/**
 * Decision trail tests (escalation contract §3, work order W6 task E): run
 * records carry a structured HumanDecisionRecord[] (who: node id + role;
 * when: clockMs + event seq; what: decision + payload; from which
 * alternatives) as a run-record extension SEPARATE from the hashed core —
 * keyed by the approval-recorded event seq, with the existing approval
 * events untouched. decisionTrailOf(runRecord) exports the pure workspace
 * view.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createInteractiveDecisionPort, decisionTrailOf, runSimulation } from "../src/index.js";
import { certifiedT2Graph } from "./helpers/graphs.js";
import { documentaryCinematicScenario } from "../src/domain/scenarios/index.js";

test("trail: the A run carries one record keyed by the approval event seq", async () => {
  const run = runSimulation(documentaryCinematicScenario, await certifiedT2Graph());
  assert.equal(run.decisionTrail.length, 1);
  const record = run.decisionTrail[0];
  if (!record) throw new Error("unreachable");
  assert.equal(record.gate, "Final delivery approval gate.");
  assert.deepEqual(record.who, { nodeId: "n1", role: "operator" });
  assert.deepEqual(record.when, { clockMs: 2000, eventSeq: 3 });
  assert.deepEqual(record.decision, { kind: "approve" });
  assert.deepEqual(record.fromAlternatives, [
    "alt-routing-1",
    "alt-routing-2",
    "alt-swap-body.video-editor-glm-5.3",
    "alt-swap-body.video-editor-glm-5.3-air",
    "alt-swap-body.video-editor-glm-5.3-voice",
    "alt-swap-body.critic-glm-5.3",
  ]);
  // The existing approval-recorded event is untouched and the trail keys to it.
  const approval = run.events.find((event) => event.type === "approval-recorded");
  assert.ok(approval);
  assert.equal(approval.seq, record.when.eventSeq);
  assert.equal(approval.detail, 'Human n1 (human operator) gate "Final delivery approval gate.": approve.');
});

test("trail: decisionTrailOf renders the committed A run (approve entry)", async () => {
  const run = runSimulation(documentaryCinematicScenario, await certifiedT2Graph());
  const view = decisionTrailOf(run);
  assert.deepEqual(view, {
    runId: "run-documentary-cinematic-b5b6cd",
    scenarioId: "documentary-cinematic",
    entries: [
      {
        eventSeq: 3,
        gate: "Final delivery approval gate.",
        actor: "n1 (human operator)",
        atMs: 2000,
        decision: "approve",
        summary: "approved",
        alternatives: [
          "alt-routing-1",
          "alt-routing-2",
          "alt-swap-body.video-editor-glm-5.3",
          "alt-swap-body.video-editor-glm-5.3-air",
          "alt-swap-body.video-editor-glm-5.3-voice",
          "alt-swap-body.critic-glm-5.3",
        ],
        applied: true,
        notes: [],
      },
    ],
  });
});

test("trail: view entries carry redirect payloads, diffs and rejection reasons", async () => {
  const graph = await certifiedT2Graph();
  const swapRun = runSimulation(documentaryCinematicScenario, graph, {
    decisionPort: createInteractiveDecisionPort(documentaryCinematicScenario, () => ({
      kind: "redirect",
      redirect: { modelSwap: { bodyId: "body.critic", modelId: "glm-5.3" } },
    })),
  });
  const swapEntry = decisionTrailOf(swapRun).entries[0];
  if (!swapEntry) throw new Error("unreachable");
  assert.equal(swapEntry.decision, "redirect");
  assert.equal(swapEntry.summary, "redirect — model swap body.critic → glm-5.3");
  assert.equal(swapEntry.applied, true);
  assert.deepEqual(swapEntry.notes, ["model n6 (body.critic): zai/glm-5.3-voice → zai/glm-5.3"]);

  const rejectedRun = runSimulation(documentaryCinematicScenario, graph, {
    decisionPort: createInteractiveDecisionPort(documentaryCinematicScenario, () => ({
      kind: "redirect",
      redirect: { modelSwap: { bodyId: "body.director", modelId: "glm-5.3-air" } },
    })),
  });
  const rejectedEntry = decisionTrailOf(rejectedRun).entries[0];
  if (!rejectedEntry) throw new Error("unreachable");
  assert.equal(rejectedEntry.applied, false);
  assert.deepEqual(rejectedEntry.notes, [
    "rejected: model zai/glm-5.3-air quality class standard below body requirement flagship",
  ]);

  const policyRun = runSimulation(documentaryCinematicScenario, graph, {
    decisionPort: createInteractiveDecisionPort(documentaryCinematicScenario, () => ({
      kind: "redirect",
      redirect: { policyPatch: { "*": "premium-first" } },
    })),
  });
  const policyEntry = decisionTrailOf(policyRun).entries[0];
  if (!policyEntry) throw new Error("unreachable");
  assert.deepEqual(policyEntry.notes, ['policy n7: "cheapest-reliable" → "premium-first"']);

  const rejectRun = runSimulation(documentaryCinematicScenario, graph, {
    decisionPort: createInteractiveDecisionPort(documentaryCinematicScenario, () => ({
      kind: "reject",
      reason: "pacing not cinematic yet",
    })),
  });
  const rejectEntry = decisionTrailOf(rejectRun).entries[0];
  if (!rejectEntry) throw new Error("unreachable");
  assert.equal(rejectEntry.decision, "reject");
  assert.equal(rejectEntry.summary, "rejected — pacing not cinematic yet");
  assert.equal(rejectEntry.applied, true);
});

test("trail: plain run records (no extension) view to an empty trail", async () => {
  const run = runSimulation(documentaryCinematicScenario, await certifiedT2Graph());
  const { decisionBundles: _bundles, decisionTrail: _trail, ...core } = run;
  const view = decisionTrailOf(core);
  assert.deepEqual(view, { runId: "run-documentary-cinematic-b5b6cd", scenarioId: "documentary-cinematic", entries: [] });
});

test("trail: deterministic across replays and excluded from the replayHash input", async () => {
  const graph = await certifiedT2Graph();
  const first = runSimulation(documentaryCinematicScenario, graph);
  const second = runSimulation(documentaryCinematicScenario, graph);
  assert.deepEqual(first.decisionTrail, second.decisionTrail);
  assert.equal(first.replayHash, "3474f812");
  // Stripping the extensions (and the hash itself) and re-hashing must
  // reproduce the committed hash — the hashed core never saw decisionBundles
  // or decisionTrail.
  const { decisionBundles, decisionTrail, replayHash: committed, ...core } = first;
  void decisionBundles;
  void decisionTrail;
  const { replayHash } = await import("../src/index.js");
  assert.equal(
    replayHash(core),
    committed,
    "hashing the extension-stripped record reproduces the committed replayHash",
  );
});
