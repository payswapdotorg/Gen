/**
 * editor-adapters domain — immutable project handles (spec/editor-adapter-contract.md §4).
 *
 * A handle binds: native project artifact + OTIO projection + working dir.
 * Mutating ops return a NEW handle; ids derive deterministically from
 * (base handle, idempotency key) so replays are stable without global state.
 * Pure functions only — no IO, no clock, no randomness.
 */

import type { EditorId } from "../contract.js";

export const EDITOR_IDS: readonly EditorId[] = [
  "mlt",
  "blender",
  "ffmpeg",
  "natron",
  "kdenlive",
  "losslesscut",
] as const;

/** Persisted, per-working-dir ledger + project pointer. Single state owner:
 *  the adapter instance that opened the working dir (see app/adapter-base.ts). */
export interface AppliedCommandRecord {
  readonly idempotencyKey: string;
  readonly commandDigest: string;
  readonly capabilityId: string;
  readonly resultingHandleId: string;
  readonly resultingProjectArtifactId: string;
}

export interface WorkingProjectState {
  readonly editorId: EditorId;
  readonly projectSeq: number;
  /** Current revision; r0 = the project exactly as opened/imported. */
  readonly revision: number;
  /** Relative to workingDir. */
  readonly projectFile: string;
  /** Relative to workingDir, when an OTIO projection has been exported. */
  readonly otioProjectionFile?: string;
  readonly appliedCommands: readonly AppliedCommandRecord[];
}

export interface ParsedHandleId {
  readonly editorId: EditorId;
  readonly projectSeq: number;
  readonly revision: number;
}

const HANDLE_PATTERN = /^h\.(mlt|blender|ffmpeg|natron|kdenlive|losslesscut)\.p(\d+)\.r(\d+)(?:-([a-z0-9-]{1,40}))?$/;

export function slugPart(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? slug : "k";
}

export function makeHandleId(editorId: EditorId, projectSeq: number, revision: number, key?: string): string {
  const base = `h.${editorId}.p${projectSeq}.r${revision}`;
  return key === undefined ? base : `${base}-${slugPart(key)}`;
}

export function parseHandleId(handleId: string): ParsedHandleId | undefined {
  const match = HANDLE_PATTERN.exec(handleId);
  if (match === null) return undefined;
  const seq = Number.parseInt(match[2] ?? "0", 10);
  const rev = Number.parseInt(match[3] ?? "0", 10);
  if (!Number.isFinite(seq) || !Number.isFinite(rev)) return undefined;
  return { editorId: match[1] as EditorId, projectSeq: seq, revision: rev };
}

/**
 * Deterministic handle succession: same (base, key) always yields the same id
 * (idempotent replay); different keys diverge. Revision increments by one.
 */
export function nextHandleId(baseHandleId: string, idempotencyKey: string): string | undefined {
  const parsed = parseHandleId(baseHandleId);
  if (parsed === undefined) return undefined;
  return makeHandleId(parsed.editorId, parsed.projectSeq, parsed.revision + 1, idempotencyKey);
}

/** Stable digest of a command for idempotency conflict detection. */
export function commandDigest(capabilityId: string, params: Readonly<Record<string, unknown>>): string {
  return `d:${capabilityId}:${stableStringify(params)}`;
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export function stateFileFor(projectSeq: number): string {
  return `state.p${projectSeq}.json`;
}

export function projectFileFor(revision: number, extension: string): string {
  return `project.r${revision}.${extension}`;
}
