/**
 * Learned method-selection policy (W14, organization-lab §2.1 + §4/§5 — the
 * flywheel's read side). A registered SearchMethod named "learned" whose
 * policy reads the committed per-goal-class method-selection ledger and
 * dispatches to the best-performing method FOR THE REQUEST'S GOAL CLASS
 * (deterministic tie-breaks: highest rankedBestFitness, then fewest
 * evaluationsRun, then name order; empty ledger => "rule" — the cold start).
 *
 * Laws (same as every method, organization-lab §2.1):
 *  - deterministic: same ledger + same request => byte-identical output
 *    (wallTimeMs is operational metadata, excluded as everywhere);
 *  - budget-bound: `options.evaluationBudget` caps the delegated run (the
 *    delegated method implements the budget law; the learned telemetry
 *    reports the delegated run's evaluation count);
 *  - telemetry: the frozen public key set, plus detail.delegatedTo = the
 *    chosen method name (the decision's provenance).
 *
 * Wiring without import cycles: concrete methods never import the registry
 * (method-types.ts keeps that invariant), so the registry binds its method
 * resolver here at registration (bindLearnedMethodResolver). The ledger
 * source is likewise injectable — armed by the composition root / tests via
 * armLearnedMethodLedger; the default is the empty ledger (cold start =>
 * rule), so the method is total and safe to register unconditionally.
 */
import { deriveSearchSeed, type MethodSearchResult, type SearchMethod } from "./method-types.js";
import {
  LEARNED_METHOD_NAME,
  selectBestMethod,
  type MethodSelectionRecord,
} from "../method-selection/selection-ledger.js";

/** Resolves a method by name; bound by the registry at registration. */
export type MethodResolver = (name: string) => SearchMethod;

let resolveMethod: MethodResolver = (name: string): SearchMethod => {
  throw new Error(
    `learned method: no method resolver bound (the search-method registry binds it at registration) — cannot dispatch to "${name}"`,
  );
};

/**
 * Bind the method resolver (called by method-registry.ts when registering the
 * learned method). The registry owns the lookup; this module must not import
 * it or the two would form an import cycle.
 */
export function bindLearnedMethodResolver(resolver: MethodResolver): void {
  resolveMethod = resolver;
}

/** Reads the committed selection ledger (the learned policy's world model). */
export type SelectionLedgerSource = () => readonly MethodSelectionRecord[];

let ledgerSource: SelectionLedgerSource = () => [];

/**
 * Arm the learned method's ledger source (composition root / tests). Returns
 * a restore handle — the default source is the empty ledger (cold start),
 * and tests must restore it to keep the registry's global state clean.
 */
export function armLearnedMethodLedger(source: SelectionLedgerSource): () => void {
  const previous = ledgerSource;
  ledgerSource = source;
  return () => {
    ledgerSource = previous;
  };
}

export const learnedSearchMethod: SearchMethod = {
  name: LEARNED_METHOD_NAME,
  search: (request): MethodSearchResult => {
    const started = Date.now();
    const records = ledgerSource();
    // The policy: best-performing method for THIS goal class ("learned" rows
    // are excluded by selectBestMethod — self-delegation would recurse).
    const chosen = selectBestMethod(records, request.goalClass);
    // Budget law: options pass through untouched, so an evaluationBudget on
    // the request caps the delegated run exactly as it would cap a direct one.
    const delegated = resolveMethod(chosen).search({ ...request, method: chosen });
    const goalClassRecords = records.filter((entry) => entry.goalClass === request.goalClass).length;
    return {
      goalClass: request.goalClass,
      candidates: delegated.candidates,
      searchedDimensions: delegated.searchedDimensions,
      issues: delegated.issues,
      telemetry: {
        method: LEARNED_METHOD_NAME,
        seed: request.seed ?? deriveSearchSeed(request.goalClass, request.policy),
        candidatesConsidered: delegated.telemetry.candidatesConsidered,
        candidatesEmitted: delegated.telemetry.candidatesEmitted,
        evaluationsRun: delegated.telemetry.evaluationsRun,
        wallTimeMs: Date.now() - started,
        ...(delegated.telemetry.bestEvaluatedFitness !== undefined
          ? { bestEvaluatedFitness: delegated.telemetry.bestEvaluatedFitness }
          : {}),
        detail: {
          delegatedTo: chosen,
          ledgerRecords: records.length,
          goalClassRecords,
        },
      },
    };
  },
};
