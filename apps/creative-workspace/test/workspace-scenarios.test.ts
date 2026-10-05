/**
 * Workspace scenario tests (work order tasks 10–12, acceptance-facing): the
 * harness mounts A (T2 documentary-cinematic), B (T4 forced-failure with the
 * real gap report) and C (replace-actor alternatives with measured deltas)
 * from the COMMITTED records via the filesystem record source, and the
 * rendered markup satisfies every spec/task-plan.md §3 UI obligation.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createWorkspaceService } from "../src/app/workspace-service.js";
import { createFsRecordSource } from "../src/adapters/fs-record-source.js";
import { WorkspaceRoot, WorkspaceErrorPanel } from "../src/ui/workspace-root.js";
import { WorkspaceView } from "../src/ui/workspace-view.js";
import { PlanSkeleton } from "../src/ui/plan-skeleton.js";
import { DemoHarness, loadDemoMounts } from "../src/harness/demo-harness.js";
import type { WorkspaceMount } from "../src/contract.js";

const service = createWorkspaceService({ recordSource: createFsRecordSource() });

async function mountOf(scenario: "documentary-cinematic" | "forced-failure" | "replace-actor-alternatives"): Promise<WorkspaceMount> {
  return service.mount(scenario);
}

// ---------------------------------------------------------------------------
// Scenario A — T2: documentary-cinematic committed run
// ---------------------------------------------------------------------------

test("scenario A: mounts the committed documentary-cinematic run (replay hash matches)", async () => {
  const mount = await mountOf("documentary-cinematic");
  assert.equal(mount.scenarioId, "documentary-cinematic");
  assert.ok(mount.run);
  assert.equal(mount.run?.replayHash, "3474f812");
  assert.match(mount.run?.runRecordRef ?? "", /^agent-lab\/runs\/run-documentary-cinematic-/);
});

test("scenario A: plan header — goal + current step, always-visible surface", async () => {
  const mount = await mountOf("documentary-cinematic");
  const { plan } = mount.planView;
  assert.equal(plan.goal, documentaryGoal());
  assert.ok(plan.currentStep.length >= 3);
  assert.match(plan.planId, /^plan\.[a-z0-9-]+$/);
  const markup = renderToStaticMarkup(createElement(WorkspaceView, { mount }));
  assert.ok(markup.includes(plan.goal));
  assert.ok(markup.includes(plan.currentStep));
  assert.ok(markup.includes("position:sticky"));
  // Evidence detail boxes are pre-rendered (hidden) so the static page stays
  // interactive without a React runtime.
  assert.ok(markup.includes('data-evidence-detail="agent-lab/runs/'));
});

function documentaryGoal(): string {
  return "Make this documentary cinematic: color, pacing, audio and review organization for the remaster goal.";
}

test("scenario A: every completed item links evidence resolving to run events", async () => {
  const mount = await mountOf("documentary-cinematic");
  assert.ok(mount.planView.completed.length >= 5);
  for (const item of mount.planView.completed) {
    assert.equal(item.verified, true, `item "${item.item}" must be verified`);
    assert.ok(item.evidence.length > 0, "no evidence, no completion mark");
    for (const link of item.evidence) {
      assert.match(link.ref, /^agent-lab\/runs\/run-documentary-cinematic-[^#]+#evt-\d+$/);
      if (link.kind === "run-event" || link.kind === "gate-result") {
        assert.ok(link.detail !== undefined, `evidence ${link.ref} must carry its event detail`);
      }
      assert.ok(link.sourcePaths.length > 0, "evidence must cite committed provenance");
    }
  }
  const gateResults = mount.planView.completed.flatMap((item) => item.evidence).filter((link) => link.kind === "gate-result");
  assert.ok(gateResults.length > 0, "the approval gate must appear as a gate result");
});

test("scenario A: certified organization visible (bodies + models + certification evidence)", async () => {
  const mount = await mountOf("documentary-cinematic");
  const organization = mount.organization;
  assert.ok(organization);
  assert.equal(organization?.certified, true);
  assert.equal(organization?.fitness, 0.8398);
  assert.equal(organization?.id, "org.documentary-cinematic-remaster-cand-04");
  const bodies = organization?.nodes.map((node) => node.bodyId) ?? [];
  for (const expected of [
    "body.director",
    "body.video-editor",
    "body.color-specialist",
    "body.audio-specialist",
    "body.critic",
  ]) {
    assert.ok(bodies.includes(expected), `${expected} must be visible in the organization`);
  }
  const models = organization?.nodes.map((node) => node.model) ?? [];
  assert.ok(models.some((model) => model?.includes("glm-5.3")));
  assert.ok(models.some((model) => model?.includes("wan-vace-14b")));
  assert.ok(
    organization?.certificationEvidence?.replayRef.includes(
      "eval.org.documentary-cinematic-remaster-cand-04.json",
    ),
    "certification must cite the committed evaluation record",
  );
});

test("scenario A: certification evidence surfaces certifiedAt + gapReportsResolved from the committed org record", async () => {
  const mount = await mountOf("documentary-cinematic");
  // Scenario A mounts carry NO organizationEvaluation summary — the committed
  // organization record's evaluation.certificationEvidence is the fallback
  // source (work/worker-8-view-completeness.md: both fields must surface).
  const evidence = mount.organization?.certificationEvidence;
  assert.ok(evidence, "the certification evidence block must be present");
  // Exact committed values from
  // packages/agent-lab/src/domain/organizations/org.documentary-cinematic-remaster-cand-04.json
  assert.equal(evidence?.certifiedAt, "2026-10-04T08:00:00.000Z");
  assert.equal(evidence?.gapReportsResolved, true);
  assert.equal(evidence?.scenarioSetRef, "packages/agent-lab/src/domain/scenarios");
  assert.equal(
    evidence?.replayRef,
    "packages/agent-lab/src/domain/evaluations/eval.org.documentary-cinematic-remaster-cand-04.json",
  );
  // The fields are user-visible too (P4/P6: committed evidence, not chat).
  const markup = renderToStaticMarkup(createElement(WorkspaceView, { mount }));
  assert.ok(markup.includes("certified at: 2026-10-04T08:00:00.000Z"));
  assert.ok(markup.includes("gap reports resolved: true"));
});

test("scenario A: nothing blocked; two alternatives with catalog deltas", async () => {
  const mount = await mountOf("documentary-cinematic");
  assert.equal(mount.planView.blocked.length, 0);
  assert.equal(mount.planView.alternative.length, 2);
  const active = mount.planView.alternative.find((alternative) => alternative.active);
  assert.ok(active);
  assert.match(active?.path ?? "", /cheapest-reliable/);
  assert.equal(active?.deltas.length, 4);
  const premium = mount.planView.alternative.find((alternative) => !alternative.active);
  assert.ok(premium);
  assert.equal(premium?.deltas.length, 4);
  const cost = premium?.deltas.find((delta) => delta.dimension === "cost");
  assert.ok(cost);
  assert.equal(cost?.delta, "+$1.10 per decision (12.0x)");
});

// ---------------------------------------------------------------------------
// Scenario B — T4: forced failure, blocked → real gap report
// ---------------------------------------------------------------------------

test("scenario B: mounts the forced-failure run referenced by the committed gap report", async () => {
  const mount = await mountOf("forced-failure");
  assert.ok(mount.run);
  assert.equal(mount.run?.runId, "run-forced-failure-ef3335");
  assert.equal(mount.run?.organizationId, "org.character-replacement-edit-cand-16");
});

test("scenario B: the blocked item links the REAL committed gap report", async () => {
  const mount = await mountOf("forced-failure");
  assert.equal(mount.planView.blocked.length, 1);
  const blocked = mount.planView.blocked[0];
  assert.ok(blocked);
  assert.equal(blocked?.kind, "capability");
  assert.equal(blocked?.capabilityGapRef, "gaps/gap.forced-failure-video-character-replacement.json");
  const gap = blocked?.gap;
  assert.ok(gap, "a capability block must link its gap report");
  assert.equal(gap?.gapId, "gap.forced-failure-video-character-replacement");
  assert.equal(gap?.arenaState, "available");
  assert.equal(gap?.requestedCapabilityId, "video.character-replacement");
  assert.equal(gap?.proposedCapabilityId, "video.profile-reference-replacement");
  assert.equal(
    gap?.sourcePath,
    "packages/arena-bridge/src/domain/gaps/gap.forced-failure-video-character-replacement.json",
  );
  const full = mount.gapReports.find((report) => report.gapId === gap?.gapId);
  assert.ok(full);
  assert.ok(full?.routerDecisionTrace?.includes("policy=cheapest-reliable"));
  assert.equal(full?.expertSessionRef, "session.t4-arena-review");
  // The gap detail box is pre-rendered (hidden) for the static demo page.
  const markup = renderToStaticMarkup(createElement(WorkspaceView, { mount }));
  assert.ok(markup.includes('data-gap-detail="gap.forced-failure-video-character-replacement"'));
  assert.ok(markup.includes(gap?.sourcePath ?? "MISSING"));
});

test("scenario B: certification honestly refused (never fabricated)", async () => {
  const mount = await mountOf("forced-failure");
  const organization = mount.organization;
  assert.ok(organization);
  assert.equal(organization?.certified, false);
  assert.ok(organization?.certificationNote?.includes("refused"));
  assert.ok(organization?.certificationNote?.includes("eval.org.character-replacement-edit-cand-04.json"));
  assert.ok((organization?.fitness ?? 0) > 0);
});

test("scenario B: the run record is the one the gap report cites (P5 chain intact)", async () => {
  const mount = await mountOf("forced-failure");
  const gap = mount.planView.blocked[0]?.gap;
  assert.ok(gap);
  // The committed gap report's organizationRunRef is agent-lab/runs/run-forced-failure-ef3335.
  assert.equal(mount.run?.runRecordRef, "agent-lab/runs/run-forced-failure-ef3335");
  assert.ok(mount.run?.events.some((event) => event.type === "gap-signaled"));
});

// ---------------------------------------------------------------------------
// Scenario C — replace-actor alternatives with real deltas
// ---------------------------------------------------------------------------

test("scenario C: mounts the committed replace-actor plan with two alternatives", async () => {
  const mount = await mountOf("replace-actor-alternatives");
  assert.equal(mount.planView.plan.planId, "plan.replace-actor-0001");
  assert.ok(mount.planView.alternative.length >= 2, "at least two alternative paths");
  const paths = mount.planView.alternative.map((alternative) => alternative.path);
  assert.ok(paths.some((path) => path.includes("higgsfield/genjutsu")));
  assert.ok(paths.some((path) => path.includes("wan-2.2/animate")));
});

test("scenario C: real deltas from the provider evaluation record, shown BEFORE switching", async () => {
  const mount = await mountOf("replace-actor-alternatives");
  const open = mount.planView.alternative.find((alternative) => alternative.path.includes("wan-2.2/animate"));
  assert.ok(open);
  assert.equal(open?.deltas.length, 4);
  const cost = open?.deltas.find((delta) => delta.dimension === "cost");
  assert.ok(cost);
  assert.equal(cost?.current, "$3.60 per-second-of-output");
  assert.equal(cost?.candidate, "$0.24 compute-minutes");
  assert.equal(cost?.delta, "different pricing units — see record");
  assert.ok(cost?.source.includes("eval.video.character-replacement.identity-basic.v1.json"));
  const quality = open?.deltas.find((delta) => delta.dimension === "quality");
  assert.ok(quality);
  assert.equal(quality?.current, "83.7/100");
  assert.equal(quality?.candidate, "73.3/100");
  const reliability = open?.deltas.find((delta) => delta.dimension === "reliability");
  assert.ok(reliability);
  assert.equal(reliability?.current, "0.97");
  assert.equal(reliability?.candidate, "0.82");
  // Deltas render before any switch happens: markup contains them with the
  // switch control still in its default state.
  const markup = renderToStaticMarkup(createElement(WorkspaceView, { mount }));
  assert.ok(markup.includes("$3.60 per-second-of-output"));
  assert.ok(markup.includes("$0.24 compute-minutes"));
  assert.ok(markup.includes("73.3/100"));
  assert.ok(markup.includes('data-switched="false"'));
});

test("scenario C: the premium path is the active selection (baseline rows)", async () => {
  const mount = await mountOf("replace-actor-alternatives");
  const premium = mount.planView.alternative.find((alternative) => alternative.active);
  assert.ok(premium);
  assert.match(premium?.path ?? "", /Premium-first/);
  assert.equal(premium?.deltas.length, 4);
  const cost = premium?.deltas.find((delta) => delta.dimension === "cost");
  assert.equal(cost?.delta, "current path baseline");
});

test("scenario C: blocked item links the committed spec example gap report", async () => {
  const mount = await mountOf("replace-actor-alternatives");
  const blocked = mount.planView.blocked[0];
  assert.ok(blocked);
  assert.equal(blocked?.kind, "capability");
  assert.equal(blocked?.capabilityGapRef, "gaps/gap.ref-frame-segment-3.json");
  assert.equal(blocked?.gap?.gapId, "gap.ref-frame-segment-3");
  assert.equal(blocked?.gap?.arenaState, "detected");
});

// ---------------------------------------------------------------------------
// Loading state (obligation 7) + demo harness page
// ---------------------------------------------------------------------------

test("loading state: the plan skeleton renders — never a bare spinner", () => {
  const markup = renderToStaticMarkup(
    createElement(WorkspaceRoot, {
      scenarioId: "documentary-cinematic",
      loadMount: () => new Promise<WorkspaceMount>(() => undefined),
    }),
  );
  assert.ok(markup.includes("plan loading"));
  assert.ok(markup.includes("TaskPlan skeleton"));
  assert.ok(markup.includes('aria-busy="true"'));
  assert.ok(markup.includes("Completed — with evidence"));
  assert.ok(markup.includes("Blocked — with gap links"));
  assert.ok(markup.includes("Alternatives — with deltas"));
  assert.ok(markup.includes("no bare spinner"));
});

test("loading state: PlanSkeleton is directly renderable for shells", () => {
  const markup = renderToStaticMarkup(
    createElement(PlanSkeleton, {
      state: { phase: "loading", scenarioId: "forced-failure", note: "loading committed records…" },
    }),
  );
  assert.ok(markup.includes("forced-failure"));
  assert.ok(markup.includes("no bare spinner"));
});

test("error state: a failed load surfaces an actionable message", () => {
  const markup = renderToStaticMarkup(
    createElement(WorkspaceErrorPanel, {
      scenarioId: "forced-failure",
      message: "record source unreachable",
    }),
  );
  assert.ok(markup.includes("load failed"));
  assert.ok(markup.includes("record source unreachable"));
  assert.ok(markup.includes('role="alert"'));
});

test("demo harness: all three scenarios mount and render from committed records", async () => {
  const mounts = await loadDemoMounts();
  assert.equal(mounts.length, 3);
  const markup = renderToStaticMarkup(createElement(DemoHarness, { mounts }));
  for (const planId of ["plan.documentary-cinematic-", "plan.forced-failure-", "plan.replace-actor-0001"]) {
    assert.ok(markup.includes(planId), `${planId} must render in the harness page`);
  }
  assert.ok(markup.includes("gap.forced-failure-video-character-replacement"));
  assert.ok(markup.includes("certified"));
  assert.ok(markup.includes("certification refused"));
  assert.ok(markup.includes("Loading state — plan skeleton"));
  assert.ok(markup.includes("packages/agent-lab/src/domain/organizations/"));
});

test("workspace mount: provenance cites every committed record used", async () => {
  const mountA = await mountOf("documentary-cinematic");
  const joined = mountA.provenance.join("\n");
  assert.ok(joined.includes("org.documentary-cinematic-remaster-cand-04.json"));
  assert.ok(joined.includes("eval.org.documentary-cinematic-remaster-cand-04.json"));
  assert.ok(joined.includes("documentary-cinematic.ts"));
  const mountB = await mountOf("forced-failure");
  const joinedB = mountB.provenance.join("\n");
  assert.ok(joinedB.includes("eval.org.character-replacement-edit-cand-04.json"));
  assert.ok(joinedB.includes("gap.forced-failure-video-character-replacement.json"));
  const mountC = await mountOf("replace-actor-alternatives");
  assert.ok(mountC.provenance.includes("spec/examples/task-plan.replace-actor.json"));
});
