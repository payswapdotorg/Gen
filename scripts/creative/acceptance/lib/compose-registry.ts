/**
 * Acceptance composition lib — the canonical registry index assembled by the
 * TL (lock §10 Phase 2): media-capabilities descriptors + editor-adapters
 * descriptors + Arena-certified contributions, all through the ONE registry
 * in @gen/media-capabilities (no second index anywhere).
 *
 * Adapters layer for the harness: fs reads live here, domain stays pure.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CapabilityRegistry } from "../../../../packages/media-capabilities/src/domain/registry.js";
import type { RawDescriptorSource } from "../../../../packages/media-capabilities/src/domain/registry.js";

const here = dirname(fileURLToPath(import.meta.url));

/** Repo root from scripts/creative/acceptance/lib. */
export function repoRoot(): string {
  return join(here, "..", "..", "..", "..");
}

export async function readJsonDir(dir: string, label: string): Promise<RawDescriptorSource> {
  const records: { source: string; data: unknown }[] = [];
  let entries: string[] = [];
  try {
    entries = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
  } catch {
    throw new Error(`acceptance composition: cannot read ${label} dir ${dir}`);
  }
  for (const name of entries) {
    const raw = await readFile(join(dir, name), "utf8");
    records.push({ source: `${label}:${name}`, data: JSON.parse(raw) });
  }
  return records;
}

export interface ComposedRegistry {
  readonly registry: CapabilityRegistry;
  readonly view: ReturnType<CapabilityRegistry["getView"]>;
  readonly loadedFrom: readonly string[];
  readonly errors: readonly string[];
}

/**
 * Assemble the canonical index (Phase 2 TL integration):
 *   1. media-capabilities registry descriptors (W1)
 *   2. editor-adapters registry descriptors (W2 — "the INDEX is the TL's")
 *   3. (optional) Arena-certified capability contributions
 */
export async function composeRegistry(
  extras: RawDescriptorSource = [],
): Promise<ComposedRegistry> {
  const media = await readJsonDir(
    join(repoRoot(), "packages/media-capabilities/src/domain/registry"),
    "media-capabilities",
  );
  const editor = await readJsonDir(
    join(repoRoot(), "packages/editor-adapters/src/domain/registry"),
    "editor-adapters",
  );
  const registry = new CapabilityRegistry();
  const result = registry.load([...media, ...editor, ...extras]);
  return {
    registry,
    view: registry.getView(),
    loadedFrom: [...media, ...editor, ...extras].map((r) => r.source),
    errors: result.errors.map((e) => `${e.source}: ${e.message}`),
  };
}
