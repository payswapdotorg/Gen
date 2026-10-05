/**
 * timeline domain — OpenTimelineIO structural binding.
 *
 * A zod binding of the SAME structural OTIO subset `@gen/editor-adapters`
 * serializes/parses (its src/domain/otio/model.ts + parse.ts): Timeline /
 * Stack / Track / Clip / Gap / ExternalReference / MissingReference /
 * TimeRange / RationalTime, with the OTIO `metadata.gen` namespace carried
 * through (fps, resolution, per-clip assetId — the artifact tie-in).
 *
 * ALIGNMENT NOTE (work order W5 §3): the OTIO model types are NOT exported
 * from @gen/editor-adapters' public entrypoint (its package.json `exports`
 * maps only "." → src/index.ts, which re-exports contract.ts + adapters, not
 * the OTIO model), and this package may not modify that package. Direct type
 * reuse is therefore impractical — the work order's fallback applies: the
 * model is mirrored HERE field-by-field and byte-format-aligned (the canonical
 * serializer below emits the same fixed key order as editor-adapters'
 * serializeOtio, so both sides produce interchangeable JSON). Cross-interop
 * is verified for real in test/integration-editor.test.ts over the
 * @gen/editor-adapters PUBLIC adapter surface (ffmpeg exportOtio → this
 * import → this export → structural equality). Exposing the OTIO model types
 * from editor-adapters' contract is filed as a contract change request.
 */
import { z } from "zod";

export const otioRationalTimeSchema = z.strictObject({
  OTIO_SCHEMA: z.literal("RationalTime.1"),
  rate: z.number(),
  value: z.number(),
});

export const otioTimeRangeSchema = z.strictObject({
  OTIO_SCHEMA: z.literal("TimeRange.1"),
  start_time: otioRationalTimeSchema,
  duration: otioRationalTimeSchema,
});

export const otioExternalReferenceSchema = z.strictObject({
  OTIO_SCHEMA: z.literal("ExternalReference.1"),
  target_url: z.string(),
  available_range: otioTimeRangeSchema.optional(),
});

export const otioSourceRefSchema = z.strictObject({
  OTIO_SCHEMA: z.literal("MissingReference.1"),
  name: z.string(),
});

export const otioMediaReferenceSchema = z.union([
  z.null(),
  otioExternalReferenceSchema,
  otioSourceRefSchema,
]);

export const otioGapSchema = z.strictObject({
  OTIO_SCHEMA: z.literal("Gap.1"),
  name: z.string(),
  source_range: otioTimeRangeSchema,
});

export const otioClipSchema = z.strictObject({
  OTIO_SCHEMA: z.literal("Clip.1"),
  name: z.string(),
  source_range: otioTimeRangeSchema,
  media_reference: otioMediaReferenceSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const otioItemSchema = z.discriminatedUnion("OTIO_SCHEMA", [otioClipSchema, otioGapSchema]);

export const otioTrackSchema = z.strictObject({
  OTIO_SCHEMA: z.literal("Track.1"),
  name: z.string(),
  kind: z.enum(["Video", "Audio"]),
  children: z.array(otioItemSchema),
});

export const otioStackSchema = z.strictObject({
  OTIO_SCHEMA: z.literal("Stack.1"),
  name: z.string(),
  children: z.array(otioTrackSchema),
});

export const otioTimelineSchema = z.strictObject({
  OTIO_SCHEMA: z.literal("Timeline.1"),
  name: z.string(),
  global_start_time: otioRationalTimeSchema,
  tracks: otioStackSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type OtioRationalTime = z.infer<typeof otioRationalTimeSchema>;
export type OtioTimeRange = z.infer<typeof otioTimeRangeSchema>;
export type OtioExternalReference = z.infer<typeof otioExternalReferenceSchema>;
export type OtioSourceRef = z.infer<typeof otioSourceRefSchema>;
export type OtioMediaReference = z.infer<typeof otioMediaReferenceSchema>;
export type OtioGap = z.infer<typeof otioGapSchema>;
export type OtioClip = z.infer<typeof otioClipSchema>;
export type OtioItem = z.infer<typeof otioItemSchema>;
export type OtioTrack = z.infer<typeof otioTrackSchema>;
export type OtioStack = z.infer<typeof otioStackSchema>;
export type OtioTimeline = z.infer<typeof otioTimelineSchema>;

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

/**
 * Deterministic serialization: fixed key order identical to editor-adapters'
 * serializeOtio — the same timeline structure produces byte-identical OTIO
 * JSON on both sides, which is what content addressing and the round-trip
 * property rely on.
 */
export function serializeOtioCanonical(timeline: OtioTimeline): string {
  return JSON.stringify(orderTimeline(timeline));
}

/** Canonical serialization of a track/item fragment (same key order contract). */
export function serializeOtioTrackCanonical(track: OtioTrack): string {
  return JSON.stringify(orderTrack(track));
}

export function serializeOtioItemCanonical(item: OtioItem): string {
  return JSON.stringify(orderItem(item));
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
    base.media_reference =
      item.media_reference === null
        ? null
        : item.media_reference.OTIO_SCHEMA === "ExternalReference.1"
          ? orderExternalReference(item.media_reference)
          : { OTIO_SCHEMA: "MissingReference.1", name: item.media_reference.name };
    if (item.metadata !== undefined) base.metadata = item.metadata;
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
