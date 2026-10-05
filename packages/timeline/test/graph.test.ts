/**
 * Artifact graph store tests (W5 §2.3–§2.5, §2.9–§2.11): store ops, DAG
 * validation (parents exist, cycles, contentAddress format), lineage queries
 * (ancestors/descendants, lineageOf audit view), bundle aggregation, and the
 * TaskPlan evidence descriptor (P4 tie-in).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { ArtifactGraph } from "../src/domain/graph/store.js";
import { lineageOf, lineageEvidence, taskPlanEvidenceRefs, artifactRef, queryArtifacts } from "../src/domain/graph/lineage.js";
import { isTimelineBundle, isTimelineArticulate, compareOtioPath } from "../src/domain/graph/bundle.js";
import { TimelineGraphService } from "../src/app/graph-service.js";
import { FsArtifactRecordSource, defaultExamplesDir, defaultRecordsDir } from "../src/adapters/fs-record-source.js";
import { sha256ContentAddress } from "../src/adapters/node-content-address.js";
import type { ArtifactDescriptor } from "../src/domain/types.js";

function artifact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    artifactId: "art.test",
    contentAddress: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    mediaType: "video/mp4",
    producedBy: { capabilityId: "editor.cut-video" },
    ...overrides,
  };
}

async function launchGraph(): Promise<ArtifactGraph> {
  const graph = new ArtifactGraph();
  const result = graph.load(await new FsArtifactRecordSource(defaultRecordsDir()).load());
  assert.ok(result.ok, `records load cleanly: ${JSON.stringify(result.errors)}`);
  return graph;
}

test("records load in any file order into a valid DAG (batch-aware parents)", async () => {
  const graph = await launchGraph();
  assert.equal(graph.stats().artifacts, 7);
  assert.equal(graph.stats().edges, 7);
  assert.deepEqual(graph.danglingTimelineAnchors(), []);
});

test("examples load as their own valid graph", async () => {
  const graph = new ArtifactGraph();
  const result = graph.load(await new FsArtifactRecordSource(defaultExamplesDir()).load());
  assert.ok(result.ok);
  assert.equal(graph.stats().artifacts, 5);
});

test("add: rejects schema violations, duplicates, and unknown parents", () => {
  const graph = new ArtifactGraph();
  assert.ok(graph.add(artifact()).ok);

  const duplicate = graph.add(artifact());
  assert.equal(duplicate.ok, false);
  assert.match(!duplicate.ok ? duplicate.error.message : "", /duplicate artifact id/);

  const badAddress = graph.add(artifact({ artifactId: "art.bad-address", contentAddress: "sha256:xyz" }));
  assert.equal(badAddress.ok, false);

  const noProducer = graph.add(artifact({ artifactId: "art.no-producer", producedBy: undefined }));
  assert.equal(noProducer.ok, false);

  const extraField = graph.add(artifact({ artifactId: "art.extra", nope: 1 }));
  assert.equal(extraField.ok, false);

  const orphan = graph.add(artifact({ artifactId: "art.orphan", derivedFrom: ["art.missing-parent"] }));
  assert.equal(orphan.ok, false);
  assert.match(!orphan.ok ? orphan.error.message : "", /unknown parent artifact/);
});

test("load: cycles are rejected with per-source errors (never thrown)", () => {
  const graph = new ArtifactGraph();
  const result = graph.load([
    { source: "a.json", data: artifact({ artifactId: "art.a", derivedFrom: ["art.b"] }) },
    { source: "b.json", data: artifact({ artifactId: "art.b", derivedFrom: ["art.a"] }) },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.loaded, 0);
  assert.ok(result.errors.length >= 2);
  assert.ok(result.errors.every((error) => /cycle/.test(error.message)));
});

test("load: self-lineage is a cycle", () => {
  const graph = new ArtifactGraph();
  const result = graph.load([{ source: "self.json", data: artifact({ artifactId: "art.self", derivedFrom: ["art.self"] }) }]);
  assert.equal(result.ok, false);
  assert.equal(result.loaded, 0);
});

test("linkLineage: adds derivation edges, refuses duplicates/cycles/unknowns", async () => {
  const graph = await launchGraph();
  assert.ok(graph.linkLineage("art.timeline-run-0009", "art.reference-character-a").ok);
  assert.deepEqual(graph.childrenOf("art.reference-character-a"), ["art.seg1-replaced-v1", "art.timeline-run-0009"]);
  assert.equal(graph.linkLineage("art.timeline-run-0009", "art.reference-character-a").ok, false, "duplicate link");
  assert.equal(graph.linkLineage("art.src-video", "art.timeline-run-0009-track-v1").ok, false, "would create a cycle");
  assert.equal(graph.linkLineage("art.src-video", "art.src-video").ok, false, "self link");
  assert.equal(graph.linkLineage("art.ghost", "art.src-video").ok, false, "unknown child");
  assert.equal(graph.linkLineage("art.src-video", "art.ghost").ok, false, "unknown parent");
});

test("ancestors/descendants/children: the launch chain", async () => {
  const graph = await launchGraph();
  assert.deepEqual([...graph.ancestorsOf("art.seg1-replaced-v1")].sort(), [
    "art.reference-character-a",
    "art.src-segment-1",
    "art.src-video",
  ]);
  assert.ok(graph.ancestorsOf("art.src-video").length === 0, "roots have no ancestors");
  assert.deepEqual([...graph.descendantsOf("art.src-video")].sort(), [
    "art.editor-project-cut-v1",
    "art.seg1-replaced-v1",
    "art.src-segment-1",
    "art.timeline-run-0009",
    "art.timeline-run-0009-track-v1",
  ]);
  const subtree = graph.subtreeOf("art.timeline-run-0009");
  assert.deepEqual(subtree.nodes.map((node) => node.artifactId), ["art.timeline-run-0009", "art.timeline-run-0009-track-v1"]);
});

test("timeline bundle aggregation: timelineRef anchors, otioPath-ordered", async () => {
  const graph = await launchGraph();
  const bundle = graph.get("art.timeline-run-0009");
  assert.ok(bundle !== undefined);
  assert.ok(isTimelineBundle(bundle as ArtifactDescriptor));
  const members = graph.timelineChildrenOf("art.timeline-run-0009");
  assert.deepEqual(members.map((member) => member.artifactId), [
    "art.timeline-run-0009-track-v1",
    "art.seg1-replaced-v1",
  ]);
  assert.ok(members.every((member) => isTimelineArticulate(member)));
  assert.equal(compareOtioPath("tracks/v1", "tracks/v1/character-replacement/clip-001") < 0, true);
  assert.equal(compareOtioPath("tracks/2", "tracks/10") < 0, true, "numeric-aware");
});

test("dangling timeline anchors surface (never silently hidden)", async () => {
  const graph = await launchGraph();
  assert.deepEqual(graph.danglingTimelineAnchors(), []);
  assert.ok(
    graph.add(
      artifact({
        artifactId: "art.anchored-elsewhere",
        mediaType: "video/mp4",
        timelineRef: { otioPath: "tracks/x/clip-9", timelineArtifactId: "art.not-in-graph" },
      }),
    ).ok,
  );
  assert.deepEqual(graph.danglingTimelineAnchors(), [
    { artifactId: "art.anchored-elsewhere", timelineArtifactId: "art.not-in-graph" },
  ]);
});

test("lineageOf: full ancestor chain with producing metadata (audit view)", async () => {
  const graph = await launchGraph();
  const report = lineageOf(graph, "art.seg1-replaced-v1");
  assert.ok(report !== undefined);
  assert.equal(report.mediaType, "video/mp4");
  assert.equal(report.producedBy.capabilityId, "video.character-replacement");
  assert.equal(report.producedBy.providerId, "higgsfield");
  assert.equal(report.producedBy.executionId, "job-20261004-0001-a3f");
  assert.deepEqual(report.directParents, ["art.src-segment-1", "art.reference-character-a"]);
  const depths = new Map(report.ancestors.map((ancestor) => [ancestor.artifactId, ancestor.depth]));
  assert.equal(depths.get("art.src-segment-1"), 1);
  assert.equal(depths.get("art.reference-character-a"), 1);
  assert.equal(depths.get("art.src-video"), 2);
  const segmentAncestor = report.ancestors.find((ancestor) => ancestor.artifactId === "art.src-segment-1");
  assert.equal(segmentAncestor?.producedBy.executionAdapter, "mlt-melt-cli");
  assert.equal(segmentAncestor?.mediaType, "video/mp4");
  assert.deepEqual(
    [...report.chains].map((chain) => [...chain]),
    [
      ["art.src-video", "art.src-segment-1", "art.seg1-replaced-v1"],
      ["art.reference-character-a", "art.seg1-replaced-v1"],
    ],
  );
  assert.equal(report.truncatedChains, false);
  assert.equal(lineageOf(graph, "art.unknown"), undefined);
});

test("lineageOf: bundle audit view shows the composition chain", async () => {
  const graph = await launchGraph();
  const report = lineageOf(graph, "art.timeline-run-0009");
  assert.ok(report !== undefined);
  assert.equal(report.producedBy.agentInstanceId, "run-0009-n1");
  assert.deepEqual(report.directParents, ["art.editor-project-cut-v1", "art.seg1-replaced-v1"]);
  assert.equal(report.ancestors.length, 5, "editor project + replaced segment + segment + reference + source");
});

test("TaskPlan evidence descriptor (P4 tie-in): refs the workspace links", async () => {
  const graph = await launchGraph();
  const evidence = lineageEvidence(graph, "art.seg1-replaced-v1");
  assert.ok(evidence !== undefined);
  assert.equal(evidence.artifactRef, "artifacts/art.seg1-replaced-v1.json");
  assert.equal(evidence.artifactId, "art.seg1-replaced-v1");
  assert.match(evidence.contentAddress, /^sha256:[0-9a-f]{64}$/);
  assert.equal(evidence.producedBy.capabilityId, "video.character-replacement");
  assert.deepEqual(evidence.derivedFrom, ["art.src-segment-1", "art.reference-character-a"]);
  assert.equal(evidence.timelineArtifactId, "art.timeline-run-0009");
  assert.equal(evidence.otioPath, "tracks/v1/character-replacement/clip-001");
  assert.equal(artifactRef("art.src-video"), "artifacts/art.src-video.json");
  const refs = taskPlanEvidenceRefs(graph, "art.seg1-replaced-v1");
  assert.deepEqual(refs, [
    "artifacts/art.seg1-replaced-v1.json",
    "artifacts/art.reference-character-a.json",
    "artifacts/art.src-segment-1.json",
    "artifacts/art.src-video.json",
  ]);
  assert.equal(taskPlanEvidenceRefs(graph, "art.ghost"), undefined);
});

test("queryArtifacts: Phase 0 LineageQuery filter", async () => {
  const graph = await launchGraph();
  const byCapability = queryArtifacts(graph, { producedByCapabilityId: "editor.cut-video" });
  assert.deepEqual(
    byCapability.map((entry) => entry.artifactId),
    ["art.editor-project-cut-v1", "art.src-segment-1"],
  );
  const byParent = queryArtifacts(graph, { derivedFromArtifactId: "art.src-video" });
  assert.deepEqual(
    byParent.map((entry) => entry.artifactId),
    ["art.editor-project-cut-v1", "art.src-segment-1"],
  );
  const byAgent = queryArtifacts(graph, { agentInstanceId: "run-0009-n1" });
  assert.deepEqual(
    byAgent.map((entry) => entry.artifactId),
    ["art.timeline-run-0009", "art.timeline-run-0009-track-v1"],
  );
});

test("app service: bootstrap over ports, lineage + evidence through the facade", async () => {
  const service = new TimelineGraphService({
    recordSources: [new FsArtifactRecordSource(defaultRecordsDir())],
    contentAddressOf: sha256ContentAddress,
  });
  const boot = await service.bootstrap();
  assert.ok(boot.ok);
  assert.equal(boot.loaded, 7);
  assert.equal(service.stats().artifacts, 7);
  assert.ok(service.lineageOf("art.seg1-replaced-v1") !== undefined);
  assert.equal(service.lineageEvidence("art.seg1-replaced-v1")?.artifactRef, "artifacts/art.seg1-replaced-v1.json");
  assert.equal(service.timelineChildrenOf("art.timeline-run-0009").length, 2);
});

test("constructor throws on invalid initial descriptors (programmer error path)", () => {
  assert.throws(() => new ArtifactGraph([artifact({ artifactId: "art.x", derivedFrom: ["art.ghost"] }) as unknown as ArtifactDescriptor]));
});
