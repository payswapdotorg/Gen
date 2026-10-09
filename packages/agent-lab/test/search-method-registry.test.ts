/**
 * Search-method registry tests (W13, organization-lab §2): the search engine
 * is pluggable behind a registry — rule | beam | evolutionary | bandit — with
 * method selection via the request, default rule behavior-identical to the
 * pre-W13 engine, deterministic outputs per seed, budget bounds respected,
 * and schema parity of every method's outputs. The OUTPUT contract stays
 * frozen by the organization-graph schema.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { OrganizationSearchRequest, SearchCandidate } from "../src/domain/lab-api.js";
import { searchOrganizations } from "../src/domain/search.js";
import {
  listSearchMethodNames,
  registerSearchMethod,
  runOrganizationSearch,
} from "../src/domain/search/method-registry.js";
import { validateOrganizationGraph } from "../src/domain/org-graph.js";
import { OrganizationGraphSchema } from "../src/domain/schema/organization-graph.js";
import { createLabService } from "../src/app/lab-service.js";
import {
  documentaryCinematicScenario,
  forcedFailureScenario,
} from "../src/domain/scenarios/index.js";

const METHODS = ["rule", "beam", "evolutionary", "bandit"] as const;

function requestFor(
  scenario: typeof documentaryCinematicScenario,
  extra: Partial<OrganizationSearchRequest> = {},
): OrganizationSearchRequest {
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

function signatureOf(candidates: readonly SearchCandidate[]): string {
  return candidates
    .map((candidate) => `${candidate.graph.id}|${candidate.preScore}|${JSON.stringify(candidate.dimensionChoices)}`)
    .join("\n");
}

test("registry exposes the four built-in methods with rule first", () => {
  const names = listSearchMethodNames();
  assert.equal(names[0], "rule");
  for (const method of METHODS) assert.ok(names.includes(method), `${method} must be registered`);
});

test("legacy searchOrganizations is behavior-identical to the rule method (no telemetry)", () => {
  for (const scenario of [documentaryCinematicScenario, forcedFailureScenario]) {
    const request = requestFor(scenario);
    const legacy = searchOrganizations(request);
    const viaRegistry = runOrganizationSearch({ ...request, method: "rule" });
    assert.deepEqual(legacy.candidates, viaRegistry.candidates);
    assert.deepEqual(legacy.searchedDimensions, viaRegistry.searchedDimensions);
    assert.deepEqual(legacy.issues, viaRegistry.issues);
    assert.equal(legacy.goalClass, viaRegistry.goalClass);
    // rule never evaluates internally and emits no evaluatedFitness.
    assert.equal(viaRegistry.telemetry.evaluationsRun, 0);
    for (const candidate of legacy.candidates) {
      assert.equal(candidate.evaluatedFitness, undefined);
    }
  }
});

test("method selection is via the request; the default is rule", () => {
  const scenario = documentaryCinematicScenario;
  const defaultOutcome = runOrganizationSearch(requestFor(scenario, { seed: "w13-registry" }));
  assert.equal(defaultOutcome.telemetry.method, "rule");
  for (const method of METHODS) {
    const outcome = runOrganizationSearch(requestFor(scenario, { method, seed: "w13-registry" }));
    assert.equal(outcome.telemetry.method, method);
    assert.ok(outcome.candidates.length > 0, `${method} must emit candidates`);
  }
});

test("unknown methods fail loudly with the known-methods list", () => {
  assert.throws(
    () => runOrganizationSearch(requestFor(documentaryCinematicScenario, { method: "does-not-exist" })),
    /unknown search method "does-not-exist" — known methods: rule, beam, evolutionary, bandit/,
  );
});

test("future methods slot in through registerSearchMethod without touching callers", () => {
  const seen: string[] = [];
  const unregister = registerSearchMethod({
    name: "probe-method",
    search: (request) => {
      seen.push(request.goalClass);
      const rule = runOrganizationSearch({ ...request, method: "rule", maxCandidates: 1 });
      return { ...rule, telemetry: { ...rule.telemetry, method: "probe-method" } };
    },
  });
  try {
    const outcome = runOrganizationSearch(requestFor(documentaryCinematicScenario, { method: "probe-method" }));
    assert.equal(outcome.telemetry.method, "probe-method");
    assert.deepEqual(seen, [documentaryCinematicScenario.goalClass]);
  } finally {
    unregister();
  }
  assert.throws(() => runOrganizationSearch(requestFor(documentaryCinematicScenario, { method: "probe-method" })));
  assert.ok(!listSearchMethodNames().includes("probe-method"));
});

test("every method is deterministic: same seed → same ranked output", () => {
  for (const scenario of [documentaryCinematicScenario, forcedFailureScenario]) {
    for (const method of METHODS) {
      const request = requestFor(scenario, { method, seed: `w13-determinism-${method}` });
      const first = runOrganizationSearch(request);
      const second = runOrganizationSearch(request);
      assert.deepEqual(first.candidates, second.candidates, `${method} must be seed-deterministic`);
      assert.equal(first.telemetry.evaluationsRun, second.telemetry.evaluationsRun);
      assert.equal(first.telemetry.candidatesConsidered, second.telemetry.candidatesConsidered);
    }
  }
});

test("schema parity: every method's outputs are schema-valid organization graphs", () => {
  for (const scenario of [documentaryCinematicScenario, forcedFailureScenario]) {
    for (const method of METHODS) {
      const outcome = runOrganizationSearch(requestFor(scenario, { method, seed: "w13-parity" }));
      assert.ok(outcome.candidates.length > 0);
      for (const candidate of outcome.candidates) {
        const parsed = OrganizationGraphSchema.safeParse(candidate.graph);
        assert.ok(parsed.success, `${method}: ${parsed.success ? "" : String(parsed.error.issues[0]?.message)}`);
        assert.deepEqual(validateOrganizationGraph(candidate.graph), []);
        assert.equal(candidate.graph.goalClass, scenario.goalClass);
      }
    }
  }
});

test("budget bounds are respected: evaluationsRun never exceeds the evaluation budget", () => {
  const scenario = documentaryCinematicScenario;
  for (const method of ["beam", "evolutionary", "bandit"] as const) {
    const outcome = runOrganizationSearch(
      requestFor(scenario, { method, seed: "w13-budget", options: { evaluationBudget: 3 } }),
    );
    assert.ok(
      outcome.telemetry.evaluationsRun <= 3,
      `${method} ran ${outcome.telemetry.evaluationsRun} evaluations with budget 3`,
    );
  }
});

test("fitness-driven methods report honest evaluatedFitness; rule leaves it absent", () => {
  const scenario = documentaryCinematicScenario;
  for (const method of ["beam", "evolutionary", "bandit"] as const) {
    const outcome = runOrganizationSearch(requestFor(scenario, { method, seed: "w13-fitness" }));
    assert.ok(outcome.telemetry.evaluationsRun > 0, `${method} must evaluate with scenarios attached`);
    for (const candidate of outcome.candidates) {
      if (candidate.evaluatedFitness !== undefined) {
        assert.ok(Number.isFinite(candidate.evaluatedFitness));
        assert.ok(candidate.evaluatedFitness >= 0 && candidate.evaluatedFitness <= 1);
      }
    }
    assert.ok(
      outcome.candidates.some((candidate) => candidate.evaluatedFitness !== undefined),
      `${method} should carry evaluatedFitness for internally evaluated candidates`,
    );
  }
  const rule = runOrganizationSearch(requestFor(scenario, { method: "rule", seed: "w13-fitness" }));
  for (const candidate of rule.candidates) {
    assert.equal(candidate.evaluatedFitness, undefined, "rule never fabricates fitness");
  }
});

test("dimension switches are honored by every method (frozen axes are not searched)", () => {
  const scenario = documentaryCinematicScenario;
  for (const method of METHODS) {
    const request = requestFor(scenario, {
      method,
      seed: "w13-frozen",
      dimensions: { toolAllocation: false, roleStructure: false },
    });
    const outcome = runOrganizationSearch(request);
    assert.ok(outcome.candidates.length > 0);
    for (const candidate of outcome.candidates) {
      assert.equal(candidate.dimensionChoices.toolAllocation, "standard");
      assert.ok(
        candidate.graph.nodes.some((node) => node.agentInstance?.bodyId === "body.video-continuity-supervisor"),
        `${method}: with roleStructure frozen, all optional roles stay included`,
      );
    }
  }
});

test("telemetry carries the run record fields: method, seed, counts, wall time", () => {
  const scenario = forcedFailureScenario;
  const outcome = runOrganizationSearch(requestFor(scenario, { method: "bandit", seed: "w13-telemetry" }));
  const { telemetry } = outcome;
  assert.equal(telemetry.method, "bandit");
  assert.equal(telemetry.seed, "w13-telemetry");
  assert.ok(Number.isFinite(telemetry.candidatesConsidered) && telemetry.candidatesConsidered > 0);
  assert.equal(telemetry.candidatesEmitted, outcome.candidates.length);
  assert.ok(telemetry.evaluationsRun >= 0);
  assert.ok(telemetry.wallTimeMs >= 0);
});

test("the lab pipeline records search telemetry and supports method selection (run record)", () => {
  const scenario = documentaryCinematicScenario;
  const lab = createLabService();
  const base = {
    request: {
      goal: scenario.goal,
      goalClass: scenario.goalClass,
      catalogs: { models: scenario.modelCatalog, capabilities: scenario.capabilityCatalog },
      policy: "cheapest-reliable" as const,
      budgetEnvelopeUsd: scenario.budgetEnvelopeUsd,
    },
    scenarios: [scenario],
    certifiedAt: "2026-10-04T08:00:00.000Z",
  };
  const ruleRun = lab.evaluateAndCertify(base);
  assert.equal(ruleRun.searchTelemetry.method, "rule");
  assert.equal(ruleRun.searchTelemetry.evaluationsRun, 0);
  assert.equal(ruleRun.best?.graph.id, "org.documentary-cinematic-remaster-cand-04");
  assert.equal(ruleRun.best?.fitness, 0.8398);

  const banditRun = lab.evaluateAndCertify({
    ...base,
    request: { ...base.request, method: "bandit", seed: "w13-pipeline" },
  });
  assert.equal(banditRun.searchTelemetry.method, "bandit");
  assert.ok(banditRun.searchTelemetry.evaluationsRun > 0);
  assert.ok(banditRun.ranked.length > 0);
});

test("rule signature on the committed scenarios stays pinned (regression armor)", () => {
  const t2 = runOrganizationSearch(requestFor(documentaryCinematicScenario, { method: "rule" }));
  const t4 = runOrganizationSearch(requestFor(forcedFailureScenario, { method: "rule" }));
  assert.equal(t2.candidates[0]?.graph.id, "org.documentary-cinematic-remaster-cand-16");
  assert.equal(t2.candidates.length, 32);
  assert.equal(t4.candidates[0]?.graph.id, "org.character-replacement-edit-cand-16");
  assert.equal(t4.candidates.length, 32);
  assert.equal(signatureOf(t2.candidates.slice(0, 1)), signatureOf(t2.candidates.slice(0, 1)));
});
