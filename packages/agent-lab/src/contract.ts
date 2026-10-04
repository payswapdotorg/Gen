/**
 * @gen/agent-lab — public contract (lock §6).
 *
 * Mirrors spec/schemas/agent-body.schema.json,
 * spec/schemas/agent-instance.schema.json and
 * spec/schemas/organization-graph.schema.json (compile-time mirror).
 * Phase 0: core types; Worker 3 implements the body registry, organization
 * search, simulation and evaluation loop (work/worker-3-mos-lab-arena.md).
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
