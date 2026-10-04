/**
 * @gen/media-capabilities — public contract (lock §6).
 *
 * Mirrors spec/schemas/capability.schema.json (compile-time types).
 * JSON Schemas remain the source of truth — divergence is a lock violation.
 * Phase 0: core type mirror only; Worker 1 adds zod bindings + registry
 * implementation + router + conformance harness (work/worker-1-provider-plane.md).
 */

/** Capability id domains (spec/capability-model.md §1). */
export type CapabilityDomain = "video" | "image" | "audio" | "editor" | "orchestration";

export type CapabilityStatus = "draft" | "active" | "deprecated";

export type LatencyClass = "subsecond" | "seconds" | "minutes" | "hours" | "interactive";

export type MappingMaturity = "reference" | "stable" | "experimental" | "planned";

export type ConformanceStatus = "unverified" | "self-verified" | "certified" | "below-threshold";

/** Artifact port on a capability (spec/schemas/capability.schema.json#$defs/artifactPort). */
export interface ArtifactPort {
  readonly name: string;
  readonly mediaType: string;
  readonly cardinality: "one" | "zero-or-one" | "one-or-more" | "zero-or-more";
  readonly constraints?: string;
}

/** Typed execution parameter. */
export interface ParamSpec {
  readonly name: string;
  readonly type: "string" | "number" | "boolean" | "enum" | "artifact-ref" | "duration";
  readonly description: string;
  readonly enumValues?: readonly string[];
  readonly minimum?: number;
  readonly maximum?: number;
  readonly default?: unknown;
  readonly unit?: string;
}

/** The provider-plane binding (P1): one way to execute a capability. */
export interface ProviderMapping {
  readonly providerId: string;
  readonly modelId?: string;
  readonly executionAdapter: string;
  readonly maturity: MappingMaturity;
  readonly conformanceStatus: ConformanceStatus;
  readonly notes?: string;
}

export interface QualityDimension {
  readonly id: string;
  readonly description: string;
  readonly scale: "0-100" | "0-1" | "categorical" | "seconds" | "ratio";
}

export interface ConformanceRef {
  readonly id: string;
  readonly path: string;
}

export interface CapabilityConformance {
  readonly scenarios: readonly ConformanceRef[];
  readonly certification: "none" | "self" | "certified";
}

/** Canonical capability descriptor (spec/schemas/capability.schema.json). */
export interface CapabilityDescriptor {
  readonly id: string;
  readonly version: string;
  readonly status: CapabilityStatus;
  readonly domain: CapabilityDomain;
  readonly summary: string;
  readonly inputs: readonly ArtifactPort[];
  readonly outputs: readonly ArtifactPort[];
  readonly parameters?: readonly ParamSpec[];
  readonly qualityDimensions: readonly QualityDimension[];
  readonly costModel?: { pricingUnit: string; currency?: string; notes?: string };
  readonly latencyClass: LatencyClass;
  readonly providerMappings: readonly ProviderMapping[];
  readonly conformance: CapabilityConformance;
  readonly notes?: string;
}

/** Router policy (spec/capability-model.md §4). */
export type RoutingPolicy =
  | "premium-first"
  | "cheapest-reliable"
  | "local-first"
  | "quality-first"
  | "latency-first";

/** Router decision input. */
export interface RoutingRequest {
  readonly capabilityId: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly inputArtifactIds: readonly string[];
  readonly policy: RoutingPolicy;
}

/** Router decision output — a pure decision (domain layer, no IO). */
export interface RoutingDecision {
  readonly ok: true;
  readonly mapping: ProviderMapping;
  readonly estimatedCost?: number;
  readonly estimatedLatencyClass?: LatencyClass;
  readonly alternatives: readonly ProviderMapping[];
}

/** Routing failure → CapabilityGapReport (P5), never a silent error. */
export interface RoutingFailure {
  readonly ok: false;
  readonly reason: "no-mapping" | "policy-unsatisfiable" | "provider-unavailable";
  readonly decisionTrace: string;
}

export type RoutingResult = RoutingDecision | RoutingFailure;

/** Read view over the registry (revision pattern mirrors @zcode/provider). */
export interface CapabilityRegistryView {
  readonly revision: number;
  readonly capabilities: readonly CapabilityDescriptor[];
}
