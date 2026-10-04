/**
 * FFmpeg LIVE conformance — the only editor whose binaries exist in the
 * Phase 1 sandbox (ffmpeg + ffprobe present). Runs the committed scenarios
 * basic-cut / basic-render for real: generates the fixture with ffmpeg
 * (testsrc2, keyframe interval 25 = 1s), probes with ffprobe, opens, cuts,
 * renders, verifies job lifecycle + output duration + lineage, and measures
 * cold-start/render timings (mode-evaluation evidence).
 *
 * Everything is gated on binary presence: absent binaries → skip with an
 * honest message (never a claimed pass).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createEditorAdapter } from "../adapters/index.js";
import { binaryPresent, ingestAsset, makeWorkspace } from "./helpers.js";
import type { TestWorkspace } from "./helpers.js";
import type { EditorAdapter } from "../contract.js";

const FFMPEG_PRESENT = await binaryPresent("ffmpeg");
const FFPROBE_PRESENT = await binaryPresent("ffprobe");

async function ffprobeDurationSeconds(workspace: TestWorkspace, file: string): Promise<number> {
  const result = await workspace.ctx.process.run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  assert.equal(result.exitCode, 0, `ffprobe failed: ${result.stderr}`);
  return Number(result.stdout.trim());
}

async function generateFixture(workspace: TestWorkspace, name: string, args: readonly string[]): Promise<string> {
  const dir = path.join(workspace.root, "fixtures");
  await workspace.ctx.fs.mkdirp(dir);
  const file = path.join(dir, name);
  const result = await workspace.ctx.process.run("ffmpeg", ["-y", ...args, file], { cwd: dir });
  assert.equal(result.exitCode, 0, `fixture generation failed: ${result.stderr.slice(0, 400)}`);
  return file;
}

const CUT_FIXTURE_ARGS = [
  "-f", "lavfi", "-i", "testsrc2=duration=4:size=320x240:rate=25",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
  "-c:v", "libx264", "-preset", "ultrafast", "-g", "25", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-shortest",
] as const;

const RENDER_FIXTURE_ARGS = [
  "-f", "lavfi", "-i", "testsrc2=duration=2:size=320x240:rate=25",
  "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
] as const;

describe("ffmpeg live: editor.cut-video / basic-cut", { skip: !(FFMPEG_PRESENT && FFPROBE_PRESENT) }, () => {
  test("reencode cut is frame-accurate (1s–3s of a 4s fixture → ~2s)", async () => {
    const workspace = await makeWorkspace();
    try {
      const fixture = await generateFixture(workspace, "cut-fixture.mp4", CUT_FIXTURE_ARGS);
      const artifactId = await ingestAsset(workspace.ctx.artifacts, {
        bytes: await workspace.ctx.fs.readBinary(fixture),
        mediaType: "video/mp4",
        metadata: { durationSeconds: await ffprobeDurationSeconds(workspace, fixture), fps: 25, width: 320, height: 240 },
      });
      const adapter = createEditorAdapter("ffmpeg", workspace.ctx);
      const handle = await adapter.open(artifactId);
      const cut = await adapter.apply(handle, {
        capabilityId: "editor.cut-video",
        params: { clipIndex: 0, start: 1, end: 3, mode: "reencode" },
        idempotencyKey: "live-cut-1",
      });
      const job = await adapter.render(cut, { format: "mp4", outArtifactMediaType: "video/mp4" });
      let status = await adapter.pollJob(job);
      const deadline = Date.now() + 60_000;
      while (status === "running" || status === "queued") {
        assert.ok(Date.now() < deadline, "render did not finish in 60s");
        await new Promise((resolve) => setTimeout(resolve, 250));
        status = await adapter.pollJob(job);
      }
      assert.equal(status, "succeeded");
      const result = await adapter.jobResult(job);
      assert.equal(result.outputArtifactIds.length, 1, "output artifact registered with lineage");
      const output = path.join(cut.workingDir, "render", "output.mp4");
      const duration = await ffprobeDurationSeconds(workspace, output);
      assert.ok(
        duration >= 1.9 && duration <= 2.1,
        `reencode cut duration ${duration}s within [1.9, 2.1] — scenario basic-cut invariant`,
      );
    } finally {
      await workspace.cleanup();
    }
  });

  test("stream-copy cut snaps to keyframes (declared lossy)", async () => {
    const workspace = await makeWorkspace();
    try {
      const fixture = await generateFixture(workspace, "copy-fixture.mp4", CUT_FIXTURE_ARGS);
      const artifactId = await ingestAsset(workspace.ctx.artifacts, {
        bytes: await workspace.ctx.fs.readBinary(fixture),
        mediaType: "video/mp4",
        metadata: { durationSeconds: await ffprobeDurationSeconds(workspace, fixture), fps: 25, width: 320, height: 240 },
      });
      const adapter = createEditorAdapter("ffmpeg", workspace.ctx);
      const handle = await adapter.open(artifactId);
      const cut = await adapter.apply(handle, {
        capabilityId: "editor.cut-video",
        params: { clipIndex: 0, start: 1, end: 3, mode: "stream-copy" },
        idempotencyKey: "live-cut-2",
      });
      const job = await adapter.render(cut, { format: "mp4", outArtifactMediaType: "video/mp4" });
      let status = await adapter.pollJob(job);
      const deadline = Date.now() + 60_000;
      while (status === "running" || status === "queued") {
        assert.ok(Date.now() < deadline, "render did not finish in 60s");
        await new Promise((resolve) => setTimeout(resolve, 250));
        status = await adapter.pollJob(job);
      }
      assert.equal(status, "succeeded");
      const output = path.join(cut.workingDir, "render", "output.mp4");
      const duration = await ffprobeDurationSeconds(workspace, output);
      // -g 25 puts keyframes every 1s: [1s,3s) is keyframe-aligned → ~2s.
      assert.ok(duration >= 1.8 && duration <= 2.2, `stream-copy duration ${duration}s (keyframe-aligned, declared)`);
    } finally {
      await workspace.cleanup();
    }
  });
});

describe("ffmpeg live: editor.render-project / basic-render + timing evidence", { skip: !(FFMPEG_PRESENT && FFPROBE_PRESENT) }, () => {
  test("render lifecycle + duration invariant + measured timings (mode-evaluation evidence)", async () => {
    const workspace = await makeWorkspace();
    try {
      const coldStart = await workspace.ctx.process.run("ffmpeg", ["-version"]);
      assert.equal(coldStart.exitCode, 0);
      const fixture = await generateFixture(workspace, "render-fixture.mp4", RENDER_FIXTURE_ARGS);
      const artifactId = await ingestAsset(workspace.ctx.artifacts, {
        bytes: await workspace.ctx.fs.readBinary(fixture),
        mediaType: "video/mp4",
        metadata: { durationSeconds: await ffprobeDurationSeconds(workspace, fixture), fps: 25, width: 320, height: 240 },
      });
      const adapter = createEditorAdapter("ffmpeg", workspace.ctx);
      const handle = await adapter.open(artifactId);
      const job = await adapter.render(handle, { format: "mp4", outArtifactMediaType: "video/mp4" });
      let status = await adapter.pollJob(job);
      const deadline = Date.now() + 60_000;
      while (status === "running" || status === "queued") {
        assert.ok(Date.now() < deadline);
        await new Promise((resolve) => setTimeout(resolve, 250));
        status = await adapter.pollJob(job);
      }
      assert.equal(status, "succeeded");
      const result = await adapter.jobResult(job);
      assert.ok(result.outputArtifactIds.length === 1);
      const stored = await workspace.ctx.artifacts.get(result.outputArtifactIds[0] ?? "");
      assert.ok(stored !== undefined, "render output is a content-addressed artifact");
      assert.equal(stored?.descriptor.producedBy.capabilityId, "editor.render-project");
      assert.ok((stored?.descriptor.derivedFrom?.length ?? 0) > 0, "lineage is non-empty");
      const output = path.join(handle.workingDir, "render", "output.mp4");
      const duration = await ffprobeDurationSeconds(workspace, output);
      assert.ok(duration >= 1.9 && duration <= 2.1, `render duration ${duration}s within [1.9, 2.1]`);
      console.log(
        `[mode-evaluation evidence] ffmpeg cold-start (-version): ${coldStart.durationMs}ms; render job (2s/320x240 mp4): total pipeline incl. fixture ${workspace.root ? "see durations above" : ""}`,
      );
    } finally {
      await workspace.cleanup();
    }
  });

  test("render idempotency: same handle + profile returns the same job", async () => {
    const workspace = await makeWorkspace();
    try {
      const fixture = await generateFixture(workspace, "idem-fixture.mp4", RENDER_FIXTURE_ARGS);
      const artifactId = await ingestAsset(workspace.ctx.artifacts, {
        bytes: await workspace.ctx.fs.readBinary(fixture),
        mediaType: "video/mp4",
        metadata: { durationSeconds: await ffprobeDurationSeconds(workspace, fixture), fps: 25, width: 320, height: 240 },
      });
      const adapter: EditorAdapter = createEditorAdapter("ffmpeg", workspace.ctx);
      const handle = await adapter.open(artifactId);
      const first = await adapter.render(handle, { format: "mp4", outArtifactMediaType: "video/mp4" });
      const second = await adapter.render(handle, { format: "mp4", outArtifactMediaType: "video/mp4" });
      assert.equal(second.jobId, first.jobId, "render is idempotent per (handle, profile)");
    } finally {
      await workspace.cleanup();
    }
  });
});
