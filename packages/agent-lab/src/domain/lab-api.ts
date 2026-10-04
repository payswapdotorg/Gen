/**
 * Lab service API types (search / simulate / evaluate / certify) — the operation
 * contract of the Agent Organization Lab (spec/organization-lab.md).
 * Re-exported through contract.ts; pure data types, no IO.
 */
import type { OrganizationGraph, LabCatalogs } from "../contract.js";

export type AllocationPolicy = "premium-first" | "cheapest-reliable" | "quality-first";

/** Rule-based search request (organization-lab §2 — the five binding dimensions). */
export interface OrganizationSearchRequest {
  readonly goal: string;
  readonly goalClass: string;
  readonly catalogs: LabCatalogs;
  readonly policy: AllocationPolicy;
  readonly budgetEnvelopeUsd: number;
  readonly dimensions?: Partial<OrganizationSearchDimensions>;
  readonly maxCandidates?: number;
}

export interface OrganizationSearchDimensions {
  readonly roleStructure: boolean;
  readonly toolAllocation: boolean;
  readonly modelAllocation: boolean;
  readonly executionOrdering: boolean;
  readonly budgetAllocation: boolean;
}

export interface SearchCandidate {
  readonly graph: OrganizationGraph;
  readonly preScore: number;
  readonly dimensionChoices: Readonly<Record<string, string>>;
}

export interface OrganizationSearchResult {
  readonly goalClass: string;
  readonly candidates: readonly SearchCandidate[];
  readonly searchedDimensions: OrganizationSearchDimensions;
  readonly issues: readonly string[];
}

/** Fitness weights (organization-lab §4). Defaults mirror the spec example org. */
export interface FitnessWeights {
  readonly goal: number;
  readonly quality: number;
  readonly cost: number;
  readonly latency: number;
  readonly human: number;
  readonly failure: number;
}

export const DEFAULT_FITNESS_WEIGHTS: FitnessWeights = {
  goal: 0.4,
  quality: 0.3,
  cost: 0.1,
  latency: 0.1,
  human: 0.05,
  failure: 0.05,
};

/** Evaluation metrics for one simulated run (numbers reproducible from seed). */
export interface EvaluationMetrics {
  readonly fitness: number;
  readonly goalAchievement: number;
  readonly qualityScore: number;
  readonly costEfficiency: number;
  readonly latencyScore: number;
  readonly humanScore: number;
  readonly gapPenalty: number;
  readonly totalSpendUsd: number;
  readonly virtualClockMs: number;
  readonly approvalCount: number;
  readonly unresolvedGaps: number;
  readonly criteriaMet: number;
  readonly criteriaTotal: number;
}

/** Certification bar (organization-lab §4): scenario set + threshold + zero unresolved gaps. */
export interface CertificationBar {
  readonly scenarioSetRef: string;
  readonly minFitness: number;
  readonly requireAllCriteriaMet: boolean;
  readonly maxUnresolvedGaps: number;
}

export const DEFAULT_CERTIFICATION_BAR: CertificationBar = {
  scenarioSetRef: "packages/agent-lab/src/domain/scenarios",
  minFitness: 0.7,
  requireAllCriteriaMet: true,
  maxUnresolvedGaps: 0,
};

export interface CertificationScenarioResult {
  readonly scenarioId: string;
  readonly metrics: EvaluationMetrics;
}

export interface CertificationOutcome {
  readonly certified: boolean;
  readonly fitness: number;
  readonly issues: readonly string[];
  readonly evidence: {
    readonly scenarioSetRef: string;
    readonly replayRef: string;
    readonly certifiedAt: string;
    readonly gapReportsResolved: boolean;
  };
}

/** A committed evaluation record (reproducible from seed; git-tracked). */
export interface EvaluationRecord {
  readonly recordId: string;
  readonly organizationId: string;
  readonly scenarioSetRef: string;
  readonly seed: string;
  readonly weights: FitnessWeights;
  readonly scenarios: readonly {
    scenarioId: string;
    metrics: EvaluationMetrics;
    replayHash: string;
  }[];
  readonly aggregateFitness: number;
  readonly certified: boolean;
  readonly generatedBy: string;
}

/** Port: persistence for evaluation records + certified organization graphs. */
export interface EvaluationStore {
  readonly saveEvaluation: (record: EvaluationRecord) => void;
  readonly saveCertifiedOrganization: (graph: OrganizationGraph) => void;
  readonly listEvaluations: () => readonly EvaluationRecord[];
}
