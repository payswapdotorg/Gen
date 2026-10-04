/**
 * editor-adapters domain — the neutral edit model.
 *
 * The hub every native editor format maps through: native → EditProject → OTIO
 * and back (spec/editor-adapter-contract.md §3). Pure data, no IO. Time is
 * rational (value/rate) to avoid float drift; native formats that quantize to
 * frame grids declare so in their fidelity notes.
 */

export interface RationalTime {
  readonly value: number;
  readonly rate: number;
}

export interface TimeRange {
  readonly start: RationalTime;
  readonly duration: RationalTime;
}

export type TrackKind = "video" | "audio";

export interface LayerTransform {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly rotation: number;
}

export interface EditClip {
  readonly name: string;
  /** Content-addressed asset the clip references (artifact id). */
  readonly assetId: string;
  /** Working-path of the asset, when materialized next to the project. */
  readonly assetPath?: string;
  readonly sourceRange: TimeRange;
  readonly recordRange: TimeRange;
  readonly transform?: LayerTransform;
  readonly opacity?: number;
  /** Cut decision carried by EDL-style formats (ffmpeg); declared in fidelity. */
  readonly cutMode?: "stream-copy" | "reencode";
}

export interface EditTrack {
  readonly kind: TrackKind;
  readonly name: string;
  readonly clips: readonly EditClip[];
}

export interface KeyframeKey {
  readonly time: RationalTime;
  readonly value: number;
}

export interface KeyframeCurve {
  /** Scene-graph target, e.g. "clip:main.0" or "track:V2". */
  readonly target: string;
  readonly property: "position" | "scale" | "rotation" | "opacity";
  readonly interpolation: "linear" | "bezier" | "constant";
  readonly keys: readonly KeyframeKey[];
}

export interface EditMarker {
  readonly name: string;
  readonly time: RationalTime;
}

export interface EditProject {
  readonly name: string;
  readonly fps: number;
  readonly resolution: { readonly width: number; readonly height: number };
  readonly tracks: readonly EditTrack[];
  readonly animationCurves: readonly KeyframeCurve[];
  readonly markers: readonly EditMarker[];
}

export function rt(value: number, rate: number): RationalTime {
  return { value, rate };
}

export function range(startValue: number, durationValue: number, rate: number): TimeRange {
  return { start: rt(startValue, rate), duration: rt(durationValue, rate) };
}

export function secondsDuration(range: TimeRange): number {
  return range.duration.value / range.duration.rate;
}

export function projectDurationSeconds(project: EditProject): number {
  let end = 0;
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const clipEnd = (clip.recordRange.start.value + clip.recordRange.duration.value) / clip.recordRange.start.rate;
      end = Math.max(end, clipEnd);
    }
  }
  return end;
}

/** Quantize a rational time onto a frame grid (frame-accurate formats). */
export function toFrame(time: RationalTime, fps: number): number {
  return Math.round((time.value / time.rate) * fps);
}

/** Build a project with one video track from a single asset (open-from-media). */
export function singleClipProject(
  name: string,
  fps: number,
  resolution: { width: number; height: number },
  asset: { id: string; path?: string; durationSeconds: number },
): EditProject {
  const frames = Math.max(1, Math.round(asset.durationSeconds * fps));
  return {
    name,
    fps,
    resolution,
    tracks: [
      {
        kind: "video",
        name: "V1",
        clips: [
          {
            name: "clip-0",
            assetId: asset.id,
            assetPath: asset.path,
            sourceRange: range(0, frames, fps),
            recordRange: range(0, frames, fps),
          },
        ],
      },
    ],
    animationCurves: [],
    markers: [],
  };
}

/** Sort tracks: video bottom-up (V1 first), then audio — a stable canonical order. */
export function canonicalTrackOrder(tracks: readonly EditTrack[]): readonly EditTrack[] {
  return [...tracks].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "video" ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}
