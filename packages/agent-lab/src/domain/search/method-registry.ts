/**
 * Search-method registry (W13, organization-lab §2): the pluggable search
 * plane. `searchOrganizations` and the lab pipeline dispatch through here, so
 * future learned/RL methods register without touching any caller (spec §2:
 * "rule-based first, learned later"; the OUTPUT contract stays frozen by the
 * schema). The four built-ins are registered up front; `registerSearchMethod`
 * returns an unregister handle for tests and plugins.
 */
import type { OrganizationSearchRequest } from "../lab-api.js";
import type { MethodSearchResult, SearchMethod } from "./method-types.js";
import { ruleSearchMethod } from "./rule-method.js";
import { beamSearchMethod } from "./beam-method.js";
import { evolutionarySearchMethod } from "./evolutionary-method.js";
import { banditSearchMethod } from "./bandit-method.js";

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

// Built-ins: rule first (the default), then the W13 methods.
registerSearchMethod(ruleSearchMethod);
registerSearchMethod(beamSearchMethod);
registerSearchMethod(evolutionarySearchMethod);
registerSearchMethod(banditSearchMethod);
