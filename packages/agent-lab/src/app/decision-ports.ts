/**
 * Decision port adapters (spec/human-escalation-contract.md §3, work order W6
 * task C — app layer): the engine pauses at approval edges and resolves the
 * human decision through a DecisionPort. Two adapters:
 *  (a) scripted — replays scenario.approvals through the shared pure
 *      nextScriptedDecision (the engine's default; bit-exact with the
 *      committed records — regression-locked);
 *  (b) interactive — a registry of host-supplied callbacks (the harness hook
 *      used by tests and later by the workspace). Callbacks are consulted in
 *      registration order; the first definite answer wins, and when every
 *      callback abstains the port falls back to the scripted replay so a
 *      harness never fabricates a decision the scenario does not license.
 */
import type { DecisionBundle, DecisionPort, HumanDecision } from "../domain/simulation/decision-types.js";
import type { ScenarioDescriptor } from "../domain/simulation/scenario-types.js";
import { nextScriptedDecision } from "../domain/simulation/scenario-types.js";

/** Scripted adapter: replays scenario.approvals in gate order (the default, bit-exact). */
export function createScriptedDecisionPort(scenario: ScenarioDescriptor): DecisionPort {
  let cursor = 0;
  return {
    resolveDecision: () => nextScriptedDecision(scenario.approvals, cursor++),
  };
}

/** A host callback; returning undefined abstains (next callback / scripted fallback). */
export type DecisionHandler = (bundle: DecisionBundle) => HumanDecision | undefined;

export interface InteractiveDecisionPort extends DecisionPort {
  /** Register a host callback; returns its unregister function. */
  register(handler: DecisionHandler): () => void;
  /** Bundles presented so far (harness introspection — read-only copy). */
  readonly presented: readonly DecisionBundle[];
}

/** Interactive adapter: registry callbacks first, scripted replay as the deterministic fallback. */
export function createInteractiveDecisionPort(
  scenario: ScenarioDescriptor,
  initial?: DecisionHandler,
): InteractiveDecisionPort {
  const handlers: DecisionHandler[] = initial === undefined ? [] : [initial];
  const presented: DecisionBundle[] = [];
  let cursor = 0;
  return {
    resolveDecision: (bundle) => {
      presented.push(bundle);
      for (const handler of handlers) {
        const decision = handler(bundle);
        if (decision !== undefined) return decision;
      }
      return nextScriptedDecision(scenario.approvals, cursor++);
    },
    register: (handler) => {
      handlers.push(handler);
      return () => {
        const index = handlers.indexOf(handler);
        if (index >= 0) handlers.splice(index, 1);
      };
    },
    get presented() {
      return [...presented];
    },
  };
}
