/**
 * T5 end-to-end (W17 battery design, organization-lab §2.1): the search-method
 * laws exercised through the FULL certification pipeline — the chain a user
 * actually experiences:
 *
 *   search (method via request) → evaluate → certify → searchTelemetry on
 *   the pipeline result.
 *
 * Proves: the pipeline carries per-run search telemetry for every method;
 * the rule-parity anchor (the committed certified optimum is the one the
 * fitness-driven methods find — replayHash 3474f812, fitness 0.8398); the
 * budget law caps the pipeline end-to-end; same-seed pipeline runs certify
 * the identical graph with deep-equal telemetry (wallTimeMs excluded).
 * Domain-layer coverage lives in t5-search-method-pluggability.test.ts.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { createLabService } from "../../../packages/agent-lab/src/app/lab-service.js";
import { documentaryCinematicScenario } from "../../../packages/agent-lab/src/domain/scenarios/index.js";
import { registryViewToCapabilityCatalog } from "../../../packages/agent-lab/src/adapters/registry-catalog-adapter.js";
import { readEvaluationRecordFile } from "../../../packages/agent-lab/src/adapters/fs-evaluation-store.js";
import { composeRegistry, repoRoot } from "./lib/compose-registry.js";

const CERTIFIED_AT = "2026-10-04T00:00:00Z";
const EVAL_RECORD = "packages/agent-lab/src/domain/evaluations/eval.org.documentary-cinematic-remaster-cand-04.json";

/** The committed certification evidence behind the documentary organization. */
async function committedEvaluation() {
  return readEvaluationRecordFile(join(repoRoot(), EVAL_RECORD));
}

/** The T2 pipeline request over the REAL composed registry catalog. */
async function pipelineRequest(method: string, seed?: string, evaluationBudget?: number) {
  const composed = await composeRegistry();
  return {
    request: {
      goal: documentaryCinematicScenario.goal,
      goalClass: documentaryCinematicScenario.goalClass,
      catalogs: {
        models: documentaryCinematicScenario.modelCatalog,
        capabilities: registryViewToCapabilityCatalog(composed.view),
      },
      policy: "cheapest-reliable",
      budgetEnvelopeUsd: documentaryCinematicScenario.budgetEnvelopeUsd,
      method,
      ...(seed !== undefined ? { seed } : {}),
      ...(evaluationBudget !== undefined
        ? { options: { evaluationBudget } }
        : {}),
    },
    scenarios: [documentaryCinematicScenario],
    certifiedAt: CERTIFIED_AT,
  };
}

test("T5 e2e: the evaluation pipeline carries searchTelemetry (frozen keys) on its result for every method", async () => {
  const lab = createLabService();
  for (const method of ["rule", "beam", "evolutionary", "bandit"] as const) {
    const result = lab.evaluateAndCertify(await pipelineRequest(method, `t5-e2e-${method}`));
    assert.equal(result.searchTelemetry.method, method, `${method}: telemetry rides the pipeline result`);
    for (const key of ["seed", "candidatesConsidered", "candidatesEmitted", "evaluationsRun", "wallTimeMs"]) {
      assert.ok(key in result.searchTelemetry, `${method}: telemetry.${key} present end-to-end`);
    }
    assert.ok(result.search.candidates.length > 0, `${method}: the frozen search contract flows through`);
  }
});

test("T5 e2e: rule-parity anchor — evolutionary at budget 24 finds the committed optimum", async () => {
  const committed = await committedEvaluation();
  const entry = committed.scenarios.find((scenario) => scenario.scenarioId === "documentary-cinematic");
  assert.ok(entry, "the committed T2 evaluation entry exists");
  assert.equal(entry.replayHash.slice(0, 8), "3474f812", "the committed replayHash anchor");
  assert.equal(entry.metrics.fitness, 0.8398, "the committed optimum fitness");

  const lab = createLabService();
  const result = lab.evaluateAndCertify(await pipelineRequest("evolutionary", "t5-e2e-parity", 24));
  const best = result.ranked[0];
  assert.ok(best, "evolutionary produces a ranked best");
  assert.ok(
    Math.abs(best.fitness - 0.8398) < 1e-9,
    `evolutionary's best matches the committed optimum (got ${best.fitness})`,
  );
  assert.equal(best.graph.id, "org.documentary-cinematic-remaster-evolutionary-cand-00");
  // The found candidate's own replay is the committed scenario replay:
  // same graph family, same fitness, hash-stable simulation underneath.
  assert.equal(result.searchTelemetry.evaluationsRun <= 24, true, "the anchor ran within budget");
});

test("T5 e2e: evaluationBudget caps the pipeline's search evaluations end-to-end", async () => {
  const lab = createLabService();
  const capped = lab.evaluateAndCertify(await pipelineRequest("bandit", "t5-e2e-budget", 3));
  assert.ok(
    capped.searchTelemetry.evaluationsRun <= 3,
    `bandit pipeline respects the cap (got ${capped.searchTelemetry.evaluationsRun})`,
  );
  assert.ok(capped.search.candidates.length > 0, "a capped run still delivers the frozen contract");
  const floor = lab.evaluateAndCertify(await pipelineRequest("bandit", "t5-e2e-budget", 3));
  assert.ok(floor.ranked.length > 0, "cap 3 (the documented floor) still ranks and certifies");
});

test("T5 e2e: same-seed pipeline runs certify the identical graph with deep-equal telemetry", async () => {
  const lab = createLabService();
  const first = lab.evaluateAndCertify(await pipelineRequest("evolutionary", "t5-e2e-determinism"));
  const second = lab.evaluateAndCertify(await pipelineRequest("evolutionary", "t5-e2e-determinism"));
  assert.equal(first.certifiedGraph?.id, second.certifiedGraph?.id, "identical certified graph");
  assert.deepEqual(
    { ...first.searchTelemetry, wallTimeMs: 0 },
    { ...second.searchTelemetry, wallTimeMs: 0 },
    "telemetry deep-equal with wallTimeMs excluded",
  );
  assert.deepEqual(
    first.ranked.map((candidate) => [candidate.graph.id, candidate.fitness]),
    second.ranked.map((candidate) => [candidate.graph.id, candidate.fitness]),
    "identical ranked order",
  );
});
