/**
 * Binary-gated LIVE scenarios for the editors whose binaries are ABSENT in
 * the Phase 1 sandbox (melt, blender, NatronRenderer, kdenlive_render —
 * verified absent at implementation time). Each block self-skips when the
 * binary is missing and RUNS when present, so the same committed scenario
 * executes at the integration station where binaries exist. Skips are the
 * honest outcome required by the work order (§3 environment note) — no
 * claimed passes.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createEditorAdapter } from "../adapters/index.js";
import { binariesPresent, binaryPresent, ingestAsset, makeWorkspace } from "./helpers.js";
import type { TestWorkspace } from "./helpers.js";
import type { EditorAdapter, EditorJobHandle } from "../contract.js";

const FIXTURE_ARGS = [
  "-f", "lavfi", "-i", "testsrc2=duration=2:size=320x240:rate=25",
  "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
] as const;

async function ensureFixture(workspace: TestWorkspace, name: string): Promise<string> {
  const dir = path.join(workspace.root, "fixtures");
  await workspace.ctx.fs.mkdirp(dir);
  const file = path.join(dir, name);
  if (await binaryPresent("ffmpeg")) {
    const result = await workspace.ctx.process.run("ffmpeg", ["-y", ...FIXTURE_ARGS, file]);
    assert.equal(result.exitCode, 0, result.stderr.slice(0, 300));
    return file;
  }
  // No ffmpeg at all: synthetic bytes still exercise the full pipeline minus decode.
  await workspace.ctx.fs.writeFile(file, "synthetic");
  return file;
}

async function ingestFixture(workspace: TestWorkspace, name: string): Promise<string> {
  const fixture = await ensureFixture(workspace, name);
  return ingestAsset(workspace.ctx.artifacts, {
    bytes: await workspace.ctx.fs.readBinary(fixture),
    mediaType: "video/mp4",
    metadata: { durationSeconds: 2, fps: 25, width: 320, height: 240 },
  });
}

async function pollToTerminal(adapter: EditorAdapter, job: EditorJobHandle): Promise<string> {
  let status = await adapter.pollJob(job);
  const deadline = Date.now() + 120_000;
  while (status === "running" || status === "queued") {
    assert.ok(Date.now() < deadline, "render did not finish in 120s");
    await new Promise((resolve) => setTimeout(resolve, 500));
    status = await adapter.pollJob(job);
  }
  return status;
}

describe("mlt live: editor.render-project (melt avformat consumer)", { skip: !(await binariesPresent(["melt"])) }, () => {
  test("melt renders the generated project to mp4", async () => {
    const workspace = await makeWorkspace();
    try {
      const artifactId = await ingestFixture(workspace, "mlt-fixture.mp4");
      const adapter = createEditorAdapter("mlt", workspace.ctx);
      const handle = await adapter.open(artifactId);
      const job = await adapter.render(handle, { format: "mp4", outArtifactMediaType: "video/mp4" });
      const status = await pollToTerminal(adapter, job);
      assert.equal(status, "succeeded");
      const result = await adapter.jobResult(job);
      assert.equal(result.outputArtifactIds.length, 1);
    } finally {
      await workspace.cleanup();
    }
  });
});

describe("blender live: editor.render-project (headless python)", { skip: !(await binariesPresent(["blender"])) }, () => {
  test("blender --background --python renders the VSE project", async () => {
    const workspace = await makeWorkspace();
    try {
      const artifactId = await ingestFixture(workspace, "blender-fixture.mp4");
      const adapter = createEditorAdapter("blender", workspace.ctx);
      const handle = await adapter.open(artifactId);
      const job = await adapter.render(handle, { format: "mp4", outArtifactMediaType: "video/mp4" });
      const status = await pollToTerminal(adapter, job);
      assert.equal(status, "succeeded");
    } finally {
      await workspace.cleanup();
    }
  });
});

describe("blender live: editor.render-project png-sequence (##### pattern)", { skip: !(await binariesPresent(["blender"])) }, () => {
  test("blender writes the declared frame files and the render registers the artifact", async () => {
    const workspace = await makeWorkspace();
    try {
      const artifactId = await ingestFixture(workspace, "blender-png-fixture.mp4");
      const adapter = createEditorAdapter("blender", workspace.ctx);
      const handle = await adapter.open(artifactId);
      // Plan: outputRelativePath is the PNG sequence declaration (first frame
      // "render/frame00001.png"); the ##### filepath pattern makes Blender emit
      // frame00001.png, frame00002.png, … — this locks the W12 sequence fix.
      const job = await adapter.render(handle, { format: "png-sequence", outArtifactMediaType: "image/png" });
      const status = await pollToTerminal(adapter, job);
      assert.equal(status, "succeeded");
      const result = await adapter.jobResult(job);
      assert.equal(result.outputArtifactIds.length, 1, "png-sequence render must register its output artifact");
      for (const frame of ["frame00001.png", "frame00002.png"]) {
        const framePath = workspace.ctx.fs.join(handle.workingDir, "render", frame);
        assert.ok(await workspace.ctx.fs.exists(framePath), `declared frame file missing: ${frame}`);
      }
      const firstFrame = await workspace.ctx.fs.readBinary(workspace.ctx.fs.join(handle.workingDir, "render", "frame00001.png"));
      assert.ok(firstFrame.length >= 4, "frame00001.png is truncated");
      assert.deepEqual(Array.from(firstFrame.slice(0, 4)), [0x89, 0x50, 0x4e, 0x47], "frame00001.png must carry the PNG magic header");
    } finally {
      await workspace.cleanup();
    }
  });
});

describe("natron live: editor.composite-layer (NatronRenderer script)", { skip: !(await binariesPresent(["NatronRenderer", "natron"])) }, () => {
  test("NatronRenderer executes the generated composite script", async () => {
    const workspace = await makeWorkspace();
    try {
      const artifactId = await ingestFixture(workspace, "natron-fixture.mp4");
      const adapter = createEditorAdapter("natron", workspace.ctx);
      const handle = await adapter.open(artifactId);
      const job = await adapter.render(handle, { format: "mp4", outArtifactMediaType: "video/mp4" });
      const status = await pollToTerminal(adapter, job);
      assert.equal(status, "succeeded");
    } finally {
      await workspace.cleanup();
    }
  });
});

describe("natron live: WriteFFmpeg codec/format selection from the render spec", { skip: !(await binariesPresent(["NatronRenderer", "natron"])) }, () => {
  test("render spec { format: mp4, codec: mpeg4 } selects the container + codec (ffprobe-verified)", async () => {
    const workspace = await makeWorkspace();
    try {
      const artifactId = await ingestFixture(workspace, "natron-codec-fixture.mp4");
      const adapter = createEditorAdapter("natron", workspace.ctx);
      const handle = await adapter.open(artifactId);
      // WriteFFmpeg (2.4.4, live-probed param surface) exposes Choice params
      // `format` (default/avi/flv/matroska/mov/mp4/…) and `codec`
      // (…/mpeg4/libx264/…); the generated script maps the option NAME to its
      // index via getOptions(). This scenario asserts the selection landed in
      // the encoded bytes, not just in the script.
      const job = await adapter.render(handle, { format: "mp4", codec: "mpeg4", outArtifactMediaType: "video/mp4" });
      const status = await pollToTerminal(adapter, job);
      assert.equal(status, "succeeded");
      const output = workspace.ctx.fs.join(handle.workingDir, "render", "output.mp4");
      const probe = await workspace.ctx.process.run("ffprobe", [
        "-v", "error",
        "-show_entries", "stream=codec_name:format=format_name",
        "-of", "json",
        output,
      ]);
      assert.equal(probe.exitCode, 0, probe.stderr.slice(0, 300));
      const parsed = JSON.parse(probe.stdout) as { streams?: { codec_name?: string }[]; format?: { format_name?: string } };
      const video = parsed.streams?.find((stream) => stream.codec_name !== undefined);
      assert.equal(video?.codec_name, "mpeg4", `encoded codec must match the selected WriteFFmpeg codec (got ${video?.codec_name ?? "none"})`);
      const containers = (parsed.format?.format_name ?? "").split(",");
      assert.ok(containers.includes("mp4"), `container must match the selected WriteFFmpeg format (got ${parsed.format?.format_name ?? "none"})`);
      const result = await adapter.jobResult(job);
      assert.equal(result.outputArtifactIds.length, 1, "codec-selection render must register its output artifact");
    } finally {
      await workspace.cleanup();
    }
  });
});

describe("kdenlive live: editor.render-project (melt over kdenlive XML)", { skip: !(await binariesPresent(["kdenlive_render", "melt"])) }, () => {
  test("kdenlive project renders to mp4", async () => {
    const workspace = await makeWorkspace();
    try {
      const artifactId = await ingestFixture(workspace, "kdenlive-fixture.mp4");
      const adapter = createEditorAdapter("kdenlive", workspace.ctx);
      const handle = await adapter.open(artifactId);
      const job = await adapter.render(handle, { format: "mp4", outArtifactMediaType: "video/mp4" });
      const status = await pollToTerminal(adapter, job);
      assert.equal(status, "succeeded");
      const result = await adapter.jobResult(job);
      assert.equal(result.outputArtifactIds.length, 1);
    } finally {
      await workspace.cleanup();
    }
  });
});

describe("skipped-scenario record (honest numbers)", () => {
  test("binary presence snapshot at run time", async () => {
    const snapshot = {
      ffmpeg: await binaryPresent("ffmpeg"),
      ffprobe: await binaryPresent("ffprobe"),
      melt: await binaryPresent("melt"),
      blender: await binaryPresent("blender"),
      natron: await binaryPresent("natron") || (await binaryPresent("NatronRenderer")),
      kdenlive: await binaryPresent("kdenlive_render") || (await binaryPresent("melt")),
      losslesscut: false,
    };
    console.log(`[binary presence] ${JSON.stringify(snapshot)}`);
    assert.ok(typeof snapshot.ffmpeg === "boolean");
  });
});
