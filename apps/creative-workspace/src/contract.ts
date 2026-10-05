/**
 * @gen/creative-workspace — public contract (lock §6).
 *
 * Mirrors spec/schemas/task-plan.schema.json (P4: no black-box generation)
 * for the user-facing workspace surface, plus ADDITIVE view-model types that
 * describe how the workspace surfaces committed records: evidence links
 * (completed items), gap links (blocked items) and alternative routing
 * deltas (switchable paths). The JSON Schema stays the source of truth —
 * every TaskPlan field is carried verbatim inside TaskPlanView.plan; the
 * view models add linkage, never replace schema fields.
 */
export type BlockedKind = "capability" | "provider" | "input" | "human-approval";

export interface TaskPlanCompletedItem {
  readonly item: string;
  readonly evidence: readonly string[];
}

export interface TaskPlanNextAction {
  readonly action: string;
  readonly ownerNode?: string;
  readonly eta?: string;
}

export interface TaskPlanBlockedItem {
  readonly reason: string;
  readonly kind: BlockedKind;
  /** REQUIRED when kind=capability (P5 tie-in). */
  readonly capabilityGapRef?: string;
  readonly missingInput?: string;
}

export interface TaskPlanAlternative {
  readonly path: string;
  readonly tradeoffs: string;
}

/** The Zcode-style task plan every user-facing workflow must expose. */
export interface TaskPlan {
  readonly planId: string;
  readonly goal: string;
  readonly currentStep: string;
  readonly completed: readonly TaskPlanCompletedItem[];
  readonly next: readonly TaskPlanNextAction[];
  readonly blocked: readonly TaskPlanBlockedItem[];
  readonly alternative: readonly TaskPlanAlternative[];
  readonly updatedAt: string;
  readonly runRecordRef?: string;
}

// ---------------------------------------------------------------------------
// Workspace view models (additive — work order task 8).
//
// task-plan.schema.json is the source of truth for the TaskPlan record. These
// types describe the WORKSPACE SURFACE over committed records: where evidence
// refs resolve, how blocked items link their gap reports, and the
// cost/latency/quality deltas shown before switching an alternative path.
// ---------------------------------------------------------------------------

/** The committed harness scenarios the workspace mounts (acceptance-facing). */
export type WorkspaceScenarioId =
  | "documentary-cinematic"
  | "forced-failure"
  | "replace-actor-alternatives";

export type EvidenceLinkKind =
  | "run-event"
  | "run-artifact"
  | "gate-result"
  | "declared-ref";

/** One evidence ref on a completed item, resolved against committed records. */
export interface EvidenceLink {
  /** The ref exactly as written in the plan (schema field, verbatim). */
  readonly ref: string;
  readonly kind: EvidenceLinkKind;
  readonly label: string;
  /** Committed repo-relative record(s) backing the ref. */
  readonly sourcePaths: readonly string[];
  /** Human detail for the backing record (event line, metric…). */
  readonly detail?: string;
}

/** A capability gap report linked from a blocked item (P5 tie-in). */
export interface GapLink {
  /** The capabilityGapRef exactly as written in the plan (verbatim). */
  readonly ref: string;
  readonly gapId: string;
  readonly gapKind: string;
  /** Arena state recorded in the committed gap report. */
  readonly arenaState: string;
  readonly summary: string;
  readonly severity: string;
  readonly goalClass: string;
  readonly requestedCapabilityId?: string;
  readonly proposedCapabilityId?: string;
  readonly sourcePath: string;
}

export type AlternativeDeltaDimension = "cost" | "latency" | "quality" | "reliability";

/** A cost/latency/quality delta shown BEFORE switching to an alternative. */
export interface AlternativeDelta {
  readonly dimension: AlternativeDeltaDimension;
  /** Measured value on the current/active path. */
  readonly current: string;
  /** Measured value on the candidate path. */
  readonly candidate: string;
  /** Human-readable delta of candidate vs current. */
  readonly delta: string;
  /** Provenance: the committed record the numbers come from. */
  readonly source: string;
}

/** An alternative routing path with schema-declared tradeoffs + measured deltas. */
export interface AlternativeView {
  readonly path: string;
  readonly tradeoffs: string;
  readonly deltas: readonly AlternativeDelta[];
  readonly active: boolean;
}

/** Completed item with resolved evidence (no evidence → verified=false). */
export interface CompletedItemView {
  readonly item: string;
  /** false when the item carries no evidence — such claims get no completion mark. */
  readonly verified: boolean;
  readonly evidence: readonly EvidenceLink[];
}

/** Blocked item with reason, kind and (for capability gaps) the linked report. */
export interface BlockedItemView {
  readonly reason: string;
  readonly kind: BlockedKind;
  readonly capabilityGapRef?: string;
  readonly missingInput?: string;
  /** Present when kind=capability and the referenced gap report resolves. */
  readonly gap?: GapLink;
}

/** The plan surface: schema-exact plan + resolved links/deltas. */
export interface TaskPlanView {
  readonly plan: TaskPlan;
  readonly completed: readonly CompletedItemView[];
  readonly next: readonly TaskPlanNextAction[];
  readonly blocked: readonly BlockedItemView[];
  readonly alternative: readonly AlternativeView[];
}

export interface RunEventView {
  readonly seq: number;
  readonly type: string;
  readonly atMs: number;
  readonly node?: string;
  readonly stage?: string;
  readonly detail: string;
}

/** Run-record view (simulation evidence: events, artifacts, criteria, telemetry). */
export interface RunRecordView {
  readonly runId: string;
  readonly runRecordRef: string;
  readonly scenarioId: string;
  readonly organizationId: string;
  readonly seed: string;
  readonly replayHash: string;
  readonly finished: boolean;
  readonly failureReason?: string;
  readonly totalSpendUsd: number;
  readonly approvalCount: number;
  readonly artifacts: readonly string[];
  readonly events: readonly RunEventView[];
  readonly criteriaResults: readonly { readonly id: string; readonly description: string; readonly met: boolean }[];
  /** One snapshot per stage transition (P4: plans persist in run records). */
  readonly planSnapshots: readonly {
    readonly stageId: string;
    readonly completedCount: number;
    readonly totalStages: number;
    readonly currentStep: string;
  }[];
}

export interface OrganizationNodeView {
  readonly nodeId: string;
  readonly kind: "agent-instance" | "human" | "capability-invocation";
  readonly label: string;
  readonly bodyId?: string;
  /** providerId/modelId — the model inhabiting the body (P2). */
  readonly model?: string;
  readonly role?: string;
}

/** The agent organization behind the plan (P2: bodies stable, models named per node). */
export interface OrganizationView {
  readonly id: string;
  readonly goal: string;
  readonly goalClass: string;
  readonly certified: boolean;
  readonly fitness?: number;
  readonly certificationNote?: string;
  readonly certificationEvidence?: {
    readonly scenarioSetRef: string;
    readonly replayRef: string;
    readonly certifiedAt?: string;
    readonly gapReportsResolved?: boolean;
  };
  readonly nodes: readonly OrganizationNodeView[];
  readonly stages: readonly { readonly stageId: string; readonly nodeIds: readonly string[] }[];
}

/** Full gap report detail (linked from blocked items, arena chain visible). */
export interface GapReportView {
  readonly gapId: string;
  readonly gapKind: string;
  readonly detectedAt: string;
  readonly arenaState: string;
  readonly summary: string;
  readonly routerDecisionTrace?: string;
  readonly severity: string;
  readonly goalClass: string;
  readonly requestedCapabilityId?: string;
  readonly proposedCapabilityId?: string;
  readonly expertSessionRef?: string;
  readonly certificationEvidence?: string;
  readonly sourcePath: string;
}

/** One mounted workspace scenario: plan + run + organization + gap reports. */
export interface WorkspaceMount {
  readonly scenarioId: WorkspaceScenarioId;
  readonly title: string;
  readonly summary: string;
  readonly planView: TaskPlanView;
  readonly run?: RunRecordView;
  readonly organization?: OrganizationView;
  readonly gapReports: readonly GapReportView[];
  /** Committed records this mount was assembled from (repo-relative). */
  readonly provenance: readonly string[];
}

/** Loading/ready/error state machine — loading shows the plan skeleton (never a bare spinner). */
export type WorkspaceLoadState =
  | { readonly phase: "loading"; readonly scenarioId: WorkspaceScenarioId; readonly note: string }
  | { readonly phase: "ready"; readonly mount: WorkspaceMount }
  | { readonly phase: "error"; readonly scenarioId: WorkspaceScenarioId; readonly message: string };
