/**
 * editor-adapters domain — OTIO parse + fidelity declarations.
 *
 * `parseOtio` accepts the subset `model.ts` serializes (plus Gap tracks) and
 * rejects anything else with a precise error: lossy or foreign OTIO is never
 * silently reinterpreted (lock P5 — failures surface, never hallucinate).
 */

import type { OtioClip, OtioGap, OtioItem, OtioTimeline, OtioTrack } from "./model.js";

export type OtioParseIssue = { readonly path: string; readonly problem: string };

export type OtioParseResult =
  | { readonly ok: true; readonly timeline: OtioTimeline }
  | { readonly ok: false; readonly issues: readonly OtioParseIssue[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRationalTime(value: unknown, path: string, issues: OtioParseIssue[]) {
  if (!isObject(value) || value.OTIO_SCHEMA !== "RationalTime.1") {
    issues.push({ path, problem: "expected RationalTime.1" });
    return undefined;
  }
  const rate = value.rate;
  const val = value.value;
  if (typeof rate !== "number" || typeof val !== "number") {
    issues.push({ path, problem: "RationalTime rate/value must be numbers" });
    return undefined;
  }
  return { OTIO_SCHEMA: "RationalTime.1" as const, rate, value: val };
}

function parseTimeRange(value: unknown, path: string, issues: OtioParseIssue[]) {
  if (!isObject(value) || value.OTIO_SCHEMA !== "TimeRange.1") {
    issues.push({ path, problem: "expected TimeRange.1" });
    return undefined;
  }
  const startTime = parseRationalTime(value.start_time, `${path}.start_time`, issues);
  const duration = parseRationalTime(value.duration, `${path}.duration`, issues);
  if (startTime === undefined || duration === undefined) return undefined;
  return {
    OTIO_SCHEMA: "TimeRange.1" as const,
    start_time: startTime,
    duration,
  };
}

function parseMediaReference(value: unknown, path: string, issues: OtioParseIssue[]) {
  if (value === null) return null;
  if (!isObject(value)) {
    issues.push({ path, problem: "media_reference must be an object or null" });
    return null;
  }
  if (value.OTIO_SCHEMA === "MissingReference.1") {
    const name = typeof value.name === "string" ? value.name : "";
    return { OTIO_SCHEMA: "MissingReference.1" as const, name };
  }
  if (value.OTIO_SCHEMA === "ExternalReference.1") {
    if (typeof value.target_url !== "string") {
      issues.push({ path, problem: "ExternalReference requires target_url" });
      return null;
    }
    const available = value.available_range;
    if (available === undefined) {
      return { OTIO_SCHEMA: "ExternalReference.1" as const, target_url: value.target_url };
    }
    const range = parseTimeRange(available, `${path}.available_range`, issues);
    if (range === undefined) return null;
    return {
      OTIO_SCHEMA: "ExternalReference.1" as const,
      target_url: value.target_url,
      available_range: range,
    };
  }
  issues.push({ path, problem: `unsupported media_reference schema: ${String(value.OTIO_SCHEMA)}` });
  return null;
}

function parseItem(value: unknown, path: string, issues: OtioParseIssue[]): OtioItem | undefined {
  if (!isObject(value)) {
    issues.push({ path, problem: "expected item object" });
    return undefined;
  }
  const sourceRange = parseTimeRange(value.source_range, `${path}.source_range`, issues);
  const name = typeof value.name === "string" ? value.name : "";
  if (sourceRange === undefined) return undefined;
  if (value.OTIO_SCHEMA === "Gap.1") {
    const gap: OtioGap = { OTIO_SCHEMA: "Gap.1", name, source_range: sourceRange };
    return gap;
  }
  if (value.OTIO_SCHEMA === "Clip.1") {
    const clip: OtioClip = {
      OTIO_SCHEMA: "Clip.1",
      name,
      source_range: sourceRange,
      media_reference: parseMediaReference(value.media_reference, `${path}.media_reference`, issues),
      metadata: isObject(value.metadata) ? value.metadata : undefined,
    };
    return clip;
  }
  issues.push({ path, problem: `unsupported item schema: ${String(value.OTIO_SCHEMA)}` });
  return undefined;
}

function parseTrack(value: unknown, path: string, issues: OtioParseIssue[]): OtioTrack | undefined {
  if (!isObject(value) || value.OTIO_SCHEMA !== "Track.1") {
    issues.push({ path, problem: "expected Track.1" });
    return undefined;
  }
  const kind = value.kind === "Audio" ? "Audio" : value.kind === "Video" ? "Video" : undefined;
  if (kind === undefined) {
    issues.push({ path, problem: "track kind must be Video or Audio" });
    return undefined;
  }
  if (!Array.isArray(value.children)) {
    issues.push({ path, problem: "track children must be an array" });
    return undefined;
  }
  const children: OtioItem[] = [];
  value.children.forEach((child, index) => {
    const item = parseItem(child, `${path}.children[${index}]`, issues);
    if (item !== undefined) children.push(item);
  });
  return {
    OTIO_SCHEMA: "Track.1",
    name: typeof value.name === "string" ? value.name : "",
    kind,
    children,
  };
}

export function parseOtio(text: string): OtioParseResult {
  const issues: OtioParseIssue[] = [];
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch (error) {
    return { ok: false, issues: [{ path: "$", problem: `invalid JSON: ${String(error)}` }] };
  }
  if (!isObject(root) || root.OTIO_SCHEMA !== "Timeline.1") {
    return { ok: false, issues: [{ path: "$", problem: "expected Timeline.1 root" }] };
  }
  const globalStart = parseRationalTime(root.global_start_time, "$.global_start_time", issues);
  if (!isObject(root.tracks) || root.tracks.OTIO_SCHEMA !== "Stack.1" || !Array.isArray(root.tracks.children)) {
    issues.push({ path: "$.tracks", problem: "expected Stack.1 with children" });
  }
  const tracks: OtioTrack[] = [];
  if (isObject(root.tracks) && Array.isArray(root.tracks.children)) {
    root.tracks.children.forEach((child, index) => {
      const track = parseTrack(child, `$.tracks.children[${index}]`, issues);
      if (track !== undefined) tracks.push(track);
    });
  }
  if (globalStart === undefined || issues.length > 0) return { ok: false, issues };
  const timeline: OtioTimeline = {
    OTIO_SCHEMA: "Timeline.1",
    name: typeof root.name === "string" ? root.name : "",
    global_start_time: globalStart,
    tracks: {
      OTIO_SCHEMA: "Stack.1",
      name: isObject(root.tracks) && typeof root.tracks.name === "string" ? root.tracks.name : "tracks",
      children: tracks,
    },
    metadata: isObject(root.metadata) ? root.metadata : undefined,
  };
  return { ok: true, timeline };
}

/**
 * Round-trip fidelity contract per editor (editor-adapter-contract.md §3:
 * lossy round-trips are DECLARED, never silent). Consumed by
 * exportOtio/importOtio and asserted in the conformance scenarios.
 */
export interface OtioFidelity {
  /** Features preserved exactly through otio → native → otio. */
  readonly preserved: readonly string[];
  /** Features quantized or approximated (with the rule). */
  readonly lossy: readonly { readonly feature: string; readonly rule: string }[];
  /** Features dropped on import into the native project. */
  readonly dropped: readonly string[];
}
