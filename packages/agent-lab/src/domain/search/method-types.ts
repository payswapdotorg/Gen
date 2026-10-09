/**
 * Search-method port types (W13, organization-lab §2): the search engine is
 * pluggable — rule-based first, learned later. The OUTPUT contract is frozen
 * by spec/schemas/organization-graph.schema.json (ranked candidate
 * OrganizationGraphs); only the ENGINE is replaceable. Types only — no
 * implementation imports here so concrete methods never form import cycles.
 */
import type {
  OrganizationSearchRequest,
  OrganizationSearchDimensions,
  SearchCandidate,
} from "../lab-api.js";

/** Built-in method names. The registry is open — custom methods may register any name. */
export type SearchMethodName = "rule" | "beam" | "evolutionary" | "bandit";

/**
 * Per-run search telemetry (W13 work item 5). Deterministic fields
 * (candidatesConsidered, evaluationsRun, seed, bestEvaluatedFitness) are
 * reproducible from the seed; wallTimeMs is operational metadata and is
 * deliberately NOT part of any replay hash or committed evaluation record.
 */
export interface SearchMethodTelemetry {
  readonly method: string;
  readonly seed: string;
  /** Dimension profiles the method considered (built or scored). */
  readonly candidatesConsidered: number;
  /** Candidates emitted in the result. */
  readonly candidatesEmitted: number;
  /** Full candidate evaluations executed (all scenarios each). */
  readonly evaluationsRun: number;
  readonly wallTimeMs: number;
  /** Best mean fitness observed among internally evaluated candidates. */
  readonly bestEvaluatedFitness?: number;
  /** Method-specific deterministic counters (e.g. generations, pulls). */
  readonly detail?: Readonly<Record<string, number | string>>;
}

/** Result of a search-method run: the frozen search contract + telemetry. */
export interface MethodSearchResult {
  readonly goalClass: string;
  readonly candidates: readonly SearchCandidate[];
  readonly searchedDimensions: OrganizationSearchDimensions;
  readonly issues: readonly string[];
  readonly telemetry: SearchMethodTelemetry;
}

/**
 * The port every search method implements (organization-lab §2). A method
 * receives the search request (which may carry scenarios + weights as the
 * fitness oracle) and returns ranked schema-valid candidates plus telemetry.
 * Determinism law: given the same request (incl. seed), a method MUST produce
 * the same ranked output — seeded PRNG only, never Math.random.
 */
export interface SearchMethod {
  readonly name: string;
  readonly search: (request: OrganizationSearchRequest) => MethodSearchResult;
}

/** Deterministic default seed when the request omits one (rule ignores it). */
export function deriveSearchSeed(goalClass: string, policy: string): string {
  return `search:${goalClass}:${policy}`;
}
