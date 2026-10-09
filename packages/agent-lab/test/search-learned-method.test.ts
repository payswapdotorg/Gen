/**
 * Learned method-selection policy tests (W14, organization-lab §2.1): the
 * registry's fifth built-in — a SearchMethod named "learned" that reads the
 * committed selection ledger and delegates to the best-performing method for
 * the request's goal class. Laws exercised: empty-ledger fallback to rule,
 * the documented tie-break order (highest rankedBestFitness, then fewest
 * evaluationsRun, then name order), the budget law (evaluationBudget caps the
 * delegated run), the frozen telemetry key set + detail.delegatedTo,
 * same-ledger determinism, the self-delegation guard, and the full flywheel
 * over the committed ledger (real numbers from real pipeline runs).
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { OrganizationSearchRequest } from "../src/domain/lab-api.js";
import type { MethodSelectionRecord } from "../src/domain/method-selection/selection-ledger.js";
import type { MethodSearchResult } from "../src/domain/search/method-types.js";
import {
  listSearchMethodNames,
  runOrganizationSearch,
} from "../src/domain/search/method-registry.js";
import {
  armLearnedMethodLedger,
  learnedSearchMethod,
} from "../src/domain/search/learned-method.js";
import {
  LEARNED_METHOD_NAME,
  rankMethodsForGoalClass,
  selectBestMethod,
} from "../src/domain/method-selection/selection-ledger.js";
import { createFsSelectionLedgerStore } from "../src/adapters/fs-selection-ledger-store.js";
import { documentaryCinematicScenario } from "../src/domain/scenarios/index.js";

const GOAL_CLASS = documentaryCinematicScenario.goalClass;

const TELEMETRY_FROZEN_KEYS = [
  "method",
  "seed",
  "candidatesConsidered",
  "candidatesEmitted",
  "evaluationsRun",
  "wallTimeMs",
] as const;

function requestFor(extra: Partial<OrganizationSearchRequest> = {}): OrganizationSearchRequest {
  return {
    goal: documentaryCinematicScenario.goal,
    goalClass: GOAL_CLASS,
    catalogs: { models: documentaryCinematicScenario.modelCatalog, capabilities: documentaryCinematicScenario.capabilityCatalog },
    policy: "cheapest-reliable",
    budgetEnvelopeUsd: documentaryCinematicScenario.budgetEnvelopeUsd,
    scenarios: [documentaryCinematicScenario],
    ...extra,
  };
}

function row(overrides: Partial<MethodSelectionRecord> = {}): MethodSelectionRecord {
  return {
    goalClass: GOAL_CLASS,
    method: "beam",
    seed: "ledger-seed",
    candidatesConsidered: 16,
    candidatesEmitted: 4,
    evaluationsRun: 4,
    rankedBestFitness: 0.8,
    certified: true,
    selectedAt: "2026-10-05T09:05:00.000Z",
    ...overrides,
  };
}

/** Runs the learned method with a given ledger; restores the source after. */
function learnedWithLedger(
  records: readonly MethodSelectionRecord[],
  request: OrganizationSearchRequest,
): MethodSearchResult {
  const restore = armLearnedMethodLedger(() => records);
  try {
    return runOrganizationSearch({ ...request, method: LEARNED_METHOD_NAME });
  } finally {
    restore();
  }
}

test("the learned policy is registered fifth: zero caller changes via request.method", () => {
  assert.deepEqual(listSearchMethodNames().slice(0, 5), [
    "rule",
    "beam",
    "evolutionary",
    "bandit",
    "learned",
  ]);
  const outcome = learnedWithLedger([], requestFor({ seed: "w14-registered" }));
  assert.equal(outcome.telemetry.method, LEARNED_METHOD_NAME);
  assert.equal(outcome.candidates.length > 0, true);
});

test("empty ledger => rule (the documented cold start)", () => {
  const request = requestFor({ seed: "w14-cold" });
  const learned = learnedWithLedger([], request);
  const rule = runOrganizationSearch({ ...request, method: "rule" });
  assert.equal(learned.telemetry.detail?.delegatedTo, "rule");
  assert.deepEqual(learned.candidates, rule.candidates, "cold start is behavior-identical to rule");
  assert.deepEqual(learned.searchedDimensions, rule.searchedDimensions);
  assert.equal(learned.telemetry.evaluationsRun, 0);
  // The default (unarmed) ledger source is also empty — safe to register unconditionally.
  const unarmed = runOrganizationSearch({ ...requestFor({ seed: "w14-unarmed" }), method: LEARNED_METHOD_NAME });
  assert.equal(unarmed.telemetry.detail?.delegatedTo, "rule");
});

test("policy tie-breaks: highest rankedBestFitness, then fewest evaluationsRun, then name order", () => {
  assert.equal(selectBestMethod([], GOAL_CLASS), "rule", "nothing rankable => rule");
  // Fitness dominates.
  assert.equal(
    selectBestMethod([row({ method: "beam", rankedBestFitness: 0.9, evaluationsRun: 5 }), row({ method: "evolutionary", rankedBestFitness: 0.85, evaluationsRun: 2 })], GOAL_CLASS),
    "beam",
  );
  // Fitness tie => fewest evaluationsRun.
  assert.equal(
    selectBestMethod([row({ method: "beam", rankedBestFitness: 0.9, evaluationsRun: 5 }), row({ method: "evolutionary", rankedBestFitness: 0.9, evaluationsRun: 3 })], GOAL_CLASS),
    "evolutionary",
  );
  // Full tie => name order (bandit < beam).
  assert.equal(
    selectBestMethod([row({ method: "beam", rankedBestFitness: 0.9, evaluationsRun: 3 }), row({ method: "bandit", rankedBestFitness: 0.9, evaluationsRun: 3 })], GOAL_CLASS),
    "bandit",
  );
  // Other goal classes never leak in.
  assert.equal(
    selectBestMethod([row({ goalClass: "some-other-class", method: "bandit", rankedBestFitness: 0.99 })], GOAL_CLASS),
    "rule",
  );
  // Multiple rows per method: the method's best row represents it.
  const ranking = rankMethodsForGoalClass(
    [
      row({ method: "beam", seed: "s1", rankedBestFitness: 0.7, evaluationsRun: 9 }),
      row({ method: "beam", seed: "s2", rankedBestFitness: 0.9, evaluationsRun: 12 }),
      row({ method: "rule", rankedBestFitness: 0.9, evaluationsRun: 0 }),
    ],
    GOAL_CLASS,
  );
  assert.deepEqual(
    ranking.map((entry) => entry.method),
    ["rule", "beam"],
    "rule wins the 0.9 tie with 0 evaluations (the real committed-ledger story)",
  );
  assert.equal(ranking[1]?.records, 2);
});

test("delegation follows the tie-breaks in real runs (detail.delegatedTo)", () => {
  const request = requestFor({ seed: "w14-delegate" });
  const fitnessWins = learnedWithLedger(
    [row({ method: "beam", rankedBestFitness: 0.9, evaluationsRun: 5 }), row({ method: "evolutionary", rankedBestFitness: 0.85, evaluationsRun: 2 })],
    request,
  );
  assert.equal(fitnessWins.telemetry.detail?.delegatedTo, "beam");
  const evalsWin = learnedWithLedger(
    [row({ method: "beam", rankedBestFitness: 0.9, evaluationsRun: 5 }), row({ method: "evolutionary", rankedBestFitness: 0.9, evaluationsRun: 3 })],
    request,
  );
  assert.equal(evalsWin.telemetry.detail?.delegatedTo, "evolutionary");
  const nameWins = learnedWithLedger(
    [row({ method: "beam", rankedBestFitness: 0.9, evaluationsRun: 3 }), row({ method: "bandit", rankedBestFitness: 0.9, evaluationsRun: 3 })],
    request,
  );
  assert.equal(nameWins.telemetry.detail?.delegatedTo, "bandit");
  // The delegated run is REAL: the output equals a direct run of the winner.
  const direct = runOrganizationSearch({ ...request, method: "bandit" });
  assert.deepEqual(nameWins.candidates, direct.candidates);
  assert.deepEqual(nameWins.searchedDimensions, direct.searchedDimensions);
});

test("budget law: evaluationBudget caps the delegated run", () => {
  const ledger = [row({ method: "beam", rankedBestFitness: 0.9, evaluationsRun: 12 })];
  for (const method of ["beam", "evolutionary", "bandit"] as const) {
    const outcome = learnedWithLedger(
      ledger.map((entry) => ({ ...entry, method })),
      requestFor({ seed: "w14-budget", options: { evaluationBudget: 3 } }),
    );
    assert.ok(
      outcome.telemetry.evaluationsRun <= 3,
      `learned→${method}: delegated run respected the cap (got ${outcome.telemetry.evaluationsRun})`,
    );
    assert.ok(outcome.telemetry.evaluationsRun >= 1, `learned→${method}: the method still ran`);
  }
  // A capped delegation to rule consumes nothing (rule never evaluates).
  const toRule = learnedWithLedger(
    [row({ method: "rule", rankedBestFitness: 0.95, evaluationsRun: 0 })],
    requestFor({ seed: "w14-budget", options: { evaluationBudget: 3 } }),
  );
  assert.equal(toRule.telemetry.detail?.delegatedTo, "rule");
  assert.equal(toRule.telemetry.evaluationsRun, 0);
});

test("telemetry law: frozen keys + detail.delegatedTo + honest delegated counts", () => {
  const ledger = [row({ method: "evolutionary", rankedBestFitness: 0.9, evaluationsRun: 12 })];
  const outcome = learnedWithLedger(ledger, requestFor({ seed: "w14-tele", options: { evaluationBudget: 5 } }));
  for (const key of TELEMETRY_FROZEN_KEYS) {
    assert.ok(key in outcome.telemetry, `telemetry.${key} is part of the frozen public contract`);
  }
  assert.equal(outcome.telemetry.method, LEARNED_METHOD_NAME);
  assert.equal(outcome.telemetry.seed, "w14-tele");
  assert.equal(outcome.telemetry.detail?.delegatedTo, "evolutionary");
  assert.equal(typeof outcome.telemetry.detail?.ledgerRecords, "number");
  assert.equal(outcome.telemetry.detail?.goalClassRecords, 1);
  // The counts mirror the delegated run exactly.
  const direct = runOrganizationSearch({
    ...requestFor({ seed: "w14-tele", options: { evaluationBudget: 5 } }),
    method: "evolutionary",
  });
  assert.equal(outcome.telemetry.candidatesConsidered, direct.telemetry.candidatesConsidered);
  assert.equal(outcome.telemetry.candidatesEmitted, direct.telemetry.candidatesEmitted);
  assert.equal(outcome.telemetry.evaluationsRun, direct.telemetry.evaluationsRun);
});

test("same ledger + same request => byte-identical output (wallTimeMs excluded)", () => {
  const ledger = [
    row({ method: "beam", seed: "s1", rankedBestFitness: 0.82, evaluationsRun: 4 }),
    row({ method: "evolutionary", seed: "s1", rankedBestFitness: 0.9, evaluationsRun: 12 }),
    row({ method: "bandit", seed: "s1", rankedBestFitness: 0.78, evaluationsRun: 24 }),
  ];
  const request = requestFor({ seed: "w14-determinism", options: { evaluationBudget: 6 } });
  const first = learnedWithLedger(ledger, request);
  const second = learnedWithLedger([...ledger], { ...request });
  const strip = (outcome: MethodSearchResult): string =>
    JSON.stringify({ ...outcome, telemetry: { ...outcome.telemetry, wallTimeMs: 0 } });
  assert.equal(strip(first), strip(second));
  assert.equal(first.telemetry.detail?.delegatedTo, second.telemetry.detail?.delegatedTo);
  // Ledger row order must not matter (the policy sorts deterministically).
  const shuffled = learnedWithLedger([...ledger].reverse(), request);
  assert.equal(strip(shuffled), strip(first));
});

test("self-delegation guard: learned rows never win the ranking", () => {
  const ledger = [
    row({ method: LEARNED_METHOD_NAME, rankedBestFitness: 0.99, evaluationsRun: 0 }),
    row({ method: "beam", rankedBestFitness: 0.9, evaluationsRun: 4 }),
  ];
  const outcome = learnedWithLedger(ledger, requestFor({ seed: "w14-guard" }));
  assert.equal(outcome.telemetry.detail?.delegatedTo, "beam", "learned rows are excluded — delegation would recurse");
  assert.ok(!rankMethodsForGoalClass(ledger, GOAL_CLASS).some((entry) => entry.method === LEARNED_METHOD_NAME));
  // A ledger holding ONLY learned rows is a cold start.
  assert.equal(selectBestMethod([row({ method: LEARNED_METHOD_NAME, rankedBestFitness: 0.99 })], GOAL_CLASS), "rule");
});

test("a ledger citing an unregistered method fails loudly (never silently falls back)", () => {
  const ledger = [row({ method: "ghost-method", rankedBestFitness: 0.99, evaluationsRun: 1 })];
  const restore = armLearnedMethodLedger(() => ledger);
  try {
    assert.throws(
      () => runOrganizationSearch({ ...requestFor({ seed: "w14-ghost" }), method: LEARNED_METHOD_NAME }),
      /unknown search method "ghost-method" — known methods: /,
    );
  } finally {
    restore();
  }
});

test("the full flywheel over the committed ledger: learned delegates per the real numbers", () => {
  const store = createFsSelectionLedgerStore();
  const committed = store.listSelections();
  assert.ok(committed.length >= 5, "the committed ledger carries the W14 generation runs");
  // The real committed story: rule / evolutionary / bandit all reached fitness
  // 0.8398 over documentary-cinematic-remaster; rule wins the tie with 0
  // evaluationsRun — exactly the documented tie-break order.
  const winner = selectBestMethod(committed, GOAL_CLASS);
  assert.equal(winner, "rule");
  const ruleRow = committed.find((entry) => entry.method === "rule");
  assert.ok(ruleRow);
  assert.equal(ruleRow.rankedBestFitness, 0.8398);
  assert.equal(ruleRow.evaluationsRun, 0);
  const tied = committed.filter(
    (entry) => entry.goalClass === GOAL_CLASS && entry.rankedBestFitness === 0.8398 && entry.method !== LEARNED_METHOD_NAME,
  );
  assert.deepEqual(
    tied.map((entry) => entry.method).sort(),
    ["bandit", "evolutionary", "rule"],
    "the real tie at the committed optimum",
  );
  // And the learned policy over the committed ledger delegates to that winner.
  const restore = armLearnedMethodLedger(() => committed);
  try {
    const outcome = runOrganizationSearch({
      ...requestFor({ seed: "w14-flywheel", options: { evaluationBudget: 12 } }),
      method: LEARNED_METHOD_NAME,
    });
    assert.equal(outcome.telemetry.detail?.delegatedTo, "rule");
    assert.equal(outcome.telemetry.evaluationsRun, 0);
    assert.ok(outcome.candidates.length > 0);
  } finally {
    restore();
  }
});

test("learnedSearchMethod is a plain SearchMethod (probe-method parity: any name, any registry)", () => {
  assert.equal(learnedSearchMethod.name, LEARNED_METHOD_NAME);
  assert.equal(typeof learnedSearchMethod.search, "function");
});
