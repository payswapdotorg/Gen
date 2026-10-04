/**
 * Hand-mirrored types for spec/schemas/creative-provider.schema.json plus the
 * generation lifecycle (spec/media-provider-contract.md §3). Domain-owned so
 * siblings import siblings — the contract re-exports this module publicly.
 */

export type CreativeProviderKind = "api" | "open-model" | "software-tool" | "custom";

export type ExecutionTransport = "http" | "cli" | "embedded" | "mcp" | "remote-service";

export type GenerationLifecycleOp = "submit" | "poll" | "stream" | "cancel" | "retrieve";

/** Adapter→router error taxonomy (spec/media-provider-contract.md §3). */
export type MediaProviderErrorKind =
  | "retryable"
  | "capacity"
  | "auth"
  | "validation"
  | "unsupported"
  | "provider-internal";

/** Env var NAMES only — values never appear in descriptors (lock P8). */
export interface ProviderAccess {
  readonly type: "api-key" | "account" | "oauth" | "none";
  readonly envVars?: readonly string[];
  readonly apiKeyManagementUrl?: string;
  readonly notes?: string;
}

export interface ExecutionAdapterDescriptor {
  readonly id: string;
  readonly transport: ExecutionTransport;
  readonly runtimeRequirements?: string;
}

export interface ProviderCapabilityMapping {
  readonly capabilityId: string;
  readonly maturity: "reference" | "stable" | "experimental" | "planned";
  readonly conformanceStatus: "unverified" | "self-verified" | "certified" | "below-threshold";
  readonly notes?: string;
}

export interface CreativeProviderDescriptor {
  /** MUST be a provider-plane id (P1). */
  readonly providerId: string;
  readonly kind: CreativeProviderKind;
  readonly access: ProviderAccess;
  readonly executionAdapter: ExecutionAdapterDescriptor;
  readonly capabilities: readonly ProviderCapabilityMapping[];
  readonly facts: {
    readonly rateLimits: string;
    readonly pricing: string;
    readonly latencyFacts?: string;
    readonly healthCheck?: string;
    readonly regions?: readonly string[];
  };
  readonly generationLifecycle?: readonly GenerationLifecycleOp[];
  readonly errorTaxonomy?: readonly MediaProviderErrorKind[];
  readonly notes?: string;
}

/** Job lifecycle (spec/media-provider-contract.md §3). */
export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface JobHandle {
  readonly jobId: string;
  readonly providerId: string;
  readonly modelId?: string;
  readonly capabilityId: string;
  readonly idempotencyKey: string;
}

export interface JobEvent {
  readonly kind: "progress" | "preview" | "log" | "status";
  readonly payload: unknown;
}

export interface MediaProviderError {
  readonly kind: MediaProviderErrorKind;
  readonly message: string;
  readonly retryable: boolean;
  /** "unsupported" and repeated "capacity" feed gap detection (P5). */
  readonly gapSignal?: boolean;
}

/** The execution adapter interface every media provider implements. */
export interface MediaExecutionAdapter {
  submit(
    capabilityId: string,
    modelId: string | undefined,
    params: Readonly<Record<string, unknown>>,
    inputArtifactRefs: readonly string[],
    idempotencyKey: string,
  ): Promise<JobHandle>;
  poll(handle: JobHandle): Promise<JobStatus>;
  stream?(handle: JobHandle): AsyncIterable<JobEvent>;
  cancel?(handle: JobHandle): Promise<"cancelled" | "terminal">;
  retrieve(handle: JobHandle): Promise<readonly string[]>;
}

/** Adapter-side recorded fixture set (mock/record conformance data). */
export type RecordedFixture = import("./schema.js").RecordedFixture;

/** Committed comparison-harness output — the T1/T3 evidence machine. */
export interface EvaluationRecord {
  readonly evaluationId: string;
  readonly capabilityId: string;
  readonly scenarioId: string;
  readonly mode: "mock";
  readonly generatedAt: string;
  readonly generator: string;
  readonly rows: readonly EvaluationRow[];
  readonly notes?: string;
}

export interface EvaluationRow {
  readonly providerId: string;
  readonly modelId?: string;
  readonly executionAdapter: string;
  readonly qualityScores: Readonly<Record<string, number>>;
  readonly normalizedQuality: number;
  readonly cost: { estimate: number; unit: string };
  readonly latency: { class: "subsecond" | "seconds" | "minutes" | "hours" | "interactive" };
  readonly reliability: number;
  readonly invariants: {
    readonly schema: "pass" | "fail";
    readonly qualityThresholds: "pass" | "fail";
    readonly perDimension: Readonly<Record<string, "pass" | "fail">>;
  };
  readonly provenance: "simulated" | "recorded-live";
}
