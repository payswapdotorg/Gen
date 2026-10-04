/**
 * Zod bindings for spec/schemas/capability.schema.json (lock §6 parity).
 *
 * The JSON Schema is the source of truth; these bindings mirror it field by
 * field (strict objects, required lists, patterns, enums, item minimums).
 * The ajv harness (adapters/ajv-validate.ts) cross-checks every descriptor
 * against BOTH validators — a divergence here is a lock violation.
 */
import { z } from "zod";

/** Domains (capability.schema.json `domain` enum; pattern source of `id`). */
const CAPABILITY_DOMAINS = ["video", "image", "audio", "editor", "orchestration"] as const;

const CAPABILITY_ID_PATTERN =
  /^(video|image|audio|editor|orchestration)\.[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)*$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const LOWER_KEBAB_PATTERN = /^[a-z0-9-]+$/;
const CAMEL_CASE_PATTERN = /^[a-z][a-zA-Z0-9]*$/;
const QUALITY_DIMENSION_ID_PATTERN = /^[a-z][a-z0-9-]*$/;

export const capabilityDomainSchema = z.enum(CAPABILITY_DOMAINS);
export const capabilityStatusSchema = z.enum(["draft", "active", "deprecated"]);
export const latencyClassSchema = z.enum(["subsecond", "seconds", "minutes", "hours", "interactive"]);
export const mappingMaturitySchema = z.enum(["reference", "stable", "experimental", "planned"]);
export const conformanceStatusSchema = z.enum([
  "unverified",
  "self-verified",
  "certified",
  "below-threshold",
]);

export const artifactPortSchema = z.strictObject({
  name: z.string().regex(CAMEL_CASE_PATTERN),
  mediaType: z.string(),
  cardinality: z.enum(["one", "zero-or-one", "one-or-more", "zero-or-more"]),
  constraints: z.string().optional(),
});

export const paramSpecSchema = z.strictObject({
  name: z.string().regex(CAMEL_CASE_PATTERN),
  type: z.enum(["string", "number", "boolean", "enum", "artifact-ref", "duration"]),
  description: z.string(),
  enumValues: z.array(z.string()).optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  default: z.unknown().optional(),
  unit: z.string().optional(),
});

export const providerMappingSchema = z.strictObject({
  providerId: z.string().min(1),
  modelId: z.string().optional(),
  executionAdapter: z.string().min(1),
  maturity: mappingMaturitySchema,
  conformanceStatus: conformanceStatusSchema,
  notes: z.string().optional(),
});

export const qualityDimensionSchema = z.strictObject({
  id: z.string().regex(QUALITY_DIMENSION_ID_PATTERN),
  description: z.string(),
  scale: z.enum(["0-100", "0-1", "categorical", "seconds", "ratio"]),
});

export const conformanceRefSchema = z.strictObject({
  id: z.string().regex(LOWER_KEBAB_PATTERN),
  path: z.string(),
});

export const capabilityConformanceSchema = z.strictObject({
  scenarios: z.array(conformanceRefSchema),
  certification: z.enum(["none", "self", "certified"]),
});

export const costModelSchema = z.strictObject({
  pricingUnit: z.enum([
    "per-invocation",
    "per-second-of-output",
    "per-image",
    "per-megapixel",
    "compute-minutes",
    "free",
  ]),
  currency: z.string().optional(),
  notes: z.string().optional(),
});

/** Canonical capability descriptor (spec/schemas/capability.schema.json). */
export const capabilityDescriptorSchema = z.strictObject({
  id: z.string().regex(CAPABILITY_ID_PATTERN),
  version: z.string().regex(SEMVER_PATTERN),
  status: capabilityStatusSchema,
  domain: capabilityDomainSchema,
  summary: z.string().min(10),
  inputs: z.array(artifactPortSchema),
  outputs: z.array(artifactPortSchema).min(1),
  parameters: z.array(paramSpecSchema).optional(),
  qualityDimensions: z.array(qualityDimensionSchema).min(1),
  costModel: costModelSchema.optional(),
  latencyClass: latencyClassSchema,
  providerMappings: z.array(providerMappingSchema),
  conformance: capabilityConformanceSchema,
  notes: z.string().optional(),
});

/**
 * Conformance scenario fixture (capability-model.md §5). Scenario FILES are
 * git-tracked data referenced from descriptor `conformance.scenarios[].path`;
 * this schema defines their shape (Worker 1's harness contract).
 */
export const qualityThresholdsSchema = z.record(z.string(), z.number().min(0));

export const conformanceScenarioSchema = z.strictObject({
  id: z.string().regex(LOWER_KEBAB_PATTERN),
  capabilityId: z.string().regex(CAPABILITY_ID_PATTERN),
  description: z.string().min(10),
  /** Logical artifact fixture references — binaries are never committed. */
  inputs: z.record(z.string(), z.unknown()),
  parameters: z.record(z.string(), z.unknown()),
  expectedOutputInvariants: z.strictObject({
    schema: z.strictObject({
      outputPort: z.string(),
      mediaType: z.string(),
      cardinality: z.enum(["one", "zero-or-one", "one-or-more", "zero-or-more"]),
    }),
    qualityThresholds: qualityThresholdsSchema,
  }),
});

export type ConformanceScenario = z.infer<typeof conformanceScenarioSchema>;
