/**
 * Cross-package interchange integration (W5 §2.6 reuse evidence): a REAL
 * editor adapter (@gen/editor-adapters PUBLIC surface only — lock §5)
 * produces an OTIO timeline; @gen/timeline imports it into the artifact
 * graph, links media lineage, and exports it back — structure must
 * round-trip. This is the byte-format alignment proof for the mirrored OTIO
 * model binding (src/domain/otio.ts): editor-adapters' serialized OTIO and
 * this package's canonical serialization agree.
 *
 * Binary-free by design (same contract as the editor-adapters round-trip
 * suite): open → apply(editor.cut-video) → exportOtio never invokes a
 * binary; render conformance is the editor side's live-test concern.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEditorAdapter, createNodeAdapterContext } from "@gen/editor-adapters";
import { ArtifactGraph } from "../src/domain/graph/store.js";
import { importOtioTimeline } from "../src/domain/otio-import.js";
import { exportOtioSubgraph } from "../src/domain/otio-export.js";
import { serializeOtioCanonical } from "../src/domain/otio.js";
import { sha256ContentAddress } from "../src/adapters/node-content-address.js";
import { lineageOf } from "../src/domain/graph/lineage.js";

const SYNTHETIC_ASSET_BYTES = new TextEncoder().encode("synthetic-mp4-bytes-not-decodable-but-content-addressed");

test("ffmpeg exportOtio → timeline import → graph → export: structure round-trips", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "gen-timeline-w5-"));
  try {
    const ctx = createNodeAdapterContext(root);
    // 1. Ingest synthetic media through the artifact store (content-addressed).
    const media = await ctx.artifacts.putBinary(SYNTHETIC_ASSET_BYTES, "video/mp4", {
      producedBy: { capabilityId: "editor.render-project", executionAdapter: "fixture-harness", executionId: "w5-fixture" },
      metadata: { durationSeconds: 4, fps: 25, width: 320, height: 240 },
    });
    assert.match(media.artifactId, /^art\.[a-z0-9-]+$/, "LocalArtifactStore ids satisfy the artifact schema pattern");

    // 2. Real adapter: open → cut → exportOtio (public surface).
    const ffmpeg = createEditorAdapter("ffmpeg", ctx);
    const handle = await ffmpeg.open(media.artifactId);
    const cut = await ffmpeg.apply(handle, {
      capabilityId: "editor.cut-video",
      params: { clipIndex: 0, start: 1, end: 3, mode: "reencode" },
      idempotencyKey: "w5-integration-1",
    });
    const otioJson = await ffmpeg.exportOtio(cut);
    assert.ok(otioJson.includes("Timeline.1"), "editor adapter emitted an OTIO Timeline.1");

    // 3. Timeline import: the zod OTIO binding accepts editor-adapters output.
    const graph = new ArtifactGraph();
    assert.ok(graph.add(media).ok, "the media descriptor (a @gen/timeline contract type from the store) enters the graph");
    const imported = importOtioTimeline(otioJson, {
      producedBy: { capabilityId: "editor.cut-video", executionAdapter: "ffmpeg-cli", executionId: "w5-integration-1" },
      derivedFrom: [media.artifactId],
      contentAddressOf: sha256ContentAddress,
    });
    assert.ok(imported.ok, `import parses editor-adapters OTIO: ${imported.ok ? "" : JSON.stringify(imported.issues)}`);
    if (!imported.ok) return;
    assert.ok(imported.references.includes(media.artifactId), "clip gen.assetId resolved to the media artifact");

    // 4. Add bundle + children, link media lineage.
    for (const child of imported.children) {
      const added = graph.add(child, `otio:${child.artifactId}`);
      assert.ok(added.ok, added.ok ? "" : added.error.message);
    }
    for (const item of imported.items) {
      for (const reference of item.references) {
        if (graph.has(reference)) assert.ok(graph.linkLineage(item.artifact.artifactId, reference).ok);
      }
    }

    // 5. Export the subgraph back: structure must round-trip.
    const exported = exportOtioSubgraph(graph, imported.bundle.artifactId);
    assert.ok(exported.ok, `export: ${exported.ok ? "" : JSON.stringify(exported.issues)}`);
    if (!exported.ok) return;
    assert.deepEqual(JSON.parse(exported.serialized), JSON.parse(otioJson), "byte-format alignment: exported structure equals the editor's OTIO");
    assert.equal(exported.serialized, serializeOtioCanonical(imported.timeline), "canonical serialization agrees with the input form");

    // 6. Lineage: the clip item's audit chain reaches the media artifact.
    const clipItem = imported.items.find((item) => item.references.includes(media.artifactId));
    assert.ok(clipItem !== undefined, "the cut clip is an item child");
    const report = lineageOf(graph, clipItem.artifact.artifactId);
    assert.ok(report !== undefined);
    assert.ok(report.ancestors.some((ancestor) => ancestor.artifactId === media.artifactId), "media is in the lineage chain");
    assert.ok(report.ancestors.some((ancestor) => ancestor.artifactId === imported.bundle.artifactId), "bundle is in the lineage chain");

    // 7. Second cycle stability: re-import the export under a different idRoot.
    const second = importOtioTimeline(exported.serialized, {
      producedBy: { capabilityId: "editor.cut-video", executionAdapter: "ffmpeg-cli", executionId: "w5-integration-2" },
      idRoot: "art.w5-second",
      contentAddressOf: sha256ContentAddress,
    });
    assert.ok(second.ok);
    if (!second.ok) return;
    assert.equal(second.bundle.contentAddress, imported.bundle.contentAddress, "same OTIO → same content address");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("mlt import path: timeline bundle feeds EditorAdapter.importOtio contract (id shape)", async () => {
  // The editor-adapters contract takes importOtio(timelineArtifactId): the
  // bundle ids this package mints must be valid handles for that call.
  const root = await mkdtemp(path.join(tmpdir(), "gen-timeline-w5-mlt-"));
  try {
    const ctx = createNodeAdapterContext(root);
    const media = await ctx.artifacts.putBinary(SYNTHETIC_ASSET_BYTES, "video/mp4", {
      producedBy: { capabilityId: "editor.render-project", executionAdapter: "fixture-harness", executionId: "w5-fixture" },
      // Probe metadata (their adapter contract requires it before open — P5).
      metadata: { durationSeconds: 4, fps: 25, width: 320, height: 240 },
    });
    const mlt = createEditorAdapter("mlt", ctx);
    const handle = await mlt.open(media.artifactId);
    const otioJson = await mlt.exportOtio(handle);

    const imported = importOtioTimeline(otioJson, {
      producedBy: { capabilityId: "editor.render-project", executionAdapter: "mlt-melt-cli", executionId: "w5-mlt-1" },
      contentAddressOf: sha256ContentAddress,
    });
    assert.ok(imported.ok);
    if (!imported.ok) return;

    // Register the OTIO document as a store artifact (the editor contract's
    // importOtio input) and drive the adapter with the bundle's graph id.
    const timelineArtifact = await ctx.artifacts.put(otioJson, "application/otio", {
      producedBy: { capabilityId: "editor.render-project", executionAdapter: "mlt-melt-cli", executionId: "w5-mlt-1" },
    });
    assert.ok(timelineArtifact.artifactId.length > 0);
    const importedHandle = await mlt.importOtio(timelineArtifact.artifactId);
    assert.ok(importedHandle.handleId.startsWith("h.mlt."), "the OTIO round-trips into the editor contract");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
