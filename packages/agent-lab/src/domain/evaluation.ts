/**
 * Evaluation loop (organization-lab §4, work order B7): the fitness function
 * with configurable weights. Every number is reproducible from the seed
 * (inputs are simulated run records only — no IO).
 *
 * fitness = w_goal·goal_achievement + w_quality·Σ quality_scores
 *         + w_cost·cost_efficiency + w_latency·time_to_result
 *         + w_human·human_load − w_failure·gap_penalty
 *
 * Interpretations (documented for determinism):
 *  - human_load is a SCORE: 1/(1+approvals) — fewer approvals demanded = higher;
 *  - gap_penalty = number of unresolved gap reports emitted during the run;
 *  - time_to_result is a SCORE: 1/(1 + virtualMs/latencyScaleMs);
 *  - cost_efficiency = clamp(1 − spend/envelope, 0, 1).
 */
import type { EvaluationMetrics, FitnessWeights } from "./lab-api.js";
import { DEFAULT_FITNESS_WEIGHTS } from "./lab-api.js";
import type { SimulationRunRecord } from "../contract.js";
import type { ScenarioDescriptor } from "./simulation/scenario-types.js";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function evaluateRun(
  run: SimulationRunRecord,
  scenario: ScenarioDescriptor,
  weights: FitnessWeights = DEFAULT_FITNESS_WEIGHTS,
): EvaluationMetrics {
  const criteriaTotal = run.criteriaResults.length;
  const criteriaMet = run.criteriaResults.filter((criterion) => criterion.met).length;
  const goalAchievement = criteriaTotal === 0 ? 0 : criteriaMet / criteriaTotal;
  const allScores = Object.values(run.telemetry.byNode).flatMap((node) => [...node.qualityScores]);
  const qualityScore = allScores.length === 0 ? 0 : allScores.reduce((sum, score) => sum + score, 0) / allScores.length;
  const spend = run.telemetry.totalSpendUsd;
  const costEfficiency =
    scenario.budgetEnvelopeUsd > 0
      ? clamp01(1 - spend / scenario.budgetEnvelopeUsd)
      : spend === 0
        ? 1
        : 0;
  const latencyScore = 1 / (1 + run.virtualClockMs / Math.max(scenario.latencyScaleMs, 1));
  const humanScore = 1 / (1 + run.telemetry.approvalCount);
  const gapPenalty = run.gapSignals.length;
  const fitness =
    weights.goal * goalAchievement +
    weights.quality * qualityScore +
    weights.cost * costEfficiency +
    weights.latency * latencyScore +
    weights.human * humanScore -
    weights.failure * gapPenalty;
  return {
    fitness: round4(fitness),
    goalAchievement: round4(goalAchievement),
    qualityScore: round4(qualityScore),
    costEfficiency: round4(costEfficiency),
    latencyScore: round4(latencyScore),
    humanScore: round4(humanScore),
    gapPenalty,
    totalSpendUsd: spend,
    virtualClockMs: run.virtualClockMs,
    approvalCount: run.telemetry.approvalCount,
    unresolvedGaps: gapPenalty,
    criteriaMet,
    criteriaTotal,
  };
}

export function meanFitness(metrics: readonly EvaluationMetrics[]): number {
  if (metrics.length === 0) return 0;
  return round4(metrics.reduce((sum, entry) => sum + entry.fitness, 0) / metrics.length);
}
