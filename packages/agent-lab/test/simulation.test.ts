/**
 * Deterministic simulation tests (work order B6, organization-lab §3): seeded
 * scenario, frozen capability mocks, virtual clock, hermetic (no network) —
 * plus T2/T4 scenario runs and P4 TaskPlan streams.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { OrganizationGraph } from "../src/contract.js";
import { searchOrganizations } from "../src/domain/search.js";
import {
  documentaryCinematicScenario,
  forcedFailureScenario,
} from "../src/domain/scenarios/index.js";
import { runSimulation } from "../src/domain/simulation/engine.js";
import { TaskPlanSchema } from "../src/domain/schema/task-plan.js";

function bestT2Graph(): OrganizationGraph {
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
  assert.ok(best, "T2 search must produce candidates");
  return best.graph;
}

function attemptingT4Graph(): OrganizationGraph {
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
  assert.ok(attempting, "T4 needs a candidate that attempts the required capability");
  return attempting.graph;
}

test("simulation is deterministic and replayable from the seed", () => {
  const graph = bestT2Graph();
  const first = runSimulation(documentaryCinematicScenario, graph);
  const second = runSimulation(documentaryCinematicScenario, graph);
  assert.equal(first.replayHash, second.replayHash);
  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.telemetry, second.telemetry);
  assert.deepEqual(first.criteriaResults, second.criteriaResults);
  // A different organization changes the stream.
  const other = { ...graph, id: "org.other-t2" } satisfies OrganizationGraph;
  const third = runSimulation(documentaryCinematicScenario, other);
  assert.notEqual(first.replayHash, third.replayHash);
});

test("virtual clock advances monotonically and events are seq-ordered", () => {
  const run = runSimulation(documentaryCinematicScenario, bestT2Graph());
  assert.ok(run.virtualClockMs > 0);
  let lastAt = 0;
  for (const event of run.events) {
    assert.ok(event.atMs >= lastAt, "event timestamps must be non-decreasing");
    lastAt = event.atMs;
  }
  assert.deepEqual(
    run.events.map((event) => event.seq),
    run.events.map((_, index) => index + 1),
  );
});

test("telemetry is bounded (maxEvents config)", () => {
  const graph = bestT2Graph();
  const capped = runSimulation(documentaryCinematicScenario, graph, { maxEvents: 5 });
  assert.ok(capped.events.length <= 5);
  const full = runSimulation(documentaryCinematicScenario, graph);
  assert.ok(full.events.length > 5);
});

test("T2 run: the documentary organization completes with zero gap signals", () => {
  const run = runSimulation(documentaryCinematicScenario, bestT2Graph());
  assert.equal(run.finished, true);
  assert.equal(run.failureReason, undefined);
  assert.deepEqual(run.gapSignals, []);
  assert.ok(run.artifacts.length > 0);
  assert.equal(run.criteriaResults.every((criterion) => criterion.met), true);
  assert.ok(
    run.criteriaResults.some((criterion) => criterion.id === "required-capabilities-invoked" && criterion.met),
  );
  assert.ok(run.taskPlans.length > 0);
});

test("T2 run: seeded defect is caught by a reviewer (deterministic)", () => {
  const run = runSimulation(documentaryCinematicScenario, bestT2Graph());
  const caught = run.criteriaResults.find((c) => c.id === "all-defects-caught");
  assert.ok(caught);
  assert.equal(caught.met, true);
  assert.ok(run.events.some((event) => event.type === "review-verdict" && /defect caught/.test(event.detail)));
});

test("T4 run: forced failure emits a schema-valid gap signal with evidence (P5)", () => {
  const run = runSimulation(forcedFailureScenario, attemptingT4Graph());
  assert.equal(run.gapSignals.length, 1);
  const [signal] = run.gapSignals;
  if (!signal) throw new Error("unreachable");
  assert.equal(signal.kind, "mapping-shortfall");
  assert.equal(signal.requestedCapability.capabilityId, "video.character-replacement");
  assert.ok(signal.failureEvidence.routerDecisionTrace);
  assert.match(signal.failureEvidence.routerDecisionTrace ?? "", /policy=cheapest-reliable/);
  assert.match(signal.failureEvidence.comparisonTableRef ?? "", /\.comparison\.json$/);
  assert.equal(signal.impact.goalClass, "character-replacement-edit");
  assert.ok(["low", "medium", "high", "critical"].includes(signal.impact.severity));
  assert.ok(run.events.some((event) => event.type === "gap-signaled"));
  // The failing criterion is the goal, not the fabricator.
  const unmet = run.criteriaResults.filter((c) => !c.met).map((c) => c.id);
  assert.deepEqual(unmet.sort(), ["goal-class-served", "no-capability-gaps"]);
});

test("T4 run: an organization that dodges the capability does not get goal credit", () => {
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
  const dodger = result.candidates.find(
    (candidate) => candidate.dimensionChoices.toolAllocation === "minimal",
  );
  assert.ok(dodger);
  const run = runSimulation(forcedFailureScenario, dodger.graph);
  assert.deepEqual(run.gapSignals, [], "dodging the capability avoids the failure");
  const required = run.criteriaResults.find((c) => c.id === "required-capabilities-invoked");
  assert.ok(required);
  assert.equal(required.met, false, "...but must not count as goal achievement");
});

test("P4: stages emit TaskPlan updates that parse against the task-plan schema", () => {
  const run = runSimulation(documentaryCinematicScenario, bestT2Graph());
  for (const plan of run.taskPlans) {
    const parsed = TaskPlanSchema.safeParse(plan);
    assert.ok(parsed.success, parsed.success ? "" : parsed.error.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
  }
  const [first] = run.taskPlans;
  assert.ok(first);
  assert.match(first.currentStep, /Stage /);
  assert.ok(first.completed.length >= 1);
  assert.ok(first.completed.every((item) => item.evidence.length >= 1));
});

test("P4/P5: blocked items reference gap reports in the T4 plan", () => {
  const run = runSimulation(forcedFailureScenario, attemptingT4Graph());
  const last = run.taskPlans[run.taskPlans.length - 1];
  assert.ok(last);
  assert.ok(last.blocked.length >= 1);
  const blocked = last.blocked.find((item) => item.kind === "capability");
  assert.ok(blocked);
  assert.match(blocked.capabilityGapRef ?? "", /^gaps\/gap\./);
});

test("approvals are recorded against the human gate (user-in-the-loop)", () => {
  const run = runSimulation(documentaryCinematicScenario, bestT2Graph());
  assert.equal(run.telemetry.approvalCount, 1);
  assert.ok(run.events.some((event) => event.type === "approval-recorded" && /approve/.test(event.detail)));
});

test("rejection at an approval gate aborts the run", () => {
  const scenario = {
    ...documentaryCinematicScenario,
    approvals: [{ gate: "final-delivery", response: "reject" as const }],
  };
  const run = runSimulation(scenario, bestT2Graph());
  assert.equal(run.finished, false);
  assert.match(run.failureReason ?? "", /approval rejected/);
});

test("hermetic: capability mocks are the only execution source", () => {
  const run = runSimulation(documentaryCinematicScenario, bestT2Graph());
  for (const event of run.events) {
    if (event.type === "capability-invoked") {
      assert.match(event.detail, /via frozen mock/);
    }
  }
});
