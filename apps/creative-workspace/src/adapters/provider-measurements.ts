/**
 * Provider-measurement loading (adapter): reads the committed
 * @gen/media-providers evaluation records (schema-validated through the
 * package's public zod bindings) and maps committed catalog rows into the
 * neutral measurement rows the domain delta helpers consume.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { evaluationRecordSchema } from "@gen/media-providers";
import type { ModelCatalogEntry } from "@gen/agent-lab";
import type { ProviderMeasurementRow } from "../domain/records.js";
import { packageRoot, toRepoRelative } from "./package-paths.js";

/** The committed character-replacement comparison evaluation record. */
export const CHARACTER_REPLACEMENT_EVALUATION =
  "eval.video.character-replacement.identity-basic.v1.json";

export interface LoadedEvaluationRecord {
  readonly rows: readonly ProviderMeasurementRow[];
  readonly sourcePath: string;
}

/** Load + validate a committed media-providers evaluation record. */
export async function loadEvaluationRecord(fileName: string): Promise<LoadedEvaluationRecord> {
  const path = join(
    packageRoot("@gen/media-providers"),
    "src",
    "domain",
    "evaluations",
    fileName,
  );
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  const parsed = evaluationRecordSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `media-providers evaluation record ${fileName}: schema violation: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return {
    rows: parsed.data.rows.map((row) => ({
      providerId: row.providerId,
      ...(row.modelId !== undefined ? { modelId: row.modelId } : {}),
      normalizedQuality: row.normalizedQuality,
      costEstimate: row.cost.estimate,
      costUnit: row.cost.unit,
      latencyClass: row.latency.class,
      reliability: row.reliability,
    })),
    sourcePath: toRepoRelative(path),
  };
}

/** Map a frozen model catalog entry (committed agent-lab scenario data). */
export function catalogRow(entry: ModelCatalogEntry): ProviderMeasurementRow {
  return {
    providerId: entry.providerId,
    modelId: entry.modelId,
    ...(entry.qualityClass !== undefined ? { qualityClass: entry.qualityClass } : {}),
    ...(entry.costPerDecisionUsd !== undefined
      ? { costEstimate: entry.costPerDecisionUsd, costUnit: "per decision" }
      : {}),
    ...(entry.latencyClass !== undefined ? { latencyClass: entry.latencyClass } : {}),
  };
}

/** Find a measurement row by provider/model hint inside a path label. */
export function rowForPath(rows: readonly ProviderMeasurementRow[], path: string): ProviderMeasurementRow | undefined {
  const lower = path.toLowerCase();
  return rows.find((row) => {
    const provider = row.providerId.toLowerCase();
    const model = row.modelId?.toLowerCase();
    if (model !== undefined && lower.includes(`${provider}/${model}`)) return true;
    return lower.includes(provider);
  });
}
