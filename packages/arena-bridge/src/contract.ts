/**
 * @gen/arena-bridge — public contract (lock §6).
 *
 * Mirrors spec/schemas/capability-gap.schema.json (P5: failure produces gap
 * reports, never hallucination) and the Arena state machine
 * (spec/human-escalation-contract.md).
 * Phase 0: core types; Worker 3 implements the gap store, arena request
 * builder, expert-session ingest and certification validator
 * (work/worker-3-mos-lab-arena.md).
 */

export type CapabilityGapKind =
  | "missing-capability"
  | "mapping-shortfall"
  | "organizational-gap"
  | "editor-coverage-gap";

/** Arena state machine (human-escalation-contract.md §1). */
export type ArenaState =
  | "detected"
  | "reported"
  | "arena-requested"
  | "expert-session"
  | "proposed"
  | "certifying"
  | "certified"
  | "available"
  | "rejected"
  | "wont-fix";

export interface GapFailureEvidence {
  readonly summary: string;
  readonly routerDecisionTrace?: string;
  readonly comparisonTableRef?: string;
  readonly adapterErrorRecords?: readonly string[];
  readonly organizationRunRef?: string;
  readonly artifactRefs?: readonly string[];
}

export interface GapImpact {
  readonly goalClass: string;
  readonly severity: "low" | "medium" | "high" | "critical";
  readonly frequency?: string;
}

export interface CapabilityGapReport {
  readonly gapId: string;
  readonly detectedAt: string;
  readonly requestedCapability: {
    intent: string;
    capabilityId?: string;
    parameters?: Record<string, unknown>;
  };
  readonly kind: CapabilityGapKind;
  readonly failureEvidence: GapFailureEvidence;
  readonly impact: GapImpact;
  readonly arena: {
    state: ArenaState;
    requestId?: string;
    expertSessionRef?: string;
    proposedCapabilityId?: string;
    certificationEvidence?: string;
    rationale?: string;
  };
}

/** Expert session record (ingested from Arena humans). */
export interface ExpertSessionRecord {
  readonly sessionId: string;
  readonly gapIds: readonly string[];
  readonly decision: "propose-capability" | "reject" | "wont-fix" | "needs-info";
  readonly proposedCapabilityId?: string;
  readonly rationale: string;
  readonly recordedAt: string;
}

/**
 * Certification follows the standard capability gate (schema + conformance +
 * mapping) — Arena-sourced capabilities are NOT exempt (lock §7).
 */
export interface CertificationRecord {
  readonly capabilityId: string;
  readonly providerMapping: string;
  readonly scenarioRefs: readonly string[];
  readonly evidenceRef: string;
  readonly certifiedAt: string;
}
