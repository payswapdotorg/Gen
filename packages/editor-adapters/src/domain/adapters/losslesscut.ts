/**
 * LosslessCut codec (priority 6).
 *
 * LosslessCut is a GUI-first Electron app. Declared surface:
 *  - the LosslessCut project JSON (cut segments list) can be AUTHORED
 *    headlessly — that is this codec's native project format;
 *  - executing an export (actually cutting) has NO stable headless surface:
 *    render() fails `unsupported` with gap gap.losslesscut-headless-cut
 *    (packages/arena-bridge/src/domain/gaps/). Per lock P5 there is NO GUI
 *    workaround — the gap is the deliverable.
 */

import type { EditorCommand, RenderProfile } from "../../contract.js";
import { applyCutVideo } from "../edit/apply.js";
import { cutVideoParamsSchema, validateCommandParams } from "../edit/commands.js";
import type { ApplyResult, CodecEnv, CodecState, EditorCapabilityMapping, NativeProjectCodec, ParseResult, RenderPlanResult, SourceAssetMeta } from "../edit/codec.js";
import { failure } from "../edit/codec.js";
import type { OtioFidelity } from "../otio/parse.js";

export const LOSSLESSCUT_GAP_ID = "gap.losslesscut-headless-cut";

export const LOSSLESSCUT_FIDELITY: OtioFidelity = {
  preserved: ["cut segment start/end (seconds)", "source file name"],
  lossy: [],
  dropped: ["multi-track structure (LosslessCut projects are single-sequence)", "transforms, opacity, animation (not expressible)"],
};

export const LOSSLESSCUT_CAPABILITIES: readonly EditorCapabilityMapping[] = [
  {
    capabilityId: "editor.cut-video",
    maturity: "planned",
    modeNotes: "project JSON authoring only — headless export is a documented gap (gap.losslesscut-headless-cut); no GUI workaround per lock P5",
  },
];

interface LosslessCutProject {
  readonly version: 1;
  readonly name: string;
  readonly fileName: string;
  readonly cutSegments: readonly { readonly start: number; readonly end: number; readonly label: string }[];
}

function toLosslessCut(state: CodecState, env: CodecEnv): string {
  const project = state.project;
  const baseClip = project.tracks.flatMap((track) => track.clips)[0];
  const assetPath = baseClip === undefined ? undefined : env.assetPathOf(baseClip.assetId) ?? baseClip.assetPath;
  const fileName = assetPath?.split("/").pop() ?? "asset.mp4";
  const segments = project.tracks
    .flatMap((track) => track.clips)
    .map((clip) => ({
      start: clip.sourceRange.start.value / clip.sourceRange.start.rate,
      end: clip.sourceRange.start.value / clip.sourceRange.start.rate + clip.sourceRange.duration.value / clip.sourceRange.duration.rate,
      label: clip.name,
    }));
  const doc: LosslessCutProject = { version: 1, name: project.name, fileName, cutSegments: segments };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function parseLosslessCut(content: string): ParseResult {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== "object" || parsed === null) return { ok: false, issues: ["project root must be an object"] };
    const doc = parsed as Partial<LosslessCutProject>;
    if (doc.version !== 1 || !Array.isArray(doc.cutSegments)) {
      return { ok: false, issues: ["not a LosslessCut project (version 1, cutSegments[])"] };
    }
    const clips = doc.cutSegments.map((segment, index) => ({
      name: segment.label || `cut-${index}`,
      assetId: `art.losslesscut-source-${doc.fileName ?? "asset"}`,
      sourceRange: { start: { value: segment.start, rate: 1 }, duration: { value: Math.max(0, segment.end - segment.start), rate: 1 } },
      recordRange: { start: { value: 0, rate: 1 }, duration: { value: Math.max(0, segment.end - segment.start), rate: 1 } },
    }));
    return {
      ok: true,
      state: {
        project: {
          name: doc.name ?? "losslesscut-project",
          fps: 25,
          resolution: { width: 1280, height: 720 },
          tracks: clips.length > 0 ? [{ kind: "video" as const, name: "V1", clips }] : [],
          animationCurves: [],
          markers: [],
        },
      },
    };
  } catch (error) {
    return { ok: false, issues: [`invalid JSON: ${String(error)}`] };
  }
}

export function createLosslessCutCodec(): NativeProjectCodec {
  return {
    editorId: "losslesscut",
    fileExtension: "json",
    nativeMediaType: "application/vnd.losslesscut.project+json",
    servedCapabilities: LOSSLESSCUT_CAPABILITIES,
    fidelity: LOSSLESSCUT_FIDELITY,
    projectFromAsset(asset: SourceAssetMeta & { path: string }): CodecState {
      return {
        project: {
          name: `losslesscut-${asset.artifactId}`,
          fps: asset.fps,
          resolution: { width: asset.width, height: asset.height },
          tracks: [
            {
              kind: "video",
              name: "V1",
              clips: [
                {
                  name: "cut-0",
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
    applyCommand(state: CodecState, command: EditorCommand): ApplyResult {
      const validated = validateCommandParams(command.capabilityId, command.params);
      if (!validated.ok) return failure("validation", "bad-params", validated.issues.join("; "));
      if (command.capabilityId === "editor.cut-video") {
        return applyCutVideo(state, cutVideoParamsSchema.parse(command.params));
      }
      return failure("unsupported", "capability-not-served", `losslesscut adapter does not serve ${command.capabilityId}`);
    },
    serialize: toLosslessCut,
    parse: parseLosslessCut,
    renderPlan(_state: CodecState, _profile: RenderProfile): RenderPlanResult {
      return {
        ok: false,
        reason: "no-render-surface",
        message: "LosslessCut exposes no stable headless export surface (GUI-driven Electron app); authoring the project JSON is supported, executing the cut is not",
        gapId: LOSSLESSCUT_GAP_ID,
      };
    },
  };
}
