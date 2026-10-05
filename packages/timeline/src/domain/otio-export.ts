/**
 * timeline domain — OTIO export (work order W5 §2.7–§2.8).
 *
 * Reassembles a subgraph (bundle + its anchored children) back into OTIO
 * JSON: the bundle's skeleton (metadata.otio.skeleton) + the verbatim OTIO
 * fragments carried by the structural children (metadata.otio.node) placed
 * at their slots (metadata.otio.slot). Because import embeds the fragments
 * verbatim, export(import(x)) reproduces x's structure byte-stably in the
 * canonical serialization — the round-trip property (ids/refs may differ;
 * structure must round-trip).
 *
 * Anchored members WITHOUT a structural slot (hand-authored records like the
 * committed spec example, whose bundle-relative otioPath anchors media into
 * the timeline) are REPORTED as unplacedMembers — never dropped silently (P5).
 */
import {
  otioItemSchema,
  otioRationalTimeSchema,
  otioTimelineSchema,
  otioTrackSchema,
  rationalTime,
  serializeOtioCanonical,
} from "./otio.js";
import type { OtioItem, OtioTimeline, OtioTrack } from "./otio.js";
import type { ArtifactGraph } from "./graph/store.js";
import type { ArtifactDescriptor } from "./types.js";

export interface OtioExportOptions {
  /** Timeline name when the bundle carries no skeleton. */
  readonly name?: string;
  /** Rate when the bundle carries no skeleton (default: first item rate, else 25). */
  readonly fps?: number;
}

export interface OtioExportIssue {
  readonly path: string;
  readonly problem: string;
}

export type OtioExportResult =
  | {
      readonly ok: true;
      readonly timeline: OtioTimeline;
      readonly serialized: string;
      readonly unplacedMembers: readonly string[];
    }
  | { readonly ok: false; readonly issues: readonly OtioExportIssue[] };

interface Slot {
  readonly trackIndex: number;
  readonly itemIndex?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readSlot(member: ArtifactDescriptor): Slot | undefined {
  const otio = member.metadata?.otio;
  if (!isRecord(otio) || !isRecord(otio.slot)) return undefined;
  const { trackIndex, itemIndex } = otio.slot;
  if (typeof trackIndex !== "number" || !Number.isInteger(trackIndex) || trackIndex < 0) return undefined;
  if (itemIndex === undefined) return { trackIndex };
  if (typeof itemIndex !== "number" || !Number.isInteger(itemIndex) || itemIndex < 0) return undefined;
  return { trackIndex, itemIndex };
}

export function exportOtioSubgraph(
  graph: ArtifactGraph,
  bundleId: string,
  options: OtioExportOptions = {},
): OtioExportResult {
  const issues: OtioExportIssue[] = [];
  const bundle = graph.get(bundleId);
  if (bundle === undefined) {
    return { ok: false, issues: [{ path: "$.bundleId", problem: `unknown artifact: ${bundleId}` }] };
  }

  const members = graph.timelineChildrenOf(bundleId);
  const trackNodes = new Map<number, { id: string; node: OtioTrack }>();
  const itemNodes = new Map<string, { trackIndex: number; itemIndex: number; id: string; node: OtioItem }>();
  const unplacedMembers: string[] = [];

  for (const member of members) {
    const slot = readSlot(member);
    if (slot === undefined) {
      unplacedMembers.push(member.artifactId);
      continue;
    }
    const otio = member.metadata?.otio;
    const node = isRecord(otio) ? otio.node : undefined;
    if (slot.itemIndex === undefined) {
      const parsed = otioTrackSchema.safeParse(node);
      if (!parsed.success) {
        issues.push({ path: `${member.artifactId}.metadata.otio.node`, problem: `invalid track fragment: ${parsed.error.message}` });
        continue;
      }
      if (trackNodes.has(slot.trackIndex)) {
        issues.push({ path: member.artifactId, problem: `conflicting track slot: ${slot.trackIndex}` });
        continue;
      }
      trackNodes.set(slot.trackIndex, { id: member.artifactId, node: parsed.data });
    } else {
      const parsed = otioItemSchema.safeParse(node);
      if (!parsed.success) {
        issues.push({ path: `${member.artifactId}.metadata.otio.node`, problem: `invalid item fragment: ${parsed.error.message}` });
        continue;
      }
      const key = `${slot.trackIndex}/${slot.itemIndex}`;
      if (itemNodes.has(key)) {
        issues.push({ path: member.artifactId, problem: `conflicting item slot: ${key}` });
        continue;
      }
      itemNodes.set(key, { trackIndex: slot.trackIndex, itemIndex: slot.itemIndex, id: member.artifactId, node: parsed.data });
    }
  }

  const tracks: OtioTrack[] = [...trackNodes.entries()]
    .sort(([a], [b]) => a - b)
    .map(([trackIndex, { node }]) => {
      const children = [...itemNodes.values()]
        .filter((item) => item.trackIndex === trackIndex)
        .sort((a, b) => a.itemIndex - b.itemIndex)
        .map((item) => item.node);
      return { ...node, children };
    });

  for (const item of itemNodes.values()) {
    if (!trackNodes.has(item.trackIndex)) {
      issues.push({ path: item.id, problem: `item references missing track slot: ${item.trackIndex}` });
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  // Bundle skeleton (import-written) with documented defaults for hand-authored bundles.
  const otioMeta = bundle.metadata?.otio;
  const skeleton = isRecord(otioMeta) && isRecord(otioMeta.skeleton) ? otioMeta.skeleton : undefined;
  const name = typeof skeleton?.name === "string" ? skeleton.name : (options.name ?? bundle.artifactId);
  const stackName =
    isRecord(skeleton?.tracks) && typeof skeleton.tracks.name === "string" ? skeleton.tracks.name : "tracks";
  const firstItemRate = tracks.flatMap((t) => t.children).find(() => true)?.source_range.start_time.rate;
  const fallbackRate = options.fps ?? firstItemRate ?? 25;
  const startParsed = otioRationalTimeSchema.safeParse(skeleton?.global_start_time);
  const globalStart = startParsed.success ? startParsed.data : rationalTime(0, fallbackRate);
  const timelineMetadata = isRecord(otioMeta) ? otioMeta.timelineMetadata : undefined;
  const metadata = isRecord(timelineMetadata) ? timelineMetadata : undefined;

  const timeline: OtioTimeline = {
    OTIO_SCHEMA: "Timeline.1",
    name,
    global_start_time: globalStart,
    tracks: { OTIO_SCHEMA: "Stack.1", name: stackName, children: tracks },
    ...(metadata !== undefined ? { metadata } : {}),
  };

  const selfCheck = otioTimelineSchema.safeParse(timeline);
  if (!selfCheck.success) {
    return { ok: false, issues: [{ path: "$", problem: `assembled timeline failed self-check: ${selfCheck.error.message}` }] };
  }

  return {
    ok: true,
    timeline,
    serialized: serializeOtioCanonical(timeline),
    unplacedMembers: Object.freeze(unplacedMembers),
  };
}
