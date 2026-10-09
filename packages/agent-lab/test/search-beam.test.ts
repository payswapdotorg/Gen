/**
 * Beam search method tests (W13, work item 2): level-by-level expansion with
 * surrogate pruning (schema validation + partial preScore), configurable width
 * K, full evaluation on survivors when scenarios are attached, deterministic
 * output, budget bounds.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { OrganizationSearchRequest } from "../src/domain/lab-api.js";
import { runOrganizationSearch } from "../src/domain/search/method-registry.js";
import { validateOrganizationGraph } from "../src/domain/org-graph.js";
import { OrganizationGraphSchema } from "../src/domain/schema/organization-graph.js";
import { documentaryCinematicScenario } from "../src/domain/scenarios/index.js";

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

test("beam width bounds the survivor pool (K configurable)", () => {
  for (const beamWidth of [1, 3, 6]) {
    const outcome = runOrganizationSearch(
      request({ method: "beam", options: { beamWidth }, seed: "beam-width" }),
    );
    assert.ok(
      outcome.candidates.length <= beamWidth,
      `width ${beamWidth}: emitted ${outcome.candidates.length} candidates`,
    );
    assert.equal(outcome.telemetry.detail?.beamWidth, beamWidth);
    for (const candidate of outcome.candidates) {
      assert.ok(OrganizationGraphSchema.safeParse(candidate.graph).success);
      assert.deepEqual(validateOrganizationGraph(candidate.graph), []);
    }
  }
});

test("a beam at least as wide as the space degenerates to full enumeration (same candidate set as rule)", () => {
  const beam = runOrganizationSearch(request({ method: "beam", options: { beamWidth: 64 }, maxCandidates: 64 }));
  const rule = runOrganizationSearch(request({ method: "rule", maxCandidates: 64 }));
  assert.equal(beam.candidates.length, rule.candidates.length);
  const keyOf = (candidate: { dimensionChoices: Readonly<Record<string, string>>; preScore: number }): string =>
    `${JSON.stringify(candidate.dimensionChoices)}@${candidate.preScore}`;
  const beamSet = beam.candidates.map(keyOf).sort();
  const ruleSet = rule.candidates.map(keyOf).sort();
  assert.deepEqual(beamSet, ruleSet, "wide beam must cover exactly the enumerable space");
});

test("with scenarios, survivors are fully evaluated and ranked by simulated fitness", () => {
  const outcome = runOrganizationSearch(request({ method: "beam", options: { beamWidth: 4 }, seed: "beam-fit" }));
  assert.ok(outcome.telemetry.evaluationsRun > 0, "survivors must be evaluated");
  assert.equal(outcome.telemetry.evaluationsRun, Math.min(4, outcome.candidates.length));
  const evaluated = outcome.candidates.filter((candidate) => candidate.evaluatedFitness !== undefined);
  assert.equal(evaluated.length, outcome.candidates.length);
  for (let i = 1; i < evaluated.length; i += 1) {
    const prev = evaluated[i - 1] as { evaluatedFitness?: number };
    const curr = evaluated[i] as { evaluatedFitness?: number };
    assert.ok(
      (prev.evaluatedFitness ?? 0) >= (curr.evaluatedFitness ?? 0),
      "survivors must be ranked by evaluated fitness (desc)",
    );
  }
  assert.ok(outcome.telemetry.bestEvaluatedFitness !== undefined);
  assert.equal(outcome.telemetry.detail?.ranking, "simulated-fitness");
});

test("without scenarios, beam degrades to surrogate ranking and says so (never fabricates fitness)", () => {
  const outcome = runOrganizationSearch({
    goal: scenario.goal,
    goalClass: scenario.goalClass,
    catalogs: { models: scenario.modelCatalog, capabilities: scenario.capabilityCatalog },
    policy: "cheapest-reliable",
    budgetEnvelopeUsd: scenario.budgetEnvelopeUsd,
    method: "beam",
  });
  assert.equal(outcome.telemetry.evaluationsRun, 0);
  assert.ok(outcome.issues.some((issue) => /beam search ran without scenarios/.test(issue)));
  for (const candidate of outcome.candidates) {
    assert.equal(candidate.evaluatedFitness, undefined);
  }
  for (let i = 1; i < outcome.candidates.length; i += 1) {
    const prev = outcome.candidates[i - 1] as { preScore: number };
    const curr = outcome.candidates[i] as { preScore: number };
    assert.ok(prev.preScore >= curr.preScore, "surrogate ranking must be by preScore");
  }
});

test("beam is deterministic (no randomness at all) and evaluation-budget bounded", () => {
  const first = runOrganizationSearch(request({ method: "beam", seed: "beam-det", options: { beamWidth: 5 } }));
  const second = runOrganizationSearch(request({ method: "beam", seed: "beam-det", options: { beamWidth: 5 } }));
  const otherSeed = runOrganizationSearch(request({ method: "beam", seed: "other", options: { beamWidth: 5 } }));
  assert.deepEqual(first.candidates, second.candidates);
  assert.deepEqual(first.candidates, otherSeed.candidates, "beam output is seed-independent (no PRNG)");

  const capped = runOrganizationSearch(
    request({ method: "beam", options: { beamWidth: 6, evaluationBudget: 2 } }),
  );
  assert.ok(capped.telemetry.evaluationsRun <= 2, "evaluation budget must cap survivor evaluations");
  const evaluatedCount = capped.candidates.filter((candidate) => candidate.evaluatedFitness !== undefined).length;
  assert.ok(evaluatedCount <= 2, "at most `budget` survivors carry evaluatedFitness");
});
