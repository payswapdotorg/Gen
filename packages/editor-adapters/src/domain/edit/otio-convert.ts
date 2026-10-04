/**
 * editor-adapters domain — EditProject ↔ OTIO conversion.
 *
 * The lossless spine of the interchange: clips/tracks/ranges map 1:1 onto the
 * OTIO subset; per-editor deviations are declared in each adapter's fidelity
 * notes (domain/otio/parse.ts OtioFidelity), never silent.
 */

import type {
  EditClip,
  EditProject,
  EditTrack,
  KeyframeCurve,
  RationalTime,
} from "./edit-model.js";
import { canonicalTrackOrder } from "./edit-model.js";
import type { OtioClip, OtioGap, OtioItem, OtioTimeline, OtioTrack } from "../otio/model.js";
import { rationalTime, timeRange } from "../otio/model.js";
import { parseOtio } from "../otio/parse.js";

const OTIO_META_KEY = "gen";

export function editProjectToOtio(project: EditProject, assetPathOf: (assetId: string) => string | undefined): OtioTimeline {
  const tracks: OtioTrack[] = canonicalTrackOrder(project.tracks).map((track, trackIndex) =>
    editTrackToOtioTrack(track, trackIndex, project.fps, assetPathOf),
  );
  return {
    OTIO_SCHEMA: "Timeline.1",
    name: project.name,
    global_start_time: rationalTime(0, project.fps),
    tracks: { OTIO_SCHEMA: "Stack.1", name: "tracks", children: tracks },
    metadata: {
      [OTIO_META_KEY]: {
        fps: project.fps,
        resolution: { width: project.resolution.width, height: project.resolution.height },
        animationCurves: project.animationCurves,
        markers: project.markers,
      },
    },
  };
}

function editTrackToOtioTrack(
  track: EditTrack,
  trackIndex: number,
  fps: number,
  assetPathOf: (assetId: string) => string | undefined,
): OtioTrack {
  const children: OtioItem[] = [];
  let cursor = 0;
  const ordered = [...track.clips].sort((a, b) =>
    a.recordRange.start.value / a.recordRange.start.rate < b.recordRange.start.value / b.recordRange.start.rate ? -1 : 1,
  );
  for (const clip of ordered) {
    const recordStart = clip.recordRange.start.value / clip.recordRange.start.rate;
    const gapFrames = Math.round((recordStart - cursor) * fps);
    if (gapFrames > 0) {
      const gap: OtioGap = {
        OTIO_SCHEMA: "Gap.1",
        name: "gap",
        source_range: timeRange(0, gapFrames, fps),
      };
      children.push(gap);
      cursor += gapFrames / fps;
    }
    children.push(editClipToOtioClip(clip, fps, assetPathOf));
    cursor += clip.recordRange.duration.value / clip.recordRange.duration.rate;
  }
  return {
    OTIO_SCHEMA: "Track.1",
    name: track.name || `${track.kind === "video" ? "V" : "A"}${trackIndex + 1}`,
    kind: track.kind === "video" ? "Video" : "Audio",
    children,
  };
}

function editClipToOtioClip(clip: EditClip, fps: number, assetPathOf: (assetId: string) => string | undefined): OtioClip {
  const target = assetPathOf(clip.assetId) ?? clip.assetPath;
  const genMeta: Record<string, unknown> = { assetId: clip.assetId };
  if (clip.transform !== undefined) genMeta.transform = clip.transform;
  if (clip.opacity !== undefined) genMeta.opacity = clip.opacity;
  const sourceStart = Math.round((clip.sourceRange.start.value / clip.sourceRange.start.rate) * fps);
  const sourceDuration = Math.max(1, Math.round((clip.sourceRange.duration.value / clip.sourceRange.duration.rate) * fps));
  const available =
    (clip.sourceRange.start.value / clip.sourceRange.start.rate) +
    (clip.sourceRange.duration.value / clip.sourceRange.duration.rate);
  return {
    OTIO_SCHEMA: "Clip.1",
    name: clip.name,
    source_range: timeRange(sourceStart, sourceDuration, fps),
    media_reference:
      target === undefined
        ? { OTIO_SCHEMA: "MissingReference.1", name: clip.assetId }
        : {
            OTIO_SCHEMA: "ExternalReference.1",
            target_url: target,
            available_range: timeRange(0, Math.max(1, Math.round(available * fps)), fps),
          },
    metadata: { [OTIO_META_KEY]: genMeta },
  };
}

export type OtioToEditResult =
  | { readonly ok: true; readonly project: EditProject }
  | { readonly ok: false; readonly issues: readonly { path: string; problem: string }[] };

/** Inverse conversion. Gen metadata (fps, curves, markers) is carried when
 *  present; absent metadata falls back to timeline rate and empty extras. */
export function otioToEditProject(timeline: OtioTimeline, assetIdOf: (targetUrl: string) => string | undefined): OtioToEditResult {
  const meta = timeline.metadata?.[OTIO_META_KEY];
  const genMeta = typeof meta === "object" && meta !== null ? (meta as Record<string, unknown>) : {};
  const fps =
    typeof genMeta.fps === "number"
      ? genMeta.fps
      : timeline.tracks.children.length > 0
        ? firstRate(timeline)
        : 25;
  const resolutionMeta = genMeta.resolution;
  const resolution =
    typeof resolutionMeta === "object" && resolutionMeta !== null
      ? {
          width: numberOr((resolutionMeta as Record<string, unknown>).width, 1280),
          height: numberOr((resolutionMeta as Record<string, unknown>).height, 720),
        }
      : { width: 1280, height: 720 };
  const issues: { path: string; problem: string }[] = [];
  const tracks: EditTrack[] = [];
  timeline.tracks.children.forEach((track, trackIndex) => {
    const clips: EditClip[] = [];
    let cursor = 0;
    track.children.forEach((item, itemIndex) => {
      const path = `$.tracks.children[${trackIndex}].children[${itemIndex}]`;
      const itemStart = item.source_range.start_time.value / item.source_range.start_time.rate;
      const itemDuration = item.source_range.duration.value / item.source_range.duration.rate;
      if (item.OTIO_SCHEMA === "Gap.1") {
        cursor += itemDuration;
        return;
      }
      const gen = item.metadata?.[OTIO_META_KEY];
      const clipMeta = typeof gen === "object" && gen !== null ? (gen as Record<string, unknown>) : {};
      const targetUrl =
        item.media_reference !== null && item.media_reference.OTIO_SCHEMA === "ExternalReference.1"
          ? item.media_reference.target_url
          : undefined;
      const metaAssetId = typeof clipMeta.assetId === "string" ? clipMeta.assetId : undefined;
      const assetId = metaAssetId ?? (targetUrl !== undefined ? assetIdOf(targetUrl) : undefined) ?? clipAssetId(item, path, issues);
      clips.push({
        name: item.name || `clip-${itemIndex}`,
        assetId,
        sourceRange: {
          start: { value: itemStart, rate: item.source_range.start_time.rate === 0 ? 1 : item.source_range.start_time.rate },
          duration: { value: itemDuration, rate: item.source_range.duration.rate === 0 ? 1 : item.source_range.duration.rate },
        },
        recordRange: { start: { value: cursor, rate: fps }, duration: { value: itemDuration, rate: fps } },
        transform: isTransform(clipMeta.transform) ? clipMeta.transform : undefined,
        opacity: typeof clipMeta.opacity === "number" ? clipMeta.opacity : undefined,
      });
      cursor += itemDuration;
    });
    tracks.push({
      kind: track.kind === "Audio" ? "audio" : "video",
      name: track.name,
      clips,
    });
  });
  const curves = Array.isArray(genMeta.animationCurves) ? (genMeta.animationCurves as KeyframeCurve[]) : [];
  const markers = Array.isArray(genMeta.markers) ? (genMeta.markers as EditProjectMarkerJson[]) : [];
  return {
    ok: issues.length === 0,
    issues,
    project: {
      name: timeline.name || "imported",
      fps,
      resolution,
      tracks: canonicalTrackOrder(tracks),
      animationCurves: curves,
      markers: markers.map((marker) => ({
        name: marker.name,
        time: { value: marker.time.value, rate: marker.time.rate },
      })),
    },
  };
}

interface EditProjectMarkerJson {
  readonly name: string;
  readonly time: RationalTime;
}

function firstRate(timeline: OtioTimeline): number {
  for (const track of timeline.tracks.children) {
    for (const item of track.children) {
      if (item.source_range.start_time.rate > 0) return item.source_range.start_time.rate;
    }
  }
  return 25;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isTransform(value: unknown): value is { x: number; y: number; scale: number; rotation: number } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.x === "number" &&
    typeof record.y === "number" &&
    typeof record.scale === "number" &&
    typeof record.rotation === "number"
  );
}

function clipAssetId(item: OtioClip, path: string, issues: { path: string; problem: string }[]): string {
  const ref = item.media_reference;
  if (ref === null) {
    issues.push({ path, problem: "clip has no media reference and no gen assetId metadata" });
    return "art.unresolved";
  }
  if (ref.OTIO_SCHEMA === "ExternalReference.1") {
    const assetMatch = /art\.[a-z0-9-]+/.exec(ref.target_url);
    if (assetMatch !== null) return assetMatch[0] ?? "art.unresolved";
    issues.push({ path, problem: `target_url does not carry a content-addressed artifact id: ${ref.target_url}` });
    return "art.unresolved";
  }
  return ref.name;
}

/** Parse + convert in one step (import path). */
export type ParsedOtioEdit =
  | { readonly ok: true; readonly project: EditProject }
  | { readonly ok: false; readonly issues: readonly { path: string; problem: string }[] };

export function parseOtioToEditProject(
  text: string,
  assetIdOf: (targetUrl: string) => string | undefined,
): ParsedOtioEdit {
  const parsed = parseOtio(text);
  if (!parsed.ok) return { ok: false, issues: parsed.issues };
  const converted = otioToEditProject(parsed.timeline, assetIdOf);
  if (!converted.ok) return { ok: false, issues: converted.issues };
  return { ok: true, project: converted.project };
}
