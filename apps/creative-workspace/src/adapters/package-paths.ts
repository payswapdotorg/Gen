/**
 * Package-path resolution for the filesystem record source: locate the
 * sibling @gen/* packages through their DECLARED dependencies
 * (import.meta.resolve over the workspace links — never hardcoded layout),
 * with a module-relative fallback, and repo-relative provenance strings.
 */
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Resolve a @gen/* workspace package root via its public entrypoint. */
export function packageRoot(packageName: string): string {
  try {
    const entry = fileURLToPath(import.meta.resolve(packageName));
    // <root>/src/index.ts → package root
    const root = resolve(dirname(entry), "..", "..");
    if (existsSync(join(root, "package.json"))) return root;
  } catch {
    // fall through to the layout fallback below
  }
  // Fallback: this module lives at apps/creative-workspace/src{,/dist}/adapters —
  // the monorepo root is four levels up; packages live under packages/<name>.
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = resolve(here, "..", "..", "..", "..");
  const name = packageName.replace(/^@gen\//, "");
  return join(repoRoot, "packages", name);
}

/** Repo root (derived from @gen/agent-lab's package root). */
export function repoRoot(): string {
  return resolve(packageRoot("@gen/agent-lab"), "..", "..");
}

/** Absolute path → repo-relative POSIX string (provenance + source paths). */
export function toRepoRelative(absolutePath: string): string {
  return relative(repoRoot(), absolutePath).split(sep).join("/");
}
