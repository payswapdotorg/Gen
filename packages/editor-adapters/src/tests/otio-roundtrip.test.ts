/**
 * OTIO exchange conformance — per-adapter round-trip through the real
 * adapter surface (open → apply → exportOtio → importOtio) over the Node
 * ports. Binary-free by design: this verifies the interchange contracts
 * (editor-adapter-contract.md §3), which is what multiple-editors-cooperate
 * depends on at Phase 2. Live render conformance lives in the *-live tests.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { EditorAdapter, EditorId } from "../contract.js";
import { createEditorAdapter } from "../adapters/index.js";
import { ingestAsset, makeWorkspace, SYNTHETIC_ASSET, SYNTHETIC_LAYER } from "./helpers.js";
import type { TestWorkspace } from "./helpers.js";
import { parseOtio } from "../domain/otio/parse.js";

interface AdapterCase {
  readonly editorId: EditorId;
  readonly command: { capabilityId: string; params: Record<string, unknown>; idempotencyKey: string };
  readonly expect: { readonly tracks: number; readonly clips: number; readonly durationTolerance: number };
}

const CUT_CASES: readonly AdapterCase[] = [
  { editorId: "mlt", command: { capabilityId: "editor.cut-video", params: { clipIndex: 0, start: 1, end: 3, mode: "reencode" }, idempotencyKey: "cut-1" }, expect: { tracks: 1, clips: 1, durationTolerance: 0.05 } },
  { editorId: "ffmpeg", command: { capabilityId: "editor.cut-video", params: { clipIndex: 0, start: 1, end: 3, mode: "reencode" }, idempotencyKey: "cut-1" }, expect: { tracks: 1, clips: 1, durationTolerance: 0.05 } },
  { editorId: "kdenlive", command: { capabilityId: "editor.cut-video", params: { clipIndex: 0, start: 1, end: 3, mode: "reencode" }, idempotencyKey: "cut-1" }, expect: { tracks: 1, clips: 1, durationTolerance: 0.05 } },
  { editorId: "losslesscut", command: { capabilityId: "editor.cut-video", params: { clipIndex: 0, start: 1, end: 3, mode: "reencode" }, idempotencyKey: "cut-1" }, expect: { tracks: 1, clips: 1, durationTolerance: 0.05 } },
];

async function cutRoundTrip(adapter: EditorAdapter, workspace: TestWorkspace, expect: AdapterCase["expect"]): Promise<void> {
  const artifactId = await ingestAsset(workspace.ctx.artifacts, SYNTHETIC_ASSET);
  const handle = await adapter.open(artifactId);
  const applied = await adapter.apply(handle, {
    capabilityId: "editor.cut-video",
    params: { clipIndex: 0, start: 1, end: 3, mode: "reencode" },
    idempotencyKey: `cut-${expect.tracks}-rt`,
  });
  const otioJson = await adapter.exportOtio(applied);
  const parsed = parseOtio(otioJson);
  assert.ok(parsed.ok, `exportOtio produced invalid OTIO: ${parsed.ok ? "" : JSON.stringify(parsed.issues)}`);
  if (!parsed.ok) return;
  const tracks = parsed.timeline.tracks.children;
  assert.equal(tracks.length, expect.tracks, "track count");
  const clips = tracks.flatMap((track) => track.children.filter((item) => item.OTIO_SCHEMA === "Clip.1"));
  assert.equal(clips.length, expect.clips, "clip count");
  for (const clip of clips) {
    const seconds = clip.source_range.duration.value / clip.source_range.duration.rate;
    assert.ok(
      Math.abs(seconds - 2) <= expect.durationTolerance,
      `clip duration ${seconds}s within ${expect.durationTolerance} of 2s (frame-grid quantization declared)`,
    );
  }
}

describe("OTIO round-trip per adapter (cut scenario)", () => {
  for (const testCase of CUT_CASES) {
    test(`${testCase.editorId}: open → cut → exportOtio invariants`, async () => {
      const workspace = await makeWorkspace();
      try {
        const adapter = createEditorAdapter(testCase.editorId, workspace.ctx);
        await cutRoundTrip(adapter, workspace, testCase.expect);
      } finally {
        await workspace.cleanup();
      }
    });
  }
});

describe("OTIO cross-editor exchange (the cooperation spine)", () => {
  test("ffmpeg export imports into mlt and kdenlive with the same clip range", async () => {
    const workspace = await makeWorkspace();
    try {
      const artifactId = await ingestAsset(workspace.ctx.artifacts, SYNTHETIC_ASSET);
      const ffmpeg = createEditorAdapter("ffmpeg", workspace.ctx);
      const handle = await ffmpeg.open(artifactId);
      const cut = await ffmpeg.apply(handle, {
        capabilityId: "editor.cut-video",
        params: { clipIndex: 0, start: 1, end: 3, mode: "reencode" },
        idempotencyKey: "exchange-1",
      });
      const otioJson = await ffmpeg.exportOtio(cut);
      // Same content → same artifact id (content addressing) — re-register and import.
      const timelineArtifact = await workspace.ctx.artifacts.put(otioJson, "application/otio", {
        producedBy: { capabilityId: "editor.cut-video", executionAdapter: "ffmpeg-cli", executionId: "exchange-1" },
      });
      for (const editorId of ["mlt", "kdenlive", "blender", "natron", "losslesscut"] as const) {
        const target = createEditorAdapter(editorId, workspace.ctx);
        const imported = await target.importOtio(timelineArtifact.artifactId);
        assert.ok(imported.handleId.startsWith(`h.${editorId}.`), `handle belongs to ${editorId}`);
        const reExported = await target.exportOtio(imported);
        const reparsed = parseOtio(reExported);
        assert.ok(reparsed.ok, `${editorId} re-export is valid OTIO`);
        if (!reparsed.ok) continue;
        const clips = reparsed.timeline.tracks.children.flatMap((track) => track.children.filter((item) => item.OTIO_SCHEMA === "Clip.1"));
        assert.equal(clips.length, 1, `${editorId} preserved the clip count`);
        const seconds = clips[0]?.source_range.duration.value ?? 0;
        assert.ok(Math.abs(seconds - 2) <= 0.05, `${editorId} preserved the cut duration (got ${seconds}s)`);
      }
    } finally {
      await workspace.cleanup();
    }
  });

  test("composite: mlt composites a layer and kdenlive imports the projection", async () => {
    const workspace = await makeWorkspace();
    try {
      const baseId = await ingestAsset(workspace.ctx.artifacts, SYNTHETIC_ASSET);
      const layerId = await ingestAsset(workspace.ctx.artifacts, SYNTHETIC_LAYER);
      const mlt = createEditorAdapter("mlt", workspace.ctx);
      const handle = await mlt.open(baseId);
      const composited = await mlt.apply(handle, {
        capabilityId: "editor.composite-layer",
        params: { layerArtifactRef: layerId, trackIndex: 1, opacity: 0.5 },
        idempotencyKey: "composite-1",
      });
      const otioJson = await mlt.exportOtio(composited);
      const parsed = parseOtio(otioJson);
      assert.ok(parsed.ok);
      if (!parsed.ok) return;
      const videoTracks = parsed.timeline.tracks.children.filter((track) => track.kind === "Video");
      assert.equal(videoTracks.length, 2, "composite produced a second video track");
      const timelineArtifact = await workspace.ctx.artifacts.put(otioJson, "application/otio", {
        producedBy: { capabilityId: "editor.composite-layer", executionAdapter: "mlt-melt-cli", executionId: "composite-1" },
      });
      const kdenlive = createEditorAdapter("kdenlive", workspace.ctx);
      const imported = await kdenlive.importOtio(timelineArtifact.artifactId);
      const kdenliveJson = await kdenlive.exportOtio(imported);
      const reparsed = parseOtio(kdenliveJson);
      assert.ok(reparsed.ok);
      if (!reparsed.ok) return;
      const kdenliveTracks = reparsed.timeline.tracks.children.filter((track) => track.kind === "Video");
      assert.equal(kdenliveTracks.length, 2, "kdenlive preserved the composite track structure");
    } finally {
      await workspace.cleanup();
    }
  });

  test("animation: blender curve survives export and re-import", async () => {
    const workspace = await makeWorkspace();
    try {
      const artifactId = await ingestAsset(workspace.ctx.artifacts, SYNTHETIC_ASSET);
      const blender = createEditorAdapter("blender", workspace.ctx);
      const handle = await blender.open(artifactId);
      const animated = await blender.apply(handle, {
        capabilityId: "editor.create-animation",
        params: { property: "opacity", keyframes: "0=0;1=1;2=0", interpolation: "linear", target: "clip-0" },
        idempotencyKey: "anim-1",
      });
      const otioJson = await blender.exportOtio(animated);
      const parsed = parseOtio(otioJson);
      assert.ok(parsed.ok);
      if (!parsed.ok) return;
      const gen = parsed.timeline.metadata?.gen as { animationCurves?: { keys: unknown[]; property: string }[] } | undefined;
      const curves = gen?.animationCurves ?? [];
      assert.equal(curves.length, 1, "curve exported in OTIO gen metadata");
      assert.equal(curves[0]?.property, "opacity");
      assert.equal(curves[0]?.keys.length, 3);
      const timelineArtifact = await workspace.ctx.artifacts.put(otioJson, "application/otio", {
        producedBy: { capabilityId: "editor.create-animation", executionAdapter: "blender-headless-python", executionId: "anim-1" },
      });
      const reimported = await blender.importOtio(timelineArtifact.artifactId);
      const reExported = await blender.exportOtio(reimported);
      const reparsed = parseOtio(reExported);
      assert.ok(reparsed.ok);
      if (!reparsed.ok) return;
      const reGen = reparsed.timeline.metadata?.gen as { animationCurves?: { keys: unknown[] }[] } | undefined;
      assert.equal(reGen?.animationCurves?.length, 1, "curve survived the round-trip");
    } finally {
      await workspace.cleanup();
    }
  });
});
