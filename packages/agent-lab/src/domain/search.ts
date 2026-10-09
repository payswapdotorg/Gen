/**
 * Organization search entry point (organization-lab §2, work order B5 → W13).
 * The engine is now pluggable behind the search-method registry (rule | beam |
 * evolutionary | bandit, plus any registered future method); this function is
 * the stable public face and stays behavior-identical to the pre-W13 engine:
 * same enumeration, same candidate ids/seeds, same preScore ranking, same
 * result shape (per-run telemetry rides on runOrganizationSearch / the lab
 * pipeline run record instead). Method selection is via the request
 * (`method`, default "rule").
 */
import type { OrganizationSearchRequest, OrganizationSearchResult } from "./lab-api.js";
import { bodyRegistry } from "./bodies/registry.js";
import { runOrganizationSearch } from "./search/method-registry.js";
import { DEFAULT_DIMENSIONS } from "./search/candidate-space.js";

export { DEFAULT_DIMENSIONS };

export function searchOrganizations(
  request: OrganizationSearchRequest,
  registry = bodyRegistry,
): OrganizationSearchResult {
  const outcome = runOrganizationSearch(
    registry === bodyRegistry ? request : { ...request, bodyRegistry: registry },
  );
  return {
    goalClass: outcome.goalClass,
    candidates: outcome.candidates,
    searchedDimensions: outcome.searchedDimensions,
    issues: outcome.issues,
  };
}
