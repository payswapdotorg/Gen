/**
 * Kdenlive codec — project XML + render (priority 5).
 *
 * Declared surface: a kdenlive project is MLT XML with kdenlive-namespaced
 * properties (doc properties on the `main_bin` playlist, clip names on
 * producers, track names on tractor tracks). Authored headlessly; rendered
 * through melt's avformat consumer (kdenlive_render is a melt wrapper and is
 * probed as an alternative binary — see adapters/kdenlive.ts).
 * Format flavor targets kdenlive 24.x documents; conformance is unverified
 * where no binary exists in the sandbox (honest reporting, lock P5).
 */

import type { EditorCommand, RenderProfile } from "../../contract.js";
import type { EditProject } from "../edit/edit-model.js";
import { canonicalTrackOrder } from "../edit/edit-model.js";
import { applyCutVideo, framesFor } from "../edit/apply.js";
import { cutVideoParamsSchema, validateCommandParams } from "../edit/commands.js";
import type { ApplyResult, CodecEnv, CodecState, EditorCapabilityMapping, NativeProjectCodec, ParseResult, RenderPlanResult, SourceAssetMeta } from "../edit/codec.js";
import { failure } from "../edit/codec.js";
import type { OtioFidelity } from "../otio/parse.js";
import { parseMltDocument } from "./mlt.js";
import { el, findAllByTag, findByTag, isElement, mltProperty, parseXml, serializeXml, text } from "../xml.js";
import type { XmlElement } from "../xml.js";

export const KDENLIVE_FIDELITY: OtioFidelity = {
  preserved: ["track count/order", "clip source in/out", "clip record placement", "clip names (kdenlive:clipname)", "project fps/resolution"],
  lossy: [{ feature: "sub-frame timing", rule: "quantized to the frame grid (MLT in/out semantics)" }],
  dropped: ["gen animation curves and markers (kdenlive effect/keyframe model is out of the declared subset)"],
};

export const KDENLIVE_CAPABILITIES: readonly EditorCapabilityMapping[] = [
  { capabilityId: "editor.cut-video", maturity: "stable", modeNotes: "project XML authored headlessly; playlist entry in/out" },
  { capabilityId: "editor.render-project", maturity: "stable", modeNotes: "render via melt avformat consumer (kdenlive_render probed as alternative)" },
];

function buildKdenliveDocument(state: CodecState, env: CodecEnv): string {
  const project = state.project;
  const fps = project.fps;
  const ordered = canonicalTrackOrder(project.tracks);

  const producers: ReturnType<typeof el>[] = [];
  const producerIds = new Map<string, string>();
  const register = (assetId: string, path: string | undefined, clipName: string): string => {
    const existing = producerIds.get(assetId);
    if (existing !== undefined) return existing;
    const id = `producer${producerIds.size}`;
    producerIds.set(assetId, id);
    producers.push(
      el("producer", { id, in: "0", out: String(framesFor(3600, fps)) }, [
        el("property", { name: "resource" }, [text(path ?? assetId)]),
        el("property", { name: "mlt_service" }, [text("avformat")]),
        el("property", { name: "kdenlive:clipname" }, [text(clipName)]),
        el("property", { name: "kdenlive:id" }, [text(String(producerIds.size))]),
        el("property", { name: "length" }, [text(String(framesFor(3600, fps) + 1))]),
      ]),
    );
    return id;
  };

  const playlists: ReturnType<typeof el>[] = [
    el("playlist", { id: "main_bin" }, [
      el("property", { name: "kdenlive:docproperties.version" }, [text("1.1")]),
      el("property", { name: "kdenlive:docproperties.projectname" }, [text(project.name)]),
      el("property", { name: "kdenlive:docproperties.activeTrack" }, [text("0")]),
      el("property", { name: "kdenlive:documentid" }, [text("gen-headless")]),
    ]),
  ];

  const trackEntries: { el: ReturnType<typeof el>; name: string }[] = [];
  ordered.forEach((track, index) => {
    const entries = track.clips.map((clip) => {
      const producerId = register(clip.assetId, env.assetPathOf(clip.assetId) ?? clip.assetPath, clip.name);
      const inFrame = Math.max(0, Math.round((clip.sourceRange.start.value / clip.sourceRange.start.rate) * fps));
      const dur = Math.max(1, Math.round((clip.sourceRange.duration.value / clip.sourceRange.duration.rate) * fps));
      return el("entry", { producer: producerId, in: String(inFrame), out: String(inFrame + dur - 1) });
    });
    const playlistId = `playlist${index + 1}`;
    playlists.push(el("playlist", { id: playlistId }, entries));
    trackEntries.push({ el: el("track", { producer: playlistId }), name: track.name || `V${index + 1}` });
  });

  const totalFrames = Math.max(
    1,
    framesFor(
      Math.max(0, ...project.tracks.flatMap((track) => track.clips.map((clip) => (clip.recordRange.start.value + clip.recordRange.duration.value) / clip.recordRange.start.rate))),
      fps,
    ),
  );
  const trackEls = trackEntries.map(({ el: trackEl, name }) => {
    const decorated = el(trackEl.tag, { ...trackEl.attrs, "kdenlive:track_name": name }, [...trackEl.children]);
    return decorated;
  });

  const doc = el("mlt", { LC_NUMERIC: "C", version: "7.28.0", root: env.workingDir, producer: "tractor0" }, [
    el("profile", {
      description: "Gen kdenlive project",
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
    el("tractor", { id: "tractor0", in: "0", out: String(totalFrames - 1) }, trackEls),
  ]);
  return `<?xml version="1.0" encoding="utf-8"?>\n${serializeXml(doc)}\n`;
}

export function parseKdenliveDocument(content: string): ParseResult {
  const parsed = parseXml(content);
  if (!parsed.ok) return { ok: false, issues: parsed.issues.map((issue) => `${issue.problem} @${issue.at}`) };
  const mainBin = parsed.root.children.find(
    (node): node is XmlElement => isElement(node) && node.tag === "playlist" && node.attrs.id === "main_bin",
  );
  const projectName =
    mainBin !== undefined
      ? mltProperty(mainBin, "kdenlive:docproperties.projectname")
      : undefined;
  const result = parseMltDocument(content);
  if (!result.ok) return result;
  const project: EditProject = { ...result.state.project, name: projectName ?? result.state.project.name };
  return { ok: true, state: { project } };
}

function renderPlan(state: CodecState, profile: RenderProfile, env: CodecEnv): RenderPlanResult {
  const out = profile.format === "png-sequence" ? "render/frame%05d.png" : `render/output.${profile.format}`;
  const consumerArgs = [`avformat:${out}`];
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
  return {
    ok: true,
    plan: {
      command: "melt",
      args: ["project.rCURRENT.kdenlive", "-consumer", ...consumerArgs, "progress=1"],
      outputRelativePath: out,
      supportFiles: [{ relativePath: "project.rCURRENT.kdenlive", content: buildKdenliveDocument(state, env) }],
    },
  };
}

export function createKdenliveCodec(): NativeProjectCodec {
  return {
    editorId: "kdenlive",
    fileExtension: "kdenlive",
    nativeMediaType: "application/vnd.kdenlive+xml",
    servedCapabilities: KDENLIVE_CAPABILITIES,
    fidelity: KDENLIVE_FIDELITY,
    projectFromAsset(asset: SourceAssetMeta & { path: string }): CodecState {
      const frames = framesFor(asset.durationSeconds, asset.fps);
      return {
        project: {
          name: `kdenlive-${asset.artifactId}`,
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
    applyCommand(state: CodecState, command: EditorCommand): ApplyResult {
      const validated = validateCommandParams(command.capabilityId, command.params);
      if (!validated.ok) return failure("validation", "bad-params", validated.issues.join("; "));
      if (command.capabilityId === "editor.cut-video") {
        return applyCutVideo(state, cutVideoParamsSchema.parse(command.params));
      }
      return failure("unsupported", "capability-not-served", `kdenlive adapter does not serve ${command.capabilityId} headlessly`);
    },
    serialize: buildKdenliveDocument,
    parse: parseKdenliveDocument,
    renderPlan,
  };
}

/** Used by tests to confirm the kdenlive flavor round-trips through the MLT core. */
export function kdenliveFlavorMarkers(content: string): { mainBin: boolean; trackNames: string[] } {
  const parsed = parseXml(content);
  if (!parsed.ok) return { mainBin: false, trackNames: [] };
  const tractor = findByTag(parsed.root, "tractor");
  const trackNames = tractor === undefined ? [] : findAllByTag(tractor, "track").map((track) => track.attrs["kdenlive:track_name"] ?? "");
  return {
    mainBin: parsed.root.children.some(
      (node) => isElement(node) && node.tag === "playlist" && node.attrs.id === "main_bin",
    ),
    trackNames,
  };
}
