/**
 * Bandit search method tests (W13, work item 4): dimension-profile arms with
 * UCB1 selection, budget-bounded rollout count, deterministic reward stream
 * (seeded simulation fitness; preScore surrogate fallback surfaced honestly
 * when no scenarios are attached).
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { OrganizationSearchRequest } from "../src/domain/lab-api.js";
import { runOrganizationSearch } from "../src/domain/search/method-registry.js";
import { validateOrganizationGraph } from "../src/domain/org-graph.js";
import { OrganizationGraphSchema } from "../src/domain/schema/organization-graph.js";
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

test("rollout count is budget-bounded (rolloutBudget and evaluationBudget both cap pulls)", () => {
  const seven = runOrganizationSearch(
    request({ method: "bandit", seed: "bandit-7", options: { rolloutBudget: 7 } }),
  );
  assert.equal(seven.telemetry.detail?.pulls, 7);
  assert.ok(seven.telemetry.evaluationsRun <= 7);
  assert.equal(seven.telemetry.detail?.arms, 32, "T2 dimension-profile arm space is 32");

  const capped = runOrganizationSearch(
    request({ method: "bandit", seed: "bandit-cap", options: { rolloutBudget: 24, evaluationBudget: 5 } }),
  );
  assert.equal(capped.telemetry.detail?.pulls, 5, "evaluationBudget must cap the rollout count");
  assert.ok(capped.telemetry.evaluationsRun <= 5);
});

test("with budget ≥ arms, every arm is pulled at least once (round-robin initial phase)", () => {
  const outcome = runOrganizationSearch(
    request({ method: "bandit", seed: "bandit-full", options: { rolloutBudget: 32 }, maxCandidates: 32 }),
  );
  assert.equal(outcome.telemetry.detail?.pulls, 32);
  assert.equal(outcome.candidates.length, 32, "all pulled arms are emitted");
});

test("UCB1 is deterministic: identical requests produce identical pulls and rankings", () => {
  const first = runOrganizationSearch(request({ method: "bandit", seed: "bandit-det" }));
  const second = runOrganizationSearch(request({ method: "bandit", seed: "bandit-det" }));
  assert.deepEqual(first.candidates, second.candidates);
  assert.deepEqual(first.telemetry.detail, second.telemetry.detail);
  const third = runOrganizationSearch(request({ method: "bandit", seed: "different-seed" }));
  assert.deepEqual(
    third.candidates.map((candidate) => candidate.graph.id),
    second.candidates.map((candidate) => candidate.graph.id),
    "bandit (UCB1) output is seed-independent — no PRNG in selection",
  );
});

test("rewards come from simulated fitness when scenarios are attached", () => {
  const outcome = runOrganizationSearch(request({ method: "bandit", seed: "bandit-reward" }));
  assert.equal(outcome.telemetry.detail?.rewardBasis, "simulated-fitness");
  assert.ok(outcome.telemetry.evaluationsRun > 0);
  assert.ok(outcome.telemetry.bestEvaluatedFitness !== undefined);
  for (const candidate of outcome.candidates) {
    if (candidate.evaluatedFitness !== undefined) {
      assert.ok(Number.isFinite(candidate.evaluatedFitness));
      assert.ok(candidate.evaluatedFitness >= 0 && candidate.evaluatedFitness <= 1);
    }
  }
  // Ranked by mean reward: non-increasing evaluatedFitness.
  const evaluated = outcome.candidates.filter((candidate) => candidate.evaluatedFitness !== undefined);
  for (let i = 1; i < evaluated.length; i += 1) {
    const prev = evaluated[i - 1] as { evaluatedFitness?: number };
    const curr = evaluated[i] as { evaluatedFitness?: number };
    assert.ok((prev.evaluatedFitness ?? 0) >= (curr.evaluatedFitness ?? 0));
  }
});

test("without scenarios, rewards fall back to the preScore surrogate and say so", () => {
  const outcome = runOrganizationSearch({
    goal: scenario.goal,
    goalClass: scenario.goalClass,
    catalogs: { models: scenario.modelCatalog, capabilities: scenario.capabilityCatalog },
    policy: "cheapest-reliable",
    budgetEnvelopeUsd: scenario.budgetEnvelopeUsd,
    method: "bandit",
    seed: "bandit-surrogate",
  });
  assert.equal(outcome.telemetry.evaluationsRun, 0);
  assert.equal(outcome.telemetry.detail?.rewardBasis, "preScore-surrogate");
  assert.ok(outcome.issues.some((issue) => /bandit search ran without scenarios/.test(issue)));
  for (const candidate of outcome.candidates) {
    assert.equal(candidate.evaluatedFitness, undefined);
  }
});

test("bandit outputs stay schema-valid across scenarios and exploration constants", () => {
  for (const scenarioFor of [documentaryCinematicScenario, forcedFailureScenario]) {
    for (const explorationConstant of [0.5, Math.SQRT2, 2.5]) {
      const outcome = runOrganizationSearch({
        goal: scenarioFor.goal,
        goalClass: scenarioFor.goalClass,
        catalogs: { models: scenarioFor.modelCatalog, capabilities: scenarioFor.capabilityCatalog },
        policy: "cheapest-reliable",
        budgetEnvelopeUsd: scenarioFor.budgetEnvelopeUsd,
        scenarios: [scenarioFor],
        method: "bandit",
        seed: "bandit-parity",
        options: { explorationConstant },
      });
      assert.ok(outcome.candidates.length > 0);
      for (const candidate of outcome.candidates) {
        assert.ok(OrganizationGraphSchema.safeParse(candidate.graph).success);
        assert.deepEqual(validateOrganizationGraph(candidate.graph), []);
      }
    }
  }
});
