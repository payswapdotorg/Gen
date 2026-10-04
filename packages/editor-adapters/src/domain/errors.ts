/**
 * editor-adapters domain — error taxonomy (spec/media-provider-contract.md §3,
 * shared with media adapters; editor-adapter-contract.md §4).
 *
 * Pure: classes + kinds only, no IO. Adapters surface failures through these
 * kinds; `unsupported` feeds gap detection (lock P5) — never a silent failure.
 */

export const EDITOR_ERROR_KINDS = [
  "retryable",
  "capacity",
  "auth",
  "validation",
  "unsupported",
  "provider-internal",
] as const;

export type EditorErrorKind = (typeof EDITOR_ERROR_KINDS)[number];

/** Stable machine-readable codes layered on top of the shared taxonomy. */
export type EditorErrorCode =
  | "binary-missing"
  | "capability-not-served"
  | "render-surface-absent"
  | "unsupported-profile"
  | "idempotency-conflict"
  | "artifact-not-found"
  | "bad-params"
  | "bad-artifact"
  | "native-parse-failed"
  | "render-failed"
  | "internal";

export class EditorAdapterError extends Error {
  readonly kind: EditorErrorKind;
  readonly code: EditorErrorCode;
  readonly editorId: string;
  readonly detail?: string;
  /** Gap report id to surface when the failure represents a coverage gap (P5). */
  readonly gapId?: string;

  constructor(init: {
    kind: EditorErrorKind;
    code: EditorErrorCode;
    editorId: string;
    message: string;
    detail?: string;
    gapId?: string;
  }) {
    super(`[${init.editorId}] ${init.message}`);
    this.name = "EditorAdapterError";
    this.kind = init.kind;
    this.code = init.code;
    this.editorId = init.editorId;
    this.detail = init.detail;
    this.gapId = init.gapId;
  }

  /** Taxonomy view for the router/orchestrator (same shape as media adapters). */
  taxonomy(): { kind: EditorErrorKind; code: EditorErrorCode; editorId: string } {
    return { kind: this.kind, code: this.code, editorId: this.editorId };
  }
}

/** Exit-code mapping used by CLI adapters to classify process failures. */
export function classifyExitCode(exitCode: number): EditorErrorKind {
  if (exitCode === 0) return "validation";
  // Editors disagree on exit codes; only a small set is meaningfully mappable.
  if (exitCode === 2) return "validation";
  return "provider-internal";
}
