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
