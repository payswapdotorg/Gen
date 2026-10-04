/**
 * Zod bindings for spec/schemas/creative-provider.schema.json (lock §6 parity)
 * plus the harness data schemas (recorded fixture sets, evaluation records).
 * The JSON Schema stays the source of truth; the ajv gate cross-checks.
 */
import { z } from "zod";

const ENV_VAR_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const ADAPTER_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const CAPABILITY_REF_PATTERN = /^(video|image|audio|editor|orchestration)\.[a-z0-9-]+/;

export const creativeProviderKindSchema = z.enum(["api", "open-model", "software-tool", "custom"]);
export const executionTransportSchema = z.enum(["http", "cli", "embedded", "mcp", "remote-service"]);
export const generationLifecycleOpSchema = z.enum(["submit", "poll", "stream", "cancel", "retrieve"]);
export const mediaProviderErrorKindSchema = z.enum([
  "retryable",
  "capacity",
  "auth",
  "validation",
  "unsupported",
  "provider-internal",
]);

export const providerAccessSchema = z.strictObject({
  type: z.enum(["api-key", "account", "oauth", "none"]),
  envVars: z.array(z.string().regex(ENV_VAR_PATTERN)).optional(),
  apiKeyManagementUrl: z.string().optional(),
  notes: z.string().optional(),
});

export const executionAdapterDescriptorSchema = z.strictObject({
  id: z.string().regex(ADAPTER_ID_PATTERN),
  transport: executionTransportSchema,
  runtimeRequirements: z.string().optional(),
});

export const providerCapabilityMappingSchema = z.strictObject({
  capabilityId: z.string().regex(CAPABILITY_REF_PATTERN),
  maturity: z.enum(["reference", "stable", "experimental", "planned"]),
  conformanceStatus: z.enum(["unverified", "self-verified", "certified", "below-threshold"]),
  notes: z.string().optional(),
});

export const providerFactsSchema = z.strictObject({
  rateLimits: z.string(),
  pricing: z.string(),
  latencyFacts: z.string().optional(),
  healthCheck: z.string().optional(),
  regions: z.array(z.string()).optional(),
});

/** Creative provider descriptor (spec/schemas/creative-provider.schema.json). */
export const creativeProviderDescriptorSchema = z.strictObject({
  providerId: z.string().min(1),
  kind: creativeProviderKindSchema,
  access: providerAccessSchema,
  executionAdapter: executionAdapterDescriptorSchema,
  capabilities: z.array(providerCapabilityMappingSchema).min(1),
  facts: providerFactsSchema,
  generationLifecycle: z.array(generationLifecycleOpSchema).min(1).optional(),
  errorTaxonomy: z.array(mediaProviderErrorKindSchema).optional(),
  notes: z.string().optional(),
});

export type CreativeProviderDescriptor = z.infer<typeof creativeProviderDescriptorSchema>;

/**
 * Recorded fixture set — the adapter-side conformance data replayed by the
 * mock adapter when no live credentials exist (work order: "mock/record
 * fixtures for scenarios"). Provenance is mandatory and flows into every
 * evaluation record so simulated evidence can never masquerade as live.
 */
export const recordedArtifactSchema = z.strictObject({
  ref: z.string().min(1),
  mediaType: z.string().min(1),
});

export const recordedLifecycleSchema = z.strictObject({
  submit: z.strictObject({
    status: z.string(),
    requestId: z.string().min(1),
  }),
  polls: z.array(
    z.strictObject({
      status: z.string(),
      progress: z.number().min(0).max(1).optional(),
    }),
  ),
  artifacts: z.array(recordedArtifactSchema),
});

export const recordedObservationSchema = z.strictObject({
  qualityScores: z.record(z.string(), z.number()),
  latencyClass: z.enum(["subsecond", "seconds", "minutes", "hours", "interactive"]),
  reliability: z.number().min(0).max(1),
  cost: z.strictObject({
    estimate: z.number().min(0),
    unit: z.string().min(1),
  }),
});

export const recordedFixtureSchema = z.strictObject({
  adapterId: z.string().regex(ADAPTER_ID_PATTERN),
  providerId: z.string().min(1),
  modelId: z.string().optional(),
  capabilityId: z.string().min(1),
  scenarioId: z.string().min(1),
  provenance: z.enum(["simulated", "recorded-live"]),
  lifecycle: recordedLifecycleSchema,
  observed: recordedObservationSchema,
  notes: z.string().optional(),
});

/** Committed evaluation record emitted by the comparison harness (T1/T3 evidence). */
export const evaluationRowSchema = z.strictObject({
  providerId: z.string(),
  modelId: z.string().optional(),
  executionAdapter: z.string(),
  qualityScores: z.record(z.string(), z.number()),
  normalizedQuality: z.number(),
  cost: z.strictObject({ estimate: z.number(), unit: z.string() }),
  latency: z.strictObject({ class: z.enum(["subsecond", "seconds", "minutes", "hours", "interactive"]) }),
  reliability: z.number(),
  invariants: z.strictObject({
    schema: z.enum(["pass", "fail"]),
    qualityThresholds: z.enum(["pass", "fail"]),
    perDimension: z.record(z.string(), z.enum(["pass", "fail"])),
  }),
  provenance: z.enum(["simulated", "recorded-live"]),
});

export const evaluationRecordSchema = z.strictObject({
  evaluationId: z.string().min(1),
  capabilityId: z.string().min(1),
  scenarioId: z.string().min(1),
  mode: z.enum(["mock"]),
  generatedAt: z.string().min(1),
  generator: z.string().min(1),
  rows: z.array(evaluationRowSchema),
  notes: z.string().optional(),
});
export type RecordedFixture = z.infer<typeof recordedFixtureSchema>;
