/**
 * T3 end-to-end (lock §9, work order §B.5): the user chain for
 * "Use cheapest reliable method." —
 *
 *   cost-aware routing (cheapest-reliable: local tools for editing, open
 *   models for generative) → the workspace's alternative deltas show the
 *   open-model/local-tools path with its cost/latency facts, and the delta
 *   table's provenance traces to committed evaluation records.
 *
 * Domain-layer coverage lives in t3-cost-aware-routing.test.ts; this file
 * extends the chain through the Phase 2 workspace surface.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { routeCapability } from "../../../packages/media-capabilities/src/domain/router.js";
import { documentaryCinematicScenario } from "../../../packages/agent-lab/src/domain/scenarios/index.js";
import type { ModelCatalogEntry } from "../../../packages/agent-lab/src/contract.js";
import { composeRegistry } from "./lib/compose-registry.js";
import { composePlane, factsForCapability } from "./lib/plane.js";
import {
  costText,
  evaluationRowFor,
  evaluationSourcePath,
  mountWorkspace,
  qualityText,
  reliabilityText,
} from "./lib/e2e-lib.js";

const GENERATIVE = "video.character-replacement";
const EDITOR_CAPABILITIES = ["editor.cut-video", "editor.render-project"] as const;
const LOCAL_TOOLS = ["ffmpeg", "mlt", "kdenlive", "losslesscut", "blender", "natron"];
const CATALOG_SOURCE = "agent-lab/src/domain/scenarios/frozen-catalog.ts (committed)";

/** The committed frozen-catalog entry behind a delta row (no hand-written numbers). */
function catalogEntry(predicate: (entry: ModelCatalogEntry) => boolean, label: string): ModelCatalogEntry {
  const entry = documentaryCinematicScenario.modelCatalog.find(predicate);
  if (entry === undefined) throw new Error(`frozen catalog lacks the ${label} entry`);
  return entry;
}

test("T3 e2e: cheapest-reliable routes editing LOCAL and generative open, facts traced to committed evaluation records", async () => {
  const composed = await composeRegistry();
  const plane = await composePlane();

  // Editing capabilities → the LOCAL tier (software tools over remote models).
  for (const capabilityId of EDITOR_CAPABILITIES) {
    const decision = routeCapability(
      { capabilityId, parameters: {}, inputArtifactIds: [], policy: "cheapest-reliable" },
      composed.view,
      factsForCapability(capabilityId, composed.view, plane),
    );
    assert.ok(decision.ok, `${capabilityId} must route under cheapest-reliable`);
    assert.ok(
      LOCAL_TOOLS.includes(decision.mapping.providerId),
      `${capabilityId} → a local tool, got ${decision.mapping.providerId}`,
    );
  }

  // Generative capability → the open model, with facts from the committed
  // evaluation record (the provenance the router decided on).
  const decision = routeCapability(
    { capabilityId: GENERATIVE, parameters: {}, inputArtifactIds: [], policy: "cheapest-reliable" },
    composed.view,
    factsForCapability(GENERATIVE, composed.view, plane),
  );
  assert.ok(decision.ok);
  assert.equal(decision.mapping.providerId, "wan-2.2", "the open model wins the cost race");
  const openRow = evaluationRowFor(plane, GENERATIVE, decision.mapping.providerId, decision.mapping.modelId);
  assert.equal(decision.estimatedCost, openRow.cost.estimate, "routed cost = the committed evaluation row");
  assert.equal(decision.estimatedLatencyClass, openRow.latency.class, "routed latency = the committed row");
  assert.ok(decision.decisionTrace.includes("reliable=["), "the reliability bar is applied and traced");

  // The router's facts for the chosen open model are the record's row fields.
  const candidate = factsForCapability(GENERATIVE, composed.view, plane).candidates.find(
    (fact) => fact.providerId === decision.mapping.providerId,
  );
  assert.ok(candidate);
  assert.equal(candidate.qualityScore, openRow.normalizedQuality);
  assert.equal(candidate.reliability, openRow.reliability);
});

test("T3 e2e: the workspace's active alternative is the cheapest-reliable open-model/local-tools path", async () => {
  const mount = await mountWorkspace("documentary-cinematic");
  const open = catalogEntry(
    (entry) => entry.providerId === "open-models" && entry.qualityClass === "standard",
    "open-models standard",
  );
  const flagship = catalogEntry((entry) => entry.qualityClass === "flagship", "flagship");

  const active = mount.planView.alternative.find((alternative) => alternative.active);
  const premium = mount.planView.alternative.find((alternative) => !alternative.active);
  assert.ok(active && premium, "the run's two routing paths are surfaced");
  assert.match(active?.path ?? "", /^cheapest-reliable \(open models \+ local tools\)$/);
  assert.match(premium?.path ?? "", /^premium-first \(flagship models/);

  // The active path shows its measured baseline from the committed catalog.
  assert.equal(active?.deltas.length, 4);
  const activeCost = active?.deltas.find((delta) => delta.dimension === "cost");
  const activeLatency = active?.deltas.find((delta) => delta.dimension === "latency");
  assert.ok(activeCost && activeLatency);
  assert.equal(activeCost?.current, `$${open.costPerDecisionUsd?.toFixed(2)} per decision`);
  assert.equal(activeCost?.delta, "current path baseline");
  assert.equal(activeLatency?.current, open.latencyClass);

  // The premium escape path shows the open→flagship facts, derived from the
  // same committed catalog (cost multiple stated, never hand-computed).
  assert.equal(premium?.deltas.length, 4);
  const cost = premium?.deltas.find((delta) => delta.dimension === "cost");
  const latency = premium?.deltas.find((delta) => delta.dimension === "latency");
  const quality = premium?.deltas.find((delta) => delta.dimension === "quality");
  assert.ok(cost && latency && quality);
  assert.equal(cost?.current, `$${open.costPerDecisionUsd?.toFixed(2)} per decision`);
  assert.equal(cost?.candidate, `$${flagship.costPerDecisionUsd?.toFixed(2)} per decision`);
  assert.equal(
    cost?.delta,
    `+$${(flagship.costPerDecisionUsd! - open.costPerDecisionUsd!).toFixed(2)} per decision (${(
      flagship.costPerDecisionUsd! / open.costPerDecisionUsd!
    ).toFixed(1)}x)`,
  );
  assert.equal(latency?.delta, `${flagship.latencyClass} vs ${open.latencyClass}`);
  assert.equal(quality?.delta, `${flagship.qualityClass} vs ${open.qualityClass} class`);

  // Provenance: every row cites the committed frozen catalog record.
  for (const alternative of mount.planView.alternative) {
    for (const delta of alternative.deltas) {
      assert.equal(delta.source, CATALOG_SOURCE, `delta provenance: ${delta.source}`);
    }
  }

  // The cost-aware outcome holds: the certified run stayed inside the envelope.
  assert.ok(mount.run);
  assert.ok(
    (mount.run?.totalSpendUsd ?? 0) <= documentaryCinematicScenario.budgetEnvelopeUsd,
    "the cheapest-reliable run stayed within budget",
  );
  const budget = mount.run?.criteriaResults.find((criterion) => criterion.id === "budget-adhered");
  assert.equal(budget?.met, true, "the run record's budget criterion agrees");
});

test("T3 e2e: the open-model delta table's provenance traces to the committed evaluation record", async () => {
  const mount = await mountWorkspace("replace-actor-alternatives");
  const plane = await composePlane();
  const premiumRow = evaluationRowFor(plane, GENERATIVE, "higgsfield", "genjutsu");
  const openRow = evaluationRowFor(plane, GENERATIVE, "wan-2.2", "animate");

  const open = mount.planView.alternative.find((alternative) => alternative.path.includes("wan-2.2/animate"));
  assert.ok(open, "the open-model switch target carries its delta table");
  assert.equal(open?.deltas.length, 4);

  // Every row's provenance points at the committed media-providers record…
  for (const delta of open?.deltas ?? []) {
    assert.equal(
      delta.source,
      evaluationSourcePath("eval.video.character-replacement.identity-basic.v1"),
      `delta provenance: ${delta.source}`,
    );
  }
  // …and the numbers in the table ARE that record's rows (the same rows the
  // router's facts derive from — one source of truth end to end).
  const cost = open?.deltas.find((delta) => delta.dimension === "cost");
  const quality = open?.deltas.find((delta) => delta.dimension === "quality");
  const latency = open?.deltas.find((delta) => delta.dimension === "latency");
  const reliability = open?.deltas.find((delta) => delta.dimension === "reliability");
  assert.ok(cost && quality && latency && reliability);
  assert.equal(cost?.current, costText(premiumRow));
  assert.equal(cost?.candidate, costText(openRow));
  assert.equal(quality?.current, qualityText(premiumRow));
  assert.equal(quality?.candidate, qualityText(openRow));
  assert.equal(latency?.current, premiumRow.latency.class);
  assert.equal(latency?.candidate, openRow.latency.class);
  assert.equal(reliability?.current, reliabilityText(premiumRow));
  assert.equal(reliability?.candidate, reliabilityText(openRow));

  // The premium path stays the active selection — switching is the user's
  // steering act, and the table exists to inform it (T1 asserts the
  // before-switching surface; here: the active row is the premium baseline).
  const active = mount.planView.alternative.find((alternative) => alternative.active);
  assert.match(active?.path ?? "", /Premium-first/);
  assert.equal(active?.deltas.find((delta) => delta.dimension === "cost")?.delta, "current path baseline");
});
