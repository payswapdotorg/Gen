/**
 * editor-adapters tests — shared helpers.
 *
 * Builds real adapter contexts over temp directories with the Node ports
 * (the adapters layer is exercised; fakes would hide contract bugs). Live
 * binary checks use the same NodeBinaryProbe the adapters use.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createNodeAdapterContext } from "../adapters/node-ports.js";
import type { EditorAdapterContext } from "../app/ports.js";
import type { ArtifactStorePort } from "../app/ports.js";
import { NodeBinaryProbe } from "../adapters/node-ports.js";

export interface TestWorkspace {
  readonly ctx: EditorAdapterContext;
  readonly root: string;
  cleanup: () => Promise<void>;
}

export async function makeWorkspace(): Promise<TestWorkspace> {
  const root = await mkdtemp(path.join(tmpdir(), "gen-editor-adapters-"));
  const ctx = createNodeAdapterContext(root);
  return {
    ctx,
    root,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}

export const SYNTHETIC_ASSET = {
  bytes: new TextEncoder().encode("synthetic-mp4-bytes-not-decodable-but-content-addressed"),
  mediaType: "video/mp4",
  metadata: { durationSeconds: 4, fps: 25, width: 320, height: 240 },
} as const;

export const SYNTHETIC_LAYER = {
  bytes: new TextEncoder().encode("synthetic-layer-mp4-bytes"),
  mediaType: "video/mp4",
  metadata: { durationSeconds: 1, fps: 25, width: 160, height: 120 },
} as const;

export async function ingestAsset(
  store: ArtifactStorePort,
  asset: { bytes: Uint8Array; mediaType: string; metadata: Record<string, unknown> },
): Promise<string> {
  const descriptor = await store.putBinary(asset.bytes, asset.mediaType, {
    producedBy: { capabilityId: "editor.render-project", executionAdapter: "fixture-harness", executionId: "fixture" },
    metadata: asset.metadata,
  });
  return descriptor.artifactId;
}

export async function binaryPresent(name: string): Promise<boolean> {
  const probe = new NodeBinaryProbe();
  return probe.hasBinary(name);
}

export async function binariesPresent(names: readonly string[]): Promise<boolean> {
  for (const name of names) {
    if (await binaryPresent(name)) return true;
  }
  return false;
}
