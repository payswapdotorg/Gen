/**
 * Filesystem adapter for the selection-ledger store port (W14): committed
 * JSON records under src/domain/method-selection/records/ — one file per
 * record, deterministic naming (sel.<goalClass>.<method>.<digest>.json),
 * idempotent append by the deterministic identity (same goalClass+method+
 * seed+budget => one record; the first committed record wins, divergent
 * deterministic content is refused). Mirrors the fs-evaluation-store pattern:
 * synchronous writes (the port is sync; evidence must never be lost to an
 * unawaited promise on process exit), schema-validated on both write and
 * read. listSelections re-reads the committed directory so the learned
 * policy observes appends from this or earlier runs (the flywheel).
 */
import { readFile, readdir } from "node:fs/promises";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  MethodSelectionRecord,
  SelectionLedgerStore,
} from "../domain/method-selection/selection-ledger.js";
import {
  MethodSelectionRecordSchema,
  selectionRecordFingerprint,
  selectionRecordId,
} from "../domain/method-selection/selection-ledger.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Default store: the committed selection records inside this package. */
export function committedSelectionRecordsDir(): string {
  return join(packageRoot, "src", "domain", "method-selection", "records");
}

function validate(record: unknown, context: string): MethodSelectionRecord {
  const parsed = MethodSelectionRecordSchema.safeParse(record);
  if (!parsed.success) {
    throw new Error(
      `${context}: refusing a schema-invalid selection record: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

function readValidated(path: string): MethodSelectionRecord {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  return validate(raw, `selection record ${path}`);
}

export function createFsSelectionLedgerStore(
  recordsDir = committedSelectionRecordsDir(),
): SelectionLedgerStore {
  return {
    appendSelection: (record) => {
      const valid = validate(record, "selection ledger append");
      const path = join(recordsDir, `${selectionRecordId(valid)}.json`);
      mkdirSync(recordsDir, { recursive: true });
      if (existsSync(path)) {
        const existing = readValidated(path);
        if (selectionRecordFingerprint(existing) !== selectionRecordFingerprint(valid)) {
          throw new Error(
            `selection record ${selectionRecordId(valid)}: committed record with the same identity has divergent deterministic content — the ledger is append-only`,
          );
        }
        return; // Idempotent append: the committed record stays.
      }
      writeFileSync(path, `${JSON.stringify(valid, null, 2)}\n`, "utf8");
    },
    listSelections: () => {
      let entries: string[];
      try {
        entries = readdirSync(recordsDir);
      } catch {
        return []; // No committed records yet (cold ledger).
      }
      return entries
        .filter((entry) => entry.startsWith("sel.") && entry.endsWith(".json"))
        .sort()
        .map((entry) => readValidated(join(recordsDir, entry)));
    },
  };
}

/** List committed selection record files under a directory (missing → empty). */
export async function listSelectionRecordFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter((entry) => entry.startsWith("sel.") && entry.endsWith(".json")).sort();
  } catch {
    return [];
  }
}

/** Load a committed selection record (JSON, schema-validated). */
export async function readSelectionRecordFile(path: string): Promise<MethodSelectionRecord> {
  const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
  return validate(raw, `selection record ${path}`);
}
