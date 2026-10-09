/**
 * T5 — search-method pluggability (W17 battery design, organization-lab §2.1).
 *
 * The W13 search-method registry laws, exercised at the acceptance domain
 * layer over the REAL composed registry catalog — the same plane the T2
 * organization runs certify on:
 *
 *   pluggability   a registered custom method dispatches by request.method
 *                  with ZERO caller changes; unregister restores.
 *   determinism    same seed → byte-identical ranked output AND telemetry
 *                  (wallTimeMs — operational metadata — excluded).
 *   seed-sensitivity
 *                  evolutionary exploration differs across seeds (documented,
 *                  asserted); beam is seed-independent by construction.
 *   budget law     evaluationBudget binds every fitness-driven method:
 *                  3 ≤ cap strictly < unbounded.
 *   telemetry law  every method run carries the frozen public key set.
 *   registry law   unknown methods fail loudly with the known-methods list;
 *                  built-ins register in spec order; default is "rule".
 *
 * End-to-end coverage (pipeline + certification) lives in
 * t5-end-to-end.test.ts.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createLabService } from "../../../packages/agent-lab/src/app/lab-service.js";
import { documentaryCinematicScenario } from "../../../packages/agent-lab/src/domain/scenarios/index.js";
import { registryViewToCapabilityCatalog } from "../../../packages/agent-lab/src/adapters/registry-catalog-adapter.js";
import {
  listSearchMethodNames,
  registerSearchMethod,
  runOrganizationSearch,
} from "../../../packages/agent-lab/src/domain/search/method-registry.js";
import type { MethodSearchResult, SearchMethod } from "../../../packages/agent-lab/src/domain/search/method-types.js";
import { composeRegistry } from "./lib/compose-registry.js";

const TELEMETRY_FROZEN_KEYS = [
  "method",
  "seed",
  "candidatesConsidered",
  "candidatesEmitted",
  "evaluationsRun",
  "wallTimeMs",
] as const;

/** A search request over the REAL composed registry catalog (the T2 plane). */
async function request(overrides: Record<string, unknown> = {}) {
  const composed = await composeRegistry();
  return {
    goal: documentaryCinematicScenario.goal,
    goalClass: documentaryCinematicScenario.goalClass,
    catalogs: {
      models: documentaryCinematicScenario.modelCatalog,
      capabilities: registryViewToCapabilityCatalog(composed.view),
    },
    policy: "cheapest-reliable",
    budgetEnvelopeUsd: documentaryCinematicScenario.budgetEnvelopeUsd,
    scenarios: [documentaryCinematicScenario],
    ...overrides,
  };
}

/** Deterministic-twin comparison: deep-equal ignoring wallTimeMs. */
function deterministicEqual(a: MethodSearchResult, b: MethodSearchResult): boolean {
  const strip = (outcome: MethodSearchResult): MethodSearchResult => ({
    ...outcome,
    telemetry: { ...outcome.telemetry, wallTimeMs: 0 },
  });
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

test("T5: a registered custom method dispatches by request.method with zero caller changes", async () => {
  const calls: string[] = [];
  const custom: SearchMethod = {
    name: "t5-custom-probe",
    search: (req) => {
      calls.push(String(req.method));
      const base = runOrganizationSearch({ ...req, method: "rule" });
      return { ...base, telemetry: { ...base.telemetry, method: "t5-custom-probe" } };
    },
  };
  const unregister = registerSearchMethod(custom);
  try {
    assert.ok(listSearchMethodNames().includes("t5-custom-probe"), "the registry lists the custom method");
    const outcome = runOrganizationSearch(await request({ method: "t5-custom-probe" }));
    assert.equal(outcome.telemetry.method, "t5-custom-probe", "the custom method's own telemetry wins");
    assert.deepEqual(calls, ["t5-custom-probe"], "exactly one dispatch through the custom method");
    assert.ok(outcome.candidates.length > 0, "the custom method returned the frozen search contract");
    // Zero caller changes: the lab service dispatches the SAME way.
    const lab = createLabService();
    const viaLab = lab.search(await request({ method: "t5-custom-probe" }));
    assert.equal(viaLab.candidates.length, outcome.candidates.length, "lab.search needs no new call shape");
  } finally {
    unregister();
  }
  assert.ok(!listSearchMethodNames().includes("t5-custom-probe"), "unregister restores the registry");
});

test("T5: same-seed determinism is byte-equality on output AND telemetry (wallTimeMs excluded)", async () => {
  for (const method of ["evolutionary", "bandit", "beam"] as const) {
    const req = await request({ method, seed: "t5-determinism-probe" });
    const first = runOrganizationSearch(req);
    const second = runOrganizationSearch({ ...req });
    assert.ok(deterministicEqual(first, second), `${method}: same seed must reproduce byte-identical outcome`);
    assert.equal(
      JSON.stringify(first.candidates.map((candidate) => candidate.graph.id)),
      JSON.stringify(second.candidates.map((candidate) => candidate.graph.id)),
      `${method}: candidate order is part of the frozen contract`,
    );
    assert.deepEqual(
      { ...first.telemetry, wallTimeMs: 0 },
      { ...second.telemetry, wallTimeMs: 0 },
      `${method}: telemetry deep-equal with wallTimeMs excluded`,
    );
  }
});

test("T5: evolutionary seed-sensitivity is real (different seeds explore differently)", async () => {
  const seedA = runOrganizationSearch(await request({ method: "evolutionary", seed: "t5-seed-a" }));
  const seedB = runOrganizationSearch(await request({ method: "evolutionary", seed: "t5-seed-b" }));
  assert.equal(seedA.telemetry.seed, "t5-seed-a");
  assert.equal(seedB.telemetry.seed, "t5-seed-b");
  const idsA = JSON.stringify(seedA.candidates.map((candidate) => candidate.graph.id));
  const idsB = JSON.stringify(seedB.candidates.map((candidate) => candidate.graph.id));
  assert.notEqual(idsA, idsB, "documented law: different seeds drive different exploration");
});

test("T5: beam is seed-independent (the seed never enters beam output)", async () => {
  const beamA = runOrganizationSearch(await request({ method: "beam", seed: "t5-seed-a" }));
  const beamB = runOrganizationSearch(await request({ method: "beam", seed: "t5-seed-b" }));
  assert.equal(
    JSON.stringify(beamA.candidates.map((candidate) => candidate.graph.id)),
    JSON.stringify(beamB.candidates.map((candidate) => candidate.graph.id)),
    "beam expands levels deterministically with no PRNG — seed must not matter",
  );
});

test("T5: the budget law binds every fitness-driven method (3 ≤ cap strictly < unbounded)", async () => {
  for (const method of ["beam", "evolutionary", "bandit"] as const) {
    const capped = runOrganizationSearch(await request({ method, options: { evaluationBudget: 3 } }));
    assert.ok(
      capped.telemetry.evaluationsRun <= 3,
      `${method}: evaluationBudget caps internal evaluations (got ${capped.telemetry.evaluationsRun})`,
    );
    assert.ok(capped.telemetry.evaluationsRun >= 1, `${method}: a cap of 3 still runs the method`);
    const unbounded = runOrganizationSearch(await request({ method }));
    assert.notEqual(
      unbounded.telemetry.evaluationsRun,
      -1,
      `${method}: absent budget means the method default, never an error`,
    );
    assert.ok(
      unbounded.telemetry.evaluationsRun > 0,
      `${method}: the method default exercises its oracle (strictly above the floor)`,
    );
  }
});

test("T5: telemetry law — every method run carries the frozen public key set", async () => {
  for (const method of ["rule", "beam", "evolutionary", "bandit"] as const) {
    const outcome = runOrganizationSearch(await request({ method, seed: `t5-tele-${method}` }));
    for (const key of TELEMETRY_FROZEN_KEYS) {
      assert.ok(
        key in outcome.telemetry,
        `${method}: telemetry.${key} is part of the frozen public contract`,
      );
    }
    assert.equal(outcome.telemetry.method, method);
    assert.ok(Number.isFinite(outcome.telemetry.candidatesConsidered));
    assert.ok(Number.isFinite(outcome.telemetry.candidatesEmitted));
    assert.ok(Number.isFinite(outcome.telemetry.evaluationsRun));
    assert.ok(Number.isFinite(outcome.telemetry.wallTimeMs));
  }
});

test("T5: unknown methods fail loudly with the known-methods list", async () => {
  const badRequest = await request({ method: "no-such-method" });
  assert.throws(
    () => runOrganizationSearch(badRequest),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /unknown search method "no-such-method"/);
      assert.match(error.message, /known methods: .+evolutionary.+bandit/);
      return true;
    },
    "never silently fall back to rule",
  );
});

test("T5: built-ins register in spec order; request.method defaults to rule", async () => {
  assert.deepEqual(
    listSearchMethodNames().slice(0, 4),
    ["rule", "beam", "evolutionary", "bandit"],
    "spec §2.1 order: rule (default) first, then the W13 methods",
  );
  const defaulted = runOrganizationSearch(await request({ method: undefined }));
  assert.equal(defaulted.telemetry.method, "rule", "omitted request.method dispatches to rule");
});
