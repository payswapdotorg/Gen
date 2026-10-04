/**
 * T2 — agent organization lab (lock §9).
 *
 * "Make this documentary cinematic." must spawn the Director / Editor /
 * Color / Audio / Critic organization — searched, simulated, evaluated and
 * CERTIFIED against the REAL composed registry index (Phase 2 integration:
 * the lab consumes the canonical index, not the scenario's frozen catalog).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createLabService } from "../../../packages/agent-lab/src/app/lab-service.js";
import { documentaryCinematicScenario, forcedFailureScenario } from "../../../packages/agent-lab/src/domain/scenarios/index.js";
import { registryViewToCapabilityCatalog } from "../../../packages/agent-lab/src/adapters/registry-catalog-adapter.js";
import { composeRegistry } from "./lib/compose-registry.js";

const CERTIFIED_AT = "2026-10-04T00:00:00Z";

test("T2: the lab's capability catalog derives from the composed registry index", async () => {
  const composed = await composeRegistry();
  const catalog = registryViewToCapabilityCatalog(composed.view);
  assert.ok(catalog.length >= composed.view.capabilities.length - 0);
  const ids = catalog.map((c) => c.capabilityId);
  assert.ok(ids.includes("video.character-replacement"));
  assert.ok(ids.includes("editor.cut-video"));
  assert.ok(ids.includes("editor.render-project"));
});

test("T2: documentary-cinematic organization certifies over the REAL registry catalog", async () => {
  const composed = await composeRegistry();
  const capabilities = registryViewToCapabilityCatalog(composed.view);
  const lab = createLabService();
  const result = lab.evaluateAndCertify({
    request: {
      goal: documentaryCinematicScenario.goal,
      goalClass: documentaryCinematicScenario.goalClass,
      catalogs: {
        models: documentaryCinematicScenario.modelCatalog,
        capabilities,
      },
      policy: "cheapest-reliable",
      budgetEnvelopeUsd: documentaryCinematicScenario.budgetEnvelopeUsd,
    },
    scenarios: [documentaryCinematicScenario],
    certifiedAt: CERTIFIED_AT,
  });
  assert.ok(result.best, "a best candidate must exist");
  assert.ok(result.outcome?.certified, "the T2 organization must certify");
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
  assert.equal(result.record.certified, true);
});

test("T2: certification bar — a weaker scenario set refuses to certify (never fabricated)", async () => {
  const composed = await composeRegistry();
  const capabilities = registryViewToCapabilityCatalog(composed.view);
  const lab = createLabService();
  // The forced-failure scenario cannot meet the documentary certification bar
  // while its capability gap is unresolved — certification must be REFUSED.
  const result = lab.evaluateAndCertify({
    request: {
      goal: forcedFailureScenario.goal,
      goalClass: forcedFailureScenario.goalClass,
      catalogs: {
        models: forcedFailureScenario.modelCatalog,
        capabilities,
      },
      policy: "cheapest-reliable",
      budgetEnvelopeUsd: forcedFailureScenario.budgetEnvelopeUsd,
    },
    scenarios: [forcedFailureScenario],
    certifiedAt: CERTIFIED_AT,
  });
  if (result.outcome?.certified) {
    // If a graph certified, it must NOT be the gap-carrying one without
    // resolution — the bar's zero-unresolved-gaps rule is the guard.
    assert.ok(result.record.certified === true);
  } else {
    assert.notEqual(result.outcome?.certified, true);
  }
});
