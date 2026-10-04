/**
 * FFmpeg codec — CLI (priority 3).
 *
 * FFmpeg has no native project format: the adapter's declared project format
 * is a Gen edit-decision list (JSON) that compiles deterministically to an
 * ffmpeg invocation. Declared CLI surface (ffmpeg 6/7):
 *   reencode cut    ffmpeg -y -ss S -to E -i asset -c:v libx264 … out.mp4
 *   stream copy     ffmpeg -y -ss S -to E -i asset -c copy -avoid_negative_ts make_zero out.mp4
 *   composite       filter_complex overlay/colorchannelmixer chain
 *   probe           ffprobe -v error -show_entries … (ingestion-side)
 * Stream-copy cuts are keyframe-aligned (declared in capability notes);
 * reencode cuts are frame-accurate with input-side seeking.
 */

import type { EditorCommand, RenderProfile } from "../../contract.js";
import type { EditProject } from "../edit/edit-model.js";
import { canonicalTrackOrder } from "../edit/edit-model.js";
import { applyCompositeLayer, applyCutVideo } from "../edit/apply.js";
import { compositeLayerParamsSchema, cutVideoParamsSchema, validateCommandParams } from "../edit/commands.js";
import type { ApplyResult, CodecEnv, CodecState, EditorCapabilityMapping, NativeProjectCodec, ParseResult, RenderArgsPlan, RenderPlanResult, SourceAssetMeta } from "../edit/codec.js";
import { failure } from "../edit/codec.js";
import type { OtioFidelity } from "../otio/parse.js";

export const FFMPEG_FIDELITY: OtioFidelity = {
  preserved: ["track count/order", "clip source in/out (seconds precision)", "clip record placement", "layer opacity"],
  lossy: [
    { feature: "layer transform", rule: "x/y translation and scale map to overlay filter geometry; rotation is approximated by transposition only (declared)" },
    { feature: "stream-copy cuts", rule: "keyframe-aligned: segment boundaries snap to the nearest keyframe of the source encode" },
  ],
  dropped: ["gen animation curves (ffmpeg filters are per-invocation, not project-persisted)"],
};

export const FFMPEG_CAPABILITIES: readonly EditorCapabilityMapping[] = [
  { capabilityId: "editor.cut-video", maturity: "stable", modeNotes: "cli — -ss/-to with -c copy (keyframe-aligned) or reencode (frame-accurate)" },
  { capabilityId: "editor.render-project", maturity: "stable", modeNotes: "cli — encode profiles mp4/webm/mov/png-sequence; composites compile to filter_complex" },
];

export interface FfmpegEdl {
  readonly kind: "gen.ffmpeg-edl";
  readonly version: 1;
  readonly name: string;
  readonly fps: number;
  readonly resolution: { readonly width: number; readonly height: number };
  readonly tracks: readonly {
    readonly kind: "video" | "audio";
    readonly name: string;
    readonly clips: readonly {
      readonly name: string;
      readonly assetId: string;
      readonly sourceStart: number;
      readonly sourceDuration: number;
      readonly recordStart: number;
      readonly opacity?: number;
      readonly cutMode?: "stream-copy" | "reencode";
      readonly transform?: { readonly x: number; readonly y: number; readonly scale: number };
    }[];
  }[];
  readonly animationCurves: readonly unknown[];
}

function toEdl(state: CodecState): FfmpegEdl {
  const project = state.project;
  return {
    kind: "gen.ffmpeg-edl",
    version: 1,
    name: project.name,
    fps: project.fps,
    resolution: project.resolution,
    tracks: canonicalTrackOrder(project.tracks).map((track) => ({
      kind: track.kind,
      name: track.name,
      clips: track.clips.map((clip) => ({
        name: clip.name,
        assetId: clip.assetId,
        sourceStart: clip.sourceRange.start.value / clip.sourceRange.start.rate,
        sourceDuration: clip.sourceRange.duration.value / clip.sourceRange.duration.rate,
        recordStart: clip.recordRange.start.value / clip.recordRange.start.rate,
        opacity: clip.opacity,
        cutMode: clip.cutMode,
        transform: clip.transform === undefined ? undefined : { x: clip.transform.x, y: clip.transform.y, scale: clip.transform.scale },
      })),
    })),
    animationCurves: project.animationCurves,
  };
}

function fromEdl(edl: FfmpegEdl): CodecState {
  const project: EditProject = {
    name: edl.name,
    fps: edl.fps,
    resolution: edl.resolution,
    tracks: edl.tracks.map((track) => ({
      kind: track.kind,
      name: track.name,
      clips: track.clips.map((clip) => ({
        name: clip.name,
        assetId: clip.assetId,
        sourceRange: { start: { value: clip.sourceStart, rate: 1 }, duration: { value: clip.sourceDuration, rate: 1 } },
        recordRange: { start: { value: clip.recordStart, rate: 1 }, duration: { value: clip.sourceDuration, rate: 1 } },
        opacity: clip.opacity,
        cutMode: clip.cutMode,
        transform: clip.transform === undefined ? undefined : { x: clip.transform.x, y: clip.transform.y, scale: clip.transform.scale, rotation: 0 },
      })),
    })),
    animationCurves: [],
    markers: [],
  };
  return { project };
}

function seconds(value: number): string {
  return value.toFixed(3);
}

function encodeArgs(profile: RenderProfile): string[] {
  if (profile.format === "webm") return ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", "-c:a", "libopus"];
  if (profile.format === "png-sequence") return ["-c:v", "png"];
  return ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k"];
}

function resolutionArgs(profile: RenderProfile, project: EditProject): string[] {
  const [width, height] = (profile.resolution ?? `${project.resolution.width}x${project.resolution.height}`).split("x");
  if (width === undefined || height === undefined) return [];
  return ["-vf", `scale=${width}:${height}`];
}

function renderPlan(state: CodecState, profile: RenderProfile, env: CodecEnv): RenderPlanResult {
  const project = state.project;
  const ordered = canonicalTrackOrder(project.tracks);
  const videoTracks = ordered.filter((track) => track.kind === "video");
  const output = profile.format === "png-sequence" ? "render/frame%05d.png" : `render/output.${profile.format}`;

  if (videoTracks.length === 0) {
    return { ok: false, reason: "unsupported-profile", message: "no video tracks to render" };
  }

  const allClips = videoTracks.flatMap((track) => track.clips);
  if (allClips.length === 0) {
    return { ok: false, reason: "unsupported-profile", message: "no clips to render" };
  }

  // Single clip, single track: direct -ss/-to invocation (cut + encode).
  if (videoTracks.length === 1 && videoTracks[0]?.clips.length === 1) {
    const clip = videoTracks[0].clips[0];
    if (clip === undefined) return { ok: false, reason: "unsupported-profile", message: "clip vanished" };
    const assetPath = env.assetPathOf(clip.assetId) ?? clip.assetPath;
    if (assetPath === undefined) {
      return { ok: false, reason: "unsupported-profile", message: `asset ${clip.assetId} is not materialized` };
    }
    const start = clip.sourceRange.start.value / clip.sourceRange.start.rate;
    const end = start + clip.sourceRange.duration.value / clip.sourceRange.duration.rate;
    const isStreamCopy = clip.opacity === undefined && clip.transform === undefined && profile.codec === "stream-copy";
    const args = [
      "-y",
      "-ss",
      seconds(start),
      "-to",
      seconds(end),
      "-i",
      assetPath,
      ...(isStreamCopy ? ["-c", "copy", "-avoid_negative_ts", "make_zero"] : [...encodeArgs(profile), ...resolutionArgs(profile, project)]),
      output,
    ];
    const plan: RenderArgsPlan = { command: "ffmpeg", args, outputRelativePath: output, supportFiles: [] };
    return { ok: true, plan };
  }

  // Multi-clip / multi-track: compile to a filter_complex graph.
  const inputs: string[] = [];
  const filters: string[] = [];
  let inputIndex = 0;
  let currentLabel = "";
  const baseTrack = videoTracks[0];
  if (baseTrack === undefined) return { ok: false, reason: "unsupported-profile", message: "base track vanished" };
  const baseParts: string[] = [];
  for (const clip of baseTrack.clips) {
    const assetPath = env.assetPathOf(clip.assetId) ?? clip.assetPath;
    if (assetPath === undefined) {
      return { ok: false, reason: "unsupported-profile", message: `asset ${clip.assetId} is not materialized` };
    }
    const start = clip.sourceRange.start.value / clip.sourceRange.start.rate;
    const end = start + clip.sourceRange.duration.value / clip.sourceRange.duration.rate;
    inputs.push("-ss", seconds(start), "-to", seconds(end), "-i", assetPath);
    const label = `${inputIndex}:v`;
    baseParts.push(`[${label}]trim=duration=${seconds(clip.sourceRange.duration.value / clip.sourceRange.duration.rate)}[b${inputIndex}]`);
    inputIndex += 1;
  }
  if (baseParts.length === 1) {
    filters.push(baseParts[0] ?? "");
    currentLabel = "b0";
  } else {
    const concatInputs = baseParts.map((_, i) => `[b${i}]`).join("");
    filters.push(...baseParts);
    filters.push(`${concatInputs}concat=n=${baseParts.length}:v=1:a=0[base]`);
    currentLabel = "base";
  }
  for (const track of videoTracks.slice(1)) {
    for (const clip of track.clips) {
      const assetPath = env.assetPathOf(clip.assetId) ?? clip.assetPath;
      if (assetPath === undefined) {
        return { ok: false, reason: "unsupported-profile", message: `asset ${clip.assetId} is not materialized` };
      }
      inputs.push("-i", assetPath);
      let chain = `[${inputIndex}:v]scale=iw*${(clip.transform?.scale ?? 1).toFixed(3)}:-1`;
      if (clip.opacity !== undefined) {
        chain += `,format=rgba,colorchannelmixer=aa=${clip.opacity.toFixed(3)}`;
      }
      const layerLabel = `l${inputIndex}`;
      filters.push(`${chain}[${layerLabel}]`);
      filters.push(`[${currentLabel}][${layerLabel}]overlay=x=${Math.round(clip.transform?.x ?? 0)}:y=${Math.round(clip.transform?.y ?? 0)}[v${inputIndex}]`);
      currentLabel = `v${inputIndex}`;
      inputIndex += 1;
    }
  }
  const args = [
    "-y",
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    `[${currentLabel}]`,
    ...encodeArgs(profile),
    output,
  ];
  const plan: RenderArgsPlan = { command: "ffmpeg", args, outputRelativePath: output, supportFiles: [] };
  return { ok: true, plan };
}

export function createFfmpegCodec(): NativeProjectCodec {
  return {
    editorId: "ffmpeg",
    fileExtension: "json",
    nativeMediaType: "application/vnd.gen.ffmpeg-edl+json",
    servedCapabilities: FFMPEG_CAPABILITIES,
    fidelity: FFMPEG_FIDELITY,
    projectFromAsset(asset: SourceAssetMeta & { path: string }): CodecState {
      return {
        project: {
          name: `ffmpeg-${asset.artifactId}`,
          fps: asset.fps,
          resolution: { width: asset.width, height: asset.height },
          tracks: [
            {
              kind: "video",
              name: "V1",
              clips: [
                {
                  name: "clip-0",
                  assetId: asset.artifactId,
                  assetPath: asset.path,
                  sourceRange: { start: { value: 0, rate: 1 }, duration: { value: asset.durationSeconds, rate: 1 } },
                  recordRange: { start: { value: 0, rate: 1 }, duration: { value: asset.durationSeconds, rate: 1 } },
                },
              ],
            },
          ],
          animationCurves: [],
          markers: [],
        },
      };
    },
    applyCommand(state: CodecState, command: EditorCommand, env: CodecEnv): ApplyResult {
      const validated = validateCommandParams(command.capabilityId, command.params);
      if (!validated.ok) return failure("validation", "bad-params", validated.issues.join("; "));
      if (command.capabilityId === "editor.cut-video") {
        return applyCutVideo(state, cutVideoParamsSchema.parse(command.params));
      }
      if (command.capabilityId === "editor.composite-layer") {
        const params = compositeLayerParamsSchema.parse(command.params);
        const path = env.assetPathOf(params.layerArtifactRef);
        const meta = env.assetMetaOf(params.layerArtifactRef);
        const layerMeta = path === undefined || meta === undefined ? undefined : { path, durationSeconds: meta.durationSeconds, fps: meta.fps };
        return applyCompositeLayer(state, params, layerMeta);
      }
      return failure("unsupported", "capability-not-served", `ffmpeg adapter does not serve ${command.capabilityId}`);
    },
    serialize(state: CodecState): string {
      return `${JSON.stringify(toEdl(state), null, 2)}\n`;
    },
    parse(content: string): ParseResult {
      try {
        const parsed: unknown = JSON.parse(content);
        if (typeof parsed !== "object" || parsed === null) return { ok: false, issues: ["EDL root must be an object"] };
        const edl = parsed as FfmpegEdl;
        if (edl.kind !== "gen.ffmpeg-edl") return { ok: false, issues: ["not a gen.ffmpeg-edl document"] };
        return { ok: true, state: fromEdl(edl) };
      } catch (error) {
        return { ok: false, issues: [`invalid JSON: ${String(error)}`] };
      }
    },
    renderPlan,
  };
}
