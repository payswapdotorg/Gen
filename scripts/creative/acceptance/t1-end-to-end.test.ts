/**
 * T1 end-to-end (lock §9, work order §B.3): the user chain for
 * "Replace this actor with my character." —
 *
 *   routing decision (premium-first vs cheapest-reliable over the composed
 *   registry + provider plane) → the workspace alternatives view.
 *
 * The view-model's alternatives for the character-replacement plan must
 * carry REAL deltas from the provider evaluation facts (premium vs
 * open-model), and the switching surface data must be present BEFORE any
 * switch happens (spec/task-plan.md §3). Domain-layer coverage lives in
 * t1-provider-neutral-routing.test.ts; this file extends the chain through
 * the Phase 2 workspace surface.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { routeCapability } from "../../../packages/media-capabilities/src/domain/router.js";
import { composeRegistry } from "./lib/compose-registry.js";
import { composePlane, factsForCapability } from "./lib/plane.js";
import {
  costText,
  evaluationRowFor,
  evaluationSourcePath,
  mountWorkspace,
  qualityText,
  reliabilityText,
  type ComposedPlane,
} from "./lib/e2e-lib.js";

const CAPABILITY = "video.character-replacement";
const EVALUATION_ID = "eval.video.character-replacement.identity-basic.v1";

interface RoutingOutcome {
  readonly providerId: string;
  readonly modelId: string | undefined;
  readonly estimatedCost: number | undefined;
  readonly estimatedLatencyClass: string | undefined;
}

async function routeUnder(policy: "premium-first" | "cheapest-reliable"): Promise<RoutingOutcome> {
  const composed = await composeRegistry();
  const plane = await composePlane();
  const decision = routeCapability(
    { capabilityId: CAPABILITY, parameters: {}, inputArtifactIds: [], policy },
    composed.view,
    factsForCapability(CAPABILITY, composed.view, plane),
  );
  assert.ok(decision.ok, `${policy} routing failed: ${JSON.stringify(decision)}`);
  return {
    providerId: decision.mapping.providerId,
    modelId: decision.mapping.modelId,
    estimatedCost: decision.estimatedCost,
    estimatedLatencyClass: decision.estimatedLatencyClass,
  };
}

test("T1 e2e: routing decisions feed the alternatives view's REAL deltas from provider evaluation facts", async () => {
  const premium = await routeUnder("premium-first");
  const cheap = await routeUnder("cheapest-reliable");
  const plane = await composePlane();

  // The same committed evaluation record backs BOTH routing facts and the
  // workspace delta table (one source of truth, no hand-written numbers).
  const premiumRow = evaluationRowFor(plane, CAPABILITY, premium.providerId, premium.modelId);
  const openRow = evaluationRowFor(plane, CAPABILITY, cheap.providerId, cheap.modelId);

  // Router facts trace to the committed record rows (P1: policy over facts).
  assert.equal(premium.estimatedCost, premiumRow.cost.estimate, "premium cost = evaluation row");
  assert.equal(premium.estimatedLatencyClass, premiumRow.latency.class, "premium latency = evaluation row");
  assert.equal(cheap.estimatedCost, openRow.cost.estimate, "open-model cost = evaluation row");
  assert.equal(cheap.estimatedLatencyClass, openRow.latency.class, "open-model latency = evaluation row");

  // The reliability bar: vace (0.58) never qualifies under cheapest-reliable,
  // and the committed plan surface offers exactly the two viable paths.
  const vaceFacts = factsForCapability(
    CAPABILITY,
    (await composeRegistry()).view,
    plane,
  ).candidates.find((candidate) => candidate.providerId === "vace");
  assert.ok(vaceFacts, "vace candidate row exists in the plane");
  assert.ok((vaceFacts.reliability ?? 0) < 0.7, "vace sits below the reliability bar");

  // …and the user-facing surface: the mounted replace-actor plan (scenario C).
  const mount = await mountWorkspace("replace-actor-alternatives");
  assert.equal(mount.planView.plan.planId, "plan.replace-actor-0001", "the committed replace-actor plan");
  assert.equal(mount.planView.alternative.length, 2, "exactly two alternative paths (no fabricated third)");

  const active = mount.planView.alternative.find((alternative) => alternative.active);
  const open = mount.planView.alternative.find((alternative) => !alternative.active);
  assert.ok(active && open, "one active + one candidate path");

  // The ACTIVE path is the premium-first decision's provider/model…
  assert.match(active.path, new RegExp(`${premium.providerId}/${premium.modelId}`));
  // …and its baseline rows show the premium evaluation facts verbatim.
  assert.equal(active.deltas.length, 4, "all four delta dimensions on the active path");
  const activeCost = active.deltas.find((delta) => delta.dimension === "cost");
  const activeQuality = active.deltas.find((delta) => delta.dimension === "quality");
  const activeReliability = active.deltas.find((delta) => delta.dimension === "reliability");
  const activeLatency = active.deltas.find((delta) => delta.dimension === "latency");
  assert.ok(activeCost && activeQuality && activeReliability && activeLatency);
  assert.equal(activeCost.current, costText(premiumRow));
  assert.equal(activeCost.candidate, costText(premiumRow), "active path = current path baseline");
  assert.equal(activeCost.delta, "current path baseline");
  assert.equal(activeQuality.current, qualityText(premiumRow));
  assert.equal(activeReliability.current, reliabilityText(premiumRow));
  assert.equal(activeLatency.current, premiumRow.latency.class);

  // The candidate path is the cheapest-reliable decision's open model…
  assert.match(open.path, new RegExp(`${cheap.providerId}/${cheap.modelId}`));
  // …and its delta rows carry the SAME evaluation facts on both sides.
  assert.equal(open.deltas.length, 4);
  const openCost = open.deltas.find((delta) => delta.dimension === "cost");
  const openQuality = open.deltas.find((delta) => delta.dimension === "quality");
  const openReliability = open.deltas.find((delta) => delta.dimension === "reliability");
  const openLatency = open.deltas.find((delta) => delta.dimension === "latency");
  assert.ok(openCost && openQuality && openReliability && openLatency);
  assert.equal(openCost.current, costText(premiumRow), "current side = the premium facts");
  assert.equal(openCost.candidate, costText(openRow), "candidate side = the open-model facts");
  assert.equal(openQuality.current, qualityText(premiumRow));
  assert.equal(openQuality.candidate, qualityText(openRow));
  assert.equal(openReliability.current, reliabilityText(premiumRow));
  assert.equal(openReliability.candidate, reliabilityText(openRow));
  assert.equal(openLatency.current, premiumRow.latency.class);
  assert.equal(openLatency.candidate, openRow.latency.class);
});

test("T1 e2e: the switching surface data is present BEFORE switching (spec/task-plan.md §3)", async () => {
  const mount = await mountWorkspace("replace-actor-alternatives");
  const plane: ComposedPlane = await composePlane();
  const premiumRow = evaluationRowFor(plane, CAPABILITY, "higgsfield", "genjutsu");
  const openRow = evaluationRowFor(plane, CAPABILITY, "wan-2.2", "animate");

  for (const alternative of mount.planView.alternative) {
    // Every path carries its schema-declared tradeoffs AND measured deltas.
    assert.ok(alternative.tradeoffs.length > 0, "declared tradeoffs travel with the path");
    assert.equal(alternative.deltas.length, 4, "the full delta table attaches by exact path");
    const dimensions = new Set(alternative.deltas.map((delta) => delta.dimension));
    assert.deepEqual(
      [...dimensions].sort(),
      ["cost", "latency", "quality", "reliability"],
      "cost/latency/quality/reliability are the switching dimensions",
    );
    for (const delta of alternative.deltas) {
      // Before switching, the user sees: current value, candidate value, the
      // delta between them, and the committed record the numbers come from.
      assert.ok(delta.current.length > 0, "measured current value present");
      assert.ok(delta.candidate.length > 0, "measured candidate value present");
      assert.ok(delta.delta.length > 0, "the delta itself present");
      assert.equal(
        delta.source,
        evaluationSourcePath(EVALUATION_ID),
        `delta provenance cites the committed evaluation record: ${delta.source}`,
      );
    }
  }

  // The non-active (switch target) path shows BOTH sides of the switch with
  // real numbers — the honest-unit rule: per-second-of-output vs
  // compute-minutes is stated, never silently converted.
  const open = mount.planView.alternative.find((alternative) => !alternative.active);
  assert.ok(open, "the open-model switch target exists");
  const openCost = open?.deltas.find((delta) => delta.dimension === "cost");
  assert.ok(openCost);
  assert.equal(openCost?.current, costText(premiumRow));
  assert.equal(openCost?.candidate, costText(openRow));
  assert.equal(openCost?.delta, "different pricing units — see record");
  // …while same-unit dimensions (quality, reliability) carry numeric deltas
  // derived from the same committed rows.
  const openQuality = open?.deltas.find((delta) => delta.dimension === "quality");
  assert.ok(openQuality);
  const expectedQualityDelta = `${
    openRow.normalizedQuality >= premiumRow.normalizedQuality ? "+" : "−"
  }${Math.abs(openRow.normalizedQuality - premiumRow.normalizedQuality).toFixed(1)} normalized quality`;
  assert.equal(openQuality?.delta, expectedQualityDelta);
  const openReliability = open?.deltas.find((delta) => delta.dimension === "reliability");
  assert.ok(openReliability);
  const expectedReliabilityDelta = `${
    openRow.reliability >= premiumRow.reliability ? "+" : "−"
  }${Math.abs(openRow.reliability - premiumRow.reliability).toFixed(2)}`;
  assert.equal(openReliability?.delta, expectedReliabilityDelta);
});
