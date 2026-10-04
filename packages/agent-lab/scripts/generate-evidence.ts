/**
 * Evidence generation (work order B7/D12/D13, organization-lab §4): runs the
 * evaluation loop over the committed scenarios and writes the committed
 * evidence artifacts — evaluation records + certified organization graphs —
 * under src/domain/{evaluations,organizations}/. Every number is reproducible
 * from the pinned seeds (asserted by test/evidence-replay.test.ts).
 *
 * The T4 forced-failure gap signal is dumped as pure data (capability-gap
 * schema-shaped) for @gen/arena-bridge ingestion: arena-bridge does not
 * require agent-lab in the architecture policy, so the handoff is a committed
 * data file, not an import — Phase 2 wires the live flow through the workspace.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createFsEvaluationStore } from "../src/adapters/fs-evaluation-store.js";
import { createLabService } from "../src/app/lab-service.js";
import type { GapSignalDraft } from "../src/contract.js";
import { evaluateRun } from "../src/domain/evaluation.js";
import { runSimulation } from "../src/domain/simulation/engine.js";
import { documentaryCinematicScenario, forcedFailureScenario } from "../src/domain/scenarios/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const domainRoot = join(here, "..", "src", "domain");
const arenaSignalsDir = join(
  here,
  "..",
  "..",
  "arena-bridge",
  "src",
  "domain",
  "gaps",
  "signals",
);

/** Deterministic certification timestamp (committed evidence must be stable). */
const CERTIFIED_AT = "2026-10-04T08:00:00.000Z";

async function main(): Promise<void> {
  const lab = createLabService({
    evaluationStore: createFsEvaluationStore(domainRoot),
  });

  // T2 (work order D12): assemble + certify the documentary-cinematic organization.
  const t2 = lab.evaluateAndCertify({
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
  if (!t2.best || !t2.outcome || !t2.certifiedGraph || !t2.record) {
    throw new Error(
      `T2 pipeline failed to produce a certified organization: ${JSON.stringify(
        t2.outcome?.issues ?? ["no candidates"],
      )}`,
    );
  }
  console.log(
    `T2: certified ${t2.certifiedGraph.id} (fitness ${t2.best.fitness}, replay ${t2.best.perScenario[0]?.replayHash})`,
  );

  // T4 (work order D13): forced failure on the character-replacement goal class.
  // The lab MUST NOT certify while the gap is unresolved (never a fabricated
  // result) — the refusal itself is committed evidence.
  const t4 = lab.evaluateAndCertify({
    request: {
      goal: forcedFailureScenario.goal,
      goalClass: forcedFailureScenario.goalClass,
      catalogs: {
        models: forcedFailureScenario.modelCatalog,
        capabilities: forcedFailureScenario.capabilityCatalog,
      },
      policy: "cheapest-reliable",
      budgetEnvelopeUsd: forcedFailureScenario.budgetEnvelopeUsd,
    },
    scenarios: [forcedFailureScenario],
    certifiedAt: CERTIFIED_AT,
  });
  if (!t4.best || !t4.outcome || !t4.record) {
    throw new Error("T4 pipeline produced no candidate to force a failure on");
  }
  if (t4.outcome.certified) {
    throw new Error(
      "T4 pipeline certified an organization with an unresolved gap — certification bar violated",
    );
  }
  console.log(
    `T4: certification refused for ${t4.best.graph.id} (fitness ${t4.best.fitness}) — issues: ${t4.outcome.issues.join("; ")}`,
  );

  // Dump the T4 gap signals (pure data) for @gen/arena-bridge ingestion.
  // The signals come from the candidate that ATTEMPTS the goal's required
  // capability (standard tool profile): the top-ranked candidate is the
  // minimal-profile one that dodges the invocation (and is correctly refused
  // certification) — the forced failure lives on the attempting organization.
  const attempting = t4.search.candidates.find(
    (candidate) => candidate.dimensionChoices.toolAllocation === "standard",
  );
  if (!attempting) {
    throw new Error("T4 search produced no candidate attempting the required capability");
  }
  const t4Run = runSimulation(forcedFailureScenario, attempting.graph);
  if (t4Run.gapSignals.length === 0) {
    throw new Error("T4 scenario emitted no gap signal — acceptance broken");
  }
  await mkdir(arenaSignalsDir, { recursive: true });
  for (const signal of t4Run.gapSignals) {
    await writeSignal(signal);
    console.log(
      `T4: gap signal ${signal.gapId} (${signal.kind}, severity ${signal.impact.severity}) dumped for arena ingestion`,
    );
  }
  // Sanity: the T2 run emits zero gap signals.
  const t2Run = runSimulation(documentaryCinematicScenario, t2.certifiedGraph);
  if (t2Run.gapSignals.length > 0) {
    throw new Error("T2 certified organization emitted gap signals in replay");
  }
  const t2Metrics = evaluateRun(t2Run, documentaryCinematicScenario);
  console.log(
    `T2 replay: ${t2Run.criteriaResults.filter((c) => c.met).length}/${t2Run.criteriaResults.length} criteria met, fitness ${t2Metrics.fitness}, replay ${t2Run.replayHash}`,
  );
}

async function writeSignal(signal: GapSignalDraft): Promise<void> {
  const path = join(arenaSignalsDir, `${signal.gapId}.signal.json`);
  await writeFile(path, `${JSON.stringify(signal, null, 2)}\n`, "utf8");
}

await main();
