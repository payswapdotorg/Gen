/**
 * @gen/arena-bridge — public contract (lock §6).
 *
 * Mirrors spec/schemas/capability-gap.schema.json (P5: failure produces gap
 * reports, never hallucination) and the Arena state machine
 * (spec/human-escalation-contract.md).
 * Implemented per work/worker-3-mos-lab-arena.md. Self-contained type mirror:
 * no imports from ./domain (architecture check: forbidCycles).
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

/**
 * Gap signal as emitted by the organization lab / router (P5). Structurally
 * the capability-gap schema minus the arena block — the ingest input. Declared
 * here (not imported from @gen/agent-lab) because arena-bridge does not
 * require agent-lab in the architecture policy; the shape is the shared
 * schema contract.
 */
export interface GapSignalInput {
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
}

/** Append-oriented transition log entry (audit trail, P6). */
export interface GapTransitionEntry {
  readonly gapId: string;
  readonly from: ArenaState;
  readonly to: ArenaState;
  readonly at: string;
  readonly via: string;
  readonly detail?: string;
}

/** Port: persistence for gap reports + the append-only transition log. */
export interface GapStore {
  readonly save: (report: CapabilityGapReport) => void;
  readonly get: (gapId: string) => CapabilityGapReport | undefined;
  readonly list: () => readonly CapabilityGapReport[];
  readonly appendTransition: (entry: GapTransitionEntry) => void;
}
