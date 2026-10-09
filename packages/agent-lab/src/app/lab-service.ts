/**
 * Lab service (app layer): orchestrates the evaluation loop — search over the
 * five binding dimensions, deterministic simulation, fitness evaluation,
 * certification. Side effects (persisting evaluation records) go through the
 * EvaluationStore port only; side effects of the W14 flywheel (committing the
 * per-goal-class method-selection record) go through the SelectionLedgerStore
 * port — armed optionally, zero behavior change when absent.
 */
import type {
  CertificationBar,
  CertificationOutcome,
  EvaluationMetrics,
  EvaluationRecord,
  EvaluationStore,
  FitnessWeights,
} from "../domain/lab-api.js";
import type { MethodSelectionRecord, SelectionLedgerStore } from "../domain/method-selection/selection-ledger.js";
import type {
  OrganizationGraph,
  SimulationRunRecord,
} from "../contract.js";
import type { SimulationRunRecordWithDecisions } from "../domain/simulation/decision-types.js";
import type { SimulationConfig } from "../domain/simulation/engine.js";
import type { OrganizationSearchRequest, OrganizationSearchResult } from "../domain/lab-api.js";
import type { SearchMethodTelemetry } from "../domain/search/method-types.js";
import type { MethodSearchResult } from "../domain/search/method-types.js";
import { DEFAULT_CERTIFICATION_BAR, DEFAULT_FITNESS_WEIGHTS } from "../domain/lab-api.js";
import { runOrganizationSearch } from "../domain/search/method-registry.js";
import { runSimulation } from "../domain/simulation/engine.js";
import type { ScenarioDescriptor } from "../domain/simulation/scenario-types.js";
import { evaluateRun, meanFitness } from "../domain/evaluation.js";
import { certifyOrganization, withCertification } from "../domain/certification.js";

export interface LabServiceDeps {
  readonly evaluationStore?: EvaluationStore;
  /** W14 flywheel: when armed, every evaluateAndCertify run appends its
   * per-goal-class method-selection record (the provenance step) to the
   * committed ledger. Unarmed (default): zero behavior change. */
  readonly selectionLedgerStore?: SelectionLedgerStore;
}

export interface EvaluationPipelineOptions {
  readonly request: OrganizationSearchRequest;
  readonly scenarios: readonly ScenarioDescriptor[];
  readonly weights?: FitnessWeights;
  readonly bar?: CertificationBar;
  /** Deterministic timestamp for committed evidence. */
  readonly certifiedAt: string;
}

export interface RankedCandidate {
  readonly graph: OrganizationGraph;
  readonly fitness: number;
  readonly perScenario: readonly {
    readonly scenarioId: string;
    readonly metrics: EvaluationMetrics;
    readonly replayHash: string;
  }[];
}

export interface EvaluationPipelineResult {
  readonly search: OrganizationSearchResult;
  /** Per-run search telemetry (W13): candidates considered, evaluations run,
   * wall time, seed — operational metadata; the committed evaluation record
   * stays a reproducible artifact (numbers reproducible from seed). */
  readonly searchTelemetry: SearchMethodTelemetry;
  readonly ranked: readonly RankedCandidate[];
  readonly best: RankedCandidate | undefined;
  readonly certifiedGraph: OrganizationGraph | undefined;
  readonly outcome: CertificationOutcome | undefined;
  readonly record: EvaluationRecord | undefined;
}

export interface LabService {
  readonly search: (request: OrganizationSearchRequest) => OrganizationSearchResult;
  readonly simulate: (
    scenario: ScenarioDescriptor,
    graph: OrganizationGraph,
    config?: SimulationConfig,
  ) => SimulationRunRecordWithDecisions;
  readonly evaluate: (
    run: SimulationRunRecord,
    scenario: ScenarioDescriptor,
    weights?: FitnessWeights,
  ) => EvaluationMetrics;
  readonly evaluateAndCertify: (options: EvaluationPipelineOptions) => EvaluationPipelineResult;
}

export function createLabService(deps: LabServiceDeps = {}): LabService {
  return {
    search: (request) => {
      const outcome = runOrganizationSearch(request);
      return {
        goalClass: outcome.goalClass,
        candidates: outcome.candidates,
        searchedDimensions: outcome.searchedDimensions,
        issues: outcome.issues,
      };
    },
    simulate: (scenario, graph, config) => runSimulation(scenario, graph, config),
    evaluate: (run, scenario, weights) => evaluateRun(run, scenario, weights ?? DEFAULT_FITNESS_WEIGHTS),
    evaluateAndCertify: (options) => runPipeline(options, deps),
  };
}

function runPipeline(options: EvaluationPipelineOptions, deps: LabServiceDeps): EvaluationPipelineResult {
  const weights = options.weights ?? DEFAULT_FITNESS_WEIGHTS;
  const bar = options.bar ?? DEFAULT_CERTIFICATION_BAR;
  const searchOutcome = runOrganizationSearch({
    ...options.request,
    scenarios: options.scenarios,
    weights,
  });
  const search: OrganizationSearchResult = {
    goalClass: searchOutcome.goalClass,
    candidates: searchOutcome.candidates,
    searchedDimensions: searchOutcome.searchedDimensions,
    issues: searchOutcome.issues,
  };
  const ranked: RankedCandidate[] = [];
  for (const candidate of searchOutcome.candidates) {
    const perScenario = options.scenarios.map((scenario) => {
      const run = runSimulation(scenario, candidate.graph);
      return {
        scenarioId: scenario.id,
        metrics: evaluateRun(run, scenario, weights),
        replayHash: run.replayHash,
      };
    });
    ranked.push({ graph: candidate.graph, fitness: meanFitness(perScenario.map((entry) => entry.metrics)), perScenario });
  }
  ranked.sort((a, b) => b.fitness - a.fitness || a.graph.id.localeCompare(b.graph.id));
  const best = ranked[0];
  if (!best) {
    persistSelectionRecord(deps, options, searchOutcome, undefined, undefined);
    return { search, searchTelemetry: searchOutcome.telemetry, ranked, best: undefined, certifiedGraph: undefined, outcome: undefined, record: undefined };
  }
  const outcome = certifyOrganization({
    graph: best.graph,
    scenarioResults: best.perScenario.map((entry) => ({ scenarioId: entry.scenarioId, metrics: entry.metrics })),
    bar,
    certifiedAt: options.certifiedAt,
  });
  const certifiedGraph = withCertification(best.graph, outcome, weights as unknown as Record<string, number>);
  const record: EvaluationRecord = {
    recordId: `eval.${best.graph.id}`,
    organizationId: best.graph.id,
    scenarioSetRef: bar.scenarioSetRef,
    seed: best.graph.simulation?.seed ?? "",
    weights,
    scenarios: best.perScenario,
    aggregateFitness: best.fitness,
    certified: outcome.certified,
    generatedBy: "@gen/agent-lab lab-service evaluateAndCertify",
  };
  deps.evaluationStore?.saveEvaluation(record);
  if (outcome.certified) deps.evaluationStore?.saveCertifiedOrganization(certifiedGraph);
  persistSelectionRecord(deps, options, searchOutcome, best, outcome);
  return { search, searchTelemetry: searchOutcome.telemetry, ranked, best, certifiedGraph, outcome, record };
}

/**
 * W14 flywheel hook: append the run's method-selection record (frozen fields
 * from the search telemetry + the pipeline outcome; selectedAt is the run's
 * deterministic evidence timestamp). No-op unless the ledger store is armed.
 */
function persistSelectionRecord(
  deps: LabServiceDeps,
  options: EvaluationPipelineOptions,
  searchOutcome: MethodSearchResult,
  best: RankedCandidate | undefined,
  outcome: CertificationOutcome | undefined,
): void {
  if (!deps.selectionLedgerStore) return;
  const budget = options.request.options?.evaluationBudget;
  const selection: MethodSelectionRecord = {
    goalClass: searchOutcome.goalClass,
    method: searchOutcome.telemetry.method,
    seed: searchOutcome.telemetry.seed,
    ...(budget !== undefined ? { evaluationBudget: budget } : {}),
    candidatesConsidered: searchOutcome.telemetry.candidatesConsidered,
    candidatesEmitted: searchOutcome.telemetry.candidatesEmitted,
    evaluationsRun: searchOutcome.telemetry.evaluationsRun,
    ...(best !== undefined ? { rankedBestFitness: best.fitness } : {}),
    ...(outcome !== undefined ? { certified: outcome.certified } : {}),
    selectedAt: options.certifiedAt,
  };
  deps.selectionLedgerStore.appendSelection(selection);
}
