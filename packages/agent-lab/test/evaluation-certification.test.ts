/**
 * Evaluation loop + certification bar tests (work order B7, organization-lab
 * §4): the fitness function with configurable weights, and the certification
 * bar — pinned scenario set, fitness threshold, zero unresolved gaps.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_FITNESS_WEIGHTS } from "../src/domain/lab-api.js";
import { evaluateRun, meanFitness } from "../src/domain/evaluation.js";
import { certifyOrganization, withCertification } from "../src/domain/certification.js";
import { searchOrganizations } from "../src/domain/search.js";
import { runSimulation } from "../src/domain/simulation/engine.js";
import {
  documentaryCinematicScenario,
  forcedFailureScenario,
} from "../src/domain/scenarios/index.js";

function t2Run() {
  const result = searchOrganizations({
    goal: documentaryCinematicScenario.goal,
    goalClass: documentaryCinematicScenario.goalClass,
    catalogs: {
      models: documentaryCinematicScenario.modelCatalog,
      capabilities: documentaryCinematicScenario.capabilityCatalog,
    },
    policy: "cheapest-reliable",
    budgetEnvelopeUsd: documentaryCinematicScenario.budgetEnvelopeUsd,
  });
  const best = result.candidates[0];
  assert.ok(best);
  const run = runSimulation(documentaryCinematicScenario, best.graph);
  return { graph: best.graph, run };
}

function t4AttemptingRun() {
  const result = searchOrganizations({
    goal: forcedFailureScenario.goal,
    goalClass: forcedFailureScenario.goalClass,
    catalogs: {
      models: forcedFailureScenario.modelCatalog,
      capabilities: forcedFailureScenario.capabilityCatalog,
    },
    policy: "cheapest-reliable",
    budgetEnvelopeUsd: forcedFailureScenario.budgetEnvelopeUsd,
  });
  const attempting = result.candidates.find(
    (candidate) => candidate.dimensionChoices.toolAllocation === "standard",
  );
  assert.ok(attempting);
  return runSimulation(forcedFailureScenario, attempting.graph);
}

test("fitness: goal achievement is criteria-based and reproducible", () => {
  const { run } = t2Run();
  const metrics = evaluateRun(run, documentaryCinematicScenario);
  assert.equal(metrics.criteriaTotal, 6);
  assert.equal(metrics.criteriaMet, 6);
  assert.equal(metrics.goalAchievement, 1);
  assert.equal(metrics.unresolvedGaps, 0);
  assert.equal(metrics.gapPenalty, 0);
  assert.equal(metrics.approvalCount, 1);
  assert.equal(metrics.humanScore, 0.5);
  assert.ok(metrics.fitness > 0.7);
  // Deterministic: same run, same numbers.
  assert.deepEqual(evaluateRun(run, documentaryCinematicScenario), metrics);
});

test("fitness: gap penalty subtracts and is configurable by weights", () => {
  const t4Run = t4AttemptingRun();
  const metrics = evaluateRun(t4Run, forcedFailureScenario);
  assert.equal(metrics.gapPenalty, 1);
  assert.equal(metrics.unresolvedGaps, 1);
  const zeroFailureWeight = evaluateRun(t4Run, forcedFailureScenario, {
    ...DEFAULT_FITNESS_WEIGHTS,
    failure: 0,
  });
  assert.equal(zeroFailureWeight.gapPenalty, 1);
  assert.ok(
    zeroFailureWeight.fitness > metrics.fitness,
    "with failure weight 0 the gap costs nothing — the weight configures the pressure",
  );
  assert.ok(metrics.goalAchievement < 1);
});

test("fitness: cost efficiency responds to the envelope", () => {
  const { run } = t2Run();
  const frugal = evaluateRun(run, documentaryCinematicScenario, {
    ...DEFAULT_FITNESS_WEIGHTS,
    cost: 0.5,
  });
  assert.ok(frugal.costEfficiency > 0 && frugal.costEfficiency <= 1);
  assert.ok(frugal.fitness > 0);
});

test("meanFitness averages across the scenario set", () => {
  const { run } = t2Run();
  const a = evaluateRun(run, documentaryCinematicScenario);
  assert.equal(meanFitness([a, a]), a.fitness);
  assert.equal(meanFitness([]), 0);
});

test("certification bar: T2 organization certifies with committed evidence", () => {
  const { graph, run } = t2Run();
  const metrics = evaluateRun(run, documentaryCinematicScenario);
  const outcome = certifyOrganization({
    graph,
    scenarioResults: [{ scenarioId: documentaryCinematicScenario.id, metrics }],
    certifiedAt: "2026-10-04T08:00:00.000Z",
  });
  assert.equal(outcome.certified, true);
  assert.deepEqual(outcome.issues, []);
  assert.equal(outcome.evidence.gapReportsResolved, true);
  assert.match(outcome.evidence.replayRef, /^packages\/agent-lab\/src\/domain\/evaluations\/eval\./);
  const certified = withCertification(graph, outcome, DEFAULT_FITNESS_WEIGHTS as unknown as Record<string, number>);
  assert.equal(certified.evaluation?.certified, true);
  assert.equal(certified.evaluation?.certificationEvidence?.gapReportsResolved, true);
});

test("certification bar: unresolved gap reports refuse certification (T4, never fabricated)", () => {
  const t4Run = t4AttemptingRun();
  const metrics = evaluateRun(t4Run, forcedFailureScenario);
  const outcome = certifyOrganization({
    graph: { id: "org.character-replacement-attempt" },
    scenarioResults: [{ scenarioId: forcedFailureScenario.id, metrics }],
    certifiedAt: "2026-10-04T08:00:00.000Z",
  });
  assert.equal(outcome.certified, false);
  assert.ok(outcome.issues.some((issue) => /unresolved gap report/.test(issue)));
});

test("certification bar: unmet success criteria refuse certification", () => {
  const { run } = t2Run();
  const metrics = evaluateRun(run, documentaryCinematicScenario);
  const outcome = certifyOrganization({
    graph: { id: "org.partial-criteria" },
    scenarioResults: [
      { scenarioId: "s", metrics: { ...metrics, criteriaMet: metrics.criteriaMet - 1 } },
    ],
    certifiedAt: "2026-10-04T08:00:00.000Z",
  });
  assert.equal(outcome.certified, false);
  assert.ok(outcome.issues.some((issue) => /success criteria met/.test(issue)));
});

test("certification bar: fitness threshold is enforced", () => {
  const { graph, run } = t2Run();
  const metrics = evaluateRun(run, documentaryCinematicScenario);
  const outcome = certifyOrganization({
    graph,
    scenarioResults: [{ scenarioId: documentaryCinematicScenario.id, metrics }],
    bar: { scenarioSetRef: "test", minFitness: 0.99, requireAllCriteriaMet: false, maxUnresolvedGaps: 0 },
    certifiedAt: "2026-10-04T08:00:00.000Z",
  });
  assert.equal(outcome.certified, false);
  assert.ok(outcome.issues.some((issue) => /below bar 0\.99/.test(issue)));
});

test("certification bar: empty scenario set is refused (pinned set required)", () => {
  const outcome = certifyOrganization({
    graph: { id: "org.empty-scenarios" },
    scenarioResults: [],
    certifiedAt: "2026-10-04T08:00:00.000Z",
  });
  assert.equal(outcome.certified, false);
  assert.ok(outcome.issues.some((issue) => /pinned scenario set/.test(issue)));
});

test("withCertification omits evidence when not certified", () => {
  const t4Run = t4AttemptingRun();
  const metrics = evaluateRun(t4Run, forcedFailureScenario);
  const outcome = certifyOrganization({
    graph: { id: "org.uncertified-t4" },
    scenarioResults: [{ scenarioId: forcedFailureScenario.id, metrics }],
    certifiedAt: "2026-10-04T08:00:00.000Z",
  });
  assert.equal(outcome.certified, false);
  const graph = withCertification(
    { id: "org.uncertified-t4", goal: "x goal", goalClass: "generic-edit", nodes: [], edges: [], allocations: { executionOrder: [] } } as never,
    outcome,
    {},
  );
  assert.equal(graph.evaluation?.certified, false);
  assert.equal(graph.evaluation?.certificationEvidence, undefined);
});
