/**
 * W14 method-selection ledger generation: runs the REAL evaluation pipeline
 * (evaluateAndCertify) over the documentary-cinematic goal class for every
 * built-in method — rule (the vanilla default run), beam / evolutionary /
 * bandit at an equal evaluation budget — and then the learned policy armed
 * with the ledger those runs just committed. Each run appends its selection
 * record through the fs ledger store (idempotent: same deterministic
 * identity => one record; re-running reproduces the committed records
 * exactly — divergent content for the same identity is refused).
 *
 * Deterministic seeds + timestamps throughout (mirrors
 * arena-bridge/scripts/generate-gap-evidence.ts): committed evidence must be
 * stable across regenerations.
 *
 * Run: node --import tsx scripts/generate-selection-ledger.ts
 */
import { createLabService } from "../src/app/lab-service.js";
import { armLearnedMethodLedger } from "../src/domain/search/learned-method.js";
import { createFsSelectionLedgerStore } from "../src/adapters/fs-selection-ledger-store.js";
import { documentaryCinematicScenario } from "../src/domain/scenarios/index.js";

/** Deterministic per-run evidence timestamps (committed records stay stable). */
const AT = {
  rule: "2026-10-05T09:00:00.000Z",
  beam: "2026-10-05T09:05:00.000Z",
  evolutionary: "2026-10-05T09:10:00.000Z",
  bandit: "2026-10-05T09:15:00.000Z",
  learned: "2026-10-05T09:20:00.000Z",
} as const;

/** Equal evaluation budget for the fitness-driven methods (the comparison plane). */
const BUDGET = 12;
/** Shared seed for the seeded methods (rule ignores seeds by construction). */
const SEED = "w14-ledger";

const scenario = documentaryCinematicScenario;

interface LedgerRun {
  readonly method: string;
  readonly at: string;
  readonly seed?: string;
  readonly options?: { readonly evaluationBudget: number };
}

const runs: readonly LedgerRun[] = [
  // The vanilla default pipeline run (no method/seed/options): rule with the
  // derived seed — the T2 anchor path whose certified optimum is committed.
  { method: "rule", at: AT.rule },
  { method: "beam", at: AT.beam, seed: SEED, options: { evaluationBudget: BUDGET } },
  { method: "evolutionary", at: AT.evolutionary, seed: SEED, options: { evaluationBudget: BUDGET } },
  { method: "bandit", at: AT.bandit, seed: SEED, options: { evaluationBudget: BUDGET } },
];

function main(): void {
  const store = createFsSelectionLedgerStore();
  const lab = createLabService({ selectionLedgerStore: store });

  const baseRequest = {
    goal: scenario.goal,
    goalClass: scenario.goalClass,
    catalogs: { models: scenario.modelCatalog, capabilities: scenario.capabilityCatalog },
    policy: "cheapest-reliable" as const,
    budgetEnvelopeUsd: scenario.budgetEnvelopeUsd,
  };

  for (const run of runs) {
    const result = lab.evaluateAndCertify({
      request: {
        ...baseRequest,
        method: run.method,
        ...(run.seed !== undefined ? { seed: run.seed } : {}),
        ...(run.options !== undefined ? { options: run.options } : {}),
      },
      scenarios: [scenario],
      certifiedAt: run.at,
    });
    console.log(
      `${run.method}: best=${result.best?.graph.id} fitness=${result.best?.fitness} certified=${result.outcome?.certified} internalEvals=${result.searchTelemetry.evaluationsRun}`,
    );
  }

  // The flywheel's read side: the learned policy over the ledger the runs
  // above just committed (the store re-reads the committed directory).
  const restore = armLearnedMethodLedger(() => store.listSelections());
  try {
    const result = lab.evaluateAndCertify({
      request: {
        ...baseRequest,
        method: "learned",
        seed: SEED,
        options: { evaluationBudget: BUDGET },
      },
      scenarios: [scenario],
      certifiedAt: AT.learned,
    });
    console.log(
      `learned: delegatedTo=${result.searchTelemetry.detail?.delegatedTo} best=${result.best?.graph.id} fitness=${result.best?.fitness} certified=${result.outcome?.certified}`,
    );
  } finally {
    restore();
  }

  const committed = store.listSelections();
  console.log(`\ncommitted selection records: ${committed.length}`);
  for (const record of committed) {
    console.log(
      `  ${record.method.padEnd(12)} seed=${record.seed} budget=${record.evaluationBudget ?? "unbounded"} ` +
        `considered=${record.candidatesConsidered} emitted=${record.candidatesEmitted} ` +
        `evals=${record.evaluationsRun} bestFitness=${record.rankedBestFitness ?? "—"} certified=${record.certified ?? "—"}`,
    );
  }
}

main();
