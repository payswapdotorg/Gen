/**
 * Committed evidence replay tests (organization-lab §4, work order B7): the
 * evaluation records and certified organization graphs committed under
 * src/domain/{evaluations,organizations} must be reproducible from the pinned
 * seeds — this test re-runs the pipeline and compares replay hashes.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EvaluationRecord } from "../src/domain/lab-api.js";
import {
  listEvaluationRecordFiles,
  readEvaluationRecordFile,
  readOrganizationGraphFile,
} from "../src/adapters/fs-evaluation-store.js";
import { createLabService } from "../src/app/lab-service.js";
import { evaluateRun } from "../src/domain/evaluation.js";
import { runSimulation } from "../src/domain/simulation/engine.js";
import { findScenario } from "../src/domain/scenarios/index.js";
import { OrganizationGraphSchema } from "../src/domain/schema/organization-graph.js";

const domainRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "domain");
const CERTIFIED_AT = "2026-10-04T08:00:00.000Z";

test("committed evaluation records exist and re-verify from seed", async () => {
  const files = await listEvaluationRecordFiles(join(domainRoot, "evaluations"));
  assert.equal(files.length, 2, "T2 certification + T4 refusal records are committed");
  const records: EvaluationRecord[] = [];
  for (const file of files) {
    records.push(await readEvaluationRecordFile(join(domainRoot, "evaluations", file)));
  }
  const byOrg = new Map(records.map((record) => [record.organizationId, record]));
  const t2 = byOrg.get("org.documentary-cinematic-remaster-cand-04");
  const t4 = byOrg.get("org.character-replacement-edit-cand-04");
  assert.ok(t2, "T2 evaluation record is committed");
  assert.ok(t4, "T4 refusal record is committed");
  assert.equal(t2.certified, true);
  assert.equal(t4.certified, false, "the T4 record must show the honest refusal");

  // Reproduce the T2 numbers: replay the pinned scenario on the certified graph.
  const certifiedGraph = await readOrganizationGraphFile(
    join(domainRoot, "organizations", "org.documentary-cinematic-remaster-cand-04.json"),
  );
  assert.equal(certifiedGraph.evaluation?.certified, true);
  const scenario = findScenario("documentary-cinematic");
  assert.ok(scenario);
  const replay = runSimulation(scenario, certifiedGraph);
  const t2Entry = t2.scenarios.find((entry) => entry.scenarioId === "documentary-cinematic");
  assert.ok(t2Entry);
  assert.equal(replay.replayHash, t2Entry.replayHash, "replay hash must match the committed record");
  const metrics = evaluateRun(replay, scenario);
  assert.equal(metrics.fitness, t2Entry.metrics.fitness);
  assert.equal(metrics.fitness, t2.aggregateFitness);
  assert.equal(certifiedGraph.evaluation?.fitness, t2.aggregateFitness);
  assert.equal(certifiedGraph.evaluation?.certificationEvidence?.replayRef, t2Entry ? `packages/agent-lab/src/domain/evaluations/${t2.recordId}.json` : "");
});

test("the certified T2 organization parses against the organization-graph schema", async () => {
  const certifiedGraph = await readOrganizationGraphFile(
    join(domainRoot, "organizations", "org.documentary-cinematic-remaster-cand-04.json"),
  );
  const parsed = OrganizationGraphSchema.safeParse(JSON.parse(JSON.stringify(certifiedGraph)));
  assert.ok(parsed.success);
  assert.equal(certifiedGraph.simulation?.seed, "documentary-cinematic-remaster-cheapest-reliable-4");
  assert.equal(
    certifiedGraph.evaluation?.certificationEvidence?.scenarioSetRef,
    "packages/agent-lab/src/domain/scenarios",
  );
  assert.equal(certifiedGraph.evaluation?.certificationEvidence?.gapReportsResolved, true);
});

test("re-running the full pipeline reproduces the committed T2 record", () => {
  const lab = createLabService();
  const scenario = findScenario("documentary-cinematic");
  assert.ok(scenario);
  const result = lab.evaluateAndCertify({
    request: {
      goal: scenario.goal,
      goalClass: scenario.goalClass,
      catalogs: { models: scenario.modelCatalog, capabilities: scenario.capabilityCatalog },
      policy: "cheapest-reliable",
      budgetEnvelopeUsd: scenario.budgetEnvelopeUsd,
    },
    scenarios: [scenario],
    certifiedAt: CERTIFIED_AT,
  });
  assert.equal(result.best?.graph.id, "org.documentary-cinematic-remaster-cand-04");
  assert.equal(result.outcome?.certified, true);
  assert.equal(result.best?.fitness, 0.8398);
});

test("the T4 gap signal is committed for arena ingestion (schema-shaped)", async () => {
  const signal = await readEvaluationRecordFile(
    join(
      domainRoot,
      "..",
      "..",
      "..",
      "arena-bridge",
      "src",
      "domain",
      "gaps",
      "signals",
      "gap.forced-failure-video-character-replacement.signal.json",
    ),
  );
  // Shape check against the capability-gap schema's required fields (the full
  // zod parity lives in @gen/arena-bridge's own suite).
  const draft = signal as unknown as Record<string, unknown>;
  assert.match(String(draft.gapId), /^gap\.[a-z0-9-]+$/);
  assert.equal(draft.kind, "mapping-shortfall");
  assert.ok(typeof (draft.failureEvidence as Record<string, unknown>)?.summary === "string");
  const impact = draft.impact as Record<string, unknown>;
  assert.equal(impact.goalClass, "character-replacement-edit");
});
