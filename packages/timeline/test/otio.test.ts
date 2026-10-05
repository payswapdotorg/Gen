/**
 * OTIO interchange tests (W5 §2.6–§2.8): import (bundle + track/item
 * children with timelineRef anchors), export (subgraph → OTIO JSON), and
 * the round-trip property — import(export(x)) is stable for the fields the
 * graph owns (ids/refs may differ; structure must round-trip — here it is
 * byte-stable in the canonical serialization).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { importOtioTimeline } from "../src/domain/otio-import.js";
import { exportOtioSubgraph } from "../src/domain/otio-export.js";
import { ArtifactGraph } from "../src/domain/graph/store.js";
import { serializeOtioCanonical, rationalTime, timeRange } from "../src/domain/otio.js";
import type { OtioTimeline } from "../src/domain/otio.js";
import { sha256ContentAddress } from "../src/adapters/node-content-address.js";
import { FsArtifactRecordSource, defaultRecordsDir } from "../src/adapters/fs-record-source.js";
import { TIMELINE_BUNDLE_MEDIA_TYPE, TIMELINE_TRACK_MEDIA_TYPE, TIMELINE_ITEM_MEDIA_TYPE } from "../src/domain/graph/bundle.js";

function sampleTimeline(): OtioTimeline {
  return {
    OTIO_SCHEMA: "Timeline.1",
    name: "run-0009-interview",
    global_start_time: rationalTime(0, 25),
    tracks: {
      OTIO_SCHEMA: "Stack.1",
      name: "tracks",
      children: [
        {
          OTIO_SCHEMA: "Track.1",
          name: "V1",
          kind: "Video",
          children: [
            {
              OTIO_SCHEMA: "Clip.1",
              name: "seg1-replaced",
              source_range: timeRange(0, 600, 25),
              media_reference: {
                OTIO_SCHEMA: "ExternalReference.1",
                target_url: "gen-artifact://art.seg1-replaced-v1/segment.mp4",
                available_range: timeRange(0, 600, 25),
              },
              metadata: { gen: { assetId: "art.seg1-replaced-v1", fps: 25 } },
            },
            {
              OTIO_SCHEMA: "Gap.1",
              name: "gap",
              source_range: timeRange(0, 25, 25),
            },
            {
              OTIO_SCHEMA: "Clip.1",
              name: "missing-ref-clip",
              source_range: timeRange(0, 100, 25),
              media_reference: { OTIO_SCHEMA: "MissingReference.1", name: "unresolved" },
              metadata: { gen: { assetId: "art.not-in-graph" } },
            },
          ],
        },
        {
          OTIO_SCHEMA: "Track.1",
          name: "A1",
          kind: "Audio",
          children: [
            {
              OTIO_SCHEMA: "Clip.1",
              name: "interview-audio",
              source_range: timeRange(0, 600, 25),
              media_reference: null,
            },
          ],
        },
      ],
    },
    metadata: { gen: { fps: 25, resolution: { width: 1280, height: 720 }, animationCurves: [], markers: [] } },
  };
}

const IMPORT_OPTIONS = {
  producedBy: { capabilityId: "orchestration.compose-timeline", executionId: "test-import-1" },
  contentAddressOf: sha256ContentAddress,
} as const;

function addAll(graph: ArtifactGraph, children: readonly import("../src/domain/types.js").ArtifactDescriptor[]): void {
  for (const child of children) {
    const result = graph.add(child, `import:${child.artifactId}`);
    assert.ok(result.ok, `add ${child.artifactId}: ${result.ok ? "" : result.error.message}`);
  }
}

test("import: maps OTIO to bundle + track/item children with timelineRef anchors", () => {
  const timeline = sampleTimeline();
  const result = importOtioTimeline(serializeOtioCanonical(timeline), IMPORT_OPTIONS);
  assert.ok(result.ok);
  if (!result.ok) return;

  assert.equal(result.bundle.artifactId, "art.otio-bundle");
  assert.equal(result.bundle.mediaType, TIMELINE_BUNDLE_MEDIA_TYPE);
  assert.equal(result.bundle.producedBy.capabilityId, "orchestration.compose-timeline");
  assert.equal(result.tracks.length, 2);
  assert.equal(result.items.length, 4);
  assert.equal(result.children.length, 7, "bundle + 2 tracks + 4 items");

  const track0 = result.tracks[0];
  assert.ok(track0 !== undefined);
  assert.equal(track0.artifact.mediaType, TIMELINE_TRACK_MEDIA_TYPE);
  assert.deepEqual(track0.artifact.timelineRef, { otioPath: "tracks/0", timelineArtifactId: "art.otio-bundle" });
  assert.deepEqual(track0.artifact.derivedFrom, ["art.otio-bundle"]);

  const item00 = result.items[0];
  assert.ok(item00 !== undefined);
  assert.equal(item00?.itemIndex, 0);
  assert.equal(item00?.trackIndex, 0);
  assert.equal(item00?.artifact.mediaType, TIMELINE_ITEM_MEDIA_TYPE);
  assert.deepEqual(item00?.artifact.timelineRef, { otioPath: "tracks/0/0", timelineArtifactId: "art.otio-bundle" });

  const gapItem = result.items[1];
  assert.ok(gapItem !== undefined);
  assert.equal(gapItem?.references.length, 0, "gaps reference no media");

  assert.deepEqual([...result.references], ["art.seg1-replaced-v1", "art.not-in-graph"]);
});

test("import: content addressing is deterministic (same OTIO structure → same bundle address)", () => {
  const timeline = sampleTimeline();
  const first = importOtioTimeline(serializeOtioCanonical(timeline), IMPORT_OPTIONS);
  // Structural keys shuffled: canonical serialization fixes structural key
  // order (metadata subtrees pass through verbatim — the editor-adapters
  // serialization contract).
  const second = importOtioTimeline(JSON.stringify(shuffledStructure(timeline)), IMPORT_OPTIONS);
  assert.ok(first.ok && second.ok);
  if (!first.ok || !second.ok) return;
  assert.equal(first.bundle.contentAddress, second.bundle.contentAddress);
  assert.match(first.bundle.contentAddress, /^sha256:[0-9a-f]{64}$/);
});

test("import: invalid OTIO is rejected with surfaced issues (P5), never thrown", () => {
  const badJson = importOtioTimeline("{not json", IMPORT_OPTIONS);
  assert.equal(badJson.ok, false);
  if (!badJson.ok) assert.ok(badJson.issues.length > 0);

  const wrongRoot = importOtioTimeline(JSON.stringify({ OTIO_SCHEMA: "Stack.1", name: "x" }), IMPORT_OPTIONS);
  assert.equal(wrongRoot.ok, false);

  const badTrack = {
    ...sampleTimeline(),
    tracks: { OTIO_SCHEMA: "Stack.1", name: "tracks", children: [{ OTIO_SCHEMA: "Track.1", name: "T", kind: "Neither", children: [] }] },
  };
  const badKind = importOtioTimeline(badTrack, IMPORT_OPTIONS);
  assert.equal(badKind.ok, false);

  const badProducer = importOtioTimeline(sampleTimeline(), {
    producedBy: { providerId: "x" } as unknown as { capabilityId: string },
    contentAddressOf: sha256ContentAddress,
  });
  assert.equal(badProducer.ok, false);
});

test("export: subgraph → OTIO JSON, byte-stable round-trip (import → export ≡ input)", () => {
  const timeline = sampleTimeline();
  const graph = new ArtifactGraph();
  const media = {
    artifactId: "art.seg1-replaced-v1",
    contentAddress: "sha256:aad928b0a3f0792c8bf3d8f45d5591e95e9058598717b37fb93935cff1294e45",
    mediaType: "video/mp4",
    producedBy: { capabilityId: "video.character-replacement", providerId: "higgsfield" },
  };
  assert.ok(graph.add(media).ok);

  const imported = importOtioTimeline(serializeOtioCanonical(timeline), IMPORT_OPTIONS);
  assert.ok(imported.ok);
  if (!imported.ok) return;
  addAll(graph, imported.children);

  // Media lineage: the clip item derives from the media it references.
  const linking = graph.linkLineage("art.otio-item-0-0", "art.seg1-replaced-v1");
  assert.ok(linking.ok);
  assert.ok(graph.ancestorsOf("art.otio-item-0-0").includes("art.seg1-replaced-v1"));

  const exported = exportOtioSubgraph(graph, "art.otio-bundle");
  assert.ok(exported.ok, `export: ${exported.ok ? "" : JSON.stringify(exported.issues)}`);
  if (!exported.ok) return;
  assert.equal(exported.serialized, serializeOtioCanonical(timeline), "byte-stable canonical round-trip");
  assert.deepEqual(exported.unplacedMembers, []);
});

test("round-trip property: import(export(x)) is stable (structure survives a second cycle)", () => {
  const timeline = sampleTimeline();
  const first = importOtioTimeline(serializeOtioCanonical(timeline), IMPORT_OPTIONS);
  assert.ok(first.ok);
  if (!first.ok) return;
  const graphOne = new ArtifactGraph();
  addAll(graphOne, first.children);
  const exportOne = exportOtioSubgraph(graphOne, "art.otio-bundle");
  assert.ok(exportOne.ok);
  if (!exportOne.ok) return;

  // Second cycle: ids may differ (different idRoot), structure must round-trip.
  const second = importOtioTimeline(exportOne.serialized, { ...IMPORT_OPTIONS, idRoot: "art.second-pass" });
  assert.ok(second.ok);
  if (!second.ok) return;
  assert.equal(second.bundle.artifactId, "art.second-pass-bundle", "ids may differ between passes");
  const graphTwo = new ArtifactGraph();
  addAll(graphTwo, second.children);
  const exportTwo = exportOtioSubgraph(graphTwo, "art.second-pass-bundle");
  assert.ok(exportTwo.ok);
  if (!exportTwo.ok) return;
  assert.equal(exportTwo.serialized, exportOne.serialized, "structure is stable across cycles");
  assert.deepEqual(JSON.parse(exportTwo.serialized), JSON.parse(serializeOtioCanonical(timeline)));
});

test("export: hand-authored bundles — anchored members without slots are reported, not dropped", async () => {
  const graph = new ArtifactGraph();
  const result = graph.load(await new FsArtifactRecordSource(defaultRecordsDir()).load());
  assert.ok(result.ok);

  const exported = exportOtioSubgraph(graph, "art.timeline-run-0009", { name: "run-0009", fps: 25 });
  assert.ok(exported.ok, `export: ${exported.ok ? "" : JSON.stringify(exported.issues)}`);
  if (!exported.ok) return;
  assert.equal(exported.timeline.tracks.children.length, 0, "no structural children recorded");
  assert.ok(exported.unplacedMembers.includes("art.timeline-run-0009-track-v1"));
  assert.ok(exported.unplacedMembers.includes("art.seg1-replaced-v1"));
  assert.ok(exported.timeline.name === "run-0009");
});

test("export: unknown bundle surfaces an error (never an empty success)", () => {
  const graph = new ArtifactGraph();
  const exported = exportOtioSubgraph(graph, "art.ghost-bundle");
  assert.equal(exported.ok, false);
  if (!exported.ok) assert.match(exported.issues[0]?.problem ?? "", /unknown artifact/);
});

test("export: conflicting slots and orphan items are surfaced", () => {
  const graph = new ArtifactGraph();
  const producedBy = { capabilityId: "orchestration.compose-timeline" };
  const address = (n: number) => `sha256:${String(n).padStart(64, "0")}`;
  const track = (id: string, trackIndex: number) => ({
    artifactId: id,
    contentAddress: address(trackIndex),
    mediaType: TIMELINE_TRACK_MEDIA_TYPE,
    producedBy,
    derivedFrom: ["art.b"],
    timelineRef: { otioPath: `tracks/${trackIndex}`, timelineArtifactId: "art.b" },
    metadata: { otio: { node: { OTIO_SCHEMA: "Track.1", name: "T", kind: "Video", children: [] }, slot: { trackIndex } } },
  });
  const item = (id: string, trackIndex: number, itemIndex: number) => ({
    artifactId: id,
    contentAddress: address(trackIndex * 10 + itemIndex),
    mediaType: TIMELINE_ITEM_MEDIA_TYPE,
    producedBy,
    derivedFrom: ["art.b"],
    timelineRef: { otioPath: `tracks/${trackIndex}/${itemIndex}`, timelineArtifactId: "art.b" },
    metadata: {
      otio: {
        node: { OTIO_SCHEMA: "Gap.1", name: "g", source_range: timeRange(0, 10, 25) },
        slot: { trackIndex, itemIndex },
      },
    },
  });
  const bundle = {
    artifactId: "art.b",
    contentAddress: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    mediaType: TIMELINE_BUNDLE_MEDIA_TYPE,
    producedBy,
    metadata: { otio: { skeleton: { name: "conflict-test", global_start_time: rationalTime(0, 25), tracks: { name: "tracks" } } } },
  };
  assert.ok(graph.add(bundle).ok);
  assert.ok(graph.add(track("art.t0", 0)).ok);
  assert.ok(graph.add(track("art.t0-dup", 0)).ok);
  assert.ok(graph.add(item("art.i9", 9, 0)).ok);

  const exported = exportOtioSubgraph(graph, "art.b");
  assert.equal(exported.ok, false);
  if (!exported.ok) {
    const problems = exported.issues.map((issue) => issue.problem).join("; ");
    assert.match(problems, /conflicting track slot/);
    assert.match(problems, /missing track slot/);
  }
});

/** Structural key-order shuffle: metadata subtrees stay verbatim (the
 * passthrough contract shared with editor-adapters' serializer). */
function shuffledStructure(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shuffledStructure);
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .reverse()
      .map(([key, val]) => [key, key === "metadata" ? val : shuffledStructure(val)] as const);
    return Object.fromEntries(entries);
  }
  return value;
}
