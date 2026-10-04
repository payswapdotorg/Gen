/**
 * Filesystem descriptor source: loads git-tracked capability descriptor JSON
 * files from this package's registry directory (spec/capability-model.md §3).
 *
 * Adapters layer — the only place registry loading touches the filesystem.
 * Editor-plane descriptors (owned by @gen/editor-adapters) flow through the
 * same DescriptorSource port from their own loader on their side.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RawDescriptorSource } from "../domain/registry.js";
import type { DescriptorSource } from "../app/ports.js";

/** Registry data directory (src/domain/registry — git-tracked data, not code). */
export function defaultRegistryDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/adapters/ → src/domain/registry (works from src and from dist).
  return join(here, "..", "domain", "registry");
}

async function listJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(dir, entry.name))
    .sort();
}

export class FsDescriptorSource implements DescriptorSource {
  readonly #dir: string;

  constructor(dir: string = defaultRegistryDir()) {
    this.#dir = dir;
  }

  async load(): Promise<RawDescriptorSource> {
    const files = await listJsonFiles(this.#dir);
    const records: { source: string; data: unknown }[] = [];
    for (const file of files) {
      const raw = await readFile(file, "utf8");
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch (error) {
        throw new Error(`invalid JSON in descriptor file ${file}: ${(error as Error).message}`);
      }
      records.push({ source: file, data });
    }
    return records;
  }
}
