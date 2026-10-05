/**
 * Decision bundle tests (escalation contract §3, work order W6 task B): at
 * each approval edge the engine must surface the bundle — TaskPlan delta
 * (completed-with-evidence, next, blocked), cost impact (spend so far vs
 * envelope, projected remaining) and the alternatives available at that
 * decision point (routing alternatives + model-swap options within the
 * bodies' requirement classes). Pinned against the committed scenarios.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { runSimulation } from "../src/index.js";
import {
  attemptingT4Graph,
  certifiedT2Graph,
} from "./helpers/graphs.js";
import { documentaryCinematicScenario, forcedFailureScenario } from "../src/domain/scenarios/index.js";

test("bundle: the A gate surfaces gate identity, plan delta, cost impact and alternatives", async () => {
  const run = runSimulation(documentaryCinematicScenario, await certifiedT2Graph());
  assert.equal(run.decisionBundles.length, 1);
  const record = run.decisionBundles[0];
  if (!record) throw new Error("unreachable");
  assert.equal(record.eventSeq, 3, "keyed by the approval-recorded event seq");
  const { bundle } = record;
  assert.deepEqual(bundle.gate, {
    id: "Final delivery approval gate.",
    stageId: "stage-plan",
    approver: { nodeId: "n1", role: "operator" },
  });
  // Plan delta: nothing completed yet (the hosting stage is mid-flight), the
  // in-flight stage leads "next", nothing blocked in the T2 scenario.
  assert.deepEqual(bundle.planDelta.completed, []);
  assert.deepEqual(
    bundle.planDelta.next.map((entry) => entry.action),
    [
      "Run stage stage-plan (n2).",
      "Run stage stage-edit (n3).",
      "Run stage stage-specialists (n4, n5).",
      "Run stage stage-review (n6).",
      "Run stage stage-deliver (n7).",
    ],
  );
  assert.deepEqual(bundle.planDelta.blocked, []);
  // Cost impact: the director's decision spend vs the $24 envelope; the
  // projection covers exactly the not-yet-executed stages.
  assert.deepEqual(bundle.costImpact, { spendUsd: 1.2, envelopeUsd: 24, projectedRemainingUsd: 4.68 });
  assert.equal(
    bundle.costImpact.spendUsd + bundle.costImpact.projectedRemainingUsd,
    run.telemetry.totalSpendUsd,
    "spend so far + projection = the full-run spend for this organization",
  );
  // Alternatives: the scenario's two routing paths + swap options for the
  // bodies that have satisfying candidates (video-editor, critic).
  assert.deepEqual(
    bundle.alternatives.map((alternative) => alternative.id),
    [
      "alt-routing-1",
      "alt-routing-2",
      "alt-swap-body.video-editor-glm-5.3",
      "alt-swap-body.video-editor-glm-5.3-air",
      "alt-swap-body.video-editor-glm-5.3-voice",
      "alt-swap-body.critic-glm-5.3",
    ],
  );
});

test("bundle: swap options respect the bodies' requirement classes (P2)", async () => {
  const run = runSimulation(documentaryCinematicScenario, await certifiedT2Graph());
  const bundle = run.decisionBundles[0]?.bundle;
  if (!bundle) throw new Error("unreachable");
  const swaps = bundle.alternatives.filter((alternative) => alternative.kind === "model-swap");
  // Director (flagship) has no satisfying alternative; color/audio specialists
  // are modality-locked; video-editor and critic keep their catalog options.
  assert.equal(swaps.filter((swap) => swap.bodyId === "body.director").length, 0);
  assert.equal(swaps.filter((swap) => swap.bodyId === "body.color-specialist").length, 0);
  assert.equal(swaps.filter((swap) => swap.bodyId === "body.audio-specialist").length, 0);
  const editorSwap = swaps.find((swap) => swap.id === "alt-swap-body.video-editor-glm-5.3");
  if (editorSwap?.kind !== "model-swap") throw new Error("unreachable");
  assert.deepEqual(editorSwap.current, { providerId: "open-models", modelId: "wan-vace-14b" });
  assert.deepEqual(editorSwap.candidate, { providerId: "zai", modelId: "glm-5.3" });
  assert.match(editorSwap.tradeoffs, /quality flagship/);
  assert.match(editorSwap.tradeoffs, /\$1\.20 per decision/);
});

test("bundle: B (attempting) gate projects over the render-heavy remainder", () => {
  const run = runSimulation(forcedFailureScenario, attemptingT4Graph());
  const bundle = run.decisionBundles[0]?.bundle;
  if (!bundle) throw new Error("unreachable");
  assert.deepEqual(bundle.costImpact, { spendUsd: 1.2, envelopeUsd: 20, projectedRemainingUsd: 5.7 });
  assert.equal(bundle.planDelta.blocked.length, 0, "the gap fires later — the gate itself is clean");
  assert.equal(bundle.alternatives.length, 9, "2 routing + 7 swap options across four bodies");
});

test("bundle: a later-stage gate carries completed evidence and the live gap block", () => {
  const base = attemptingT4Graph();
  const lateGraph = {
    ...base,
    edges: base.edges.map((edge) => (edge.kind === "approval" ? { ...edge, from: "n6" } : edge)),
  };
  const run = runSimulation(forcedFailureScenario, lateGraph);
  assert.equal(run.decisionBundles.length, 1);
  const record = run.decisionBundles[0];
  if (!record) throw new Error("unreachable");
  assert.equal(record.eventSeq, 37, "approval event lands inside stage-deliver");
  assert.equal(record.bundle.gate.stageId, "stage-deliver");
  assert.deepEqual(record.bundle.costImpact, { spendUsd: 6.9, envelopeUsd: 20, projectedRemainingUsd: 0 });
  assert.deepEqual(
    record.bundle.planDelta.completed.map((entry) => entry.item),
    ["Stage stage-plan completed.", "Stage stage-0 completed.", "Stage stage-review completed."],
  );
  assert.deepEqual(
    record.bundle.planDelta.completed.map((entry) => entry.evidence),
    [
      ["agent-lab/runs/run-forced-failure-ef3335#evt-1", "agent-lab/runs/run-forced-failure-ef3335#evt-3"],
      ["agent-lab/runs/run-forced-failure-ef3335#evt-5", "agent-lab/runs/run-forced-failure-ef3335#evt-15"],
      ["agent-lab/runs/run-forced-failure-ef3335#evt-17", "agent-lab/runs/run-forced-failure-ef3335#evt-32"],
    ],
  );
  assert.deepEqual(record.bundle.planDelta.next.map((entry) => entry.action), ["Run stage stage-deliver (n6)."]);
  const blocked = record.bundle.planDelta.blocked[0];
  assert.ok(blocked);
  assert.equal(blocked.kind, "capability");
  assert.equal(blocked.capabilityGapRef, "gaps/gap.forced-failure-video-character-replacement.json");
});

test("bundle: deterministic across replays and never enters the replayHash", async () => {
  const graph = await certifiedT2Graph();
  const first = runSimulation(documentaryCinematicScenario, graph);
  const second = runSimulation(documentaryCinematicScenario, graph);
  assert.deepEqual(first.decisionBundles, second.decisionBundles);
  assert.equal(first.replayHash, "3474f812", "committed hash stands while bundles ride along");
});
