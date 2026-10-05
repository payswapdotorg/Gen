/**
 * Redirect semantics tests (escalation contract §3, work order W6 task D):
 * humans may redirect with {policyPatch}, {modelSwap: bodyId, modelId}
 * (validated against the body's model requirement class — invalid swaps are
 * recorded with reasons, never applied) and {inputSupply: artifactRef}. Every
 * applied redirect is recorded with before/after diffs in the trail.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createInteractiveDecisionPort, runSimulation } from "../src/index.js";
import type { HumanDecision } from "../src/index.js";
import { certifiedT2Graph } from "./helpers/graphs.js";
import { documentaryCinematicScenario } from "../src/domain/scenarios/index.js";
import { FROZEN_MODEL_CATALOG } from "../src/domain/scenarios/frozen-catalog.js";

const NO_EFFECT_HASH = "442e7bf3";

async function redirectRun(decision: HumanDecision): Promise<ReturnType<typeof runSimulation>> {
  const graph = await certifiedT2Graph();
  return runSimulation(documentaryCinematicScenario, graph, {
    decisionPort: createInteractiveDecisionPort(documentaryCinematicScenario, () => decision),
  });
}

test("redirect: a valid model swap rebinds the body and changes the run honestly", async () => {
  const run = await redirectRun({
    kind: "redirect",
    redirect: { modelSwap: { bodyId: "body.critic", modelId: "glm-5.3" } },
  });
  const record = run.decisionTrail[0];
  if (!record?.redirect) throw new Error("unreachable");
  assert.equal(record.redirect.applied, true);
  assert.deepEqual(record.redirect.modelBindingDiff, [
    {
      nodeId: "n6",
      bodyId: "body.critic",
      before: { providerId: "zai", modelId: "glm-5.3-voice" },
      after: { providerId: "zai", modelId: "glm-5.3" },
    },
  ]);
  assert.deepEqual(record.redirect.rejectedBecause, []);
  assert.equal(
    run.events.find((event) => event.type === "node-acted" && event.node === "n6")?.detail,
    "n6 (body.critic) acted (model zai/glm-5.3).",
  );
  assert.equal(run.telemetry.totalSpendUsd, 6.78, "flagship decision cost flows into telemetry");
  assert.equal(run.telemetry.byNode.n6?.spendUsd, 1.2);
  assert.equal(run.replayHash, "3a82b986", "the behavior change is hashed — the run genuinely differs");
  assert.equal(run.finished, true);
  assert.equal(run.criteriaResults.every((criterion) => criterion.met), true);
});

test("redirect: model swaps below the body's requirement class are recorded, not applied", async () => {
  const run = await redirectRun({
    kind: "redirect",
    redirect: { modelSwap: { bodyId: "body.director", modelId: "glm-5.3-air" } },
  });
  const redirect = run.decisionTrail[0]?.redirect;
  if (!redirect) throw new Error("unreachable");
  assert.equal(redirect.applied, false);
  assert.deepEqual(redirect.modelBindingDiff, []);
  assert.deepEqual(redirect.rejectedBecause, [
    "model zai/glm-5.3-air quality class standard below body requirement flagship",
  ]);
  assert.equal(run.replayHash, NO_EFFECT_HASH, "no behavioral change → the hashed stream only records the redirect");
  assert.equal(
    run.events.find((event) => event.type === "node-acted" && event.node === "n2")?.detail,
    "n2 (body.director) acted (model zai/glm-5.3).",
    "the original binding stands",
  );
});

test("redirect: unknown bodies, unresolvable and ambiguous models are rejected with reasons", async () => {
  const unknownBody = await redirectRun({
    kind: "redirect",
    redirect: { modelSwap: { bodyId: "body.nonexistent", modelId: "glm-5.3" } },
  });
  assert.deepEqual(unknownBody.decisionTrail[0]?.redirect?.rejectedBecause, [
    "body body.nonexistent not found in the body registry",
    "no node inhabited by body body.nonexistent in organization org.documentary-cinematic-remaster-cand-04",
  ]);
  const unknownModel = await redirectRun({
    kind: "redirect",
    redirect: { modelSwap: { bodyId: "body.critic", modelId: "not-a-model" } },
  });
  assert.deepEqual(unknownModel.decisionTrail[0]?.redirect?.rejectedBecause, [
    "model not-a-model does not resolve in the model catalog",
  ]);
  // An ambiguous model id (two providers) must not be silently resolved.
  const graph = await certifiedT2Graph();
  const ambiguous = runSimulation(
    {
      ...documentaryCinematicScenario,
      modelCatalog: [
        ...FROZEN_MODEL_CATALOG,
        { providerId: "other", modelId: "glm-5.3", modalities: ["text-in", "text-out"], qualityClass: "flagship" },
      ],
    },
    graph,
    {
      decisionPort: createInteractiveDecisionPort(documentaryCinematicScenario, () => ({
        kind: "redirect",
        redirect: { modelSwap: { bodyId: "body.critic", modelId: "glm-5.3" } },
      })),
    },
  );
  assert.match(
    String(ambiguous.decisionTrail[0]?.redirect?.rejectedBecause[0]),
    /model id glm-5\.3 is ambiguous across providers/,
  );
  // A body with no node in this organization cannot be swapped here.
  const uninhabited = await redirectRun({
    kind: "redirect",
    redirect: { modelSwap: { bodyId: "body.video-continuity-supervisor", modelId: "glm-5.3" } },
  });
  assert.deepEqual(uninhabited.decisionTrail[0]?.redirect?.rejectedBecause, [
    "no node inhabited by body body.video-continuity-supervisor in organization org.documentary-cinematic-remaster-cand-04",
  ]);
});

test("redirect: a swap to the already-bound model is an honest no-op", async () => {
  const run = await redirectRun({
    kind: "redirect",
    redirect: { modelSwap: { bodyId: "body.critic", modelId: "glm-5.3-voice" } },
  });
  const redirect = run.decisionTrail[0]?.redirect;
  if (!redirect) throw new Error("unreachable");
  assert.equal(redirect.applied, false);
  assert.deepEqual(redirect.modelBindingDiff, []);
  assert.deepEqual(redirect.rejectedBecause, []);
  assert.equal(run.replayHash, NO_EFFECT_HASH);
});

test("redirect: a run-wide policy patch is applied with a per-node before/after diff", async () => {
  const run = await redirectRun({
    kind: "redirect",
    redirect: { policyPatch: { "*": "premium-first" } },
  });
  const redirect = run.decisionTrail[0]?.redirect;
  if (!redirect) throw new Error("unreachable");
  assert.equal(redirect.applied, true);
  assert.deepEqual(redirect.policyDiff, [{ nodeId: "n7", before: "cheapest-reliable", after: "premium-first" }]);
  assert.deepEqual(redirect.rejectedBecause, []);
  assert.equal(run.replayHash, NO_EFFECT_HASH, "policy state is carried on the run — frozen mocks stay frozen");
});

test("redirect: a scoped policy patch targets one capability-invocation node", async () => {
  const run = await redirectRun({
    kind: "redirect",
    redirect: { policyPatch: { n7: "quality-first" } },
  });
  assert.deepEqual(run.decisionTrail[0]?.redirect?.policyDiff, [
    { nodeId: "n7", before: "cheapest-reliable", after: "quality-first" },
  ]);
});

test("redirect: invalid policy patches are rejected with reasons", async () => {
  const badValue = await redirectRun({
    kind: "redirect",
    redirect: { policyPatch: { "*": "fastest" } },
  });
  assert.equal(badValue.decisionTrail[0]?.redirect?.applied, false);
  assert.match(String(badValue.decisionTrail[0]?.redirect?.rejectedBecause[0]), /unsupported routing policy "fastest"/);
  const badTarget = await redirectRun({
    kind: "redirect",
    redirect: { policyPatch: { n99: "premium-first" } },
  });
  assert.match(String(badTarget.decisionTrail[0]?.redirect?.rejectedBecause[0]), /neither "\*" nor a capability-invocation node/);
  const empty = await redirectRun({ kind: "redirect", redirect: { policyPatch: {} } });
  assert.deepEqual(empty.decisionTrail[0]?.redirect?.rejectedBecause, ["policyPatch carries no entries"]);
});

test("redirect: input supply is recorded; duplicates against the run's inputs are rejected", async () => {
  const supplied = await redirectRun({
    kind: "redirect",
    redirect: { inputSupply: { artifactRef: "artifacts/art.frontal-ref.json" } },
  });
  const redirect = supplied.decisionTrail[0]?.redirect;
  if (!redirect) throw new Error("unreachable");
  assert.equal(redirect.applied, true);
  assert.deepEqual(redirect.suppliedInputs, ["artifacts/art.frontal-ref.json"]);
  assert.deepEqual(redirect.rejectedBecause, []);
  assert.equal(supplied.replayHash, NO_EFFECT_HASH);
  const duplicate = await redirectRun({
    kind: "redirect",
    redirect: { inputSupply: { artifactRef: "artifacts/art.src-interview-a.json" } },
  });
  assert.deepEqual(duplicate.decisionTrail[0]?.redirect?.rejectedBecause, [
    "input artifacts/art.src-interview-a.json is already available to the run",
  ]);
  const blank = await redirectRun({ kind: "redirect", redirect: { inputSupply: { artifactRef: "" } } });
  assert.deepEqual(blank.decisionTrail[0]?.redirect?.rejectedBecause, [
    "inputSupply artifactRef must be a non-empty string",
  ]);
});

test("redirect: no-effect redirects share one hash while their trails differ (trail is outside the hash)", async () => {
  const rejected = await redirectRun({
    kind: "redirect",
    redirect: { modelSwap: { bodyId: "body.director", modelId: "glm-5.3-air" } },
  });
  const policy = await redirectRun({
    kind: "redirect",
    redirect: { policyPatch: { "*": "premium-first" } },
  });
  const input = await redirectRun({
    kind: "redirect",
    redirect: { inputSupply: { artifactRef: "artifacts/art.frontal-ref.json" } },
  });
  assert.equal(rejected.replayHash, NO_EFFECT_HASH);
  assert.equal(policy.replayHash, NO_EFFECT_HASH);
  assert.equal(input.replayHash, NO_EFFECT_HASH);
  assert.deepEqual(rejected.events, policy.events);
  assert.deepEqual(policy.events, input.events);
  assert.notDeepEqual(rejected.decisionTrail, policy.decisionTrail);
  assert.notDeepEqual(policy.decisionTrail, input.decisionTrail);
});

test("redirect: applied mid-run — a later gate sees the swapped model in its bundle", async () => {
  const graph = await certifiedT2Graph();
  const twoGates = {
    ...graph,
    edges: [...graph.edges, { from: "n6", to: "n1", kind: "approval" as const, notes: "Delivery check gate." }],
  };
  let calls = 0;
  const run = runSimulation(documentaryCinematicScenario, twoGates, {
    decisionPort: createInteractiveDecisionPort(documentaryCinematicScenario, () => {
      calls += 1;
      return calls === 1
        ? { kind: "redirect", redirect: { modelSwap: { bodyId: "body.critic", modelId: "glm-5.3" } } }
        : { kind: "approve" };
    }),
  });
  assert.equal(run.decisionTrail.length, 2);
  assert.equal(run.decisionTrail[0]?.decision.kind, "redirect");
  assert.equal(run.decisionTrail[1]?.decision.kind, "approve");
  const secondBundle = run.decisionBundles[1]?.bundle;
  if (!secondBundle) throw new Error("unreachable");
  assert.equal(secondBundle.gate.id, "Delivery check gate.");
  const criticSwap = secondBundle.alternatives.find((a) => a.id === "alt-swap-body.critic-glm-5.3-voice");
  assert.ok(criticSwap, "after the swap the reverse option is offered");
  if (criticSwap.kind === "model-swap") {
    assert.deepEqual(criticSwap.current, { providerId: "zai", modelId: "glm-5.3" });
  }
  assert.equal(
    secondBundle.costImpact.spendUsd,
    5.98,
    "the gate fires in stage-review, after the director, editor, specialists and the swapped critic acted",
  );
});
