/**
 * Filesystem adapter for the evaluation store port + committed artifact
 * loaders (evaluation records and certified organization graphs are committed
 * under src/domain/{evaluations,organizations}/ — P6: decisions in the repo).
 * The store port is synchronous, so persistence here is synchronous too —
 * a fire-and-forget async write could be lost on process exit (lost evidence).
 */
import { readFile, readdir } from "node:fs/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { OrganizationGraph } from "../contract.js";
import type { EvaluationRecord, EvaluationStore } from "../domain/lab-api.js";
import { OrganizationGraphSchema } from "../domain/schema/organization-graph.js";

export function createFsEvaluationStore(root: string): EvaluationStore {
  const evaluationsDir = join(root, "evaluations");
  const organizationsDir = join(root, "organizations");
  const records: EvaluationRecord[] = [];
  return {
    saveEvaluation: (record) => {
      if (!records.some((entry) => entry.recordId === record.recordId)) records.push(record);
      mkdirSync(evaluationsDir, { recursive: true });
      writeFileSync(
        join(evaluationsDir, `${record.recordId}.json`),
        `${JSON.stringify(record, null, 2)}\n`,
        "utf8",
      );
    },
    saveCertifiedOrganization: (graph) => {
      mkdirSync(organizationsDir, { recursive: true });
      writeFileSync(
        join(organizationsDir, `${graph.id}.json`),
        `${JSON.stringify(graph, null, 2)}\n`,
        "utf8",
      );
    },
    listEvaluations: () => records,
  };
}

/** Load and schema-validate a committed organization graph (JSON). */
export async function readOrganizationGraphFile(path: string): Promise<OrganizationGraph> {
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  const parsed = OrganizationGraphSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `organization graph ${path}: schema violation: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

/** List committed evaluation record files under a directory. */
export async function listEvaluationRecordFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter((entry) => entry.startsWith("eval.") && entry.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

/** Load a committed evaluation record (JSON). */
export async function readEvaluationRecordFile(path: string): Promise<EvaluationRecord> {
  return JSON.parse(await readFile(path, "utf8")) as EvaluationRecord;
}
