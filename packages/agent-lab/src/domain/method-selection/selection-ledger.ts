/**
 * Method-selection ledger (W14, organization-lab §2.1 + §4/§5): the flywheel
 * input. Every `evaluateAndCertify` pipeline run commits ONE selection record
 * per goal class — which method ran, under which seed/budget, how much of the
 * evaluation budget it consumed, and what it produced. The record IS the
 * provenance step (frozen fields); committed records accumulate under
 * src/domain/method-selection/records/ (git-tracked, P6 decisions-in-repo)
 * and feed the learned method-selection policy (search/learned-method.ts).
 *
 * Pure domain: record shape + deterministic identity + idempotent append +
 * the ranking policy. Persistence goes through the SelectionLedgerStore port
 * (app layer consumes it; adapters/fs-selection-ledger-store.ts implements
 * it over the committed records directory).
 */
import { z } from "zod";
import { fnv1a32, replayHash } from "../simulation/rng.js";

/**
 * The learned policy's method name (search/learned-method.ts). Ranking
 * excludes it — the ledger's "learned" rows describe delegated runs, and
 * delegating to "learned" would recurse.
 */
export const LEARNED_METHOD_NAME = "learned" as const;

/** Default delegation target when the ledger has no rows for a goal class. */
export const DEFAULT_SELECTION_METHOD = "rule" as const;

/**
 * One committed method-selection record — the frozen field set. The record
 * IS the provenance step: `goalClass`+`method`+`seed`+`evaluationBudget` are
 * the deterministic identity (dedupe key); the count fields mirror the run's
 * search telemetry (frozen public keys); `rankedBestFitness`/`certified`
 * carry the pipeline outcome; `selectedAt` is the caller-supplied
 * deterministic timestamp (NOT part of the identity).
 */
export interface MethodSelectionRecord {
  readonly goalClass: string;
  readonly method: string;
  readonly seed: string;
  readonly evaluationBudget?: number;
  readonly candidatesConsidered: number;
  readonly candidatesEmitted: number;
  readonly evaluationsRun: number;
  readonly rankedBestFitness?: number;
  readonly certified?: boolean;
  readonly selectedAt?: string;
}

/** Structural binding of the frozen field set (strict: no extra fields). */
export const MethodSelectionRecordSchema = z
  .object({
    goalClass: z.string().min(1),
    method: z.string().min(1),
    seed: z.string().min(1),
    evaluationBudget: z.number().int().positive().optional(),
    candidatesConsidered: z.number().int().nonnegative(),
    candidatesEmitted: z.number().int().nonnegative(),
    evaluationsRun: z.number().int().nonnegative(),
    rankedBestFitness: z.number().min(0).max(1).optional(),
    certified: z.boolean().optional(),
    selectedAt: z.string().min(1).optional(),
  })
  .strict();

export type MethodSelectionRecordInput = z.input<typeof MethodSelectionRecordSchema>;

/** The deterministic identity subset (the dedupe field set). */
export type SelectionRecordIdentity = Pick<
  MethodSelectionRecord,
  "goalClass" | "method" | "seed" | "evaluationBudget"
>;

/**
 * Deterministic dedupe key: same goalClass + method + seed + budget => one
 * record. A record with no evaluationBudget delegates at the method default
 * ("unbounded" — the method's own budget law still binds its internals).
 */
export function selectionRecordKey(record: SelectionRecordIdentity): string {
  return [
    record.goalClass,
    record.method,
    record.seed,
    record.evaluationBudget === undefined ? "unbounded" : String(record.evaluationBudget),
  ].join("|");
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x";
}

/** Deterministic record id / committed file basename (no extension). */
export function selectionRecordId(record: SelectionRecordIdentity): string {
  return `sel.${slug(record.goalClass)}.${slug(record.method)}.${fnv1a32(selectionRecordKey(record))}`;
}

/**
 * Deterministic content fingerprint (selectedAt excluded — the first commit's
 * timestamp stays; every other field is reproducible from the identity, so a
 * divergence is a determinism violation, never a legitimate update).
 */
export function selectionRecordFingerprint(record: MethodSelectionRecord): string {
  return replayHash({ ...record, selectedAt: undefined });
}

/** Result of a pure append: the ledger after the append + what happened. */
export interface SelectionAppendResult {
  readonly records: readonly MethodSelectionRecord[];
  /** True when the record was new; false when the identity already existed. */
  readonly appended: boolean;
  /** The record the ledger now holds for this identity (existing when not appended). */
  readonly record: MethodSelectionRecord;
}

/**
 * Idempotent append: same deterministic field set => one record. Appending a
 * record whose identity exists is a no-op (the committed record wins); a
 * record with the SAME identity but DIVERGENT deterministic content is
 * refused loudly — the determinism law makes that a bug, never an update.
 */
export function appendSelectionRecord(
  records: readonly MethodSelectionRecord[],
  record: MethodSelectionRecordInput,
): SelectionAppendResult {
  const parsed = MethodSelectionRecordSchema.safeParse(record);
  if (!parsed.success) {
    throw new Error(
      `selection record: refusing a schema-invalid record: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  const valid = parsed.data;
  const key = selectionRecordKey(valid);
  const existing = records.find((entry) => selectionRecordKey(entry) === key);
  if (existing !== undefined) {
    if (selectionRecordFingerprint(existing) !== selectionRecordFingerprint(valid)) {
      throw new Error(
        `selection record ${selectionRecordId(valid)}: same identity (${key}) with divergent deterministic content — the ledger is append-only`,
      );
    }
    return { records, appended: false, record: existing };
  }
  return { records: [...records, valid], appended: true, record: valid };
}

/** One method's standing for a goal class (its best committed record). */
export interface MethodRankingEntry {
  readonly method: string;
  readonly rankedBestFitness: number | undefined;
  readonly evaluationsRun: number;
  readonly records: number;
}

const UNRANKED = Number.NEGATIVE_INFINITY;

function fitnessOf(record: MethodSelectionRecord): number {
  return record.rankedBestFitness ?? UNRANKED;
}

/** Record order within a method: best fitness, then fewest evaluations, then identity. */
function compareRecords(a: MethodSelectionRecord, b: MethodSelectionRecord): number {
  return (
    fitnessOf(b) - fitnessOf(a) ||
    a.evaluationsRun - b.evaluationsRun ||
    selectionRecordKey(a).localeCompare(selectionRecordKey(b))
  );
}

/** Method order: best representative fitness, then fewest evaluations, then name. */
function compareEntries(a: MethodRankingEntry, b: MethodRankingEntry): number {
  return (
    (b.rankedBestFitness ?? UNRANKED) - (a.rankedBestFitness ?? UNRANKED) ||
    a.evaluationsRun - b.evaluationsRun ||
    a.method.localeCompare(b.method)
  );
}

/**
 * The learned policy's deterministic ranking of methods for a goal class:
 * representative record per method (highest rankedBestFitness, then fewest
 * evaluationsRun, then identity), methods ordered by the same tie-breaks with
 * name order last. "learned" rows are excluded (self-delegation would
 * recurse); other goal classes' rows never leak in.
 */
export function rankMethodsForGoalClass(
  records: readonly MethodSelectionRecord[],
  goalClass: string,
): readonly MethodRankingEntry[] {
  const byMethod = new Map<string, MethodSelectionRecord[]>();
  for (const record of records) {
    if (record.goalClass !== goalClass) continue;
    if (record.method === LEARNED_METHOD_NAME) continue;
    const list = byMethod.get(record.method);
    if (list === undefined) byMethod.set(record.method, [record]);
    else list.push(record);
  }
  const entries: MethodRankingEntry[] = [];
  for (const [method, list] of byMethod) {
    const best = [...list].sort(compareRecords)[0] as MethodSelectionRecord;
    entries.push({
      method,
      rankedBestFitness: best.rankedBestFitness,
      evaluationsRun: best.evaluationsRun,
      records: list.length,
    });
  }
  return entries.sort(compareEntries);
}

/**
 * The best-performing method for a goal class per the documented tie-breaks;
 * "rule" when the ledger holds nothing rankable for the class (cold start).
 */
export function selectBestMethod(
  records: readonly MethodSelectionRecord[],
  goalClass: string,
): string {
  return rankMethodsForGoalClass(records, goalClass)[0]?.method ?? DEFAULT_SELECTION_METHOD;
}

/**
 * Port (app-side): persistence for the committed selection ledger. The fs
 * adapter writes one JSON file per record under
 * src/domain/method-selection/records/ with deterministic naming; appends are
 * idempotent by the deterministic identity.
 */
export interface SelectionLedgerStore {
  readonly appendSelection: (record: MethodSelectionRecordInput) => void;
  readonly listSelections: () => readonly MethodSelectionRecord[];
}
