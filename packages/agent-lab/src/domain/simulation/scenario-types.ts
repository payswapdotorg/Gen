/**
 * Scenario fixture types (organization-lab §3): goal + input artifacts +
 * environment stubs — seeded, frozen capability mocks, frozen model catalog
 * (provider-plane projection), deterministic human approvals. Committed under
 * src/domain/scenarios/ (git-tracked); the simulation is hermetic (no network,
 * no real provider calls — every behavior is declared here).
 */
import type {
  CapabilityCatalogEntry,
  GapSignalKind,
  GapSeverity,
  ModelCatalogEntry,
} from "../../contract.js";
import type { HumanDecision, RedirectPayload } from "./decision-types.js";

export interface MockMappingCandidate {
  readonly providerId: string;
  readonly modelId?: string;
  readonly rejectedBecause: string;
}

/** Frozen capability mock: deterministic outcome, cost, latency and quality. */
export interface CapabilityMock {
  readonly capabilityId: string;
  readonly costUsd: number;
  readonly latencyMs: number;
  /** Conformance quality score (0..1) when the invocation succeeds. */
  readonly quality: number;
  readonly outcome: "ok" | "fail";
  /** Evidence emitted when outcome = fail (P5 — never a fabricated result). */
  readonly failure?: {
    readonly kind: GapSignalKind;
    readonly summary: string;
    readonly routerDecisionTrace?: string;
    readonly comparisonTableRef?: string;
    readonly adapterErrorRecords?: readonly string[];
  };
  /** Candidate mappings considered before the failure (mapping-shortfall evidence). */
  readonly mappingCandidates?: readonly MockMappingCandidate[];
}

/** Frozen behavior profile for an agent body in this scenario. */
export interface BodyBehavior {
  readonly decisionLatencyMs: number;
  readonly decisionCostUsd: number;
  readonly defectCatchRate?: number;
  readonly falsePositiveRate?: number;
}

export interface ScenarioDefect {
  /** Artifact (capability-produced) that carries the seeded defect. */
  readonly onCapability: string;
  readonly description: string;
}

export interface ScenarioCriterion {
  readonly id: string;
  readonly description: string;
}

export interface ScenarioApproval {
  readonly gate: string;
  readonly response: "approve" | "reject" | "redirect";
  /** Redirect payload (required when response = "redirect" — W6 escalation §3). */
  readonly redirect?: RedirectPayload;
}

/**
 * Scripted decision resolution (W6): replays scenario.approvals exactly as
 * the engine did before the decision port existed — same cursor modulo, same
 * default-approve fallback — so the scripted path stays bit-exact with the
 * committed records. A "redirect" entry without a payload is a hermetic
 * fixture error and fails loudly (never a fabricated decision).
 */
export function nextScriptedDecision(
  approvals: readonly ScenarioApproval[],
  cursor: number,
): HumanDecision {
  const entry = approvals[cursor % Math.max(approvals.length, 1)];
  if (entry === undefined) return { kind: "approve" };
  if (entry.response === "reject") return { kind: "reject" };
  if (entry.response === "redirect") {
    if (entry.redirect === undefined) {
      throw new Error(
        `scenario approval gate "${entry.gate}" says "redirect" but carries no redirect payload (hermetic fixture error)`,
      );
    }
    return { kind: "redirect", redirect: entry.redirect };
  }
  return { kind: "approve" };
}

export interface ScenarioDescriptor {
  readonly id: string;
  readonly goalClass: string;
  readonly goal: string;
  readonly seed: string;
  readonly clockEpochIso: string;
  readonly latencyScaleMs: number;
  readonly budgetEnvelopeUsd: number;
  readonly inputArtifacts: readonly string[];
  readonly modelCatalog: readonly ModelCatalogEntry[];
  readonly capabilityCatalog: readonly CapabilityCatalogEntry[];
  readonly capabilityMocks: readonly CapabilityMock[];
  readonly behaviorOverrides?: Readonly<Record<string, BodyBehavior>>;
  readonly approvals: readonly ScenarioApproval[];
  readonly successCriteria: readonly ScenarioCriterion[];
  readonly defects: readonly ScenarioDefect[];
  readonly alternatives: readonly { path: string; tradeoffs: string }[];
  /**
   * Capability ids the organization MUST actually invoke for the goal to count
   * as served (T4 integrity): a candidate that dodges a required capability
   * (e.g. a minimal tool profile) fails goal achievement — an organization that
   * attempts it and hits a forced failure emits a gap report instead. Either
   * way, never a fabricated success.
   */
  readonly requiredCapabilities?: readonly string[];
}

const DEFECT_CATCH_BASE: Readonly<Record<string, number>> = {
  lightweight: 0.6,
  standard: 0.8,
  flagship: 0.95,
};

/** Default frozen behavior derived from the model's quality class (overridable). */
export function bodyBehavior(
  scenario: ScenarioDescriptor,
  bodyId: string,
  model: ModelCatalogEntry | undefined,
): BodyBehavior {
  const override = scenario.behaviorOverrides?.[bodyId];
  const qualityClass = model?.qualityClass ?? "standard";
  return {
    decisionLatencyMs: 2000,
    decisionCostUsd: model?.costPerDecisionUsd ?? 0.5,
    defectCatchRate: DEFECT_CATCH_BASE[qualityClass] ?? 0.8,
    falsePositiveRate: 0.05,
    ...override,
  };
}

/** Look up the frozen mock for a capability id. */
export function mockFor(scenario: ScenarioDescriptor, capabilityId: string): CapabilityMock | undefined {
  return scenario.capabilityMocks.find((mock) => mock.capabilityId === capabilityId);
}

export function severityFor(kind: GapSignalKind): GapSeverity {
  if (kind === "missing-capability") return "high";
  if (kind === "mapping-shortfall") return "medium";
  if (kind === "editor-coverage-gap") return "medium";
  return "high";
}
