/**
 * Spec-example loading helper (repo-root-relative). The committed examples use
 * JSON null as an "absent" marker — strip nulls before zod parsing so the
 * SCHEMAS stay the source of truth (same convention as agent-lab's helper).
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// test/helpers/ → apps/creative-workspace/test/helpers: up 4 levels reaches the repo root.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== null)
        .map(([key, entry]) => [key, stripNulls(entry)]),
    );
  }
  return value;
}

export async function readJson(...segments: string[]): Promise<unknown> {
  return JSON.parse(await readFile(join(repoRoot, ...segments), "utf8")) as unknown;
}

export async function specExample(name: string): Promise<Record<string, unknown>> {
  return stripNulls(await readJson("spec", "examples", name)) as Record<string, unknown>;
}

export const repoRootPath = repoRoot;
