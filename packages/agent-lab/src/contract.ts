/**
 * @gen/agent-lab — public contract (lock §6).
 *
 * Mirrors spec/schemas/agent-body.schema.json,
 * spec/schemas/agent-instance.schema.json,
 * spec/schemas/organization-graph.schema.json and
 * spec/schemas/task-plan.schema.json (compile-time mirror; runtime zod
 * bindings live in domain/schema — parity is tested).
 * Implemented per work/worker-3-mos-lab-arena.md.
 */

/** P2: a model inhabits a body — bodies never name concrete model ids. */
export type Modality =
  | "text-in"
  | "image-in"
  | "video-in"
  | "audio-in"
  | "text-out"
  | "image-out"
  | "video-out"
  | "audio-out";

export type QualityClass = "lightweight" | "standard" | "flagship";

export interface ModelRequirements {
  readonly modalities: readonly Modality[];
  readonly qualityClass: QualityClass;
  readonly minContextTokens?: number;
  readonly latencyClass?: "subsecond" | "seconds" | "minutes" | "hours" | "interactive";
  readonly notes?: string;
}

export interface DecisionInterface {
  readonly inputSchema: string;
  readonly outputSchema: string;
  readonly notes?: string;
}

export interface PossessionClass {
  readonly id: string;
  readonly description: string;
  readonly grants?: readonly string[];
  readonly limits?: string;
}

export interface AgentBodyDescriptor {
  readonly id: string;
  readonly version: string;
  readonly role: string;
  readonly summary: string;
  readonly decisionInterface: DecisionInterface;
  readonly percepts: readonly { kind: string; description: string }[];
  readonly actuators: { capabilityIds: readonly string[]; tools?: readonly string[] };
  readonly possessionClasses: readonly PossessionClass[];
  readonly modelRequirements: ModelRequirements;
  readonly contextSchema: string;
  readonly evaluationCriteria: readonly { id: string; description: string; measurement?: string }[];
  readonly lifecycle: { state: "created" | "active" | "deprecated"; created?: string; deprecated?: string; supersededBy?: string };
}

/** Agent Instance = body version + cognitive model + possessions + environment (+ out-of-band runtime state). */
export interface CognitiveModelBinding {
  readonly providerId: string;
  readonly modelId: string;
}

export interface AgentInstanceDescriptor {
  readonly instanceId: string;
  readonly bodyId: string;
  readonly bodyVersion: string;
  readonly cognitiveModel: CognitiveModelBinding;
  readonly possessionConfig: {
    readonly grants: readonly { class: string; items?: readonly string[] }[];
    readonly budget?: { currency?: string; maxSpend?: number; computeMinutes?: number };
  };
  readonly environment: {
    readonly workspaceRef?: string;
    readonly artifactStoreRef?: string;
    readonly sandboxRef?: string;
  };
  /** Runtime state lives in the organization run store — NEVER in this descriptor. */
  readonly runtimeStatePointer?: {
    readonly runRecordRef?: string;
    readonly phase?: "idle" | "thinking" | "acting" | "waiting-human" | "done" | "failed";
  };
}

/** Organization graph (spec/organization-lab.md). */
export type OrganizationNodeKind = "agent-instance" | "human" | "capability-invocation";

export type OrganizationEdgeKind = "delegation" | "review" | "artifact-flow" | "approval";

export interface OrganizationStage {
  readonly stageId: string;
  readonly nodeIds: readonly string[];
  readonly dependsOn?: readonly string[];
  readonly checkpoint?: boolean;
}

export interface OrganizationGraph {
  readonly id: string;
  readonly goal: string;
  readonly goalClass: string;
  readonly nodes: readonly {
    nodeId: string;
    kind: OrganizationNodeKind;
    agentInstance?: { bodyId: string; bodyVersion?: string; instanceId?: string; cognitiveModel: CognitiveModelBinding };
    human?: { role: string; decisionInterface?: string; approvalGates?: readonly string[] };
    capabilityInvocation?: { capabilityId: string; parameterBindings?: Record<string, unknown>; providerPolicy?: string };
  }[];
  readonly edges: readonly { from: string; to: string; kind: OrganizationEdgeKind; notes?: string }[];
  readonly allocations: {
    modelAllocation?: Record<string, CognitiveModelBinding>;
    toolAllocation?: Record<string, readonly string[]>;
    budgetAllocation?: Record<string, { maxSpend?: number; computeMinutes?: number }>;
    executionOrder: readonly OrganizationStage[];
  };
  readonly simulation?: { seed?: string; scenarioRefs?: readonly string[] };
  readonly evaluation?: OrganizationEvaluation;
}

/** Fitness evaluation (organization-lab §4) — numbers reproducible from seed. */
export interface OrganizationEvaluation {
  readonly certified: boolean;
  readonly fitness?: number;
  readonly weights?: Record<string, number>;
  readonly metrics?: Record<string, number>;
  readonly certificationEvidence?: {
    scenarioSetRef: string;
    replayRef: string;
    certifiedAt?: string;
    gapReportsResolved?: boolean;
  };
}

/** Search-space dimensions (binding, spec/organization-lab.md §2). */
export interface OrganizationSearchSpace {
  readonly roleStructure: boolean;
  readonly toolAllocation: boolean;
  readonly modelAllocation: boolean;
  readonly executionOrdering: boolean;
  readonly budgetAllocation: boolean;
}

/** TaskPlan (P4) — same schema in simulation and runtime (spec/task-plan.md). */
export interface TaskPlan {
  readonly planId: string;
  readonly goal: string;
  readonly currentStep: string;
  readonly completed: readonly { item: string; evidence: readonly string[] }[];
  readonly next: readonly { action: string; ownerNode?: string; eta?: string }[];
  readonly blocked: readonly {
    reason: string;
    kind: "capability" | "provider" | "input" | "human-approval";
    capabilityGapRef?: string;
    missingInput?: string;
  }[];
  readonly alternative: readonly { path: string; tradeoffs: string }[];
  readonly updatedAt: string;
  readonly runRecordRef?: string;
}

/** Capability-gap draft emitted by the lab (P5); recorded by @gen/arena-bridge. */
export type GapSignalKind =
  | "missing-capability"
  | "mapping-shortfall"
  | "organizational-gap"
  | "editor-coverage-gap";

export type GapSeverity = "low" | "medium" | "high" | "critical";

export interface GapSignalDraft {
  readonly gapId: string;
  readonly detectedAt: string;
  readonly requestedCapability: {
    intent: string;
    capabilityId?: string;
    parameters?: Record<string, unknown>;
  };
  readonly kind: GapSignalKind;
  readonly failureEvidence: {
    summary: string;
    routerDecisionTrace?: string;
    comparisonTableRef?: string;
    adapterErrorRecords?: readonly string[];
    organizationRunRef?: string;
    artifactRefs?: readonly string[];
  };
  readonly impact: { goalClass: string; severity: GapSeverity; frequency?: string };
}

/** Frozen catalog ports over the provider/capability planes (P1/P3 — the lab never re-implements them). */
export interface ModelCatalogEntry {
  readonly providerId: string;
  readonly modelId: string;
  readonly modalities: readonly string[];
  readonly qualityClass: QualityClass;
  readonly contextTokens?: number;
  readonly latencyClass?: string;
  readonly costPerDecisionUsd?: number;
}

export interface CapabilityCatalogEntry {
  readonly capabilityId: string;
  readonly domain: string;
  readonly status: string;
}

export interface LabCatalogs {
  readonly models: readonly ModelCatalogEntry[];
  readonly capabilities: readonly CapabilityCatalogEntry[];
}

/** Deterministic simulation telemetry (per node, bounded). */
export interface NodeTelemetry {
  readonly node: string;
  readonly bodyId?: string;
  readonly decisions: number;
  readonly capabilityInvocations: number;
  readonly spendUsd: number;
  readonly qualityScores: readonly number[];
}

export interface SimulationEvent {
  readonly seq: number;
  readonly atMs: number;
  readonly type:
    | "stage-started"
    | "node-acted"
    | "capability-invoked"
    | "artifact-produced"
    | "review-verdict"
    | "approval-recorded"
    | "plan-updated"
    | "gap-signaled"
    | "stage-completed"
    | "run-finished";
  readonly node?: string;
  readonly stage?: string;
  readonly detail: string;
}

export interface SimulationRunRecord {
  readonly runId: string;
  readonly organizationId: string;
  readonly scenarioId: string;
  readonly seed: string;
  readonly virtualClockMs: number;
  readonly events: readonly SimulationEvent[];
  readonly telemetry: {
    readonly byNode: Readonly<Record<string, NodeTelemetry>>;
    readonly totalSpendUsd: number;
    readonly approvalCount: number;
  };
  readonly artifacts: readonly string[];
  readonly taskPlans: readonly TaskPlan[];
  readonly gapSignals: readonly GapSignalDraft[];
  readonly criteriaResults: readonly { id: string; description: string; met: boolean }[];
  readonly replayHash: string;
  readonly finished: boolean;
  readonly failureReason?: string;
}

/**
 * NOTE (layer rule): the lab service API types (search request/result, fitness
 * weights, certification bar, evaluation records + store port) live in
 * ./domain/lab-api.ts and are surfaced through src/index.ts — re-exporting
 * them here would create a contract ↔ domain import cycle (architecture
 * check: forbidCycles). contract.ts stays a self-contained schema mirror.
 */

