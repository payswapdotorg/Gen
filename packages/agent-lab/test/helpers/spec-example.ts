/**
 * Spec-example loading helper. The committed examples use JSON null as an
 * "absent" marker (the JSON Schemas declare optional properties, not nullable
 * ones) — strip nulls before zod parsing so the SCHEMAS stay the source of
 * truth for parity checks.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// test/helpers/ → agent-lab/test/helpers: up 4 levels reaches the repo root.
const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "..",
);

export function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, stripNulls(v)]),
    );
  }
  return value;
}

export async function specExample(name: string): Promise<Record<string, unknown>> {
  const raw = JSON.parse(await readFile(join(repoRoot, "spec", "examples", name), "utf8")) as unknown;
  return stripNulls(raw) as Record<string, unknown>;
}

export async function readJson(...segments: string[]): Promise<unknown> {
  return JSON.parse(await readFile(join(repoRoot, ...segments), "utf8")) as unknown;
}

export const repoRootPath = repoRoot;
