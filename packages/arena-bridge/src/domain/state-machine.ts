/**
 * Arena state machine (human-escalation-contract.md §1, work order C10):
 * detected → reported → arena-requested → expert-session → proposed →
 * certifying → certified → available, with optional terminal states
 * rejected / wont-fix (recorded rationale). Pure transitions over the store —
 * no IO, no clocks (timestamps are carried by callers so committed evidence
 * stays deterministic).
 */
import type {
  ArenaState,
  CapabilityGapReport,
  ExpertSessionRecord,
} from "../contract.js";

/** The happy-path chain, in order. */
export const ARENA_CHAIN: readonly ArenaState[] = [
  "detected",
  "reported",
  "arena-requested",
  "expert-session",
  "proposed",
  "certifying",
  "certified",
  "available",
];

export const TERMINAL_STATES: readonly ArenaState[] = ["available", "rejected", "wont-fix"];

export function isTerminal(state: ArenaState): boolean {
  return TERMINAL_STATES.includes(state);
}

/** Guarded legality: which transitions exist and from where. */
export function canTransition(from: ArenaState, to: ArenaState): boolean {
  if (from === to) return false;
  if (isTerminal(from)) return false;
  if (to === "rejected" || to === "wont-fix") return true; // rationale required, see below
  const index = ARENA_CHAIN.indexOf(from);
  const target = ARENA_CHAIN.indexOf(to);
  if (index === -1 || target === -1) return false;
  // Chain transitions advance exactly one step.
  return target === index + 1;
}

export type TransitionResult =
  | { readonly ok: true; readonly report: CapabilityGapReport }
  | { readonly ok: false; readonly issue: string };

function withArena(
  report: CapabilityGapReport,
  arena: Partial<CapabilityGapReport["arena"]>,
): CapabilityGapReport {
  return { ...report, arena: { ...report.arena, ...arena } };
}

/**
 * detected → reported: the gap is recorded in the committed store (P6).
 * The evidence bundle is the failure evidence already captured at detection.
 */
export function reportGap(report: CapabilityGapReport): TransitionResult {
  return applyTransition(report, "reported", {}, "reportGap");
}

/** reported → arena-requested: the request carries the evidence bundle. */
export function requestArena(
  report: CapabilityGapReport,
  requestId: string,
): TransitionResult {
  return applyTransition(report, "arena-requested", { requestId }, "requestArena");
}

/**
 * arena-requested → expert-session: an expert session record is ingested.
 * The session decision drives the next step:
 *  - propose-capability → expert-session (awaiting the formal proposal)
 *  - needs-info → stays in expert-session (no state change, information pending)
 *  - reject → rejected, wont-fix → wont-fix (rationale recorded)
 */
export function ingestExpertSession(
  report: CapabilityGapReport,
  session: ExpertSessionRecord,
): TransitionResult {
  if (!session.gapIds.includes(report.gapId)) {
    return { ok: false, issue: `expert session ${session.sessionId} does not reference gap ${report.gapId}` };
  }
  if (
    report.arena.state !== "arena-requested" &&
    report.arena.state !== "expert-session"
  ) {
    return {
      ok: false,
      issue: `ingestExpertSession requires arena-requested (or a follow-up in expert-session), gap ${report.gapId} is ${report.arena.state}`,
    };
  }
  if (session.decision === "reject" || session.decision === "wont-fix") {
    const to: ArenaState = session.decision === "reject" ? "rejected" : "wont-fix";
    return applyTransition(report, to, { rationale: session.rationale }, "ingestExpertSession");
  }
  if (session.decision === "needs-info" || report.arena.state === "expert-session") {
    // Information pending, or a follow-up session while one is already recorded:
    // the STATE stays expert-session — this is a record update, not a transition.
    return {
      ok: true,
      report: { ...report, arena: { ...report.arena, state: "expert-session", expertSessionRef: session.sessionId } },
    };
  }
  return applyTransition(
    report,
    "expert-session",
    { expertSessionRef: session.sessionId },
    "ingestExpertSession",
  );
}

/** expert-session → proposed: the capability proposal is on the table. */
export function proposeCapability(
  report: CapabilityGapReport,
  proposedCapabilityId: string,
): TransitionResult {
  return applyTransition(
    report,
    "proposed",
    { proposedCapabilityId },
    "proposeCapability",
  );
}

/** proposed → certifying: certification evidence is submitted for the standard gate. */
export function submitCertification(
  report: CapabilityGapReport,
  certificationEvidence: string,
): TransitionResult {
  return applyTransition(
    report,
    "certifying",
    { certificationEvidence },
    "submitCertification",
  );
}

/** certifying → certified: the standard gate PASSED (validated by the caller). */
export function certifyGap(report: CapabilityGapReport): TransitionResult {
  return applyTransition(report, "certified", {}, "certifyGap");
}

/** certified → available: published to lab availability (router + org search). */
export function publishAvailability(report: CapabilityGapReport): TransitionResult {
  return applyTransition(report, "available", {}, "publishAvailability");
}

/** Any non-terminal state → rejected / wont-fix, rationale required. */
export function closeGap(
  report: CapabilityGapReport,
  to: "rejected" | "wont-fix",
  rationale: string,
): TransitionResult {
  if (rationale.trim().length === 0) {
    return { ok: false, issue: "terminal states require a recorded rationale" };
  }
  return applyTransition(report, to, { rationale }, "closeGap");
}

function applyTransition(
  report: CapabilityGapReport,
  to: ArenaState,
  arena: Partial<CapabilityGapReport["arena"]>,
  via: string,
): TransitionResult {
  const from = report.arena.state;
  if (!canTransition(from, to)) {
    return { ok: false, issue: `${via}: illegal transition ${from} → ${to} for gap ${report.gapId}` };
  }
  return { ok: true, report: withArena(report, { ...arena, state: to }) };
}
