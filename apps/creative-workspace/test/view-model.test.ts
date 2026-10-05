/**
 * View-model tests (work order task 8 / spec/task-plan.md §3): the projection
 * invariants that make the P4 obligations structural —
 *  - no evidence → no completion mark;
 *  - every completed evidence ref resolves to a link (run events, gate
 *    results, artifacts, or declared refs with provenance);
 *  - capability blocks link the gap report;
 *  - alternative deltas attach by path and are present BEFORE switching;
 *  - delta derivation is honest about unit mismatches.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { CapabilityGapReport } from "@gen/arena-bridge";
import type { TaskPlan } from "../src/contract.js";
import type { WorkspaceRecordBundle } from "../src/domain/records.js";
import { buildWorkspaceMount, resolveEvidenceLink, resolveGapLink } from "../src/domain/projection.js";
import { currentPathDeltas, deltasBetween } from "../src/domain/deltas.js";

const BASE_PLAN: TaskPlan = {
  planId: "plan.test-mount-0001",
  goal: "Replace this actor with my character across the documentary interview sequence.",
  currentStep: "Director body (n2) is routing video.character-replacement for segment 1/4.",
  completed: [
    {
      item: "Stage stage-plan completed.",
      evidence: ["agent-lab/runs/run-test-0001#evt-1", "agent-lab/runs/run-test-0001#evt-3"],
    },
    { item: "Hollow claim without evidence.", evidence: [] },
  ],
  next: [{ action: "Execute replacement on segment 1/4.", ownerNode: "n3" }],
  blocked: [
    {
      reason: "No usable frontal reference frame.",
      kind: "capability",
      capabilityGapRef: "gaps/gap.test-gap-0001.json",
    },
    { reason: "Waiting for operator approval.", kind: "human-approval" },
  ],
  alternative: [
    { path: "cheapest-reliable (open models + local tools)", tradeoffs: "Lower spend." },
    { path: "premium-first (flagship models)", tradeoffs: "Higher spend." },
  ],
  updatedAt: "2026-10-04T03:52:11Z",
  runRecordRef: "agent-lab/runs/run-test-0001",
};

const BASE_RUN = {
  runId: "run-test-0001",
  organizationId: "org.test-0001",
  scenarioId: "test",
  seed: "test-seed",
  virtualClockMs: 1000,
  events: [
    { seq: 1, atMs: 0, type: "stage-started", detail: "Stage stage-plan starting." },
    { seq: 2, atMs: 10, type: "approval-recorded", detail: "Human gate: approve." },
    { seq: 3, atMs: 20, type: "artifact-produced", detail: "artifacts/video.restyle.01.json (quality 86/100)." },
    { seq: 4, atMs: 30, type: "stage-completed", detail: "Stage stage-plan completed." },
  ],
  telemetry: { byNode: {}, totalSpendUsd: 1, approvalCount: 1 },
  artifacts: ["artifacts/video.restyle.01.json"],
  taskPlans: [BASE_PLAN],
  gapSignals: [],
  criteriaResults: [{ id: "goal-class-served", description: "Goal served.", met: true }],
  replayHash: "deadbeef",
  finished: true,
};

const BASE_GAP: CapabilityGapReport = {
  gapId: "gap.test-gap-0001",
  detectedAt: "2026-10-04T00:00:00.000Z",
  requestedCapability: { intent: "test", capabilityId: "video.character-replacement" },
  kind: "mapping-shortfall",
  failureEvidence: { summary: "All mappings rejected.", routerDecisionTrace: "rejected=3" },
  impact: { goalClass: "character-replacement-edit", severity: "medium" },
  arena: { state: "reported" },
};

function baseBundle(overrides: Partial<WorkspaceRecordBundle> = {}): WorkspaceRecordBundle {
  return {
    scenarioId: "replace-actor-alternatives",
    plan: BASE_PLAN,
    planSourcePath: "spec/examples/task-plan.replace-actor.json",
    run: BASE_RUN as WorkspaceRecordBundle["run"],
    runProvenance: ["packages/agent-lab/src/domain/scenarios/documentary-cinematic.ts"],
    gapReports: [BASE_GAP],
    gapSourcePaths: ["packages/arena-bridge/src/domain/gaps/gap.test-gap-0001.json"],
    alternativeDeltas: [
      {
        path: "cheapest-reliable (open models + local tools)",
        deltas: currentPathDeltas(
          { providerId: "open-models", modelId: "wan-vace-14b", costEstimate: 0.1, costUnit: "per decision", qualityClass: "standard", latencyClass: "minutes" },
          "test-catalog",
        ),
      },
      {
        path: "premium-first (flagship models)",
        deltas: deltasBetween(
          { providerId: "open-models", modelId: "wan-vace-14b", costEstimate: 0.1, costUnit: "per decision", qualityClass: "standard", latencyClass: "minutes" },
          { providerId: "zai", modelId: "glm-5.3", costEstimate: 1.2, costUnit: "per decision", qualityClass: "flagship", latencyClass: "seconds" },
          "test-catalog",
        ),
      },
    ],
    activeAlternativeHint: "cheapest-reliable",
    ...overrides,
  };
}

test("view-model: completed items without evidence get NO completion mark", () => {
  const mount = buildWorkspaceMount(baseBundle());
  const [verified, hollow] = mount.planView.completed;
  assert.ok(verified);
  assert.ok(hollow);
  assert.equal(verified.verified, true);
  assert.equal(hollow.verified, false);
  assert.equal(hollow.evidence.length, 0);
});

test("view-model: evidence refs resolve to run events; approvals are gate results", () => {
  const bundle = baseBundle();
  const link1 = resolveEvidenceLink("agent-lab/runs/run-test-0001#evt-1", bundle);
  assert.equal(link1.kind, "run-event");
  assert.equal(link1.detail, "Stage stage-plan starting.");
  assert.ok(link1.sourcePaths.length > 0);
  // evt-2 exists in the run but is not referenced by the plan — refs are verbatim.
  const link3 = resolveEvidenceLink("agent-lab/runs/run-test-0001#evt-3", bundle);
  assert.equal(link3.kind, "run-event");
  const gate = resolveEvidenceLink("agent-lab/runs/run-test-0001#evt-2", bundle);
  assert.equal(gate.kind, "gate-result");
});

test("view-model: unknown event refs and artifact refs resolve honestly", () => {
  const bundle = baseBundle();
  const missing = resolveEvidenceLink("agent-lab/runs/run-test-0001#evt-99", bundle);
  assert.equal(missing.kind, "declared-ref");
  const artifact = resolveEvidenceLink("artifacts/video.restyle.01.json", bundle);
  assert.equal(artifact.kind, "run-artifact");
  assert.ok(artifact.detail !== undefined);
  const declared = resolveEvidenceLink("runs/run-0009/ingest.json", bundle);
  assert.equal(declared.kind, "declared-ref");
  assert.deepEqual(declared.sourcePaths, ["spec/examples/task-plan.replace-actor.json"]);
});

test("view-model: capability blocks link the gap report; other kinds do not", () => {
  const bundle = baseBundle();
  const gapLink = resolveGapLink(
    "gaps/gap.test-gap-0001.json",
    bundle.gapReports,
    bundle.gapSourcePaths,
  );
  assert.ok(gapLink);
  assert.equal(gapLink.gapId, "gap.test-gap-0001");
  assert.equal(gapLink.arenaState, "reported");
  const mount = buildWorkspaceMount(bundle);
  const [capabilityBlock, approvalBlock] = mount.planView.blocked;
  assert.ok(capabilityBlock);
  assert.ok(approvalBlock);
  assert.equal(capabilityBlock.kind, "capability");
  assert.ok(capabilityBlock.gap);
  assert.equal(capabilityBlock.gap?.gapId, "gap.test-gap-0001");
  assert.equal(approvalBlock.gap, undefined);
});

test("view-model: unresolved gap ref keeps the ref visible (never silent)", () => {
  const mount = buildWorkspaceMount(baseBundle({ gapReports: [], gapSourcePaths: [] }));
  const [capabilityBlock] = mount.planView.blocked;
  assert.ok(capabilityBlock);
  assert.equal(capabilityBlock.gap, undefined);
  assert.equal(capabilityBlock.capabilityGapRef, "gaps/gap.test-gap-0001.json");
});

test("view-model: alternative deltas attach by exact path; deltas exist before switching", () => {
  const mount = buildWorkspaceMount(baseBundle());
  const [cheapest, premium] = mount.planView.alternative;
  assert.ok(cheapest);
  assert.ok(premium);
  assert.equal(cheapest.active, true);
  assert.equal(premium.active, false);
  assert.equal(cheapest.deltas.length, 4);
  assert.equal(premium.deltas.length, 4);
  const cost = premium.deltas.find((delta) => delta.dimension === "cost");
  assert.ok(cost);
  assert.equal(cost.delta, "+$1.10 per decision (12.0x)");
  const quality = premium.deltas.find((delta) => delta.dimension === "quality");
  assert.ok(quality);
  assert.equal(quality.delta, "flagship vs standard class");
});

test("view-model: unmatched alternative paths fall back to declared tradeoffs", () => {
  const mount = buildWorkspaceMount(baseBundle({ alternativeDeltas: [] }));
  for (const alternative of mount.planView.alternative) {
    assert.equal(alternative.deltas.length, 0);
  }
});

test("deltas: unit mismatch is stated, never converted", () => {
  const deltas = deltasBetween(
    { providerId: "higgsfield", modelId: "genjutsu", normalizedQuality: 83.7, costEstimate: 3.6, costUnit: "per-second-of-output", latencyClass: "minutes", reliability: 0.97 },
    { providerId: "wan-2.2", modelId: "animate", normalizedQuality: 73.3, costEstimate: 0.24, costUnit: "compute-minutes", latencyClass: "minutes", reliability: 0.82 },
    "provider-eval",
  );
  const cost = deltas.find((delta) => delta.dimension === "cost");
  assert.ok(cost);
  assert.equal(cost.delta, "different pricing units — see record");
  const quality = deltas.find((delta) => delta.dimension === "quality");
  assert.ok(quality);
  assert.equal(quality.delta, "−10.4 normalized quality");
  const latency = deltas.find((delta) => delta.dimension === "latency");
  assert.ok(latency);
  assert.equal(latency.delta, "same class (minutes)");
  const reliability = deltas.find((delta) => delta.dimension === "reliability");
  assert.ok(reliability);
  assert.equal(reliability.delta, "−0.15");
});

test("view-model: run view carries stage snapshots, criteria and telemetry", () => {
  const mount = buildWorkspaceMount(baseBundle());
  assert.ok(mount.run);
  assert.equal(mount.run?.replayHash, "deadbeef");
  assert.equal(mount.run?.events.length, 4);
  assert.equal(mount.run?.planSnapshots.length, 1);
  assert.equal(mount.run?.criteriaResults[0]?.met, true);
});
