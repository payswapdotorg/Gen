/**
 * Method-selection provenance tests (W14 — the provenance ladder's top rung):
 * the lab's committed selection-ledger record maps onto the Arena plane as a
 * proposal-style record citing its evidence chain
 * (ledger record → telemetry → certified evaluation), with a
 * draft → certified → published lifecycle consistent with state-machine.ts.
 * The committed example's numbers are REAL — cross-checked against the
 * committed @gen/agent-lab artifacts via file-based handoff (arena-bridge
 * does not import agent-lab in the architecture policy; committed evidence
 * data crosses the boundary as files, exactly like the T4 gap signal).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  MethodSelectionLedgerEntry,
  MethodSelectionProvenanceRecord,
} from "../src/domain/schema/method-selection-provenance.js";
import { MethodSelectionLedgerEntrySchema, MethodSelectionProvenanceSchema } from "../src/domain/schema/method-selection-provenance.js";
import type { MethodSelectionProvenanceMappingInput } from "../src/domain/method-selection-provenance.js";
import {
  PROVENANCE_CHAIN,
  canTransitionProvenance,
  certifyProvenance,
  isProvenanceTerminal,
  mapSelectionToProvenance,
  provenanceIdOf,
  publishProvenance,
} from "../src/domain/method-selection-provenance.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(packageRoot, "..", "..");
const provenanceDir = join(packageRoot, "src", "domain", "method-selection-provenance");
const ledgerDir = join(repoRoot, "packages", "agent-lab", "src", "domain", "method-selection", "records");

/** Deterministic lifecycle timestamps (mirrors the generation script). */
const AT = {
  certified: "2026-10-05T09:30:00.000Z",
  published: "2026-10-05T09:45:00.000Z",
} as const;

function committedExample(): MethodSelectionProvenanceRecord {
  const files = readDirFiles(provenanceDir).filter((name) => name.startsWith("msp.") && name.endsWith(".json"));
  assert.equal(files.length, 1, "exactly one committed provenance example");
  const raw = JSON.parse(readFileSync(join(provenanceDir, files[0] as string), "utf8")) as unknown;
  const parsed = MethodSelectionProvenanceSchema.safeParse(raw);
  assert.ok(parsed.success, `the committed example must be schema-valid: ${parsed.success ? "" : String(parsed.error.issues[0]?.message)}`);
  return parsed.data;
}

function readDirFiles(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** The committed ledger entries (file-based handoff from @gen/agent-lab). */
function committedLedger(): { file: string; entry: MethodSelectionLedgerEntry }[] {
  return readDirFiles(ledgerDir)
    .filter((name) => name.startsWith("sel.") && name.endsWith(".json"))
    .sort()
    .map((file) => {
      const raw = JSON.parse(readFileSync(join(ledgerDir, file), "utf8")) as unknown;
      const parsed = MethodSelectionLedgerEntrySchema.safeParse(raw);
      assert.ok(parsed.success, `committed ledger record ${file} must parse against the mirror schema`);
      return { file, entry: parsed.data };
    });
}

function ruleLedgerRow(): { file: string; entry: MethodSelectionLedgerEntry } {
  const row = committedLedger().find(
    ({ entry }) => entry.goalClass === "documentary-cinematic-remaster" && entry.method === "rule",
  );
  assert.ok(row, "the committed rule selection record exists");
  return row;
}

/** The mapping input that regenerates the committed example (real numbers). */
function exampleMappingInput(notes?: string): MethodSelectionProvenanceMappingInput {
  const { file, entry } = ruleLedgerRow();
  return {
    entry,
    evidence: {
      ledgerRecordRef: `packages/agent-lab/src/domain/method-selection/records/${file}`,
      telemetry: {
        method: entry.method,
        seed: entry.seed,
        candidatesConsidered: entry.candidatesConsidered,
        candidatesEmitted: entry.candidatesEmitted,
        evaluationsRun: entry.evaluationsRun,
      },
      certifiedEvaluationRef: "packages/agent-lab/src/domain/evaluations/eval.org.documentary-cinematic-remaster-cand-04.json",
      certifiedFitness: entry.rankedBestFitness,
    },
    notes,
  };
}

test("the lifecycle chain is draft → certified → published with exactly-one-step transitions", () => {
  assert.deepEqual(PROVENANCE_CHAIN, ["draft", "certified", "published"]);
  assert.ok(canTransitionProvenance("draft", "certified"));
  assert.ok(canTransitionProvenance("certified", "published"));
  assert.ok(!canTransitionProvenance("draft", "published"), "no skipping");
  assert.ok(!canTransitionProvenance("certified", "draft"), "no going back");
  assert.ok(!canTransitionProvenance("draft", "draft"), "no self transitions");
  assert.ok(!canTransitionProvenance("published", "draft"), "published is terminal");
  assert.ok(!canTransitionProvenance("published", "certified"));
  assert.ok(isProvenanceTerminal("published"));
  assert.ok(!isProvenanceTerminal("draft"));
  assert.ok(!isProvenanceTerminal("certified"));
});

test("the committed example is schema-valid, fully escalated, and regenerates byte-for-byte", () => {
  const example = committedExample();
  assert.equal(example.lifecycle.state, "published");
  assert.equal(example.lifecycle.certifiedAt, AT.certified);
  assert.equal(example.lifecycle.publishedAt, AT.published);

  // Regeneration: map the committed ledger row (real numbers), walk the
  // lifecycle, and require byte-identical committed evidence.
  const mapped = mapSelectionToProvenance(exampleMappingInput(example.notes));
  assert.ok(mapped.ok, `mapping must accept the real evidence: ${mapped.ok ? "" : mapped.issues.join("; ")}`);
  const certified = certifyProvenance(mapped.record, AT.certified);
  assert.ok(certified.ok);
  const published = publishProvenance(certified.record, AT.published);
  assert.ok(published.ok);
  assert.deepEqual(published.record, example, "the committed example reproduces from the committed ledger row");
  assert.equal(
    JSON.stringify(published.record, null, 2),
    JSON.stringify(example, null, 2),
    "byte-for-byte regeneration",
  );
});

test("state machine transitions on real records: illegal moves are refused with the record id", () => {
  const example = committedExample();
  const again = publishProvenance(example, "2030-01-01T00:00:00.000Z");
  assert.ok(!again.ok, "published is terminal");
  assert.match(again.ok ? "" : again.issue, /illegal transition published → published/);
  const back = certifyProvenance({ ...example, lifecycle: { state: "draft" } }, AT.certified);
  assert.ok(back.ok, "draft → certified with a certified selection is legal");
  const forward = publishProvenance(back.record, AT.published);
  assert.ok(forward.ok);
  assert.equal(forward.record.lifecycle.state, "published");
  assert.equal(forward.record.lifecycle.certifiedAt, AT.certified);
  assert.equal(forward.record.lifecycle.publishedAt, AT.published);
});

test("certifyProvenance refuses a selection that did not certify (audit, never rubber-stamp)", () => {
  const { entry } = ruleLedgerRow();
  const uncertified = {
    ...entry,
    certified: false,
    rankedBestFitness: undefined,
  };
  const mapped = mapSelectionToProvenance({
    entry: uncertified,
    evidence: {
      ledgerRecordRef: "packages/agent-lab/src/domain/method-selection/records/sel.some-record.json",
      telemetry: {
        method: uncertified.method,
        seed: uncertified.seed,
        candidatesConsidered: uncertified.candidatesConsidered,
        candidatesEmitted: uncertified.candidatesEmitted,
        evaluationsRun: uncertified.evaluationsRun,
      },
    },
  });
  assert.ok(mapped.ok, "an uncertified selection maps (nothing certified to cite)");
  assert.equal(mapped.record.evidence.certifiedEvaluationRef, undefined);
  const refused = certifyProvenance(mapped.record, AT.certified);
  assert.ok(!refused.ok);
  assert.match(refused.ok ? "" : refused.issue, /did not certify/);
});

test("the mapping refuses evidence that disagrees with the ledger entry", () => {
  const input = exampleMappingInput("consistency probes");
  const base = mapSelectionToProvenance(input);
  assert.ok(base.ok);

  const wrongCounts = mapSelectionToProvenance({
    ...input,
    evidence: { ...input.evidence, telemetry: { ...input.evidence.telemetry, evaluationsRun: 99 } },
  });
  assert.ok(!wrongCounts.ok);
  assert.ok(wrongCounts.ok ? true : wrongCounts.issues.some((issue) => issue.includes("evaluationsRun 99")));

  const wrongMethod = mapSelectionToProvenance({
    ...input,
    evidence: { ...input.evidence, telemetry: { ...input.evidence.telemetry, method: "beam" } },
  });
  assert.ok(!wrongMethod.ok);

  const certifiedWithoutEvidence = mapSelectionToProvenance({
    ...input,
    evidence: {
      ledgerRecordRef: input.evidence.ledgerRecordRef,
      telemetry: input.evidence.telemetry,
    },
  });
  assert.ok(!certifiedWithoutEvidence.ok, "a certified selection must cite its certified evaluation");

  const fitnessMismatch = mapSelectionToProvenance({
    ...input,
    evidence: { ...input.evidence, certifiedFitness: 0.1234 },
  });
  assert.ok(!fitnessMismatch.ok, "the chain's fitness must agree with the entry");
});

test("the mapping enforces the learned-selection evidence rules", () => {
  const { entry } = ruleLedgerRow();
  const learnedEntry = {
    ...entry,
    method: "learned",
    seed: "w14-ledger",
    evaluationBudget: 12,
    evaluationsRun: 0,
  };
  // A learned selection without delegatedTo is refused...
  const noDelegate = mapSelectionToProvenance({
    entry: learnedEntry,
    evidence: {
      ledgerRecordRef: "packages/agent-lab/src/domain/method-selection/records/sel.x.learned.00000000.json",
      telemetry: {
        method: "learned",
        seed: "w14-ledger",
        candidatesConsidered: 32,
        candidatesEmitted: 32,
        evaluationsRun: 0,
      },
      certifiedEvaluationRef: "packages/agent-lab/src/domain/evaluations/eval.org.documentary-cinematic-remaster-cand-04.json",
      certifiedFitness: entry.rankedBestFitness,
    },
  });
  assert.ok(!noDelegate.ok, "a learned selection without delegatedTo is refused");
  assert.ok(
    !noDelegate.ok && noDelegate.issues.some((issue) => issue.includes("delegatedTo")),
    "the issue names the missing decision fact",
  );
  // ...delegating to "learned" itself is refused...
  const selfDelegate = mapSelectionToProvenance({
    entry: learnedEntry,
    evidence: {
      ledgerRecordRef: "packages/agent-lab/src/domain/method-selection/records/sel.x.learned.00000000.json",
      telemetry: {
        method: "learned",
        seed: "w14-ledger",
        candidatesConsidered: 32,
        candidatesEmitted: 32,
        evaluationsRun: 0,
        delegatedTo: "learned",
      },
      certifiedEvaluationRef: "packages/agent-lab/src/domain/evaluations/eval.org.documentary-cinematic-remaster-cand-04.json",
      certifiedFitness: entry.rankedBestFitness,
    },
  });
  assert.ok(!selfDelegate.ok);
  // ...and a non-learned selection citing a delegate is refused.
  const strayDelegate = mapSelectionToProvenance({
    ...exampleMappingInput("probe"),
    evidence: {
      ...exampleMappingInput("probe").evidence,
      telemetry: { ...exampleMappingInput("probe").evidence.telemetry, delegatedTo: "beam" },
    },
  });
  assert.ok(!strayDelegate.ok);
  // A well-formed learned selection maps with its decision fact intact.
  const learnedOk = mapSelectionToProvenance({
    entry: learnedEntry,
    evidence: {
      ledgerRecordRef: "packages/agent-lab/src/domain/method-selection/records/sel.x.learned.00000000.json",
      telemetry: {
        method: "learned",
        seed: "w14-ledger",
        candidatesConsidered: 32,
        candidatesEmitted: 32,
        evaluationsRun: 0,
        delegatedTo: "rule",
      },
      certifiedEvaluationRef: "packages/agent-lab/src/domain/evaluations/eval.org.documentary-cinematic-remaster-cand-04.json",
      certifiedFitness: entry.rankedBestFitness,
    },
  });
  assert.ok(learnedOk.ok, learnedOk.ok ? "" : learnedOk.issues.join("; "));
  assert.equal(learnedOk.ok ? learnedOk.record.evidence.telemetry.delegatedTo : undefined, "rule");
  assert.match(learnedOk.ok ? learnedOk.record.provenanceId : "", /^msp\.[a-z0-9-]+\.learned\.[0-9a-f]{8}$/);
});

test("the committed example cites REAL numbers: the chain audits clean end-to-end", () => {
  const example = committedExample();
  const { file, entry } = ruleLedgerRow();

  // The provenance record's mapped fields ARE the committed ledger row's.
  assert.equal(example.provenanceId, provenanceIdOf(entry));
  assert.equal(example.goalClass, entry.goalClass);
  assert.equal(example.method, entry.method);
  assert.equal(example.seed, entry.seed);
  assert.equal(example.candidatesConsidered, entry.candidatesConsidered);
  assert.equal(example.candidatesEmitted, entry.candidatesEmitted);
  assert.equal(example.evaluationsRun, entry.evaluationsRun);
  assert.equal(example.rankedBestFitness, entry.rankedBestFitness);
  assert.equal(example.certified, entry.certified);
  assert.equal(example.selectedAt, entry.selectedAt);

  // The provenanceId digest equals the ledger record file name's digest
  // (the same deterministic identity, mirrored across the package boundary).
  assert.equal(
    example.provenanceId.split(".").pop(),
    (file.match(/\.([0-9a-f]{8})\.json$/) ?? [])[1],
    "the id digest must equal the committed ledger record file's digest",
  );

  // Every cited ref exists in the repo (P6: committed evidence, no dangling chains).
  assert.ok(existsSync(join(repoRoot, example.evidence.ledgerRecordRef)), "the cited ledger record exists");
  assert.ok(existsSync(join(repoRoot, example.evidence.certifiedEvaluationRef ?? "")), "the cited evaluation record exists");

  // The cited certified evaluation AGREES: the committed T2 record's own rows.
  const evaluation = JSON.parse(
    readFileSync(join(repoRoot, example.evidence.certifiedEvaluationRef ?? ""), "utf8"),
  ) as { aggregateFitness: number; certified: boolean; recordId: string };
  assert.equal(evaluation.recordId, "eval.org.documentary-cinematic-remaster-cand-04");
  assert.equal(evaluation.certified, true);
  assert.equal(evaluation.aggregateFitness, example.evidence.certifiedFitness);
  assert.equal(evaluation.aggregateFitness, 0.8398, "the committed T2 optimum — the real anchor");

  // The real tie at the committed optimum (the learned policy's tie-break story).
  const tied = committedLedger().filter(
    ({ entry: row }) => row.goalClass === "documentary-cinematic-remaster" && row.rankedBestFitness === 0.8398,
  );
  assert.deepEqual(
    tied.map(({ entry: row }) => row.method).sort(),
    ["bandit", "evolutionary", "learned", "rule"],
    "rule / evolutionary / bandit / learned all reached 0.8398 on the real runs",
  );
});
