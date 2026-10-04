/**
 * T1 — provider-neutral capability routing (lock §9).
 *
 * "Replace this actor with my character." must route to Higgsfield OR
 * Wan/VACE per routing policy — the SAME capability descriptor, different
 * policy → different (valid) provider tier. Provider neutrality means the
 * decision is policy-driven over facts, never hard-wired to one vendor.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { routeCapability } from "../../../packages/media-capabilities/src/domain/router.js";
import { composeRegistry } from "./lib/compose-registry.js";
import { composePlane, factsForCapability } from "./lib/plane.js";

test("T1: registry composes media + editor planes with zero errors", async () => {
  const composed = await composeRegistry();
  assert.deepEqual(composed.errors, [], `descriptor errors: ${composed.errors.join("; ")}`);
  const ids = composed.view.capabilities.map((c) => c.id);
  assert.ok(ids.includes("video.character-replacement"), "character-replacement present");
  assert.ok(ids.includes("editor.cut-video"), "editor descriptors registered into the index");
  assert.ok(composed.view.revision > 0);
});

test("T1: premium-first policy routes character replacement to the premium provider", async () => {
  const composed = await composeRegistry();
  const plane = await composePlane();
  assert.deepEqual(plane.errors, [], `plane errors: ${plane.errors.join("; ")}`);
  const decision = routeCapability(
    {
      capabilityId: "video.character-replacement",
      parameters: {},
      inputArtifactIds: [],
      policy: "premium-first",
    },
    composed.view,
    factsForCapability("video.character-replacement", composed.view, plane),
  );
  assert.ok(decision.ok, `premium-first failed: ${JSON.stringify(decision)}`);
  assert.equal(decision.mapping.providerId, "higgsfield");
  assert.ok(decision.decisionTrace.includes("policy=premium-first"));
});

test("T1: cheapest-reliable policy routes the SAME capability to an open model", async () => {
  const composed = await composeRegistry();
  const plane = await composePlane();
  const decision = routeCapability(
    {
      capabilityId: "video.character-replacement",
      parameters: {},
      inputArtifactIds: [],
      policy: "cheapest-reliable",
    },
    composed.view,
    factsForCapability("video.character-replacement", composed.view, plane),
  );
  assert.ok(decision.ok, `cheapest-reliable failed: ${JSON.stringify(decision)}`);
  assert.notEqual(decision.mapping.providerId, "higgsfield");
  assert.ok(
    ["wan-2.2", "vace", "ltx", "hunyuan"].includes(decision.mapping.providerId),
    `open provider expected, got ${decision.mapping.providerId}`,
  );
});

test("T1: provider neutrality — both decisions trace policy, not vendor identity", async () => {
  const composed = await composeRegistry();
  const plane = await composePlane();
  const facts = factsForCapability("video.character-replacement", composed.view, plane);
  const premium = routeCapability(
    { capabilityId: "video.character-replacement", parameters: {}, inputArtifactIds: [], policy: "premium-first" },
    composed.view,
    facts,
  );
  const cheap = routeCapability(
    { capabilityId: "video.character-replacement", parameters: {}, inputArtifactIds: [], policy: "cheapest-reliable" },
    composed.view,
    facts,
  );
  assert.ok(premium.ok && cheap.ok);
  assert.notEqual(premium.mapping.providerId, cheap.mapping.providerId);
  // The decision must be reproducible (pure function, no randomness).
  const premium2 = routeCapability(
    { capabilityId: "video.character-replacement", parameters: {}, inputArtifactIds: [], policy: "premium-first" },
    composed.view,
    facts,
  );
  assert.deepEqual(premium2.mapping, premium.mapping);
});
