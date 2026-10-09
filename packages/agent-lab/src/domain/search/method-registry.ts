/**
 * Search-method registry (W13, organization-lab §2): the pluggable search
 * plane. `searchOrganizations` and the lab pipeline dispatch through here, so
 * future learned/RL methods register without touching any caller (spec §2:
 * "rule-based first, learned later"; the OUTPUT contract stays frozen by the
 * schema). The four built-ins are registered up front; `registerSearchMethod`
 * returns an unregister handle for tests and plugins. W14 adds the learned
 * method-selection policy (search/learned-method.ts) as the fifth built-in:
 * it delegates per the committed selection ledger, and resolves its delegate
 * through a resolver bound HERE (concrete methods never import the registry —
 * no import cycle; the T5 probe-method path proved zero-caller-change
 * registration long before this one).
 */
import type { OrganizationSearchRequest } from "../lab-api.js";
import type { MethodSearchResult, SearchMethod } from "./method-types.js";
import { ruleSearchMethod } from "./rule-method.js";
import { beamSearchMethod } from "./beam-method.js";
import { evolutionarySearchMethod } from "./evolutionary-method.js";
import { banditSearchMethod } from "./bandit-method.js";
import { bindLearnedMethodResolver, learnedSearchMethod } from "./learned-method.js";

const registry = new Map<string, SearchMethod>();

/** Register a search method; returns an unregister handle. */
export function registerSearchMethod(method: SearchMethod): () => void {
  registry.set(method.name, method);
  return () => {
    const current = registry.get(method.name);
    if (current === method) registry.delete(method.name);
  };
}

/** Known method names (registration order, built-ins first). */
export function listSearchMethodNames(): readonly string[] {
  return [...registry.keys()];
}

/** Look up a method; unknown names fail loudly (never silently fall back). */
export function getSearchMethod(name: string): SearchMethod {
  const method = registry.get(name);
  if (method === undefined) {
    throw new Error(`unknown search method "${name}" — known methods: ${listSearchMethodNames().join(", ")}`);
  }
  return method;
}

/**
 * Run a search through the registry. Method selection is via the request
 * (`request.method`); the default is "rule" — behavior-identical to the
 * pre-W13 engine. Returns the frozen search contract plus per-run telemetry.
 */
export function runOrganizationSearch(request: OrganizationSearchRequest): MethodSearchResult {
  const method = getSearchMethod(request.method ?? "rule");
  return method.search(request);
}

// Built-ins: rule first (the default), then the W13 methods, then the W14
// learned policy (ledger-driven delegation; registered through the same
// registerSearchMethod surface any plugin uses — zero caller changes).
bindLearnedMethodResolver(getSearchMethod);
registerSearchMethod(ruleSearchMethod);
registerSearchMethod(beamSearchMethod);
registerSearchMethod(evolutionarySearchMethod);
registerSearchMethod(banditSearchMethod);
registerSearchMethod(learnedSearchMethod);
