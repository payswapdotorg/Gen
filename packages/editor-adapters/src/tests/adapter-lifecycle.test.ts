/**
 * Adapter lifecycle conformance — immutability, idempotency, capability
 * gating, honest failures (lock P5). Runs against the real adapter classes
 * over the Node ports; no editor binaries needed.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { createEditorAdapter } from "../adapters/index.js";
import { ingestAsset, makeWorkspace, SYNTHETIC_ASSET } from "./helpers.js";
import { EditorAdapterError } from "../domain/errors.js";

describe("immutable handles", () => {
  test("apply returns a NEW handle; old revision files untouched", async () => {
    const workspace = await makeWorkspace();
    try {
      const artifactId = await ingestAsset(workspace.ctx.artifacts, SYNTHETIC_ASSET);
      const adapter = createEditorAdapter("ffmpeg", workspace.ctx);
      const handle = await adapter.open(artifactId);
      const r0File = `${handle.workingDir}/project.r0.json`;
      const before = await workspace.ctx.fs.readFile(r0File);
      const applied = await adapter.apply(handle, {
        capabilityId: "editor.cut-video",
        params: { clipIndex: 0, start: 1, end: 2, mode: "reencode" },
        idempotencyKey: "imm-1",
      });
      assert.notEqual(applied.handleId, handle.handleId);
      assert.notEqual(applied.projectArtifactId, handle.projectArtifactId);
      const after = await workspace.ctx.fs.readFile(r0File);
      assert.equal(after, before, "r0 project file is immutable");
      assert.match(applied.handleId, /-imm-1$/, "handle id derives from the idempotency key");
    } finally {
      await workspace.cleanup();
    }
  });
});

describe("idempotency", () => {
  test("same key + same command replays to the same handle", async () => {
    const workspace = await makeWorkspace();
    try {
      const artifactId = await ingestAsset(workspace.ctx.artifacts, SYNTHETIC_ASSET);
      const adapter = createEditorAdapter("mlt", workspace.ctx);
      const handle = await adapter.open(artifactId);
      const command = {
        capabilityId: "editor.cut-video",
        params: { clipIndex: 0, start: 1, end: 3, mode: "reencode" },
        idempotencyKey: "idem-1",
      } as const;
      const first = await adapter.apply(handle, command);
      const second = await adapter.apply(handle, command);
      assert.equal(second.handleId, first.handleId, "replay returns the same resulting handle");
      assert.equal(second.projectArtifactId, first.projectArtifactId, "replay is content-identical");
    } finally {
      await workspace.cleanup();
    }
  });

  test("same key + different command is a validation error, not a silent overwrite", async () => {
    const workspace = await makeWorkspace();
    try {
      const artifactId = await ingestAsset(workspace.ctx.artifacts, SYNTHETIC_ASSET);
      const adapter = createEditorAdapter("mlt", workspace.ctx);
      const handle = await adapter.open(artifactId);
      await adapter.apply(handle, {
        capabilityId: "editor.cut-video",
        params: { clipIndex: 0, start: 1, end: 3, mode: "reencode" },
        idempotencyKey: "idem-conflict",
      });
      await assert.rejects(
        adapter.apply(handle, {
          capabilityId: "editor.cut-video",
          params: { clipIndex: 0, start: 0.5, end: 2, mode: "reencode" },
          idempotencyKey: "idem-conflict",
        }),
        (error: unknown) => {
          assert.ok(error instanceof EditorAdapterError);
          assert.equal(error.kind, "validation");
          assert.equal(error.code, "idempotency-conflict");
          return true;
        },
      );
    } finally {
      await workspace.cleanup();
    }
  });
});

describe("capability gating", () => {
  test("unserved capability → unsupported with the shared taxonomy", async () => {
    const workspace = await makeWorkspace();
    try {
      const artifactId = await ingestAsset(workspace.ctx.artifacts, SYNTHETIC_ASSET);
      const adapter = createEditorAdapter("ffmpeg", workspace.ctx);
      const handle = await adapter.open(artifactId);
      await assert.rejects(
        adapter.apply(handle, {
          capabilityId: "editor.create-animation",
          params: { property: "opacity", keyframes: "0=0;1=1" },
          idempotencyKey: "gate-1",
        }),
        (error: unknown) => {
          assert.ok(error instanceof EditorAdapterError);
          assert.equal(error.kind, "unsupported");
          assert.equal(error.code, "capability-not-served");
          return true;
        },
      );
    } finally {
      await workspace.cleanup();
    }
  });

  test("bad params → validation error listing precise issues", async () => {
    const workspace = await makeWorkspace();
    try {
      const artifactId = await ingestAsset(workspace.ctx.artifacts, SYNTHETIC_ASSET);
      const adapter = createEditorAdapter("ffmpeg", workspace.ctx);
      const handle = await adapter.open(artifactId);
      await assert.rejects(
        adapter.apply(handle, {
          capabilityId: "editor.cut-video",
          params: { clipIndex: -1, start: 1, end: 3 },
          idempotencyKey: "gate-2",
        }),
        (error: unknown) => {
          assert.ok(error instanceof EditorAdapterError);
          assert.equal(error.kind, "validation");
          assert.ok(error.message.includes("clipIndex"));
          return true;
        },
      );
    } finally {
      await workspace.cleanup();
    }
  });

  test("cut outside source range → validation error (no fabricated cuts)", async () => {
    const workspace = await makeWorkspace();
    try {
      const artifactId = await ingestAsset(workspace.ctx.artifacts, SYNTHETIC_ASSET);
      const adapter = createEditorAdapter("kdenlive", workspace.ctx);
      const handle = await adapter.open(artifactId);
      await assert.rejects(
        adapter.apply(handle, {
          capabilityId: "editor.cut-video",
          params: { clipIndex: 0, start: 3, end: 9, mode: "reencode" },
          idempotencyKey: "gate-3",
        }),
        (error: unknown) => {
          assert.ok(error instanceof EditorAdapterError);
          assert.equal(error.kind, "validation");
          return true;
        },
      );
    } finally {
      await workspace.cleanup();
    }
  });
});

describe("open requires probe metadata (ingestion contract)", () => {
  test("asset without durationSeconds → validation error telling ingestion to probe", async () => {
    const workspace = await makeWorkspace();
    try {
      const artifact = await workspace.ctx.artifacts.put("opaque-bytes", "video/mp4", {
        producedBy: { capabilityId: "editor.render-project", executionAdapter: "fixture-harness", executionId: "no-meta" },
      });
      const adapter = createEditorAdapter("ffmpeg", workspace.ctx);
      await assert.rejects(
        adapter.open(artifact.artifactId),
        (error: unknown) => {
          assert.ok(error instanceof EditorAdapterError);
          assert.equal(error.kind, "validation");
          assert.ok(error.message.includes("durationSeconds"));
          return true;
        },
      );
    } finally {
      await workspace.cleanup();
    }
  });
});

describe("losslesscut: honest no-render-surface failure (lock P5)", () => {
  test("render fails unsupported with the gap reference — no GUI workaround", async () => {
    const workspace = await makeWorkspace();
    try {
      const artifactId = await ingestAsset(workspace.ctx.artifacts, SYNTHETIC_ASSET);
      const adapter = createEditorAdapter("losslesscut", workspace.ctx);
      const handle = await adapter.open(artifactId);
      const applied = await adapter.apply(handle, {
        capabilityId: "editor.cut-video",
        params: { clipIndex: 0, start: 1, end: 3, mode: "stream-copy" },
        idempotencyKey: "llc-1",
      });
      assert.ok(applied.handleId.includes("llc-1"), "authoring the cut works (project JSON)");
      await assert.rejects(
        adapter.render(applied, { format: "mp4", outArtifactMediaType: "video/mp4" }),
        (error: unknown) => {
          assert.ok(error instanceof EditorAdapterError);
          assert.equal(error.kind, "unsupported");
          assert.equal(error.code, "render-surface-absent");
          assert.equal(error.gapId, "gap.losslesscut-headless-cut");
          return true;
        },
      );
    } finally {
      await workspace.cleanup();
    }
  });
});

describe("render binary gating (all non-losslesscut editors)", () => {
  for (const editorId of ["mlt", "blender", "natron", "kdenlive"] as const) {
    test(`${editorId}: absent binary → unsupported/binary-missing (never a hang)`, async () => {
      const workspace = await makeWorkspace();
      try {
        const artifactId = await ingestAsset(workspace.ctx.artifacts, SYNTHETIC_ASSET);
        const adapter = createEditorAdapter(editorId, workspace.ctx);
        const handle = await adapter.open(artifactId);
        const binaries = { mlt: ["melt"], blender: ["blender"], natron: ["NatronRenderer", "natron"], kdenlive: ["kdenlive_render", "melt"] }[editorId];
        let present = false;
        for (const binary of binaries) {
          if (await workspace.ctx.binaries.hasBinary(binary)) present = true;
        }
        if (present) {
          console.log(`[${editorId}] binary present — skipping binary-missing assertion`);
          return;
        }
        await assert.rejects(
          adapter.render(handle, { format: "mp4", outArtifactMediaType: "video/mp4" }),
          (error: unknown) => {
            assert.ok(error instanceof EditorAdapterError);
            assert.equal(error.kind, "unsupported");
            assert.equal(error.code, "binary-missing");
            return true;
          },
        );
      } finally {
        await workspace.cleanup();
      }
    });
  }
});
