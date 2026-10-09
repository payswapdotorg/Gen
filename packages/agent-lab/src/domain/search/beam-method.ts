/**
 * Beam search method (W13, work item 2): level-by-level expansion over the
 * five binding dimensions (role structure → review topology → tool → exec →
 * budget). Partial assignments are scored by the fast surrogate (schema
 * validation + partial preScore via the shared factory, completed with the
 * frozen dimension defaults); the top-K states per level survive. Survivors
 * are then FULLY evaluated (simulated fitness) when the request carries
 * scenarios and ranked by fitness, else ranked by the surrogate. K is
 * configurable (beamWidth); the method is deterministic — no randomness at
 * all, and every tie-break is canonical (profile key, then graph id).
 */
import { bodyRegistry } from "../bodies/registry.js";
import { findRoleTemplate } from "../search-templates.js";
import {
  buildCandidateFromProfile,
  catalogShortfallIssues,
  DEFAULT_DIMENSIONS,
  subsets,
  type DimensionProfile,
} from "./candidate-space.js";
import { createFitnessOracle } from "./fitness-oracle.js";
import { deriveSearchSeed, type MethodSearchResult, type SearchMethod } from "./method-types.js";
import type { OrganizationSearchDimensions, SearchCandidate, OrganizationSearchRequest } from "../lab-api.js";
import type { RoleTemplate } from "../search-templates.js";

/** Choices available on one dimension axis (dimension switches respected). */
function dimensionChoices(
  template: RoleTemplate,
  dims: OrganizationSearchDimensions,
): {
  optionalSets: readonly (readonly string[])[];
  topologies: readonly DimensionProfile["topology"][];
  tools: readonly DimensionProfile["toolProfile"][];
  execs: readonly DimensionProfile["execProfile"][];
  budgets: readonly DimensionProfile["budgetProfile"][];
} {
  return {
    optionalSets: dims.roleStructure ? subsets(template.optionalRoles) : [template.optionalRoles],
    topologies: dims.roleStructure
      ? (["critic-reviews-all", "critic-reviews-editor"] as const)
      : (["critic-reviews-all"] as const),
    tools: dims.toolAllocation ? (["standard", "minimal"] as const) : (["standard"] as const),
    execs: dims.executionOrdering ? (["parallel", "sequential"] as const) : (["parallel"] as const),
    budgets: dims.budgetAllocation ? (["role-weighted", "even"] as const) : (["role-weighted"] as const),
  };
}

/** A partial assignment over the dimension axes (unset axes are undefined). */
interface PartialProfile {
  readonly optionalRoles?: readonly string[];
  readonly topology?: DimensionProfile["topology"];
  readonly toolProfile?: DimensionProfile["toolProfile"];
  readonly execProfile?: DimensionProfile["execProfile"];
  readonly budgetProfile?: DimensionProfile["budgetProfile"];
}

function completeProfile(template: ReturnType<typeof findRoleTemplate>, partial: PartialProfile): DimensionProfile {
  return {
    optionalRoles: partial.optionalRoles ?? template.optionalRoles,
    topology: partial.topology ?? "critic-reviews-all",
    toolProfile: partial.toolProfile ?? "standard",
    execProfile: partial.execProfile ?? "parallel",
    budgetProfile: partial.budgetProfile ?? "role-weighted",
  };
}

function partialKey(partial: PartialProfile): string {
  return [
    partial.optionalRoles === undefined ? "?" : `[${[...partial.optionalRoles].sort().join(",")}]`,
    partial.topology ?? "?",
    partial.toolProfile ?? "?",
    partial.execProfile ?? "?",
    partial.budgetProfile ?? "?",
  ].join(";");
}

export const beamSearchMethod: SearchMethod = {
  name: "beam",
  search: (request: OrganizationSearchRequest): MethodSearchResult => {
    const dims: OrganizationSearchDimensions = { ...DEFAULT_DIMENSIONS, ...request.dimensions };
    const template = findRoleTemplate(request.goalClass);
    const issues = catalogShortfallIssues(template, request);
    const beamWidth = request.options?.beamWidth ?? 4;
    const oracle = createFitnessOracle({ request, template, method: "beam" });
    const started = Date.now();
    const choices = dimensionChoices(template, dims);

    const levels: readonly (readonly PartialProfile[])[] = [
      choices.optionalSets.map((optionalRoles) => ({ optionalRoles })),
      choices.topologies.map((topology) => ({ topology })),
      choices.tools.map((toolProfile) => ({ toolProfile })),
      choices.execs.map((execProfile) => ({ execProfile })),
      choices.budgets.map((budgetProfile) => ({ budgetProfile })),
    ];

    const surrogateBuilds = new Map<string, SearchCandidate | undefined>();
    const surrogateOf = (partial: PartialProfile): { score: number; candidate?: SearchCandidate } => {
      const complete = completeProfile(template, partial);
      const key = partialKey(complete);
      if (!surrogateBuilds.has(key)) {
        surrogateBuilds.set(
          key,
          buildCandidateFromProfile({
            request,
            template,
            registry: request.bodyRegistry ?? bodyRegistry,
            profile: complete,
            index: surrogateBuilds.size,
            method: "beam",
          }),
        );
      }
      const candidate = surrogateBuilds.get(key);
      if (candidate === undefined) return { score: -1 };
      return { score: candidate.preScore, candidate };
    };

    let beam: PartialProfile[] = [{}];
    for (const level of levels) {
      const expanded: { partial: PartialProfile; score: number }[] = [];
      for (const state of beam) {
        for (const choice of level) {
          const next: PartialProfile = { ...state, ...choice };
          expanded.push({ partial: next, score: surrogateOf(next).score });
        }
      }
      expanded.sort((a, b) => b.score - a.score || partialKey(a.partial).localeCompare(partialKey(b.partial)));
      beam = expanded.slice(0, beamWidth).map((entry) => entry.partial);
    }

    // Survivors are fully-specified states: complete them and evaluate.
    const max = request.maxCandidates ?? 32;
    const budget = request.options?.evaluationBudget ?? Number.POSITIVE_INFINITY;
    let evaluated = 0;
    const survivors: { candidate: SearchCandidate; fitness: number | undefined }[] = [];
    for (const state of beam) {
      const built = surrogateOf(state).candidate;
      if (built === undefined) continue;
      let fitness: number | undefined;
      if (oracle.hasScenarios && evaluated < budget) {
        fitness = oracle.evaluateCandidate(built);
        evaluated += 1;
      }
      survivors.push({ candidate: built, fitness });
    }
    survivors.sort((a, b) => {
      const fa = a.fitness;
      const fb = b.fitness;
      if (fa !== undefined && fb !== undefined && fa !== fb) return fb - fa;
      if (fa !== undefined && fb === undefined) return -1;
      if (fa === undefined && fb !== undefined) return 1;
      return a.candidate.graph.id.localeCompare(b.candidate.graph.id);
    });
    if (!oracle.hasScenarios) {
      issues.push(
        "beam search ran without scenarios — survivors ranked by the preScore surrogate; attach scenarios for full evaluation",
      );
    }
    const emitted = survivors.slice(0, max).map(({ candidate, fitness }) =>
      fitness === undefined ? candidate : { ...candidate, evaluatedFitness: fitness },
    );
    return {
      goalClass: request.goalClass,
      candidates: emitted,
      searchedDimensions: dims,
      issues,
      telemetry: {
        method: "beam",
        seed: request.seed ?? deriveSearchSeed(request.goalClass, request.policy),
        candidatesConsidered: surrogateBuilds.size,
        candidatesEmitted: emitted.length,
        evaluationsRun: oracle.evaluationsRun(),
        wallTimeMs: Date.now() - started,
        ...(oracle.bestFitness() !== undefined ? { bestEvaluatedFitness: oracle.bestFitness() } : {}),
        detail: {
          beamWidth,
          levels: levels.length,
          surrogateBuilds: surrogateBuilds.size,
          survivors: survivors.length,
          ranking: oracle.hasScenarios ? "simulated-fitness" : "preScore-surrogate",
        },
      },
    };
  },
};
