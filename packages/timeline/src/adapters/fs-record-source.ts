/**
 * timeline adapters — filesystem record source.
 *
 * Loads git-tracked artifact record JSON files (adapters layer is the only
 * place graph loading touches the filesystem — pattern per
 * @gen/media-capabilities fs-descriptor-source).
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RawArtifactRecordSource } from "../domain/graph/store.js";
import type { ArtifactRecordSource } from "../app/ports.js";

function packageSrcRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/adapters/ → src (works from src and from dist).
  return join(here, "..");
}

/** Git-tracked launch graph records (src/domain/graph/records — data, not code). */
export function defaultRecordsDir(): string {
  return join(packageSrcRoot(), "domain", "graph", "records");
}

/** Git-tracked launch examples (src/domain/examples — the showcase trio + children). */
export function defaultExamplesDir(): string {
  return join(packageSrcRoot(), "domain", "examples");
}

async function listJsonFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(dir, entry.name))
    .sort();
}

export class FsArtifactRecordSource implements ArtifactRecordSource {
  readonly #dir: string;

  constructor(dir: string = defaultRecordsDir()) {
    this.#dir = dir;
  }

  async load(): Promise<RawArtifactRecordSource> {
    const files = await listJsonFiles(this.#dir);
    const records: { source: string; data: unknown }[] = [];
    for (const file of files) {
      const raw = await readFile(file, "utf8");
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch (error) {
        throw new Error(`invalid JSON in artifact record file ${file}: ${(error as Error).message}`);
      }
      records.push({ source: file, data });
    }
    return records;
  }
}
