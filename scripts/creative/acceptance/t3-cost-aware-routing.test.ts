/**
 * T3 — cost-aware routing (lock §9).
 *
 * "Use cheapest reliable method." must route to open models + LOCAL TOOLS
 * over premium providers: local editor adapters beat remote models for
 * editing capabilities; open models beat premium for generative ones.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { routeCapability } from "../../../packages/media-capabilities/src/domain/router.js";
import { composeRegistry } from "./lib/compose-registry.js";
import { composePlane, factsForCapability } from "./lib/plane.js";

test("T3: cheapest-reliable prefers the LOCAL tier for editing capabilities", async () => {
  const composed = await composeRegistry();
  const plane = await composePlane();
  const decision = routeCapability(
    {
      capabilityId: "editor.cut-video",
      parameters: { clipIndex: 0, start: 1.5, end: 4.0, mode: "reencode" },
      inputArtifactIds: [],
      policy: "cheapest-reliable",
    },
    composed.view,
    factsForCapability("editor.cut-video", composed.view, plane),
  );
  assert.ok(decision.ok, `cut-video routing failed: ${JSON.stringify(decision)}`);
  assert.ok(
    ["ffmpeg", "mlt", "kdenlive", "losslesscut"].includes(decision.mapping.providerId),
    `local editor tool expected, got ${decision.mapping.providerId}`,
  );
  assert.ok(decision.decisionTrace.includes("policy=cheapest-reliable"));
});

test("T3: premium-first still reaches premium for generative video work", async () => {
  const composed = await composeRegistry();
  const plane = await composePlane();
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
  assert.ok(decision.ok);
  assert.equal(decision.mapping.providerId, "higgsfield");
});

test("T3: local-first policy is honored across the editor plane", async () => {
  const composed = await composeRegistry();
  const plane = await composePlane();
  for (const capabilityId of ["editor.render-project", "editor.composite-layer"]) {
    const decision = routeCapability(
      { capabilityId, parameters: {}, inputArtifactIds: [], policy: "local-first" },
      composed.view,
      factsForCapability(capabilityId, composed.view, plane),
    );
    assert.ok(decision.ok, `${capabilityId} must route under local-first`);
    assert.ok(
      ["ffmpeg", "mlt", "kdenlive", "blender", "natron", "losslesscut"].includes(
        decision.mapping.providerId,
      ),
      `${capabilityId} local-first must pick a local tool, got ${decision.mapping.providerId}`,
    );
  }
});

test("T3: cost policy never returns a below-reliability mapping", async () => {
  const composed = await composeRegistry();
  const plane = await composePlane();
  const facts = factsForCapability("video.character-replacement", composed.view, plane);
  // Strip all reliability to below the threshold → routing must FAIL with a
  // trace (feeding a gap report), never return an unreliable cheap pick.
  const degraded = {
    candidates: facts.candidates.map((c) => ({ ...c, reliability: 0.1, available: true })),
  };
  const decision = routeCapability(
    { capabilityId: "video.character-replacement", parameters: {}, inputArtifactIds: [], policy: "cheapest-reliable" },
    composed.view,
    degraded,
  );
  assert.ok(!decision.ok, "degraded reliability must not produce a decision");
  assert.ok(decision.decisionTrace.length > 0, "failures carry a trace for the gap report");
});
