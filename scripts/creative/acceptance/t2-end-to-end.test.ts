/**
 * T2 end-to-end (lock §9, work order §B.4 + §B.7): the user chain for
 * "Make this documentary cinematic." —
 *
 *   documentary-cinematic organization run (lab certifies over the REAL
 *   composed registry catalog) → the workspace scenario A projection.
 *
 * Asserts the plan header fields, every completed item's evidence links
 * resolving to run events / gate results, the certified organization
 * visible with its fitness and bodies — plus the timeline lineage audit
 * (lineageOf full ancestor chain with producedBy metadata, subtreeOf bundle
 * renderable set) for the run's artifact refs. Domain-layer coverage lives
 * in t2-documentary-organization.test.ts.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { createLabService } from "../../../packages/agent-lab/src/app/lab-service.js";
import { documentaryCinematicScenario } from "../../../packages/agent-lab/src/domain/scenarios/index.js";
import { registryViewToCapabilityCatalog } from "../../../packages/agent-lab/src/adapters/registry-catalog-adapter.js";
import {
  readEvaluationRecordFile,
  readOrganizationGraphFile,
} from "../../../packages/agent-lab/src/adapters/fs-evaluation-store.js";
import { TIMELINE_BUNDLE_MEDIA_TYPE } from "../../../packages/timeline/src/contract.js";
import { artifactRef } from "../../../packages/timeline/src/domain/graph/lineage.js";
import { composeRegistry, repoRoot } from "./lib/compose-registry.js";
import { mountWorkspace, timelineGraph } from "./lib/e2e-lib.js";

const CERTIFIED_AT = "2026-10-04T00:00:00Z";
const ORG_RECORD = "packages/agent-lab/src/domain/organizations/org.documentary-cinematic-remaster-cand-04.json";
const EVAL_RECORD = "packages/agent-lab/src/domain/evaluations/eval.org.documentary-cinematic-remaster-cand-04.json";

/** The committed certification evidence behind the documentary organization. */
async function committedEvaluation() {
  return readEvaluationRecordFile(join(repoRoot(), EVAL_RECORD));
}

test("T2 e2e: the certified organization run projects into the workspace plan (header + run parity)", async () => {
  // The lab certifies over the REAL composed registry catalog (domain chain).
  const composed = await composeRegistry();
  const lab = createLabService();
  const result = lab.evaluateAndCertify({
    request: {
      goal: documentaryCinematicScenario.goal,
      goalClass: documentaryCinematicScenario.goalClass,
      catalogs: {
        models: documentaryCinematicScenario.modelCatalog,
        capabilities: registryViewToCapabilityCatalog(composed.view),
      },
      policy: "cheapest-reliable",
      budgetEnvelopeUsd: documentaryCinematicScenario.budgetEnvelopeUsd,
    },
    scenarios: [documentaryCinematicScenario],
    certifiedAt: CERTIFIED_AT,
  });
  assert.ok(result.outcome?.certified, "the lab certifies the documentary organization");
  assert.equal(result.certifiedGraph?.id, "org.documentary-cinematic-remaster-cand-04");

  // …and the workspace mounts the committed run of that organization.
  const mount = await mountWorkspace("documentary-cinematic");
  const { plan } = mount.planView;
  assert.equal(mount.scenarioId, "documentary-cinematic");

  // Plan header (P4: always-visible goal + current step, schema-exact fields).
  assert.equal(plan.goal, documentaryCinematicScenario.goal, "the user's goal, normalized");
  assert.match(plan.planId, /^plan\.documentary-cinematic-[a-z0-9]+$/);
  assert.match(plan.currentStep, /^Stage stage-deliver executing/);
  assert.ok(Date.parse(plan.updatedAt) > 0, "updatedAt is a parseable timestamp");
  assert.ok(mount.run, "the run record view is mounted");

  // The run the plan points at is the run the mount shows (one run, one ref).
  assert.equal(plan.runRecordRef, mount.run?.runRecordRef);
  assert.match(mount.run?.runRecordRef ?? "", /^agent-lab\/runs\/run-documentary-cinematic-/);

  // Run parity with the COMMITTED certification evidence record: the mounted
  // run replays the certified organization deterministically.
  const evaluation = await committedEvaluation();
  const scenarioEntry = evaluation.scenarios.find((entry) => entry.scenarioId === "documentary-cinematic");
  assert.ok(scenarioEntry, "the committed evaluation covers the documentary scenario");
  assert.equal(mount.run?.replayHash, scenarioEntry?.replayHash, "replay hash pins the committed record");
  assert.equal(mount.run?.organizationId, evaluation.organizationId);
  assert.equal(mount.run?.totalSpendUsd, scenarioEntry?.metrics.totalSpendUsd, "telemetry matches the record");
  assert.equal(mount.run?.approvalCount, scenarioEntry?.metrics.approvalCount);
  assert.equal(mount.run?.finished, true);
  for (const criterion of mount.run?.criteriaResults ?? []) {
    assert.equal(criterion.met, true, `criterion "${criterion.id}" met in the certified run`);
  }
});

test("T2 e2e: every completed item's evidence links resolve to run events and gate results", async () => {
  const mount = await mountWorkspace("documentary-cinematic");
  const run = mount.run;
  assert.ok(run, "the run record view is mounted");
  assert.ok(mount.planView.completed.length >= 5, "every stage completed");
  assert.equal(
    mount.planView.completed.length,
    run?.planSnapshots.length,
    "one completed item per stage snapshot (P4: plans persist in run records)",
  );

  let gateResults = 0;
  for (const item of mount.planView.completed) {
    assert.equal(item.verified, true, `item "${item.item}" must be verified`);
    assert.ok(item.evidence.length > 0, "no evidence, no completion mark");
    for (const link of item.evidence) {
      // Every ref resolves against the mounted run record…
      assert.ok(link.kind === "run-event" || link.kind === "gate-result", `resolved: ${link.ref}`);
      const seq = Number.parseInt(link.ref.split("#evt-")[1] ?? "", 10);
      const event = run?.events.find((candidate) => candidate.seq === seq);
      assert.ok(event, `evidence ${link.ref} exists in the run events`);
      assert.equal(link.detail, event?.detail, "evidence detail = the run event line, verbatim");
      assert.ok(
        link.sourcePaths.some((path) => path.endsWith(ORG_RECORD.split("/").pop() ?? "")),
        "evidence cites the committed organization record",
      );
      if (link.kind === "gate-result") gateResults += 1;
    }
  }
  assert.ok(gateResults > 0, "the human approval gate appears as a gate result");

  // Stage coherence: completed items are the run's stages, in execution order.
  const itemStages = mount.planView.completed.map((item) => /^Stage (\S+) completed\.$/.exec(item.item)?.[1]);
  assert.deepEqual(itemStages, run?.planSnapshots.map((snapshot) => snapshot.stageId));
});

test("T2 e2e: the certified organization is visible with fitness, bodies and committed evidence", async () => {
  const mount = await mountWorkspace("documentary-cinematic");
  const organization = mount.organization;
  assert.ok(organization, "the organization view is mounted");
  const evaluation = await committedEvaluation();

  assert.equal(organization?.certified, true, "certification visible, not just recorded");
  assert.equal(organization?.fitness, evaluation.aggregateFitness, "fitness = the committed record's aggregate");
  assert.equal(organization?.id, evaluation.organizationId);

  // P2: bodies are stable, models are named per node.
  const bodies = organization?.nodes.map((node) => node.bodyId) ?? [];
  for (const expected of [
    "body.director",
    "body.video-editor",
    "body.color-specialist",
    "body.audio-specialist",
    "body.critic",
  ]) {
    assert.ok(bodies.includes(expected), `${expected} visible in the organization`);
  }
  const models = organization?.nodes.map((node) => node.model) ?? [];
  assert.ok(models.some((model) => model === "zai/glm-5.3"), "flagship planning model named per node");
  assert.ok(models.some((model) => model === "open-models/wan-vace-14b"), "open model named per node");

  // Certification evidence cites the committed record (P6: repo, not chat).
  assert.ok(organization?.certificationEvidence?.replayRef.includes("eval.org.documentary-cinematic-remaster-cand-04.json"));
  // The committed organization record carries the full certification
  // evidence (the view projects scenarioSetRef/replayRef; certifiedAt +
  // gapReportsResolved live on the committed graph's evaluation field —
  // see the contract change request in the worker report).
  const committedOrg = await readOrganizationGraphFile(join(repoRoot(), ORG_RECORD));
  assert.equal(committedOrg.evaluation?.certified, true);
  assert.equal(committedOrg.evaluation?.fitness, evaluation.aggregateFitness);
  assert.equal(committedOrg.evaluation?.certificationEvidence?.gapReportsResolved, true);
  assert.ok(committedOrg.evaluation?.certificationEvidence?.certifiedAt);

  // The execution order the organization declares is the order the run used.
  assert.deepEqual(
    organization?.stages.map((stage) => stage.stageId),
    mount.run?.planSnapshots.map((snapshot) => snapshot.stageId),
  );
});

test("T2 e2e: the run's artifact refs audit through the timeline lineage surface", async () => {
  const mount = await mountWorkspace("documentary-cinematic");
  const run = mount.run;
  assert.ok(run && run.artifacts.length > 0, "the certified run produced artifacts");

  // Every artifact ref the run view carries is in the timeline evidence-ref
  // format (`artifacts/<id>.json` — exactly what artifactRef() emits).
  for (const ref of run.artifacts) {
    assert.match(ref, /^artifacts\/[^/]+\.json$/);
    const artifactId = ref.slice("artifacts/".length, -".json".length);
    assert.equal(artifactRef(artifactId), ref, "ref round-trips through the timeline descriptor format");
  }

  // The committed timeline graph (the run-0009 documentary interview chain):
  // lineageOf returns the FULL ancestor chain with producedBy metadata.
  const service = await timelineGraph();
  const report = service.lineageOf("art.seg1-replaced-v1");
  assert.ok(report, "the committed character-replacement artifact audits");
  assert.deepEqual(
    report?.directParents,
    ["art.src-segment-1", "art.reference-character-a"],
    "the replaced segment derives from the cut + the reference frame",
  );
  const ancestors = report?.ancestors ?? [];
  assert.equal(ancestors.length, 3, "the full ancestor chain (no truncation)");
  assert.equal(report?.truncatedChains, false);
  for (const ancestor of ancestors) {
    assert.ok(ancestor.producedBy.capabilityId, `${ancestor.artifactId} carries producedBy metadata`);
    assert.match(ancestor.contentAddress, /^sha256:[0-9a-f]{64}$/);
  }
  const byId = new Map(ancestors.map((ancestor) => [ancestor.artifactId, ancestor]));
  assert.equal(byId.get("art.src-video")?.depth, 2, "the source video is the root ancestor");
  assert.equal(byId.get("art.src-segment-1")?.producedBy.providerId, "local-tools");
  assert.equal(byId.get("art.src-segment-1")?.producedBy.capabilityId, "editor.cut-video");
  // Every derivation path root → … → artifact is enumerable.
  assert.deepEqual(
    (report?.chains ?? []).map((chain) => [...chain]).sort((a, b) => a.join(">").localeCompare(b.join(">"))),
    [
      ["art.reference-character-a", "art.seg1-replaced-v1"],
      ["art.src-video", "art.src-segment-1", "art.seg1-replaced-v1"],
    ].sort((a, b) => a.join(">").localeCompare(b.join(">"))),
  );

  // subtreeOf(bundle) returns the renderable set…
  const subtree = service.subtreeOf("art.timeline-run-0009");
  assert.deepEqual(
    subtree.nodes.map((node) => node.artifactId),
    ["art.timeline-run-0009", "art.timeline-run-0009-track-v1"],
    "the bundle + its renderable track",
  );
  assert.equal(subtree.nodes[0]?.mediaType, TIMELINE_BUNDLE_MEDIA_TYPE);
  // …and the bundle's anchored members order by OTIO path (render order).
  assert.deepEqual(
    service.timelineChildrenOf("art.timeline-run-0009").map((member) => member.timelineRef?.otioPath),
    ["tracks/v1", "tracks/v1/character-replacement/clip-001"],
  );
});
