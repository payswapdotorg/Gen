/**
 * editor-adapters domain — shared command application on the edit model.
 *
 * Used by codecs whose native formats express the shared edit semantics
 * (MLT, Kdenlive, FFmpeg, LosslessCut, Blender-VSE). Codecs with
 * editor-specific behavior (Natron compositing, Blender tracking) layer their
 * own logic on top. Pure.
 */

import type { EditClip, EditProject, KeyframeCurve } from "./edit-model.js";
import { range } from "./edit-model.js";
import { parseKeyframes, parseTuple } from "./commands.js";
import type { CompositeLayerParams, CreateAnimationParams, CutVideoParams } from "./commands.js";
import type { ApplyResult, CodecState } from "./codec.js";
import { failure, flatClips } from "./codec.js";

export function applyCutVideo(state: CodecState, params: CutVideoParams): ApplyResult {
  const clips = flatClips(state.project);
  const target = clips[params.clipIndex];
  if (target === undefined) {
    return failure("validation", "bad-params", `clipIndex ${params.clipIndex} out of range (${clips.length} clips)`);
  }
  const tracks = state.project.tracks.map((track) => ({ ...track, clips: [...track.clips] }));
  const track = tracks[target.trackIndex];
  if (track === undefined) return failure("validation", "bad-params", "track vanished");
  const clip = track.clips[target.clipIndex];
  if (clip === undefined) return failure("validation", "bad-params", "clip vanished");
  const srcStartSec = clip.sourceRange.start.value / clip.sourceRange.start.rate;
  const srcEndSec = srcStartSec + clip.sourceRange.duration.value / clip.sourceRange.duration.rate;
  const start = params.start ?? srcStartSec;
  const end = params.end ?? srcEndSec;
  if (!(start >= srcStartSec) || !(end > start) || end > srcEndSec + 1e-9) {
    return failure(
      "validation",
      "bad-params",
      `cut [${start}, ${end}] outside clip source range [${srcStartSec}, ${srcEndSec}]`,
    );
  }
  const durationSec = end - start;
  const recordStartSec = clip.recordRange.start.value / clip.recordRange.start.rate;
  track.clips[target.clipIndex] = {
    ...clip,
    sourceRange: { start: { value: start, rate: 1 }, duration: { value: durationSec, rate: 1 } },
    recordRange: { start: { value: recordStartSec, rate: 1 }, duration: { value: durationSec, rate: 1 } },
    cutMode: params.mode,
  };
  const project: EditProject = { ...state.project, tracks };
  return { ok: true, state: { ...state, project } };
}

export function applyCompositeLayer(
  state: CodecState,
  params: CompositeLayerParams,
  layerMeta: { path: string; durationSeconds: number; fps: number } | undefined,
): ApplyResult {
  if (layerMeta === undefined) {
    return failure("validation", "bad-artifact", `layerArtifactRef ${params.layerArtifactRef} is not a materialized video asset`);
  }
  const tracks: { kind: "video" | "audio"; name: string; clips: EditClip[] }[] = state.project.tracks.map((track) => ({
    kind: track.kind,
    name: track.name,
    clips: [...track.clips],
  }));
  while (tracks.length <= params.trackIndex) {
    tracks.push({ kind: "video", name: `V${tracks.length + 1}`, clips: [] });
  }
  const track = tracks[params.trackIndex];
  if (track === undefined) return failure("validation", "bad-params", "track vanished");
  const transformTuple = params.transform === undefined ? undefined : parseTuple(params.transform, 4);
  const durationSec = layerMeta.durationSeconds;
  track.clips.push({
    name: `layer-${track.clips.length}`,
    assetId: params.layerArtifactRef,
    assetPath: layerMeta.path,
    sourceRange: range(0, durationSec, 1),
    recordRange: range(0, durationSec, 1),
    opacity: params.opacity,
    transform:
      transformTuple === undefined
        ? undefined
        : { x: transformTuple[0] ?? 0, y: transformTuple[1] ?? 0, scale: transformTuple[2] ?? 1, rotation: transformTuple[3] ?? 0 },
  });
  const project: EditProject = { ...state.project, tracks };
  return { ok: true, state: { ...state, project } };
}

export function applyCreateAnimation(state: CodecState, params: CreateAnimationParams): ApplyResult {
  const keys = parseKeyframes(params.keyframes);
  if (keys.length < 2) {
    return failure("validation", "bad-params", "animation needs at least two keyframes");
  }
  const clipExists = state.project.tracks.some((track) =>
    track.clips.some((clip) => clip.name === params.target),
  );
  if (!clipExists && params.target !== "project") {
    return failure("validation", "bad-params", `animation target "${params.target}" is not a clip name`);
  }
  const curve: KeyframeCurve = {
    target: params.target === "project" ? "project" : `clip:${params.target}`,
    property: params.property,
    interpolation: params.interpolation,
    keys: keys.map((key) => ({ time: { value: key.time, rate: 1 }, value: key.value })),
  };
  const curves = [...state.project.animationCurves.filter((existing) => existing.target !== curve.target || existing.property !== curve.property), curve];
  const project: EditProject = { ...state.project, animationCurves: curves };
  return { ok: true, state: { ...state, project } };
}

/** Frame-quantized duration at a project rate (for frame-grid formats). */
export function framesFor(seconds: number, fps: number): number {
  return Math.max(1, Math.round(seconds * fps));
}
