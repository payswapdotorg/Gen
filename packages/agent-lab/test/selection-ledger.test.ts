/**
 * Method-selection ledger tests (W14, organization-lab §2.1 + §4/§5): the
 * flywheel input — frozen-field shape, deterministic identity (same fields =>
 * one record), idempotent append (pure + fs store), the pipeline persist hook
 * (armed appends, unarmed is a zero-change no-op), and the committed ledger's
 * reproducibility from REAL pipeline runs (scripts/generate-selection-ledger.ts).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MethodSelectionRecord, SelectionLedgerStore } from "../src/domain/method-selection/selection-ledger.js";
import {
  MethodSelectionRecordSchema,
  appendSelectionRecord,
  selectionRecordFingerprint,
  selectionRecordId,
  selectionRecordKey,
} from "../src/domain/method-selection/selection-ledger.js";
import {
  committedSelectionRecordsDir,
  createFsSelectionLedgerStore,
  readSelectionRecordFile,
} from "../src/adapters/fs-selection-ledger-store.js";
import { createLabService } from "../src/app/lab-service.js";
import { documentaryCinematicScenario } from "../src/domain/scenarios/index.js";

const CERTIFIED_AT = "2026-10-05T09:00:00.000Z";

function record(overrides: Partial<MethodSelectionRecord> = {}): MethodSelectionRecord {
  return {
    goalClass: "documentary-cinematic-remaster",
    method: "rule",
    seed: "seed-a",
    candidatesConsidered: 32,
    candidatesEmitted: 32,
    evaluationsRun: 0,
    rankedBestFitness: 0.8398,
    certified: true,
    selectedAt: CERTIFIED_AT,
    ...overrides,
  };
}

function memoryLedger(): SelectionLedgerStore & { records: MethodSelectionRecord[] } {
  const records: MethodSelectionRecord[] = [];
  return {
    records,
    appendSelection: (entry) => {
      const result = appendSelectionRecord(records, entry);
      if (result.appended) records.push(result.record);
    },
    listSelections: () => records,
  };
}

test("frozen-field shape: the schema accepts exactly the frozen field set and nothing more", () => {
  const parsed = MethodSelectionRecordSchema.safeParse(record());
  assert.ok(parsed.success);
  assert.deepEqual(Object.keys(parsed.data).sort(), [
    "candidatesConsidered",
    "candidatesEmitted",
    "certified",
    "evaluationsRun",
    "goalClass",
    "method",
    "rankedBestFitness",
    "seed",
    "selectedAt",
  ]);
  // Optional fields are legitimately absent (the minimum provenance step).
  const minimal = MethodSelectionRecordSchema.safeParse({
    goalClass: "g",
    method: "beam",
    seed: "s",
    candidatesConsidered: 1,
    candidatesEmitted: 1,
    evaluationsRun: 1,
  });
  assert.ok(minimal.success);
  // Extra fields are refused (strict — the field set is frozen).
  assert.ok(!MethodSelectionRecordSchema.safeParse({ ...record(), extra: 1 }).success);
  // Negative / non-integer counters are refused.
  assert.ok(!MethodSelectionRecordSchema.safeParse(record({ evaluationsRun: -1 })).success);
  assert.ok(!MethodSelectionRecordSchema.safeParse(record({ candidatesConsidered: 1.5 })).success);
});

test("determinism: the same deterministic field set maps to one identity and one file name", () => {
  const first = record();
  const twin = record({ selectedAt: "2030-01-01T00:00:00.000Z" }); // selectedAt is NOT identity
  assert.equal(selectionRecordKey(first), selectionRecordKey(twin));
  assert.equal(selectionRecordId(first), selectionRecordId(twin));
  assert.match(selectionRecordId(first), /^sel\.documentary-cinematic-remaster\.rule\.[0-9a-f]{8}$/);
  // Identity components each matter.
  assert.notEqual(selectionRecordId(first), selectionRecordId(record({ method: "beam" })));
  assert.notEqual(selectionRecordId(first), selectionRecordId(record({ seed: "seed-b" })));
  assert.notEqual(selectionRecordId(first), selectionRecordId(record({ evaluationBudget: 12 })));
  assert.notEqual(
    selectionRecordId(record({ evaluationBudget: 12 })),
    selectionRecordId(record({ evaluationBudget: 24 })),
  );
  assert.notEqual(selectionRecordId(first), selectionRecordId(record({ goalClass: "other-class" })));
  // The fingerprint ignores selectedAt but honors every deterministic field.
  assert.equal(selectionRecordFingerprint(first), selectionRecordFingerprint(twin));
  assert.notEqual(selectionRecordFingerprint(first), selectionRecordFingerprint(record({ evaluationsRun: 3 })));
});

test("idempotent append: same fields => one record; the first commit wins", () => {
  const first = appendSelectionRecord([], record());
  assert.equal(first.appended, true);
  assert.equal(first.records.length, 1);
  const again = appendSelectionRecord(first.records, record({ selectedAt: "2030-01-01T00:00:00.000Z" }));
  assert.equal(again.appended, false, "an existing identity is a no-op append");
  assert.equal(again.records.length, 1);
  assert.equal(again.record.selectedAt, CERTIFIED_AT, "the committed record (and its timestamp) stays");
  // A second, distinct record appends normally.
  const grown = appendSelectionRecord(again.records, record({ method: "beam", evaluationsRun: 4 }));
  assert.equal(grown.appended, true);
  assert.equal(grown.records.length, 2);
  // Schema-invalid records are refused loudly.
  assert.throws(() => appendSelectionRecord([], { ...record(), candidatesConsidered: -1 }));
});

test("the ledger is append-only: same identity with divergent deterministic content is refused", () => {
  const committed = appendSelectionRecord([], record());
  assert.throws(
    () => appendSelectionRecord(committed.records, record({ rankedBestFitness: 0.1234 })),
    /divergent deterministic content/,
  );
});

test("fs store: one file per record, deterministic naming, idempotent append, cold dir lists empty", () => {
  const dir = mkdtempSync(join(tmpdir(), "selection-ledger-"));
  try {
    const store = createFsSelectionLedgerStore(dir);
    assert.deepEqual(store.listSelections(), [], "a cold records directory lists empty");
    store.appendSelection(record());
    store.appendSelection(record({ selectedAt: "2030-01-01T00:00:00.000Z" })); // idempotent re-append
    const files = readdirSync(dir).filter((name) => name.endsWith(".json"));
    assert.equal(files.length, 1, "one file per deterministic record");
    assert.equal(files[0], `${selectionRecordId(record())}.json`);
    assert.equal(store.listSelections().length, 1);
    // Divergent content for the same identity is refused at the store boundary too.
    assert.throws(() => store.appendSelection(record({ evaluationsRun: 7 })), /divergent/);
    // A schema-invalid record never reaches the disk.
    assert.throws(() => store.appendSelection({ ...record(), goalClass: "" }));
    assert.equal(readdirSync(dir).filter((name) => name.endsWith(".json")).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pipeline persist hook: armed, every evaluateAndCertify run appends its selection record", () => {
  const ledger = memoryLedger();
  const lab = createLabService({ selectionLedgerStore: ledger });
  const base = {
    request: {
      goal: documentaryCinematicScenario.goal,
      goalClass: documentaryCinematicScenario.goalClass,
      catalogs: {
        models: documentaryCinematicScenario.modelCatalog,
        capabilities: documentaryCinematicScenario.capabilityCatalog,
      },
      policy: "cheapest-reliable" as const,
      budgetEnvelopeUsd: documentaryCinematicScenario.budgetEnvelopeUsd,
    },
    scenarios: [documentaryCinematicScenario],
    certifiedAt: CERTIFIED_AT,
  };
  const result = lab.evaluateAndCertify(base);
  assert.equal(ledger.records.length, 1);
  const appended = ledger.records[0] as MethodSelectionRecord;
  assert.equal(appended.method, "rule");
  assert.equal(appended.goalClass, documentaryCinematicScenario.goalClass);
  assert.equal(appended.seed, result.searchTelemetry.seed);
  assert.equal(appended.candidatesConsidered, result.searchTelemetry.candidatesConsidered);
  assert.equal(appended.candidatesEmitted, result.searchTelemetry.candidatesEmitted);
  assert.equal(appended.evaluationsRun, result.searchTelemetry.evaluationsRun);
  assert.equal(appended.rankedBestFitness, result.best?.fitness);
  assert.equal(appended.certified, result.outcome?.certified);
  assert.equal(appended.selectedAt, CERTIFIED_AT);
  assert.equal(appended.evaluationBudget, undefined, "no budget on the request => no budget field");

  // Budget rides the request onto the record.
  const budgeted = lab.evaluateAndCertify({
    ...base,
    request: { ...base.request, method: "beam", seed: "hook-budget", options: { evaluationBudget: 3 } },
  });
  const budgetedRecord = ledger.records.find((entry) => entry.method === "beam");
  assert.ok(budgetedRecord);
  assert.equal(budgetedRecord.evaluationBudget, 3);
  assert.equal(budgetedRecord.evaluationsRun, budgeted.searchTelemetry.evaluationsRun);
  assert.ok(budgetedRecord.evaluationsRun <= 3, "the budget law binds the recorded count");

  // Same deterministic run appended twice => still one record (idempotent).
  lab.evaluateAndCertify(base);
  assert.equal(ledger.records.length, 2, "rule + beam identities only — the rule re-run deduped");
});

test("pipeline persist hook: unarmed (default) is a zero-change no-op", () => {
  const lab = createLabService(); // no selectionLedgerStore
  const result = lab.evaluateAndCertify({
    request: {
      goal: documentaryCinematicScenario.goal,
      goalClass: documentaryCinematicScenario.goalClass,
      catalogs: {
        models: documentaryCinematicScenario.modelCatalog,
        capabilities: documentaryCinematicScenario.capabilityCatalog,
      },
      policy: "cheapest-reliable",
      budgetEnvelopeUsd: documentaryCinematicScenario.budgetEnvelopeUsd,
    },
    scenarios: [documentaryCinematicScenario],
    certifiedAt: CERTIFIED_AT,
  });
  // Behavior identical to the pre-W14 pipeline: same anchor numbers, no side effects.
  assert.equal(result.best?.graph.id, "org.documentary-cinematic-remaster-cand-04");
  assert.equal(result.best?.fitness, 0.8398);
  assert.ok(result.outcome?.certified);
});

test("the committed ledger reproduces from REAL pipeline runs (no fixture numbers)", async () => {
  // The exact run matrix of scripts/generate-selection-ledger.ts, replayed
  // into a temp store: the committed records under
  // src/domain/method-selection/records/ must be field-for-field identical.
  const dir = mkdtempSync(join(tmpdir(), "selection-ledger-replay-"));
  try {
    const store = createFsSelectionLedgerStore(dir);
    const lab = createLabService({ selectionLedgerStore: store });
    const at = {
      rule: "2026-10-05T09:00:00.000Z",
      beam: "2026-10-05T09:05:00.000Z",
      evolutionary: "2026-10-05T09:10:00.000Z",
      bandit: "2026-10-05T09:15:00.000Z",
      learned: "2026-10-05T09:20:00.000Z",
    } as const;
    const baseRequest = {
      goal: documentaryCinematicScenario.goal,
      goalClass: documentaryCinematicScenario.goalClass,
      catalogs: {
        models: documentaryCinematicScenario.modelCatalog,
        capabilities: documentaryCinematicScenario.capabilityCatalog,
      },
      policy: "cheapest-reliable" as const,
      budgetEnvelopeUsd: documentaryCinematicScenario.budgetEnvelopeUsd,
    };
    lab.evaluateAndCertify({ request: { ...baseRequest, method: "rule" }, scenarios: [documentaryCinematicScenario], certifiedAt: at.rule });
    for (const method of ["beam", "evolutionary", "bandit"] as const) {
      lab.evaluateAndCertify({
        request: { ...baseRequest, method, seed: "w14-ledger", options: { evaluationBudget: 12 } },
        scenarios: [documentaryCinematicScenario],
        certifiedAt: at[method],
      });
    }
    // The learned run over the ledger the replay just produced.
    const { armLearnedMethodLedger } = await import("../src/domain/search/learned-method.js");
    const restore = armLearnedMethodLedger(() => store.listSelections());
    try {
      lab.evaluateAndCertify({
        request: { ...baseRequest, method: "learned", seed: "w14-ledger", options: { evaluationBudget: 12 } },
        scenarios: [documentaryCinematicScenario],
        certifiedAt: at.learned,
      });
    } finally {
      restore();
    }

    const committedDir = committedSelectionRecordsDir();
    const committedFiles = readdirSync(committedDir).filter((name) => name.endsWith(".json")).sort();
    const replayedFiles = readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
    assert.deepEqual(replayedFiles, committedFiles, "the replay writes exactly the committed record files");
    assert.equal(committedFiles.length, 5);
    for (const file of committedFiles) {
      const committed = await readSelectionRecordFile(join(committedDir, file));
      const replayed = await readSelectionRecordFile(join(dir, file));
      assert.deepEqual(replayed, committed, `${file}: the committed numbers reproduce from a fresh run`);
    }
    // The real anchors: the committed rule row carries the T2 certified optimum.
    const ruleRecord = await readSelectionRecordFile(
      join(committedDir, committedFiles.find((name) => name.includes(".rule.")) ?? ""),
    );
    assert.equal(ruleRecord.rankedBestFitness, 0.8398);
    assert.equal(ruleRecord.certified, true);
    assert.equal(ruleRecord.evaluationsRun, 0);
    // The committed bytes are canonical JSON (schema key order, trailing newline).
    const raw = readFileSync(join(committedDir, committedFiles.find((name) => name.includes(".rule.")) ?? ""), "utf8");
    assert.ok(raw.endsWith("\n"));
    assert.equal(JSON.stringify(ruleRecord, null, 2), raw.trimEnd());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
