/**
 * Lab service API types (search / simulate / evaluate / certify) — the operation
 * contract of the Agent Organization Lab (spec/organization-lab.md).
 * Re-exported through contract.ts; pure data types, no IO.
 */
import type { OrganizationGraph, LabCatalogs } from "../contract.js";
import type { ScenarioDescriptor } from "./simulation/scenario-types.js";
import type { BodyRegistry } from "./bodies/registry.js";

export type AllocationPolicy = "premium-first" | "cheapest-reliable" | "quality-first";

/** Per-method search knobs (W13 pluggable search; defaults are method-specific). */
export interface SearchMethodOptions {
  /** Beam width K (beam method): survivors kept per level. Default 4. */
  readonly beamWidth?: number;
  /** Evolutionary population size. Default 8. */
  readonly populationSize?: number;
  /** Evolutionary generation budget. Default 3. */
  readonly generations?: number;
  /** Hard cap on full candidate evaluations (one evaluation = the candidate
   * simulated on every attached scenario). Bounds beam survivor evaluations,
   * evolutionary generations and bandit rollouts. */
  readonly evaluationBudget?: number;
  /** Bandit rollout budget (pulls). Default 24. Also capped by evaluationBudget. */
  readonly rolloutBudget?: number;
  /** Bandit UCB exploration constant c. Default √2. */
  readonly explorationConstant?: number;
}

/**
 * Search request over the five binding dimensions (organization-lab §2).
 * The engine is pluggable (W13): `method` selects the registered search
 * method (default "rule" — behavior-identical to the original engine);
 * fitness-driven methods (beam survivors, evolutionary, bandit) consume the
 * optional scenarios/weights as their evaluation oracle.
 */
export interface OrganizationSearchRequest {
  readonly goal: string;
  readonly goalClass: string;
  readonly catalogs: LabCatalogs;
  readonly policy: AllocationPolicy;
  readonly budgetEnvelopeUsd: number;
  readonly dimensions?: Partial<OrganizationSearchDimensions>;
  readonly maxCandidates?: number;
  /** Search-method selection via the registry (W13). Default "rule". */
  readonly method?: string;
  /** Deterministic seed for PRNG-driven methods (rule ignores it). */
  readonly seed?: string;
  readonly options?: SearchMethodOptions;
  /** Evaluation oracle for fitness-driven methods: simulate each candidate
   * on these scenarios (deterministic, seeded — organization-lab §3). */
  readonly scenarios?: readonly ScenarioDescriptor[];
  /** Fitness weights for method-internal evaluation (default: spec weights). */
  readonly weights?: FitnessWeights;
  /** Body-registry injection point (defaults to the shared built-in registry). */
  readonly bodyRegistry?: BodyRegistry;
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
  /** Mean simulated fitness when a method internally evaluated this candidate
   * on the request's scenarios (W13); absent otherwise — never fabricated. */
  readonly evaluatedFitness?: number;
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
