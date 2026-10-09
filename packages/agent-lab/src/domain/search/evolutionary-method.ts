/**
 * Evolutionary search method (W13, work item 3): population = candidate orgs
 * parameterized by the five binding dimensions; mutation over role structure
 * (optional roles + review topology), tool allocation, model allocation
 * (per-body eligible models, P2), execution ordering and budget allocation;
 * selection by simulated fitness (the request's scenarios are the oracle).
 * Elitist (μ+λ) replacement, generation budget bounded, fully deterministic
 * given the seed (seeded PRNG via seedFromString — never Math.random).
 */
import type { OrganizationSearchDimensions, OrganizationSearchRequest, SearchCandidate } from "../lab-api.js";
import type { ModelCatalogEntry } from "../../contract.js";
import { bodyRegistry } from "../bodies/registry.js";
import { findRoleTemplate, type RoleTemplate } from "../search-templates.js";
import { seedFromString } from "../simulation/rng.js";
import {
  catalogShortfallIssues,
  DEFAULT_DIMENSIONS,
  eligibleModelsFor,
  enumerateDimensionProfiles,
  policyModelFor,
  profileKey,
  type DimensionProfile,
  type ModelOverrides,
} from "./candidate-space.js";
import { createFitnessOracle } from "./fitness-oracle.js";
import { deriveSearchSeed, type MethodSearchResult, type SearchMethod } from "./method-types.js";

interface Individual {
  readonly profile: DimensionProfile;
  readonly overrides: ModelOverrides;
}

interface ScoredIndividual {
  readonly individual: Individual;
  readonly candidate: SearchCandidate;
  readonly fitness: number | undefined;
}

function pickInt(rng: () => number, bound: number): number {
  return Math.min(bound - 1, Math.floor(rng() * bound));
}

function other<T>(rng: () => number, current: T, choices: readonly T[]): T {
  if (choices.length <= 1) return current;
  for (let attempt = 0; attempt < choices.length * 2; attempt += 1) {
    const next = choices[pickInt(rng, choices.length)] as T;
    if (next !== current) return next;
  }
  return choices.find((choice) => choice !== current) ?? current;
}

function mutatableBodies(
  request: OrganizationSearchRequest,
  template: RoleTemplate,
  individual: Individual,
): { bodyId: string; alternatives: readonly ModelCatalogEntry[] }[] {
  const registry = request.bodyRegistry ?? bodyRegistry;
  const bodyIds = ["body.director", ...template.pipeline, ...individual.profile.optionalRoles, template.reviewerBodyId];
  const out: { bodyId: string; alternatives: readonly ModelCatalogEntry[] }[] = [];
  for (const bodyId of bodyIds) {
    const body = registry.get(bodyId);
    if (body === undefined) continue;
    const eligible = eligibleModelsFor(body, request.catalogs.models);
    const current = individual.overrides[bodyId] ?? policyModelFor(body, request.catalogs.models, request.policy);
    const alternatives = eligible.filter(
      (model) => current === undefined || model.providerId !== current.providerId || model.modelId !== current.modelId,
    );
    if (alternatives.length > 0) out.push({ bodyId, alternatives });
  }
  return out;
}

function mutate(
  rng: () => number,
  individual: Individual,
  request: OrganizationSearchRequest,
  template: RoleTemplate,
  dims: OrganizationSearchDimensions,
  counters: { modelOverrideMutations: number },
): Individual {
  const axes: string[] = [];
  if (dims.roleStructure) axes.push("roleStructure", "topology");
  if (dims.toolAllocation) axes.push("toolAllocation");
  if (dims.modelAllocation) axes.push("modelAllocation");
  if (dims.executionOrdering) axes.push("executionOrdering");
  if (dims.budgetAllocation) axes.push("budgetAllocation");
  if (axes.length === 0) return individual;
  const axis = axes[pickInt(rng, axes.length)] as string;
  const { profile, overrides } = individual;
  switch (axis) {
    case "roleStructure": {
      if (template.optionalRoles.length === 0) return individual;
      const role = template.optionalRoles[pickInt(rng, template.optionalRoles.length)] as string;
      const present = profile.optionalRoles.includes(role);
      const optionalRoles = present
        ? profile.optionalRoles.filter((entry) => entry !== role)
        : [...profile.optionalRoles, role].sort();
      return { profile: { ...profile, optionalRoles }, overrides };
    }
    case "topology":
      return { profile: { ...profile, topology: other(rng, profile.topology, ["critic-reviews-all", "critic-reviews-editor"]) }, overrides };
    case "toolAllocation":
      return { profile: { ...profile, toolProfile: other(rng, profile.toolProfile, ["standard", "minimal"]) }, overrides };
    case "executionOrdering":
      return { profile: { ...profile, execProfile: other(rng, profile.execProfile, ["parallel", "sequential"]) }, overrides };
    case "budgetAllocation":
      return { profile: { ...profile, budgetProfile: other(rng, profile.budgetProfile, ["role-weighted", "even"]) }, overrides };
    case "modelAllocation": {
      const mutatable = mutatableBodies(request, template, individual);
      if (mutatable.length === 0) return individual;
      const target = mutatable[pickInt(rng, mutatable.length)];
      if (target === undefined) return individual;
      const model = target.alternatives[pickInt(rng, target.alternatives.length)];
      if (model === undefined) return individual;
      counters.modelOverrideMutations += 1;
      return { profile, overrides: { ...overrides, [target.bodyId]: model } };
    }
    default:
      return individual;
  }
}

function byScore(a: ScoredIndividual, b: ScoredIndividual): number {
  return (
    (b.fitness !== undefined ? 1 : 0) - (a.fitness !== undefined ? 1 : 0) ||
    (b.fitness ?? b.candidate.preScore) - (a.fitness ?? a.candidate.preScore) ||
    a.candidate.graph.id.localeCompare(b.candidate.graph.id)
  );
}

function poolKey(individual: Individual): string {
  const overrides = Object.keys(individual.overrides)
    .sort()
    .map((bodyId) => `${bodyId}:${individual.overrides[bodyId]?.providerId}/${individual.overrides[bodyId]?.modelId}`)
    .join(",");
  return `${profileKey(individual.profile)}|${overrides}`;
}

export const evolutionarySearchMethod: SearchMethod = {
  name: "evolutionary",
  search: (request: OrganizationSearchRequest): MethodSearchResult => {
    const dims: OrganizationSearchDimensions = { ...DEFAULT_DIMENSIONS, ...request.dimensions };
    const template = findRoleTemplate(request.goalClass);
    const issues = catalogShortfallIssues(template, request);
    const populationSize = request.options?.populationSize ?? 8;
    const generations = request.options?.generations ?? 3;
    const budget = request.options?.evaluationBudget ?? populationSize * (generations + 1);
    const seed = request.seed ?? deriveSearchSeed(request.goalClass, request.policy);
    const rng = seedFromString(`${seed}::evolutionary`);
    const oracle = createFitnessOracle({ request, template, method: "evolutionary" });
    const started = Date.now();
    const space = enumerateDimensionProfiles(template, dims);
    const target = Math.min(populationSize, space.length);

    // Initial population: seeded distinct samples from the enumerable space.
    const sampled: DimensionProfile[] = [];
    const sampledKeys = new Set<string>();
    while (sampled.length < target && sampledKeys.size < space.length) {
      const profile = space[pickInt(rng, space.length)] as DimensionProfile;
      if (sampledKeys.has(profileKey(profile))) continue;
      sampledKeys.add(profileKey(profile));
      sampled.push(profile);
    }
    let population: ScoredIndividual[] = [];
    for (const profile of sampled) {
      if (oracle.hasScenarios && oracle.evaluationsRun() >= budget) break;
      const evaluation = oracle.evaluateProfile(profile);
      if (evaluation === undefined) continue;
      population.push({ individual: { profile, overrides: {} }, candidate: evaluation.candidate, fitness: evaluation.fitness });
    }
    let generationsRun = 0;
    let mutations = 0;
    let buildFailures = 0;
    const counters = { modelOverrideMutations: 0 };
    for (let generation = 0; generation < generations; generation += 1) {
      if (oracle.hasScenarios && oracle.evaluationsRun() >= budget) break;
      generationsRun += 1;
      const offspring: ScoredIndividual[] = [];
      for (const parent of population) {
        mutations += 1;
        const child = mutate(rng, parent.individual, request, template, dims, counters);
        if (oracle.hasScenarios && oracle.evaluationsRun() >= budget) break;
        const evaluation = oracle.evaluateProfile(child.profile, child.overrides);
        if (evaluation === undefined) {
          buildFailures += 1;
          continue;
        }
        offspring.push({ individual: child, candidate: evaluation.candidate, fitness: evaluation.fitness });
      }
      const keys = new Set<string>();
      const pool = [...population, ...offspring].sort(byScore);
      const next: ScoredIndividual[] = [];
      for (const entry of pool) {
        const key = poolKey(entry.individual);
        if (keys.has(key)) continue;
        keys.add(key);
        next.push(entry);
        if (next.length >= populationSize) break;
      }
      population = next;
    }
    if (!oracle.hasScenarios) {
      issues.push(
        "evolutionary search ran without scenarios — selection fell back to the preScore surrogate; attach scenarios for fitness-based selection",
      );
    }
    const max = request.maxCandidates ?? 32;
    const ranked = [...population].sort(byScore).slice(0, max);
    const emitted = ranked.map((entry) =>
      entry.fitness === undefined ? entry.candidate : { ...entry.candidate, evaluatedFitness: entry.fitness },
    );
    return {
      goalClass: request.goalClass,
      candidates: emitted,
      searchedDimensions: dims,
      issues,
      telemetry: {
        method: "evolutionary",
        seed,
        candidatesConsidered: space.length,
        candidatesEmitted: emitted.length,
        evaluationsRun: oracle.evaluationsRun(),
        wallTimeMs: Date.now() - started,
        ...(oracle.bestFitness() !== undefined ? { bestEvaluatedFitness: oracle.bestFitness() } : {}),
        detail: {
          populationSize,
          generations,
          generationsRun,
          mutations,
          buildFailures,
          budget,
          modelOverrideMutations: counters.modelOverrideMutations,
        },
      },
    };
  },
};
