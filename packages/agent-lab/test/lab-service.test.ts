/**
 * Lab service tests (app layer, work order B): search → simulate → evaluate →
 * certify through the public service API, with the evaluation store port.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { EvaluationRecord, EvaluationStore } from "../src/domain/lab-api.js";
import type { OrganizationGraph } from "../src/contract.js";
import { createLabService } from "../src/app/lab-service.js";
import { documentaryCinematicScenario, forcedFailureScenario } from "../src/domain/scenarios/index.js";

function memoryStore(): EvaluationStore & {
  evaluations: EvaluationRecord[];
  organizations: OrganizationGraph[];
} {
  const evaluations: EvaluationRecord[] = [];
  const organizations: OrganizationGraph[] = [];
  return {
    evaluations,
    organizations,
    saveEvaluation: (record) => evaluations.push(record),
    saveCertifiedOrganization: (graph) => organizations.push(graph),
    listEvaluations: () => evaluations,
  };
}

const CERTIFIED_AT = "2026-10-04T08:00:00.000Z";

test("evaluateAndCertify: T2 end-to-end — search, simulate, evaluate, certify, persist", () => {
  const store = memoryStore();
  const lab = createLabService({ evaluationStore: store });
  const result = lab.evaluateAndCertify({
    request: {
      goal: documentaryCinematicScenario.goal,
      goalClass: documentaryCinematicScenario.goalClass,
      catalogs: {
        models: documentaryCinematicScenario.modelCatalog,
        capabilities: documentaryCinematicScenario.capabilityCatalog,
      },
      policy: "cheapest-reliable",
      budgetEnvelopeUsd: documentaryCinematicScenario.budgetEnvelopeUsd,
    },
    scenarios: [documentaryCinematicScenario],
    certifiedAt: CERTIFIED_AT,
  });
  assert.ok(result.best);
  assert.ok(result.outcome?.certified);
  assert.ok(result.certifiedGraph);
  assert.ok(result.record);
  // The certified organization carries the five-role T2 cast.
  const bodies = (result.certifiedGraph?.nodes ?? [])
    .filter((node) => node.agentInstance)
    .map((node) => node.agentInstance!.bodyId);
  for (const expected of [
    "body.director",
    "body.video-editor",
    "body.color-specialist",
    "body.audio-specialist",
    "body.critic",
  ]) {
    assert.ok(bodies.includes(expected), `${expected} must be in the certified org`);
  }
  assert.equal(store.evaluations.length, 1);
  assert.equal(store.organizations.length, 1);
  assert.equal(store.organizations[0]?.evaluation?.certified, true);
  assert.equal(result.record.certified, true);
  assert.match(result.record.recordId, /^eval\.org\.documentary-cinematic-remaster-cand-\d+$/);
});

test("evaluateAndCertify: T4 refuses certification while the gap is unresolved", () => {
  const store = memoryStore();
  const lab = createLabService({ evaluationStore: store });
  const result = lab.evaluateAndCertify({
    request: {
      goal: forcedFailureScenario.goal,
      goalClass: forcedFailureScenario.goalClass,
      catalogs: {
        models: forcedFailureScenario.modelCatalog,
        capabilities: forcedFailureScenario.capabilityCatalog,
      },
      policy: "cheapest-reliable",
      budgetEnvelopeUsd: forcedFailureScenario.budgetEnvelopeUsd,
    },
    scenarios: [forcedFailureScenario],
    certifiedAt: CERTIFIED_AT,
  });
  assert.ok(result.best, "a best candidate exists");
  assert.ok(result.outcome);
  assert.equal(result.outcome.certified, false, "never certify with unresolved gaps / unmet criteria");
  assert.ok(result.outcome.issues.length > 0);
  // The refusal itself is recorded — decisions in the repo (P6).
  assert.equal(store.evaluations.length, 1);
  assert.equal(store.evaluations[0]?.certified, false);
  assert.equal(store.organizations.length, 0, "no organization graph is persisted for a refused certification");
});

test("evaluateAndCertify is deterministic across runs", () => {
  const lab = createLabService();
  const request = {
    request: {
      goal: documentaryCinematicScenario.goal,
      goalClass: documentaryCinematicScenario.goalClass,
      catalogs: {
        models: documentaryCinematicScenario.modelCatalog,
        capabilities: documentaryCinematicScenario.capabilityCatalog,
      },
      policy: "cheapest-reliable" as const,
      budgetEnvelopeUsd: documentaryCinematicScenario.budgetEnvelopeUsd,
    },
    scenarios: [documentaryCinematicScenario],
    certifiedAt: CERTIFIED_AT,
  };
  const first = lab.evaluateAndCertify(request);
  const second = lab.evaluateAndCertify(request);
  assert.equal(first.best?.graph.id, second.best?.graph.id);
  assert.equal(first.best?.fitness, second.best?.fitness);
  assert.deepEqual(first.best?.perScenario, second.best?.perScenario);
  assert.equal(first.record?.recordId, second.record?.recordId);
});

test("fitness responds to budget policy changes (T3 linkage)", () => {
  const lab = createLabService();
  const base = {
    goal: documentaryCinematicScenario.goal,
    goalClass: documentaryCinematicScenario.goalClass,
    catalogs: {
      models: documentaryCinematicScenario.modelCatalog,
      capabilities: documentaryCinematicScenario.capabilityCatalog,
    },
    budgetEnvelopeUsd: documentaryCinematicScenario.budgetEnvelopeUsd,
  };
  const cheapest = lab.evaluateAndCertify({
    request: { ...base, policy: "cheapest-reliable" },
    scenarios: [documentaryCinematicScenario],
    certifiedAt: CERTIFIED_AT,
  });
  const premium = lab.evaluateAndCertify({
    request: { ...base, policy: "premium-first" },
    scenarios: [documentaryCinematicScenario],
    certifiedAt: CERTIFIED_AT,
  });
  assert.ok(cheapest.best && premium.best);
  const cheapestSpend = cheapest.best.perScenario[0]?.metrics.totalSpendUsd ?? 0;
  const premiumSpend = premium.best.perScenario[0]?.metrics.totalSpendUsd ?? 0;
  assert.ok(
    premiumSpend > cheapestSpend,
    `premium-first must spend more (${premiumSpend} > ${cheapestSpend})`,
  );
  // Same winning topology, different model inhabitants — the allocation moved (P2/T3).
  const modelOf = (graph: typeof cheapest.best.graph, bodyId: string): string => {
    const node = graph.nodes.find((candidate) => candidate.agentInstance?.bodyId === bodyId);
    assert.ok(node?.agentInstance, `${bodyId} must be in the org`);
    return `${node.agentInstance.cognitiveModel.providerId}/${node.agentInstance.cognitiveModel.modelId}`;
  };
  const cheapestEditor = modelOf(cheapest.best.graph, "body.video-editor");
  const premiumEditor = modelOf(premium.best.graph, "body.video-editor");
  assert.notEqual(cheapestEditor, premiumEditor);
  const cheapestCritic = modelOf(cheapest.best.graph, "body.critic");
  const premiumCritic = modelOf(premium.best.graph, "body.critic");
  assert.notEqual(cheapestCritic, premiumCritic);
});

test("service exposes search/simulate/evaluate separately", () => {
  const lab = createLabService();
  const search = lab.search({
    goal: documentaryCinematicScenario.goal,
    goalClass: documentaryCinematicScenario.goalClass,
    catalogs: {
      models: documentaryCinematicScenario.modelCatalog,
      capabilities: documentaryCinematicScenario.capabilityCatalog,
    },
    policy: "cheapest-reliable",
    budgetEnvelopeUsd: documentaryCinematicScenario.budgetEnvelopeUsd,
  });
  const best = search.candidates[0];
  assert.ok(best);
  const run = lab.simulate(documentaryCinematicScenario, best.graph);
  const metrics = lab.evaluate(run, documentaryCinematicScenario);
  assert.ok(metrics.fitness > 0.7);
  assert.equal(run.criteriaResults.every((c) => c.met), true);
});
