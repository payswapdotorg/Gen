/**
 * timeline domain — OTIO import (work order W5 §2.6).
 *
 * Maps an OTIO JSON timeline (the structural subset bound in otio.ts — the
 * same subset @gen/editor-adapters serializes) onto artifact graph nodes:
 * ONE bundle artifact + one child artifact per track/item, each anchored via
 * timelineRef (otioPath + timelineArtifactId) and carrying its verbatim OTIO
 * fragment + structural slot under metadata.otio, so export can reassemble
 * the timeline byte-stably (round-trip property, §2.8).
 *
 * Media lineage (§2.3): clips reference content-addressed media via
 * `metadata.gen.assetId` or an `art.*` id inside target_url (the editor-
 * adapters convention); import extracts those refs per item — the caller
 * links them as derivedFrom edges through the store (media must exist in the
 * graph first; P5 — unresolved refs are returned, never dropped silently).
 *
 * Pure: content addressing is a injected pure function (sha256 lives behind
 * the ContentAddresser port; the domain never hashes).
 */
import { artifactProducerSchema, ARTIFACT_ID_PATTERN } from "./schema.js";
import {
  otioTimelineSchema,
  serializeOtioCanonical,
  serializeOtioItemCanonical,
  serializeOtioTrackCanonical,
} from "./otio.js";
import type { OtioClip, OtioItem, OtioTimeline, OtioTrack } from "./otio.js";
import {
  TIMELINE_BUNDLE_MEDIA_TYPE,
  TIMELINE_ITEM_MEDIA_TYPE,
  TIMELINE_TRACK_MEDIA_TYPE,
} from "./graph/bundle.js";
import type { ArtifactDescriptor, ArtifactProducer } from "./types.js";

export interface OtioImportIssue {
  readonly path: string;
  readonly problem: string;
}

/** Pure content-addressing hook (adapter supplies sha256; domain stays pure). */
export type ContentAddresser = (serialized: string) => string;

export interface OtioImportOptions {
  /** Producing metadata (P3): the capability execution behind this timeline. */
  readonly producedBy: ArtifactProducer;
  /** Lineage parents of the bundle (e.g. the editor project it was exported from). */
  readonly derivedFrom?: readonly string[];
  /** Artifact id root; children append -bundle / -track-N / -item-N-M. */
  readonly idRoot?: string;
  /** Content addressing of canonical node serializations. */
  readonly contentAddressOf: ContentAddresser;
}

export interface OtioImportedChild {
  readonly artifact: ArtifactDescriptor;
  readonly trackIndex: number;
  readonly itemIndex?: number;
  /** Media artifact ids referenced by this node (clips only). */
  readonly references: readonly string[];
}

export type OtioImportResult =
  | {
      readonly ok: true;
      readonly timeline: OtioTimeline;
      readonly bundle: ArtifactDescriptor;
      readonly tracks: readonly OtioImportedChild[];
      readonly items: readonly OtioImportedChild[];
      readonly children: readonly ArtifactDescriptor[];
      readonly references: readonly string[];
    }
  | { readonly ok: false; readonly issues: readonly OtioImportIssue[] };

const DEFAULT_ID_ROOT = "art.otio";
const ARTIFACT_IN_URL_PATTERN = /art\.[a-z0-9-]+/;

export function importOtioTimeline(input: string | unknown, options: OtioImportOptions): OtioImportResult {
  const issues: OtioImportIssue[] = [];
  let value: unknown = input;
  if (typeof input === "string") {
    try {
      value = JSON.parse(input);
    } catch (error) {
      return { ok: false, issues: [{ path: "$", problem: `invalid JSON: ${String(error)}` }] };
    }
  }
  const parsed = otioTimelineSchema.safeParse(value);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({ path: `$.${issue.path.map(String).join(".")}`, problem: issue.message });
    }
    return { ok: false, issues };
  }
  const timeline = parsed.data;

  const producer = artifactProducerSchema.safeParse(options.producedBy);
  if (!producer.success) {
    issues.push({ path: "$.producedBy", problem: `invalid producing metadata: ${producer.error.message}` });
  }
  const idRoot = options.idRoot ?? DEFAULT_ID_ROOT;
  if (!ARTIFACT_ID_PATTERN.test(idRoot)) {
    issues.push({ path: "$.idRoot", problem: `id root must match ${ARTIFACT_ID_PATTERN.source}: ${idRoot}` });
  }
  if (issues.length > 0) return { ok: false, issues };

  const bundleId = `${idRoot}-bundle`;
  const references: string[] = [];
  const tracks: OtioImportedChild[] = [];
  const items: OtioImportedChild[] = [];

  timeline.tracks.children.forEach((track: OtioTrack, trackIndex: number) => {
    const trackId = `${idRoot}-track-${trackIndex}`;
    tracks.push({
      artifact: {
        artifactId: trackId,
        contentAddress: options.contentAddressOf(serializeOtioTrackCanonical(track)),
        mediaType: TIMELINE_TRACK_MEDIA_TYPE,
        producedBy: options.producedBy,
        derivedFrom: [bundleId],
        timelineRef: { otioPath: `tracks/${trackIndex}`, timelineArtifactId: bundleId },
        metadata: { otio: { node: track, slot: { trackIndex } } },
      },
      trackIndex,
      references: [],
    });
    track.children.forEach((item: OtioItem, itemIndex: number) => {
      const refs = item.OTIO_SCHEMA === "Clip.1" ? clipReferences(item) : [];
      for (const ref of refs) if (!references.includes(ref)) references.push(ref);
      items.push({
        artifact: {
          artifactId: `${idRoot}-item-${trackIndex}-${itemIndex}`,
          contentAddress: options.contentAddressOf(serializeOtioItemCanonical(item)),
          mediaType: TIMELINE_ITEM_MEDIA_TYPE,
          producedBy: options.producedBy,
          derivedFrom: [bundleId],
          timelineRef: { otioPath: `tracks/${trackIndex}/${itemIndex}`, timelineArtifactId: bundleId },
          metadata: { otio: { node: item, slot: { trackIndex, itemIndex } } },
        },
        trackIndex,
        itemIndex,
        references: refs,
      });
    });
  });

  const bundle: ArtifactDescriptor = {
    artifactId: bundleId,
    contentAddress: options.contentAddressOf(serializeOtioCanonical(timeline)),
    mediaType: TIMELINE_BUNDLE_MEDIA_TYPE,
    producedBy: options.producedBy,
    derivedFrom: options.derivedFrom ?? [],
    metadata: {
      otio: {
        skeleton: {
          OTIO_SCHEMA: timeline.OTIO_SCHEMA,
          name: timeline.name,
          global_start_time: timeline.global_start_time,
          tracks: { OTIO_SCHEMA: timeline.tracks.OTIO_SCHEMA, name: timeline.tracks.name },
        },
        // Full timeline-level metadata (incl. the gen namespace) — carried
        // verbatim so export round-trips foreign metadata byte-stably.
        timelineMetadata: timeline.metadata,
      },
    },
  };

  return {
    ok: true,
    timeline,
    bundle,
    tracks: Object.freeze(tracks),
    items: Object.freeze(items),
    children: Object.freeze([bundle, ...tracks.map((t) => t.artifact), ...items.map((i) => i.artifact)]),
    references: Object.freeze(references),
  };
}

/** Media refs in the editor-adapters convention: gen.assetId, then target_url. */
function clipReferences(clip: OtioClip): string[] {
  const refs: string[] = [];
  const gen = clip.metadata?.gen;
  const assetId = typeof gen === "object" && gen !== null ? (gen as Record<string, unknown>).assetId : undefined;
  if (typeof assetId === "string" && assetId.length > 0) refs.push(assetId);
  if (clip.media_reference !== null && clip.media_reference.OTIO_SCHEMA === "ExternalReference.1") {
    const match = ARTIFACT_IN_URL_PATTERN.exec(clip.media_reference.target_url);
    if (match !== null && !refs.includes(match[0])) refs.push(match[0]);
  }
  return refs;
}
