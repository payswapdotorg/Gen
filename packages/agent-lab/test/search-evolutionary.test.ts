/**
 * Evolutionary search method tests (W13, work item 3): population of candidate
 * orgs, mutation over the five binding dimensions (role structure, tool
 * allocation, model allocation, execution ordering, budget allocation),
 * selection by simulated fitness, bounded generation/evaluation budget,
 * seeded determinism.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { OrganizationSearchRequest } from "../src/domain/lab-api.js";
import { runOrganizationSearch } from "../src/domain/search/method-registry.js";
import { validateOrganizationGraph } from "../src/domain/org-graph.js";
import { OrganizationGraphSchema } from "../src/domain/schema/organization-graph.js";
import { createLabService } from "../src/app/lab-service.js";
import { documentaryCinematicScenario, forcedFailureScenario } from "../src/domain/scenarios/index.js";

const scenario = documentaryCinematicScenario;

function request(extra: Partial<OrganizationSearchRequest> = {}): OrganizationSearchRequest {
  return {
    goal: scenario.goal,
    goalClass: scenario.goalClass,
    catalogs: { models: scenario.modelCatalog, capabilities: scenario.capabilityCatalog },
    policy: "cheapest-reliable",
    budgetEnvelopeUsd: scenario.budgetEnvelopeUsd,
    scenarios: [scenario],
    ...extra,
  };
}

test("population and generation budgets are bounded", () => {
  const outcome = runOrganizationSearch(
    request({
      method: "evolutionary",
      seed: "evo-budget",
      options: { populationSize: 4, generations: 2 },
    }),
  );
  const detail = outcome.telemetry.detail ?? {};
  assert.equal(detail.populationSize, 4);
  assert.equal(detail.generations, 2);
  assert.ok(
    Number(detail.generationsRun) <= 2,
    `generationsRun ${String(detail.generationsRun)} must be ≤ 2`,
  );
  assert.ok(outcome.candidates.length <= 4, "emitted candidates are bounded by the population size");
  // Default budget = population × (generations + 1); the hard cap also applies.
  assert.ok(outcome.telemetry.evaluationsRun <= 12);
});

test("explicit evaluation budget stops evolution early (bounded, deterministic)", () => {
  const outcome = runOrganizationSearch(
    request({
      method: "evolutionary",
      seed: "evo-cap",
      options: { populationSize: 8, generations: 5, evaluationBudget: 3 },
    }),
  );
  assert.ok(outcome.telemetry.evaluationsRun <= 3, "hard evaluation budget must bound evaluations");
  const detail = outcome.telemetry.detail ?? {};
  assert.ok(Number(detail.generationsRun) < 5, "evolution must stop before completing all generations");
  const again = runOrganizationSearch(
    request({
      method: "evolutionary",
      seed: "evo-cap",
      options: { populationSize: 8, generations: 5, evaluationBudget: 3 },
    }),
  );
  assert.deepEqual(outcome.candidates, again.candidates);
});

test("same seed → identical ranked output; different seeds drive different exploration", () => {
  const seeds = ["evo-seed-1", "evo-seed-2", "evo-seed-3", "evo-seed-4", "evo-seed-5"];
  const runs = seeds.map((seed) => runOrganizationSearch(request({ method: "evolutionary", seed })));
  for (let i = 1; i < runs.length; i += 1) {
    const repeat = runOrganizationSearch(request({ method: "evolutionary", seed: seeds[i] as string }));
    assert.deepEqual(runs[i]?.candidates, repeat.candidates, "same seed must reproduce the ranked output");
  }
  const signatures = new Set(runs.map((run) => run.candidates.map((candidate) => candidate.graph.id).join(",")));
  assert.ok(
    signatures.size > 1,
    "distinct seeds should drive distinct exploration (all-equal would mean the seed is dead)",
  );
});

test("mutation explores the model-allocation dimension (per-body overrides, P2)", () => {
  const outcome = runOrganizationSearch(
    request({
      method: "evolutionary",
      seed: "evo-model",
      options: { populationSize: 6, generations: 6 },
      maxCandidates: 6,
    }),
  );
  const detail = outcome.telemetry.detail ?? {};
  assert.ok(
    Number(detail.modelOverrideMutations) >= 1,
    "with all five dimensions enabled, the pinned seed must exercise the model-allocation axis",
  );
  assert.ok(
    outcome.candidates.some(
      (candidate) => candidate.dimensionChoices.modelAllocation === "cheapest-reliable+per-body-override",
    ),
    "a mutated candidate must surface the override in dimensionChoices",
  );
  for (const candidate of outcome.candidates) {
    assert.ok(OrganizationGraphSchema.safeParse(candidate.graph).success);
    assert.deepEqual(validateOrganizationGraph(candidate.graph), []);
  }
});

test("with scenarios, the population is selected by simulated fitness", () => {
  const outcome = runOrganizationSearch(
    request({ method: "evolutionary", seed: "evo-fitness", options: { populationSize: 6, generations: 3 } }),
  );
  assert.ok(outcome.telemetry.evaluationsRun > 0);
  const evaluated = outcome.candidates.filter((candidate) => candidate.evaluatedFitness !== undefined);
  assert.ok(evaluated.length > 0, "population members carry evaluatedFitness");
  for (let i = 1; i < evaluated.length; i += 1) {
    const prev = evaluated[i - 1] as { evaluatedFitness?: number };
    const curr = evaluated[i] as { evaluatedFitness?: number };
    assert.ok((prev.evaluatedFitness ?? 0) >= (curr.evaluatedFitness ?? 0), "ranked by fitness (desc)");
  }
});

test("without scenarios, selection falls back to the surrogate and says so", () => {
  const outcome = runOrganizationSearch({
    goal: scenario.goal,
    goalClass: scenario.goalClass,
    catalogs: { models: scenario.modelCatalog, capabilities: scenario.capabilityCatalog },
    policy: "cheapest-reliable",
    budgetEnvelopeUsd: scenario.budgetEnvelopeUsd,
    method: "evolutionary",
    seed: "evo-no-scenarios",
  });
  assert.equal(outcome.telemetry.evaluationsRun, 0);
  assert.ok(outcome.issues.some((issue) => /evolutionary search ran without scenarios/.test(issue)));
  for (const candidate of outcome.candidates) {
    assert.equal(candidate.evaluatedFitness, undefined);
  }
});

test("dimension switches freeze their axes for mutation (no out-of-contract exploration)", () => {
  const outcome = runOrganizationSearch(
    request({
      method: "evolutionary",
      seed: "evo-frozen",
      dimensions: { roleStructure: false, toolAllocation: false },
      options: { populationSize: 6, generations: 4 },
    }),
  );
  for (const candidate of outcome.candidates) {
    assert.equal(candidate.dimensionChoices.toolAllocation, "standard");
    assert.ok(
      candidate.graph.nodes.some((node) => node.agentInstance?.bodyId === "body.video-continuity-supervisor"),
      "frozen role structure keeps all optional roles present",
    );
  }
});

test("evolutionary search serves the T4 forced-failure class deterministically", () => {
  const t4 = forcedFailureScenario;
  const t4Request: OrganizationSearchRequest = {
    goal: t4.goal,
    goalClass: t4.goalClass,
    catalogs: { models: t4.modelCatalog, capabilities: t4.capabilityCatalog },
    policy: "cheapest-reliable",
    budgetEnvelopeUsd: t4.budgetEnvelopeUsd,
    scenarios: [t4],
    method: "evolutionary",
    seed: "evo-t4",
  };
  const first = runOrganizationSearch(t4Request);
  const second = runOrganizationSearch(t4Request);
  assert.deepEqual(first.candidates, second.candidates);
  assert.ok(first.candidates.length > 0);
  // Integrity bound (P5 + certification bar untouched): with one criterion
  // structurally unmeetable on the forced-failure class, goal achievement ≤ 4/5
  // caps fitness below the sum of the remaining weighted terms (0.87 < 1).
  for (const candidate of first.candidates) {
    assert.ok(
      (candidate.evaluatedFitness ?? 0) < 0.88,
      "T4 fitness must stay capped by the unmeetable criterion — never a fabricated success",
    );
  }
  // The certification bar refuses every evolutionary T4 candidate (dodger or
  // attempter): the search method cannot buy its way past the lock.
  const lab = createLabService();
  const pipeline = lab.evaluateAndCertify({
    request: {
      goal: t4.goal,
      goalClass: t4.goalClass,
      catalogs: { models: t4.modelCatalog, capabilities: t4.capabilityCatalog },
      policy: "cheapest-reliable",
      budgetEnvelopeUsd: t4.budgetEnvelopeUsd,
      method: "evolutionary",
      seed: "evo-t4",
    },
    scenarios: [t4],
    certifiedAt: "2026-10-04T08:00:00.000Z",
  });
  assert.equal(pipeline.searchTelemetry.method, "evolutionary");
  assert.equal(pipeline.outcome?.certified, false, "T4 must refuse certification regardless of search method");
  assert.ok(pipeline.outcome.issues.length > 0);
});
