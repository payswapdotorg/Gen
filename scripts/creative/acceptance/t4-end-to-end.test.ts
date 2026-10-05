/**
 * T4 end-to-end (lock §9, work order §B.6): the user chain for a forced
 * capability failure —
 *
 *   forced routing failure (traceable, never silent) → the committed gap
 *   report → the workspace blocked view. Asserts the blocked item links the
 *   REAL gap report (arena state, severity, router trace), certification is
 *   honestly refused while the gap is unresolved, and a completed item's
 *   artifact ref yields a timeline lineage evidence descriptor (the P4
 *   tie-in: what made this, with which capability/provider).
 *
 * Domain-layer coverage lives in t4-gap-report.test.ts.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { routeCapability } from "../../../packages/media-capabilities/src/domain/router.js";
import { readEvaluationRecordFile } from "../../../packages/agent-lab/src/adapters/fs-evaluation-store.js";
import { composeRegistry, repoRoot } from "./lib/compose-registry.js";
import { composePlane, factsForCapability } from "./lib/plane.js";
import { mountWorkspace, timelineGraph } from "./lib/e2e-lib.js";
import { taskPlanEvidenceRefs } from "../../../packages/timeline/src/domain/graph/lineage.js";

const GAP_RECORD = "packages/arena-bridge/src/domain/gaps/gap.forced-failure-video-character-replacement.json";
const REFUSAL_RECORD = "packages/agent-lab/src/domain/evaluations/eval.org.character-replacement-edit-cand-04.json";

interface CommittedGap {
  readonly gapId: string;
  readonly kind: string;
  readonly failureEvidence: {
    readonly summary: string;
    readonly routerDecisionTrace: string;
    readonly organizationRunRef: string;
    readonly artifactRefs: readonly string[];
  };
  readonly impact: { readonly goalClass: string; readonly severity: string };
  readonly arena: { readonly state: string; readonly proposedCapabilityId?: string };
  readonly requestedCapability: { readonly capabilityId: string };
}

async function committedGap(): Promise<CommittedGap> {
  return JSON.parse(await readFile(join(repoRoot(), GAP_RECORD), "utf8")) as CommittedGap;
}

test("T4 e2e: forced routing failure → the blocked view links the REAL committed gap report", async () => {
  // The domain failure mode: every mapping degraded below the reliability
  // bar → the router REFUSES with a trace (never a silent or hallucinated
  // pick) — the same cheapest-reliable bar the committed gap records.
  const composed = await composeRegistry();
  const plane = await composePlane();
  const facts = factsForCapability("video.character-replacement", composed.view, plane);
  const degraded = {
    candidates: facts.candidates.map((candidate) => ({ ...candidate, reliability: 0.05, available: true })),
  };
  const refusal = routeCapability(
    { capabilityId: "video.character-replacement", parameters: {}, inputArtifactIds: [], policy: "cheapest-reliable" },
    composed.view,
    degraded,
  );
  assert.ok(!refusal.ok, "degraded reliability must not produce a decision");
  assert.ok(refusal.decisionTrace.includes("rejection="), "the failure carries a router trace");

  // …and the workspace mounts the forced-failure run that emitted the gap.
  const mount = await mountWorkspace("forced-failure");
  assert.ok(mount.run, "the forced-failure run record is mounted");
  const gap = await committedGap();

  // The blocked item links the real gap report (arena state, severity, trace).
  assert.equal(mount.planView.blocked.length, 1);
  const blocked = mount.planView.blocked[0];
  assert.ok(blocked);
  assert.equal(blocked?.kind, "capability");
  assert.equal(blocked?.capabilityGapRef, "gaps/gap.forced-failure-video-character-replacement.json");
  assert.equal(blocked?.gap?.gapId, gap.gapId);
  assert.equal(blocked?.gap?.arenaState, gap.arena.state, "arena state visible on the blocked item");
  assert.equal(blocked?.gap?.severity, gap.impact.severity, "severity visible on the blocked item");
  assert.equal(blocked?.gap?.sourcePath, GAP_RECORD, "the link points at the committed record");
  assert.equal(blocked?.reason, gap.failureEvidence.summary, "the blocked reason IS the gap summary");

  // The full gap report view carries the router trace + arena resolution.
  const full = mount.gapReports.find((report) => report.gapId === gap.gapId);
  assert.ok(full, "the full gap report is mounted");
  assert.equal(full?.routerDecisionTrace, gap.failureEvidence.routerDecisionTrace);
  assert.ok(full?.routerDecisionTrace.includes("policy=cheapest-reliable"));
  assert.ok(full?.routerDecisionTrace.includes("rejected=3"));
  assert.equal(full?.proposedCapabilityId, gap.arena.proposedCapabilityId);

  // P5 chain intact: the run the mount shows is the run the gap cites…
  assert.equal(mount.run?.runRecordRef, gap.failureEvidence.organizationRunRef);
  // …and that run actually emitted the gap signal.
  assert.ok(mount.run?.events.some((event) => event.type === "gap-signaled"));
});

test("T4 e2e: certification honestly refused while the gap is unresolved", async () => {
  const mount = await mountWorkspace("forced-failure");
  const organization = mount.organization;
  assert.ok(organization, "the attempting organization is visible");
  const refusal = await readEvaluationRecordFile(join(repoRoot(), REFUSAL_RECORD));

  assert.equal(organization?.certified, false, "certification refused — never fabricated");
  assert.ok((organization?.fitness ?? 0) > 0, "the attempting run still has measurable fitness");
  assert.ok(
    organization?.certificationNote?.includes(REFUSAL_RECORD.split("/").pop() ?? ""),
    "the refusal cites the committed refusal record",
  );
  assert.equal(refusal.certified, false, "the committed evaluation record agrees: not certified");

  // Honest criteria: the gap counts against the run, but the ATTEMPT counts
  // for capability coverage (dodging the capability is not goal achievement).
  const criteria = new Map((mount.run?.criteriaResults ?? []).map((criterion) => [criterion.id, criterion.met]));
  assert.equal(criteria.get("no-capability-gaps"), false, "the gap is visible in the criteria");
  assert.equal(criteria.get("required-capabilities-invoked"), true, "the attempt was made and surfaced");
});

test("T4 e2e: a completed item's artifact ref yields a timeline lineage evidence descriptor (P4 tie-in)", async () => {
  // The forced-failure run still completed stages — with honest evidence.
  const blocked = await mountWorkspace("forced-failure");
  assert.ok(blocked.planView.completed.length > 0, "stages completed around the block");
  for (const item of blocked.planView.completed) {
    assert.equal(item.verified, true, `item "${item.item}" verified`);
    for (const link of item.evidence) {
      assert.ok(link.kind === "run-event" || link.kind === "gate-result");
    }
  }

  // The P4 tie-in: the sibling replace-actor plan (the run-0009 documentary
  // interview chain) carries a completed item whose evidence includes an
  // ARTIFACT ref — the timeline surface audits exactly that ref shape.
  const mount = await mountWorkspace("replace-actor-alternatives");
  const artifactRefs = mount.planView.completed
    .flatMap((item) => item.evidence.map((link) => link.ref))
    .filter((ref) => ref.startsWith("artifacts/"));
  assert.ok(artifactRefs.length > 0, "a completed item carries artifact-ref evidence");
  const srcVideoRef = artifactRefs.find((ref) => ref === "artifacts/art.src-video.json");
  assert.ok(srcVideoRef, "the ingested source video is cited as evidence");

  const service = await timelineGraph();
  const evidence = service.lineageEvidence("art.src-video");
  assert.ok(evidence, "the artifact ref yields a lineage evidence descriptor");

  // The descriptor shape matches what the workspace links — the artifactRef
  // IS the evidence ref string, verbatim.
  assert.equal(evidence?.artifactRef, srcVideoRef);
  assert.equal(evidence?.artifactId, "art.src-video");
  assert.equal(evidence?.mediaType, "video/mp4");
  assert.match(evidence?.contentAddress ?? "", /^sha256:[0-9a-f]{64}$/);
  // What made this: the ingest capability through the workspace adapter.
  assert.equal(evidence?.producedBy.capabilityId, "orchestration.ingest-media");
  assert.equal(evidence?.producedBy.executionAdapter, "workspace-ingest");

  // …and the workspace's own evidence link for the same ref stays visible
  // (declared-ref with provenance — the timeline descriptor is the audit
  // depth BEHIND the link, never a replacement for it).
  const link = mount.planView.completed
    .flatMap((item) => item.evidence)
    .find((candidate) => candidate.ref === srcVideoRef);
  assert.ok(link);
  assert.equal(link?.label, srcVideoRef);
  assert.deepEqual(link?.sourcePaths, ["spec/examples/task-plan.replace-actor.json"]);

  // With which capability/provider: the character-replacement artifact that
  // WAS produced (the plan's next action, executed) names the full triple —
  // the exact capability the T4 gap was about, made by the premium provider.
  const replaced = service.lineageEvidence("art.seg1-replaced-v1");
  assert.ok(replaced, "the replaced segment yields its evidence descriptor");
  assert.equal(replaced?.producedBy.capabilityId, "video.character-replacement");
  assert.equal(replaced?.producedBy.providerId, "higgsfield");
  assert.equal(replaced?.producedBy.modelId, "genjutsu");
  assert.deepEqual(replaced?.derivedFrom, ["art.src-segment-1", "art.reference-character-a"]);
  assert.equal(replaced?.timelineArtifactId, "art.timeline-run-0009");
  assert.equal(replaced?.otioPath, "tracks/v1/character-replacement/clip-001");

  // The evidence refs a completed item would carry over that artifact: the
  // artifact + its full ancestor chain (P4: evidence is auditable lineage).
  assert.deepEqual(taskPlanEvidenceRefs(service.graph, "art.seg1-replaced-v1"), [
    "artifacts/art.seg1-replaced-v1.json",
    "artifacts/art.reference-character-a.json",
    "artifacts/art.src-segment-1.json",
    "artifacts/art.src-video.json",
  ]);
});
