/**
 * Filesystem-backed record source (work order task 2): loads the COMMITTED
 * program records each workspace scenario renders — via the @gen/agent-lab
 * and @gen/arena-bridge public APIs (declared dependencies), never raw fs in
 * components. Records are read from the git-tracked evidence stores; nothing
 * is fetched, nothing fabricated.
 *
 *  - Scenario A (T2): committed certified documentary-cinematic organization +
 *    evaluation record; the run record is replayed deterministically from the
 *    pinned scenario seed (replay hash must match the committed record).
 *  - Scenario B (T4): forced-failure — the lab pipeline (search → simulate →
 *    refuse certification) reproduces the attempting organization whose run
 *    emits the gap; the committed gap report + refusal record are loaded
 *    through @gen/arena-bridge.
 *  - Scenario C: the committed replace-actor TaskPlan spec example with
 *    measured alternative deltas from the @gen/media-providers evaluation
 *    record (premium vs open-model rows).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createLabService,
  documentaryCinematicScenario,
  evaluateRun,
  forcedFailureScenario,
  readEvaluationRecordFile,
  readOrganizationGraphFile,
  runSimulation,
} from "@gen/agent-lab";
import type {
  EvaluationRecord,
  ModelCatalogEntry,
  OrganizationGraph,
  SimulationRunRecord,
  TaskPlan,
} from "@gen/agent-lab";
import { CapabilityGapReportSchema, readGapReport } from "@gen/arena-bridge";
import type { CapabilityGapReport } from "@gen/arena-bridge";
import type { TaskPlan as WorkspaceTaskPlan, WorkspaceScenarioId } from "../contract.js";
import type { WorkspaceRecordBundle, WorkspaceRecordSource } from "../domain/records.js";
import { currentPathDeltas, deltasBetween } from "../domain/deltas.js";
import { packageRoot, repoRoot, toRepoRelative } from "./package-paths.js";
import {
  CHARACTER_REPLACEMENT_EVALUATION,
  catalogRow,
  loadEvaluationRecord,
  rowForPath,
} from "./provider-measurements.js";

/** Deterministic certification timestamp (mirrors agent-lab's evidence generator). */
const CERTIFIED_AT = "2026-10-04T08:00:00.000Z";

function agentLabPath(...segments: string[]): string {
  return join(packageRoot("@gen/agent-lab"), ...segments);
}

function rel(path: string): string {
  return toRepoRelative(path);
}

/** Spec examples use JSON null as an "absent" marker — strip before parsing. */
function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== null)
        .map(([key, entry]) => [key, stripNulls(entry)]),
    );
  }
  return value;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function finalPlanOf(run: SimulationRunRecord): TaskPlan {
  const plan = run.taskPlans.at(-1);
  if (plan === undefined) {
    throw new Error(`workspace: run ${run.runId} produced no TaskPlan snapshots`);
  }
  return plan;
}

function requireCatalogEntry(
  catalog: readonly ModelCatalogEntry[],
  predicate: (entry: ModelCatalogEntry) => boolean,
  label: string,
): ModelCatalogEntry {
  const entry = catalog.find(predicate);
  if (entry === undefined) {
    throw new Error(`workspace: frozen model catalog lacks the ${label} entry`);
  }
  return entry;
}

// ---------------------------------------------------------------------------
// Scenario A — T2: documentary-cinematic (committed certified run)
// ---------------------------------------------------------------------------

async function loadDocumentaryCinematic(): Promise<WorkspaceRecordBundle> {
  const scenario = documentaryCinematicScenario;
  const orgPath = agentLabPath(
    "src",
    "domain",
    "organizations",
    "org.documentary-cinematic-remaster-cand-04.json",
  );
  const evalPath = agentLabPath(
    "src",
    "domain",
    "evaluations",
    "eval.org.documentary-cinematic-remaster-cand-04.json",
  );
  const scenarioPath = agentLabPath("src", "domain", "scenarios", "documentary-cinematic.ts");

  const organization: OrganizationGraph = await readOrganizationGraphFile(orgPath);
  const evaluation: EvaluationRecord = await readEvaluationRecordFile(evalPath);
  const run = runSimulation(scenario, organization);
  const committedReplay = evaluation.scenarios
    .find((entry) => entry.scenarioId === scenario.id)
    ?.replayHash;
  if (committedReplay !== undefined && committedReplay !== run.replayHash) {
    throw new Error(
      `workspace: documentary-cinematic replay ${run.replayHash} diverges from the committed record ${committedReplay}`,
    );
  }

  // Alternative deltas from the committed frozen model catalog: the active
  // cheapest-reliable path (open models) vs the premium-first escape.
  const catalog = scenario.modelCatalog;
  const openRow = catalogRow(
    requireCatalogEntry(
      catalog,
      (entry) => entry.providerId === "open-models" && entry.qualityClass === "standard",
      "open-models standard",
    ),
  );
  const flagshipRow = catalogRow(
    requireCatalogEntry(catalog, (entry) => entry.qualityClass === "flagship", "flagship"),
  );
  const catalogSource = "agent-lab/src/domain/scenarios/frozen-catalog.ts (committed)";
  const [cheapestPath, premiumPath] = scenario.alternatives.map((alternative) => alternative.path);
  if (cheapestPath === undefined || premiumPath === undefined) {
    throw new Error("workspace: documentary-cinematic scenario lacks its two alternative paths");
  }

  return {
    scenarioId: "documentary-cinematic",
    plan: finalPlanOf(run),
    planSourcePath: rel(orgPath),
    run,
    runProvenance: [rel(orgPath), rel(evalPath), rel(scenarioPath)],
    organization,
    organizationSourcePath: rel(orgPath),
    gapReports: [],
    gapSourcePaths: [],
    alternativeDeltas: [
      { path: cheapestPath, deltas: currentPathDeltas(openRow, catalogSource) },
      { path: premiumPath, deltas: deltasBetween(openRow, flagshipRow, catalogSource) },
    ],
    activeAlternativeHint: "cheapest-reliable",
  };
}

// ---------------------------------------------------------------------------
// Scenario B — T4: forced-failure (blocked → real gap report)
// ---------------------------------------------------------------------------

async function loadForcedFailure(): Promise<WorkspaceRecordBundle> {
  const scenario = forcedFailureScenario;
  const lab = createLabService();
  const t4 = lab.evaluateAndCertify({
    request: {
      goal: scenario.goal,
      goalClass: scenario.goalClass,
      catalogs: {
        models: scenario.modelCatalog,
        capabilities: scenario.capabilityCatalog,
      },
      policy: "cheapest-reliable",
      budgetEnvelopeUsd: scenario.budgetEnvelopeUsd,
    },
    scenarios: [scenario],
    certifiedAt: CERTIFIED_AT,
  });
  // The candidate that ATTEMPTS the goal's required capability (standard tool
  // profile) — the forced failure lives on this organization (same recipe as
  // agent-lab's committed evidence generator).
  const attempting = t4.search.candidates.find(
    (candidate) => candidate.dimensionChoices.toolAllocation === "standard",
  );
  if (attempting === undefined) {
    throw new Error("workspace: forced-failure search produced no attempting candidate");
  }
  const run = runSimulation(scenario, attempting.graph);

  // Committed evidence: refusal record + gap report + gap signal.
  const evalPath = agentLabPath(
    "src",
    "domain",
    "evaluations",
    "eval.org.character-replacement-edit-cand-04.json",
  );
  const evaluation: EvaluationRecord = await readEvaluationRecordFile(evalPath);
  const gapReports: CapabilityGapReport[] = [];
  const gapSourcePaths: string[] = [];
  for (const signal of run.gapSignals) {
    const gapPath = join(
      packageRoot("@gen/arena-bridge"),
      "src",
      "domain",
      "gaps",
      `${signal.gapId}.json`,
    );
    gapReports.push(readGapReport(gapPath));
    gapSourcePaths.push(rel(gapPath));
  }
  const signalPaths = run.gapSignals.map((signal) =>
    rel(
      join(
        packageRoot("@gen/arena-bridge"),
        "src",
        "domain",
        "gaps",
        "signals",
        `${signal.gapId}.signal.json`,
      ),
    ),
  );
  const scenarioPath = agentLabPath("src", "domain", "scenarios", "forced-failure.ts");

  return {
    scenarioId: "forced-failure",
    plan: finalPlanOf(run),
    planSourcePath: rel(scenarioPath),
    run,
    runProvenance: [rel(scenarioPath), rel(evalPath), ...signalPaths],
    organization: attempting.graph,
    organizationSourcePath: rel(scenarioPath),
    organizationEvaluation: {
      certified: false,
      fitness: evaluateRun(run, scenario).fitness,
      note: `Certification refused while the capability gap is unresolved — committed refusal record ${rel(
        evalPath,
      )} (organization ${evaluation.organizationId}, fitness ${evaluation.aggregateFitness}, certified: ${evaluation.certified}).`,
    },
    evaluation,
    evaluationSourcePath: rel(evalPath),
    gapReports,
    gapSourcePaths,
    alternativeDeltas: [],
  };
}

// ---------------------------------------------------------------------------
// Scenario C — replace-actor alternatives (premium vs open-model deltas)
// ---------------------------------------------------------------------------

async function loadReplaceActorAlternatives(): Promise<WorkspaceRecordBundle> {
  const planPath = join(repoRoot(), "spec", "examples", "task-plan.replace-actor.json");
  const gapPath = join(repoRoot(), "spec", "examples", "capability-gap.ref-frame-segment-3.json");
  const plan = stripNulls(await readJson(planPath)) as WorkspaceTaskPlan;
  const gapParsed = CapabilityGapReportSchema.safeParse(stripNulls(await readJson(gapPath)));
  if (!gapParsed.success) {
    throw new Error(
      `workspace: spec gap example violates capability-gap.schema.json: ${gapParsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  // Measured deltas from the committed provider evaluation record: premium
  // (higgsfield/genjutsu — active) vs open-model (wan-2.2/animate).
  const evaluation = await loadEvaluationRecord(CHARACTER_REPLACEMENT_EVALUATION);
  const premiumRow = rowForPath(evaluation.rows, "higgsfield/genjutsu");
  const openRow = rowForPath(evaluation.rows, "wan-2.2/animate");
  if (premiumRow === undefined || openRow === undefined) {
    throw new Error(
      "workspace: provider evaluation record lacks the higgsfield/wan-2.2 comparison rows",
    );
  }
  const premiumPath = "Premium-first: force higgsfield/genjutsu on all segments (higher identity score, ~3.1x cost).";
  const openPath = "Open-models-only: wan-2.2/animate on all segments.";

  return {
    scenarioId: "replace-actor-alternatives",
    plan,
    planSourcePath: rel(planPath),
    runProvenance: [],
    gapReports: [gapParsed.data],
    gapSourcePaths: [rel(gapPath)],
    alternativeDeltas: [
      { path: premiumPath, deltas: currentPathDeltas(premiumRow, evaluation.sourcePath) },
      { path: openPath, deltas: deltasBetween(premiumRow, openRow, evaluation.sourcePath) },
    ],
    activeAlternativeHint: "premium-first",
  };
}

// ---------------------------------------------------------------------------
// Public record source
// ---------------------------------------------------------------------------

const LOADERS: Readonly<Record<WorkspaceScenarioId, () => Promise<WorkspaceRecordBundle>>> = {
  "documentary-cinematic": loadDocumentaryCinematic,
  "forced-failure": loadForcedFailure,
  "replace-actor-alternatives": loadReplaceActorAlternatives,
};

/** Filesystem-backed record source over the committed evidence stores. */
export function createFsRecordSource(): WorkspaceRecordSource {
  return {
    load: (scenarioId) => {
      const loader = LOADERS[scenarioId];
      if (loader === undefined) {
        return Promise.reject(new Error(`workspace: unknown scenario "${scenarioId}"`));
      }
      return loader();
    },
  };
}
