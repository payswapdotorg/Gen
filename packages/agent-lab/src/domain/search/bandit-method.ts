/**
 * Bandit search method (W13, work item 4): dimension-profile choices are arms
 * (role structure, review topology, tool/exec/budget profiles — every profile
 * in the enumerated space is one arm). UCB1 selection with a deterministic
 * reward stream (seeded simulation fitness, or the preScore surrogate when
 * the request carries no scenarios); rollout count is budget-bounded. Ties
 * break toward the lower arm index, so the whole run is deterministic given
 * the request — UCB1 needs no randomness at all (a Thompson variant would
 * need a per-arm seeded PRNG; UCB keeps the determinism proof trivial).
 * Unbuildable arms are marked dead and consume no rollout.
 */
import type { OrganizationSearchDimensions, OrganizationSearchRequest, SearchCandidate } from "../lab-api.js";
import { findRoleTemplate } from "../search-templates.js";
import {
  catalogShortfallIssues,
  DEFAULT_DIMENSIONS,
  enumerateDimensionProfiles,
  type DimensionProfile,
} from "./candidate-space.js";
import { createFitnessOracle, type FitnessOracle } from "./fitness-oracle.js";
import { deriveSearchSeed, type MethodSearchResult, type SearchMethod } from "./method-types.js";

interface Arm {
  readonly profile: DimensionProfile;
  pulls: number;
  rewardSum: number;
  dead: boolean;
}

function pullReward(oracle: FitnessOracle, arms: Arm[], index: number): number | undefined {
  const arm = arms[index] as Arm;
  const evaluation = oracle.evaluateProfile(arm.profile);
  if (evaluation === undefined) return undefined;
  // Surrogate fallback keeps pulls meaningful without scenarios (honest —
  // surfaced as an issue; never a fabricated simulated fitness).
  return evaluation.fitness ?? evaluation.candidate.preScore;
}

export const banditSearchMethod: SearchMethod = {
  name: "bandit",
  search: (request: OrganizationSearchRequest): MethodSearchResult => {
    const dims: OrganizationSearchDimensions = { ...DEFAULT_DIMENSIONS, ...request.dimensions };
    const template = findRoleTemplate(request.goalClass);
    const issues = catalogShortfallIssues(template, request);
    const rolloutBudget = Math.min(
      request.options?.rolloutBudget ?? 24,
      request.options?.evaluationBudget ?? Number.POSITIVE_INFINITY,
    );
    const explorationConstant = request.options?.explorationConstant ?? Math.SQRT2;
    const oracle = createFitnessOracle({ request, template, method: "bandit" });
    const started = Date.now();

    const arms: Arm[] = enumerateDimensionProfiles(template, dims).map((profile) => ({
      profile,
      pulls: 0,
      rewardSum: 0,
      dead: false,
    }));

    let totalPulls = 0;
    while (totalPulls < rolloutBudget) {
      const alive = arms.filter((arm) => !arm.dead);
      if (alive.length === 0) break;
      const unpulledIndex = arms.findIndex((arm) => !arm.dead && arm.pulls === 0);
      const chosen =
        unpulledIndex >= 0
          ? unpulledIndex
          : arms.reduce((best, arm, index) => {
              if (arm.dead) return best;
              const bestArm = arms[best] as Arm;
              const ucbBest =
                bestArm.rewardSum / bestArm.pulls +
                explorationConstant * Math.sqrt(Math.log(totalPulls) / bestArm.pulls);
              const ucb =
                arm.rewardSum / arm.pulls + explorationConstant * Math.sqrt(Math.log(totalPulls) / arm.pulls);
              return ucb > ucbBest ? index : best;
            }, arms.findIndex((arm) => !arm.dead));
      const chosenArm = arms[chosen] as Arm;
      const reward = pullReward(oracle, arms, chosen);
      if (reward === undefined) {
        chosenArm.dead = true;
        continue;
      }
      chosenArm.pulls += 1;
      chosenArm.rewardSum += reward;
      totalPulls += 1;
    }

    if (!oracle.hasScenarios) {
      issues.push(
        "bandit search ran without scenarios — arm rewards fall back to the preScore surrogate; attach scenarios for simulated rewards",
      );
    }
    const max = request.maxCandidates ?? 32;
    const ranked = arms
      .map((arm, index) => ({ arm, index }))
      .filter((entry) => entry.arm.pulls > 0)
      .sort((a, b) => {
        const meanA = a.arm.rewardSum / a.arm.pulls;
        const meanB = b.arm.rewardSum / b.arm.pulls;
        return meanB - meanA || a.index - b.index;
      })
      .slice(0, max);
    const candidates: SearchCandidate[] = [];
    for (const entry of ranked) {
      const evaluation = oracle.evaluateProfile(entry.arm.profile);
      if (evaluation === undefined) continue;
      candidates.push(
        oracle.hasScenarios && evaluation.fitness !== undefined
          ? { ...evaluation.candidate, evaluatedFitness: evaluation.fitness }
          : evaluation.candidate,
      );
    }
    const bestArm = ranked[0];
    return {
      goalClass: request.goalClass,
      candidates,
      searchedDimensions: dims,
      issues,
      telemetry: {
        method: "bandit",
        seed: request.seed ?? deriveSearchSeed(request.goalClass, request.policy),
        candidatesConsidered: arms.length,
        candidatesEmitted: candidates.length,
        evaluationsRun: oracle.evaluationsRun(),
        wallTimeMs: Date.now() - started,
        ...(oracle.bestFitness() !== undefined ? { bestEvaluatedFitness: oracle.bestFitness() } : {}),
        detail: {
          arms: arms.length,
          deadArms: arms.filter((arm) => arm.dead).length,
          pulls: totalPulls,
          explorationConstant: Number(explorationConstant.toFixed(6)),
          bestArmPulls: bestArm?.arm.pulls ?? 0,
          rewardBasis: oracle.hasScenarios ? "simulated-fitness" : "preScore-surrogate",
        },
      },
    };
  },
};
