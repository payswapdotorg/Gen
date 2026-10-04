/**
 * editor-adapters domain — render job state machine (shared lifecycle with
 * media-provider-contract.md §3: queued → running → succeeded | failed |
 * cancelled). Pure transition validation; the app-layer JobManager owns the
 * records, adapters-layer ports observe real processes.
 */

import type { EditorJobStatus } from "../contract.js";

const TRANSITIONS: Readonly<Record<EditorJobStatus, readonly EditorJobStatus[]>> = {
  queued: ["running", "cancelled", "failed"],
  running: ["succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: EditorJobStatus, to: EditorJobStatus): boolean {
  const allowed = TRANSITIONS[from];
  return allowed !== undefined && allowed.includes(to);
}

export function isTerminal(status: EditorJobStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

export type JobTransitionError = { readonly from: EditorJobStatus; readonly to: EditorJobStatus };

/** Result wrapper so callers never need try/catch in pure flows. */
export function transition(
  from: EditorJobStatus,
  to: EditorJobStatus,
): { ok: true; status: EditorJobStatus } | { ok: false; error: JobTransitionError } {
  if (!canTransition(from, to)) return { ok: false, error: { from, to } };
  return { ok: true, status: to };
}

/** Map an OS process outcome onto the shared lifecycle. */
export function processOutcomeToStatus(
  exited: boolean,
  exitCode: number | null,
): EditorJobStatus {
  if (!exited) return "running";
  return exitCode === 0 ? "succeeded" : "failed";
}
