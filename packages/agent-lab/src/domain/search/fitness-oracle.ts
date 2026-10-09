/**
 * Fitness oracle for fitness-driven search methods (W13): builds a dimension
 * profile into a candidate through the shared factory and — when the request
 * carries scenarios — simulates + evaluates it deterministically (seeded,
 * replayable, no network; organization-lab §3/§4). Results are cached per
 * build so a method never pays twice for the same candidate within a run.
 * Without scenarios the oracle degrades to the preScore surrogate and reports
 * fitness undefined — callers surface that honestly, never fabricate numbers.
 */
import type { SearchCandidate } from "../lab-api.js";
import { DEFAULT_FITNESS_WEIGHTS } from "../lab-api.js";
import type { ScenarioDescriptor } from "../simulation/scenario-types.js";
import { runSimulation } from "../simulation/engine.js";
import { evaluateRun, meanFitness } from "../evaluation.js";
import { bodyRegistry } from "../bodies/registry.js";
import type { BodyRegistry } from "../bodies/registry.js";
import type { RoleTemplate } from "../search-templates.js";
import {
  buildCandidateFromProfile,
  profileKey,
  type DimensionProfile,
  type ModelOverrides,
} from "./candidate-space.js";
import type { OrganizationSearchRequest } from "../lab-api.js";

export interface ProfileEvaluation {
  readonly candidate: SearchCandidate;
  /** Mean fitness across the request's scenarios; undefined without scenarios. */
  readonly fitness: number | undefined;
}

export interface FitnessOracle {
  readonly hasScenarios: boolean;
  /** Build (cached) and evaluate a profile; index sequencing is deterministic. */
  readonly evaluateProfile: (
    profile: DimensionProfile,
    overrides?: ModelOverrides,
  ) => ProfileEvaluation | undefined;
  /** Evaluate an already-built candidate (cached by graph id). */
  readonly evaluateCandidate: (candidate: SearchCandidate) => number | undefined;
  readonly evaluationsRun: () => number;
  readonly buildsRun: () => number;
  readonly bestFitness: () => number | undefined;
}

export interface OracleContext {
  readonly request: OrganizationSearchRequest;
  readonly template: RoleTemplate;
  /** Emitting method (ids/seeds); "rule" keeps legacy strings. */
  readonly method: string;
  readonly registry?: BodyRegistry;
}

function overridesKey(overrides: ModelOverrides | undefined): string {
  if (overrides === undefined) return "";
  return Object.keys(overrides)
    .sort()
    .map((bodyId) => `${bodyId}:${overrides[bodyId]?.providerId}/${overrides[bodyId]?.modelId}`)
    .join(",");
}

export function createFitnessOracle(context: OracleContext): FitnessOracle {
  const scenarios: readonly ScenarioDescriptor[] = context.request.scenarios ?? [];
  const weights = context.request.weights ?? DEFAULT_FITNESS_WEIGHTS;
  const registry = context.registry ?? bodyRegistry;
  const profileCache = new Map<string, ProfileEvaluation>();
  const fitnessByGraphId = new Map<string, number>();
  let evaluations = 0;
  let builds = 0;
  let best: number | undefined;
  let nextIndex = 0;

  const recordBest = (fitness: number | undefined): void => {
    if (fitness === undefined) return;
    if (best === undefined || fitness > best) best = fitness;
  };

  const evaluateBuilt = (candidate: SearchCandidate): number | undefined => {
    const cached = fitnessByGraphId.get(candidate.graph.id);
    if (cached !== undefined) return cached;
    if (scenarios.length === 0) return undefined;
    evaluations += 1;
    const metrics = scenarios.map((scenario) => evaluateRun(runSimulation(scenario, candidate.graph), scenario, weights));
    const fitness = meanFitness(metrics);
    fitnessByGraphId.set(candidate.graph.id, fitness);
    recordBest(fitness);
    return fitness;
  };

  return {
    hasScenarios: scenarios.length > 0,
    evaluateProfile: (profile, overrides) => {
      const key = `${profileKey(profile)}|${overridesKey(overrides)}`;
      const cached = profileCache.get(key);
      if (cached !== undefined) return cached;
      builds += 1;
      const candidate = buildCandidateFromProfile({
        request: context.request,
        template: context.template,
        registry,
        profile,
        index: nextIndex,
        method: context.method,
        ...(overrides !== undefined && Object.keys(overrides).length > 0 ? { modelOverrides: overrides } : {}),
      });
      nextIndex += 1;
      if (candidate === undefined) return undefined;
      const evaluation: ProfileEvaluation = { candidate, fitness: evaluateBuilt(candidate) };
      profileCache.set(key, evaluation);
      return evaluation;
    },
    evaluateCandidate: (candidate) => evaluateBuilt(candidate),
    evaluationsRun: () => evaluations,
    buildsRun: () => builds,
    bestFitness: () => best,
  };
}
