/**
 * MLT codec — `melt` CLI contract (priority 1, spec/editor-adapter-contract.md §2).
 *
 * Declared CLI surface (MLT 7.x):
 *   render      melt <project.mlt> -consumer avformat:<out> vcodec=… acodec=…
 *   validate    melt <project.mlt> -consumer null silent=1 (used by live tests)
 * Native format: MLT project XML (profile / producer / playlist / tractor).
 * Frame-grid format: in/out are inclusive frame numbers.
 * Pure build/parse — the binary is only touched at render time.
 */

import type { EditorCommand, RenderProfile } from "../../contract.js";
import type { EditClip, EditProject } from "../edit/edit-model.js";
import { canonicalTrackOrder } from "../edit/edit-model.js";
import { applyCompositeLayer, applyCreateAnimation, applyCutVideo, framesFor } from "../edit/apply.js";
import { compositeLayerParamsSchema, createAnimationParamsSchema, cutVideoParamsSchema, validateCommandParams } from "../edit/commands.js";
import type { ApplyResult, CodecEnv, CodecState, EditorCapabilityMapping, NativeProjectCodec, ParseResult, RenderPlanResult, SourceAssetMeta } from "../edit/codec.js";
import { failure } from "../edit/codec.js";
import type { OtioFidelity } from "../otio/parse.js";
import { el, findAllByTag, findByTag, isElement, mltProperty, parseXml, serializeXml, text } from "../xml.js";
import type { XmlElement } from "../xml.js";

const MLT_SERVICE_COMPOSITE = "composite";

export const MLT_FIDELITY: OtioFidelity = {
  preserved: ["track count/order", "clip source in/out", "clip record placement", "clip names", "project fps/resolution"],
  lossy: [{ feature: "sub-frame timing", rule: "quantized to the frame grid (MLT in/out are frame numbers, out inclusive)" }],
  dropped: ["gen animation curves (MLT has no shared curve container; land as kdenlive/OTIO metadata only)"],
};

export const MLT_CAPABILITIES: readonly EditorCapabilityMapping[] = [
  { capabilityId: "editor.cut-video", maturity: "stable", modeNotes: "cli — in/out points on playlist entries" },
  { capabilityId: "editor.composite-layer", maturity: "stable", modeNotes: "cli — multi-track tractor + composite transition" },
  { capabilityId: "editor.render-project", maturity: "stable", modeNotes: "cli — melt avformat consumer" },
];

function clipFrames(clip: EditClip, fps: number): { inFrame: number; outFrame: number } {
  const inFrame = Math.max(0, Math.round((clip.sourceRange.start.value / clip.sourceRange.start.rate) * fps));
  const dur = Math.max(1, Math.round((clip.sourceRange.duration.value / clip.sourceRange.duration.rate) * fps));
  return { inFrame, outFrame: inFrame + dur - 1 };
}

export function buildMltDocument(state: CodecState, env: CodecEnv): string {
  const project = state.project;
  const fps = project.fps;
  const ordered = canonicalTrackOrder(project.tracks);
  const producerIds = new Map<string, string>();
  const producerBounds = new Map<string, number>();
  for (const track of ordered) {
    for (const clip of track.clips) {
      const endFrame = clipFrames(clip, fps).outFrame;
      producerBounds.set(clip.assetId, Math.max(producerBounds.get(clip.assetId) ?? 0, endFrame));
    }
  }
  const producers: XmlElement[] = [];
  const playlists: XmlElement[] = [];

  const ensureProducer = (assetId: string, assetPath: string | undefined): string => {
    const existing = producerIds.get(assetId);
    if (existing !== undefined) return existing;
    const id = `producer${producerIds.size}`;
    producerIds.set(assetId, id);
    const length = Math.max(1, producerBounds.get(assetId) ?? 1);
    producers.push(
      el("producer", { id, in: "0", out: String(length) }, [
        el("property", { name: "resource" }, [text(assetPath ?? assetId)]),
        el("property", { name: "mlt_service" }, [text("avformat")]),
        el("property", { name: "length" }, [text(String(length + 1))]),
      ]),
    );
    return id;
  };

  ordered.forEach((track, index) => {
    const playlistId = `playlist${index}`;
    const entries = track.clips.map((clip) => {
      const producerId = ensureProducer(clip.assetId, env.assetPathOf(clip.assetId) ?? clip.assetPath);
      const { inFrame, outFrame } = clipFrames(clip, fps);
      return el("entry", { producer: producerId, in: String(inFrame), out: String(outFrame) });
    });
    playlists.push(el("playlist", { id: playlistId }, entries));
  });

  const totalFrames = Math.max(
    1,
    framesFor(
      Math.max(0, ...project.tracks.flatMap((track) => track.clips.map((clip) => (clip.recordRange.start.value + clip.recordRange.duration.value) / clip.recordRange.start.rate))),
      fps,
    ),
  );

  const tracks = ordered.map((_, index) => el("track", { producer: `playlist${index}` }));
  // MLT composites track b onto track a; ordered[0] is the top layer, the last
  // ordered track is the background. Emit transitions top-over-next-below.
  const transitions = ordered.slice(0, -1).map((_, index) =>
    el("transition", { id: `transition${index}`, in: "0", out: String(totalFrames - 1) }, [
      el("property", { name: "a" }, [text(String(index + 1))]),
      el("property", { name: "b" }, [text(String(index))]),
      el("property", { name: "mlt_service" }, [text(MLT_SERVICE_COMPOSITE)]),
      el("property", { name: "geometry" }, [text("0%/0%:100%x100%")]),
    ]),
  );

  const doc = el("mlt", { LC_NUMERIC: "C", version: "7.28.0", root: env.workingDir, producer: "tractor0" }, [
    el("profile", {
      description: "Gen editor-adapters project",
      width: String(project.resolution.width),
      height: String(project.resolution.height),
      progressive: "1",
      sample_aspect_num: "1",
      sample_aspect_den: "1",
      display_aspect_num: String(project.resolution.width),
      display_aspect_den: String(project.resolution.height),
      frame_rate_num: String(fps),
      frame_rate_den: "1",
      colorspace: "709",
    }),
    ...producers,
    ...playlists,
    el("tractor", { id: "tractor0", in: "0", out: String(totalFrames - 1) }, [...tracks, ...transitions]),
  ]);
  return `<?xml version="1.0" encoding="utf-8"?>\n${serializeXml(doc)}\n`;
}

export function parseMltDocument(content: string): ParseResult {
  const parsed = parseXml(content);
  if (!parsed.ok) return { ok: false, issues: parsed.issues.map((issue) => `${issue.problem} @${issue.at}`) };
  const profile = findByTag(parsed.root, "profile");
  if (profile === undefined) return { ok: false, issues: ["missing <profile>"] };
  const fpsNum = Number(profile.attrs.frame_rate_num ?? "25");
  const fpsDen = Number(profile.attrs.frame_rate_den ?? "1");
  const fps = fpsDen === 0 ? 25 : fpsNum / fpsDen;
  const producers = new Map<string, { resource?: string }>();
  for (const producer of findAllByTag(parsed.root, "producer")) {
    producers.set(producer.attrs.id ?? "", { resource: mltProperty(producer, "resource") });
  }
  const tractor = findByTag(parsed.root, "tractor");
  const trackEls = tractor === undefined ? [] : findAllByTag(tractor, "track");
  const playlistById = new Map<string, XmlElement>();
  for (const playlist of findAllByTag(parsed.root, "playlist")) {
    playlistById.set(playlist.attrs.id ?? "", playlist);
  }
  const issues: string[] = [];
  const tracks = trackEls.map((trackEl, index) => {
    const playlist = playlistById.get(trackEl.attrs.producer ?? "");
    if (playlist === undefined) {
      issues.push(`track ${index} references unknown playlist ${trackEl.attrs.producer ?? "?"}`);
      return { kind: "video" as const, name: `V${index + 1}`, clips: [] };
    }
    const clips: EditClip[] = [];
    let cursor = 0;
    for (const child of playlist.children) {
      if (!isElement(child) || child.tag !== "entry") continue;
      const producerId = child.attrs.producer ?? "";
      const producer = producers.get(producerId);
      if (producer === undefined) {
        issues.push(`entry references unknown producer ${producerId}`);
        continue;
      }
      const inFrame = Number(child.attrs.in ?? "0");
      const outFrame = Number(child.attrs.out ?? "0");
      const durFrames = Math.max(1, outFrame - inFrame + 1);
      clips.push({
        name: `clip-${clips.length}`,
        assetId: producer.resource ?? `art.unresolved-${producerId}`,
        sourceRange: { start: { value: inFrame, rate: fps }, duration: { value: durFrames, rate: fps } },
        recordRange: { start: { value: cursor, rate: fps }, duration: { value: durFrames, rate: fps } },
      });
      cursor += durFrames;
    }
    return { kind: "video" as const, name: `V${index + 1}`, clips };
  });
  if (issues.length > 0) return { ok: false, issues };
  const project: EditProject = {
    name: mltProperty(parsed.root, "gen:name") ?? "mlt-project",
    fps,
    resolution: { width: Number(profile.attrs.width ?? "1280"), height: Number(profile.attrs.height ?? "720") },
    tracks: canonicalTrackOrder(tracks),
    animationCurves: [],
    markers: [],
  };
  return { ok: true, state: { project } };
}

function renderPlan(state: CodecState, profile: RenderProfile, env: CodecEnv): RenderPlanResult {
  const out = profile.format === "png-sequence" ? "render/frame%05d.png" : `render/output.${profile.format}`;
  const consumerArgs = ["avformat:" + out];
  if (profile.format === "mp4" || profile.format === "mov") {
    consumerArgs.push("vcodec=libx264", "acodec=aac", "crf=20");
  } else if (profile.format === "webm") {
    consumerArgs.push("vcodec=libvpx-vp9", "acodec=libopus");
  } else if (profile.format === "png-sequence") {
    consumerArgs.push("vcodec=png");
  }
  const [width, height] = (profile.resolution ?? `${state.project.resolution.width}x${state.project.resolution.height}`).split("x");
  if (width !== undefined && height !== undefined) {
    consumerArgs.push(`width=${width}`, `height=${height}`);
  }
  if (profile.fps !== undefined) consumerArgs.push(`frame_rate_num=${profile.fps}`, "frame_rate_den=1");
  return {
    ok: true,
    plan: {
      command: "melt",
      args: ["project.rCURRENT.mlt", "-consumer", ...consumerArgs, "progress=1"],
      outputRelativePath: out,
      supportFiles: [{ relativePath: "project.rCURRENT.mlt", content: buildMltDocument(state, env) }],
    },
  };
}

export function createMltCodec(): NativeProjectCodec {
  return {
    editorId: "mlt",
    fileExtension: "mlt",
    nativeMediaType: "application/vnd.mlt+xml",
    servedCapabilities: MLT_CAPABILITIES,
    fidelity: MLT_FIDELITY,
    projectFromAsset(asset: SourceAssetMeta & { path: string }): CodecState {
      const frames = framesFor(asset.durationSeconds, asset.fps);
      return {
        project: {
          name: `mlt-${asset.artifactId}`,
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
                  sourceRange: { start: { value: 0, rate: asset.fps }, duration: { value: frames, rate: asset.fps } },
                  recordRange: { start: { value: 0, rate: asset.fps }, duration: { value: frames, rate: asset.fps } },
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
        const layerMeta =
          path === undefined || meta === undefined
            ? undefined
            : { path, durationSeconds: meta.durationSeconds, fps: meta.fps };
        return applyCompositeLayer(state, params, layerMeta);
      }
      if (command.capabilityId === "editor.create-animation") {
        return applyCreateAnimation(state, createAnimationParamsSchema.parse(command.params));
      }
      return failure("unsupported", "capability-not-served", `melt does not serve ${command.capabilityId}`);
    },
    serialize: buildMltDocument,
    parse: parseMltDocument,
    renderPlan,
  };
}
