/**
 * Rule search method (W13, organization-lab §2): deterministic enumeration
 * over the five binding dimensions — the pre-W13 engine, registered as the
 * first pluggable method. Behavior-identical to searchOrganizations before
 * the registry refactor: same enumeration order, same candidate ids/seeds,
 * same preScore ranking. Proven by the unchanged 111-test suite plus
 * registry parity tests.
 */
import type { OrganizationSearchDimensions, OrganizationSearchRequest } from "../lab-api.js";
import { bodyRegistry } from "../bodies/registry.js";
import { findRoleTemplate } from "../search-templates.js";
import {
  buildCandidateFromProfile,
  catalogShortfallIssues,
  DEFAULT_DIMENSIONS,
  enumerateDimensionProfiles,
  type DimensionProfile,
} from "./candidate-space.js";
import { deriveSearchSeed, type MethodSearchResult, type SearchMethod } from "./method-types.js";

export const ruleSearchMethod: SearchMethod = {
  name: "rule",
  search: (request: OrganizationSearchRequest): MethodSearchResult => {
    const dims: OrganizationSearchDimensions = { ...DEFAULT_DIMENSIONS, ...request.dimensions };
    const template = findRoleTemplate(request.goalClass);
    const issues = catalogShortfallIssues(template, request);
    const registry = request.bodyRegistry ?? bodyRegistry;
    const profiles = enumerateDimensionProfiles(template, dims);
    const started = Date.now();
    const candidates = [];
    for (let index = 0; index < profiles.length; index += 1) {
      const built = buildCandidateFromProfile({
        request,
        template,
        registry,
        profile: profiles[index] as DimensionProfile,
        index,
        method: "rule",
      });
      if (built !== undefined) candidates.push(built);
    }
    const max = request.maxCandidates ?? 32;
    const ranked = [...candidates]
      .sort((a, b) => b.preScore - a.preScore || a.graph.id.localeCompare(b.graph.id))
      .slice(0, max);
    return {
      goalClass: request.goalClass,
      candidates: ranked,
      searchedDimensions: dims,
      issues,
      telemetry: {
        method: "rule",
        seed: request.seed ?? deriveSearchSeed(request.goalClass, request.policy),
        candidatesConsidered: profiles.length,
        candidatesEmitted: ranked.length,
        evaluationsRun: 0,
        wallTimeMs: Date.now() - started,
      },
    };
  },
};
