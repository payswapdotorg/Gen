/**
 * DecisionPort tests (escalation contract §3, work order W6 task C): the
 * engine pauses at approval edges and resolves the human decision through a
 * port. The scripted adapter must be bit-exact with the default path (and
 * with the committed records); the interactive adapter is the host harness
 * hook (registry callbacks, abstention falls back to the scripted replay).
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  createInteractiveDecisionPort,
  createScriptedDecisionPort,
  runSimulation,
} from "../src/index.js";
import type { DecisionPort } from "../src/index.js";
import { certifiedT2Graph } from "./helpers/graphs.js";
import { documentaryCinematicScenario } from "../src/domain/scenarios/index.js";

test("port: the scripted adapter is bit-identical to the default path", async () => {
  const graph = await certifiedT2Graph();
  const scenario = documentaryCinematicScenario;
  const viaDefault = runSimulation(scenario, graph);
  const viaAdapter = runSimulation(scenario, graph, { decisionPort: createScriptedDecisionPort(scenario) });
  assert.deepEqual(viaDefault, viaAdapter, "full record deep-equality (events, telemetry, trail, bundles)");
  assert.equal(viaAdapter.replayHash, "3474f812");
  // Reject path too.
  const rejectScenario = {
    ...scenario,
    approvals: [{ gate: "final-delivery", response: "reject" as const }],
  };
  const rejectDefault = runSimulation(rejectScenario, graph);
  const rejectAdapter = runSimulation(rejectScenario, graph, {
    decisionPort: createScriptedDecisionPort(rejectScenario),
  });
  assert.deepEqual(rejectDefault, rejectAdapter);
  assert.equal(rejectAdapter.finished, false);
  assert.equal(rejectAdapter.failureReason, "Human approval rejected at stage stage-plan.");
});

test("port: a scripted redirect reproduces the interactive swap bit-for-bit", async () => {
  const graph = await certifiedT2Graph();
  const scenario = {
    ...documentaryCinematicScenario,
    approvals: [
      {
        gate: "final-delivery",
        response: "redirect" as const,
        redirect: { modelSwap: { bodyId: "body.critic", modelId: "glm-5.3" } },
      },
    ],
  };
  const scripted = runSimulation(scenario, graph);
  const interactive = runSimulation(documentaryCinematicScenario, graph, {
    decisionPort: createInteractiveDecisionPort(documentaryCinematicScenario, () => ({
      kind: "redirect",
      redirect: { modelSwap: { bodyId: "body.critic", modelId: "glm-5.3" } },
    })),
  });
  assert.deepEqual(scripted, interactive);
  assert.equal(scripted.replayHash, "3a82b986");
  assert.equal(scripted.telemetry.totalSpendUsd, 6.78);
});

test("port: interactive callbacks are consulted in order; abstention falls back to scripted", async () => {
  const graph = await certifiedT2Graph();
  const port = createInteractiveDecisionPort(documentaryCinematicScenario);
  const unregister = port.register(() => undefined);
  const abstaining = runSimulation(documentaryCinematicScenario, graph, { decisionPort: port });
  assert.equal(abstaining.replayHash, "3474f812", "fallback replays the scripted approve");
  assert.equal(port.presented.length, 1);
  assert.equal(port.presented[0]?.gate.id, "Final delivery approval gate.");
  unregister();
  const decided = runSimulation(documentaryCinematicScenario, graph, {
    decisionPort: createInteractiveDecisionPort(documentaryCinematicScenario, () => ({ kind: "approve" })),
  });
  assert.equal(decided.replayHash, "3474f812");
  assert.equal(port.presented.length, 1, "the unregistered port saw no further bundles");
});

test("port: the harness records every bundle presented to the human", async () => {
  const graph = await certifiedT2Graph();
  const port = createInteractiveDecisionPort(documentaryCinematicScenario);
  runSimulation(documentaryCinematicScenario, graph, { decisionPort: port });
  const run = runSimulation(documentaryCinematicScenario, graph);
  assert.equal(port.presented.length, 1);
  assert.deepEqual(port.presented[0], run.decisionBundles[0]?.bundle, "presented === the persisted bundle");
});

test("port: an interactive reject aborts exactly like a scripted reject", async () => {
  const graph = await certifiedT2Graph();
  const port: DecisionPort = createInteractiveDecisionPort(documentaryCinematicScenario, () => ({
    kind: "reject",
    reason: "pacing not cinematic yet",
  }));
  const run = runSimulation(documentaryCinematicScenario, graph, { decisionPort: port });
  assert.equal(run.finished, false);
  assert.equal(run.failureReason, "Human approval rejected at stage stage-plan.");
  assert.equal(run.replayHash, "d3a8b43c");
  assert.deepEqual(run.decisionTrail[0]?.decision, { kind: "reject", reason: "pacing not cinematic yet" });
});

test("port: scripted cursor semantics survive wrap-around and empty approval lists", async () => {
  const graph = await certifiedT2Graph();
  const twoGates = {
    ...graph,
    edges: [...graph.edges, { from: "n3", to: "n1", kind: "approval" as const, notes: "Edit pass approval gate." }],
  };
  const wrapping = runSimulation(
    { ...documentaryCinematicScenario, approvals: [{ gate: "final-delivery", response: "approve" }] },
    twoGates,
  );
  assert.equal(wrapping.telemetry.approvalCount, 2);
  assert.deepEqual(wrapping.decisionTrail.map((entry) => entry.decision.kind), ["approve", "approve"]);
  const empty = runSimulation({ ...documentaryCinematicScenario, approvals: [] }, twoGates);
  assert.deepEqual(empty.decisionTrail.map((entry) => entry.decision.kind), ["approve", "approve"]);
  assert.equal(empty.decisionTrail[1]?.gate, "Edit pass approval gate.");
});

test("port: a malformed scripted redirect fails loudly (never a fabricated decision)", async () => {
  const graph = await certifiedT2Graph();
  const scenario = {
    ...documentaryCinematicScenario,
    approvals: [{ gate: "x", response: "redirect" as const }],
  };
  assert.throws(() => runSimulation(scenario, graph), /carries no redirect payload/);
});
