/**
 * Filesystem gap store (work order C9): git-tracked gap reports under
 * src/domain/gaps/ (append-oriented: new gaps append files, each file holds
 * the gap's current state) + transitions.jsonl — the append-only audit log.
 * Synchronous writes: the store port is sync, and evidence must never be lost
 * to an unawaited promise on process exit.
 */
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CapabilityGapReport, GapStore } from "../contract.js";
import { CapabilityGapReportSchema } from "../domain/schema/capability-gap.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Default store: the committed gap directory inside this package. */
export function createFsGapStore(gapsDir = join(packageRoot, "src", "domain", "gaps")): GapStore {
  const byId = new Map<string, CapabilityGapReport>();
  const transitionsPath = join(gapsDir, "transitions.jsonl");
  return {
    save: (report) => {
      const parsed = CapabilityGapReportSchema.safeParse(report);
      if (!parsed.success) {
        throw new Error(
          `gap ${report.gapId}: refusing to persist a schema-invalid report: ${parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ")}`,
        );
      }
      byId.set(parsed.data.gapId, parsed.data);
      mkdirSync(gapsDir, { recursive: true });
      writeFileSync(
        join(gapsDir, `${parsed.data.gapId}.json`),
        `${JSON.stringify(parsed.data, null, 2)}\n`,
        "utf8",
      );
    },
    get: (gapId) => byId.get(gapId),
    list: () => [...byId.values()].sort((a, b) => a.gapId.localeCompare(b.gapId)),
    appendTransition: (entry) => {
      mkdirSync(gapsDir, { recursive: true });
      appendFileSync(transitionsPath, `${JSON.stringify(entry)}\n`, "utf8");
    },
  };
}

/** Load a committed gap report (schema-validated). */
export function readGapReport(path: string): CapabilityGapReport {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const parsed = CapabilityGapReportSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `gap report ${path}: schema violation: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

/** Load the append-only transition log (missing file → empty). */
export function readTransitionLog(gapsDir = join(packageRoot, "src", "domain", "gaps")): unknown[] {
  const path = join(gapsDir, "transitions.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as unknown);
}
