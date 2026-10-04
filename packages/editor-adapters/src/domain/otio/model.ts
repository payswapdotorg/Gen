/**
 * editor-adapters domain — OpenTimelineIO interchange model.
 *
 * A structural subset of the OTIO JSON file format (OTIO_SCHEMA versions from
 * the public spec): Timeline / Stack / Track / Clip / Gap / ExternalReference /
 * TimeRange / RationalTime. Editors cooperate through this projection plus the
 * content-addressed asset manifest (spec/editor-adapter-contract.md §3).
 * Pure data + deterministic serialization — no IO.
 */

export interface OtioRationalTime {
  readonly OTIO_SCHEMA: "RationalTime.1";
  readonly rate: number;
  readonly value: number;
}

export interface OtioTimeRange {
  readonly OTIO_SCHEMA: "TimeRange.1";
  readonly start_time: OtioRationalTime;
  readonly duration: OtioRationalTime;
}

export interface OtioExternalReference {
  readonly OTIO_SCHEMA: "ExternalReference.1";
  readonly target_url: string;
  readonly available_range?: OtioTimeRange;
}

export interface OtioSourceRef {
  readonly OTIO_SCHEMA: "MissingReference.1";
  readonly name: string;
}

export type OtioMediaReference = OtioExternalReference | OtioSourceRef;

export interface OtioItemBase {
  readonly name: string;
  readonly source_range: OtioTimeRange;
}

export interface OtioClip extends OtioItemBase {
  readonly OTIO_SCHEMA: "Clip.1";
  readonly media_reference: OtioMediaReference | null;
  /** Gen metadata (non-standard keys live under metadata.gen.*). */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface OtioGap extends OtioItemBase {
  readonly OTIO_SCHEMA: "Gap.1";
}

export type OtioItem = OtioClip | OtioGap;

export interface OtioTrack {
  readonly OTIO_SCHEMA: "Track.1";
  readonly name: string;
  readonly kind: "Video" | "Audio";
  readonly children: readonly OtioItem[];
}

export interface OtioStack {
  readonly OTIO_SCHEMA: "Stack.1";
  readonly name: string;
  readonly children: readonly OtioTrack[];
}

export interface OtioTimeline {
  readonly OTIO_SCHEMA: "Timeline.1";
  readonly name: string;
  readonly global_start_time: OtioRationalTime;
  readonly tracks: OtioStack;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export function rationalTime(value: number, rate: number): OtioRationalTime {
  return { OTIO_SCHEMA: "RationalTime.1", rate, value };
}

export function timeRange(startValue: number, durationValue: number, rate: number): OtioTimeRange {
  return {
    OTIO_SCHEMA: "TimeRange.1",
    start_time: rationalTime(startValue, rate),
    duration: rationalTime(durationValue, rate),
  };
}

/** Deterministic serialization: fixed key order, no incidental whitespace —
 *  the same edit model always produces byte-identical OTIO JSON. */
export function serializeOtio(timeline: OtioTimeline): string {
  return JSON.stringify(orderTimeline(timeline));
}

function orderTimeline(t: OtioTimeline): Record<string, unknown> {
  const out: Record<string, unknown> = {
    OTIO_SCHEMA: t.OTIO_SCHEMA,
    name: t.name,
    global_start_time: { ...t.global_start_time },
    tracks: {
      OTIO_SCHEMA: t.tracks.OTIO_SCHEMA,
      name: t.tracks.name,
      children: t.tracks.children.map(orderTrack),
    },
  };
  if (t.metadata !== undefined) out.metadata = t.metadata;
  return out;
}

function orderTrack(track: OtioTrack): Record<string, unknown> {
  return {
    OTIO_SCHEMA: track.OTIO_SCHEMA,
    name: track.name,
    kind: track.kind,
    children: track.children.map(orderItem),
  };
}

function orderItem(item: OtioItem): Record<string, unknown> {
  const base: Record<string, unknown> = {
    OTIO_SCHEMA: item.OTIO_SCHEMA,
    name: item.name,
    source_range: orderTimeRange(item.source_range),
  };
  if (item.OTIO_SCHEMA === "Clip.1") {
    const clip = item as OtioClip;
    base.media_reference =
      clip.media_reference === null
        ? null
        : clip.media_reference.OTIO_SCHEMA === "ExternalReference.1"
          ? orderExternalReference(clip.media_reference)
          : { OTIO_SCHEMA: "MissingReference.1", name: (clip.media_reference as OtioSourceRef).name };
    if (clip.metadata !== undefined) base.metadata = clip.metadata;
  }
  return base;
}

function orderTimeRange(range: OtioTimeRange): Record<string, unknown> {
  return {
    OTIO_SCHEMA: range.OTIO_SCHEMA,
    start_time: { ...range.start_time },
    duration: { ...range.duration },
  };
}

function orderExternalReference(ref: OtioExternalReference): Record<string, unknown> {
  const out: Record<string, unknown> = {
    OTIO_SCHEMA: ref.OTIO_SCHEMA,
    target_url: ref.target_url,
  };
  if (ref.available_range !== undefined) out.available_range = orderTimeRange(ref.available_range);
  return out;
}
