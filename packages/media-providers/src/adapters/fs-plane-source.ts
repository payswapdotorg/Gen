/**
 * Filesystem ProviderPlaneSource: loads provider descriptors, capability
 * descriptors (canonical data in @gen/media-capabilities, read-only),
 * scenario fixtures, recorded fixture sets and committed evaluation records
 * from their repo locations.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProviderPlaneSource } from "../app/ports.js";
import { capabilityDescriptorSchema } from "@gen/media-capabilities";

function here(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/** packages/media-providers/src/adapters → repo root. */
export function repoRoot(): string {
  return join(here(), "..", "..", "..", "..");
}

async function readJsonFiles(dir: string): Promise<{ source: string; data: unknown }[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(dir, entry.name))
    .sort();
  const records: { source: string; data: unknown }[] = [];
  for (const file of files) {
    records.push({ source: file, data: JSON.parse(await readFile(file, "utf8")) });
  }
  return records;
}

export class FsProviderPlaneSource implements ProviderPlaneSource {
  readonly #root: string;

  constructor(root: string = repoRoot()) {
    this.#root = root;
  }

  async loadProviders(): Promise<readonly { source: string; data: unknown }[]> {
    return readJsonFiles(join(this.#root, "packages", "media-providers", "src", "domain", "providers"));
  }

  async listCapabilityIds(): Promise<readonly string[]> {
    const dir = join(this.#root, "packages", "media-capabilities", "src", "domain", "registry");
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.replace(/\.json$/, ""))
      .sort();
  }

  async loadCapabilityDescriptor(capabilityId: string): Promise<unknown> {
    const path = join(
      this.#root,
      "packages",
      "media-capabilities",
      "src",
      "domain",
      "registry",
      `${capabilityId}.json`,
    );
    return JSON.parse(await readFile(path, "utf8"));
  }

  async loadScenario(capabilityId: string, scenarioId: string): Promise<unknown> {
    const descriptor = capabilityDescriptorSchema.parse(await this.loadCapabilityDescriptor(capabilityId));
    const ref = descriptor.conformance.scenarios.find((item) => item.id === scenarioId);
    if (ref === undefined) {
      throw new Error(`capability ${capabilityId} has no scenario "${scenarioId}"`);
    }
    return JSON.parse(await readFile(join(this.#root, ref.path), "utf8"));
  }

  async loadFixtures(capabilityId: string, scenarioId: string): Promise<readonly { source: string; data: unknown }[]> {
    return readJsonFiles(
      join(this.#root, "packages", "media-providers", "src", "domain", "conformance", capabilityId, scenarioId),
    );
  }

  async loadEvaluations(): Promise<readonly { source: string; data: unknown }[]> {
    return readJsonFiles(join(this.#root, "packages", "media-providers", "src", "domain", "evaluations"));
  }
}

/** Writes evaluation records next to the committed fixtures. */
export class FsEvaluationRecordSink {
  readonly #root: string;

  constructor(root: string = repoRoot()) {
    this.#root = root;
  }

  async write(record: import("../contract.js").EvaluationRecord): Promise<string> {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const dir = join(this.#root, "packages", "media-providers", "src", "domain", "evaluations");
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${record.evaluationId}.json`);
    await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    return path;
  }
}
