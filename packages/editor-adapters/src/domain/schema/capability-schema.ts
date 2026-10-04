/**
 * editor-adapters domain — zod bindings for the editor-domain capability
 * descriptors (work/worker-2-editing-ecosystem.md task A.1).
 *
 * Mirror of spec/schemas/capability.schema.json (the SAME schema media uses —
 * capability-model.md §2/§7). The JSON Schema stays the source of truth; these
 * bindings exist so descriptor files, adapters and tests share one runtime
 * validator. Any divergence is a lock violation — parity is asserted by
 * shape-mirroring tests, and the schema's regexes are copied verbatim.
 */

import { z } from "zod";

export const CAPABILITY_ID_PATTERN = "^(video|image|audio|editor|orchestration)\\.[a-z0-9]+(-[a-z0-9]+)*(\\.[a-z0-9]+(-[a-z0-9]+)*)*$";
export const SEMVER_PATTERN = "^\\d+\\.\\d+\\.\\d+$";
export const QUALITY_DIMENSION_ID_PATTERN = "^[a-z][a-z0-9-]*$";
export const PORT_NAME_PATTERN = "^[a-z][a-zA-Z0-9]*$";
export const PARAM_NAME_PATTERN = "^[a-z][a-zA-Z0-9]*$";
export const SCENARIO_ID_PATTERN = "^[a-z0-9-]+$";

export const artifactPortSchema = z.strictObject({
  name: z.string().regex(new RegExp(PORT_NAME_PATTERN)),
  mediaType: z.string(),
  cardinality: z.enum(["one", "zero-or-one", "one-or-more", "zero-or-more"]),
  constraints: z.string().optional(),
});

export const paramSpecSchema = z.strictObject({
  name: z.string().regex(new RegExp(PARAM_NAME_PATTERN)),
  type: z.enum(["string", "number", "boolean", "enum", "artifact-ref", "duration"]),
  description: z.string(),
  enumValues: z.array(z.string()).optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  default: z.unknown().optional(),
  unit: z.string().optional(),
});

export const qualityDimensionSchema = z.strictObject({
  id: z.string().regex(new RegExp(QUALITY_DIMENSION_ID_PATTERN)),
  description: z.string(),
  scale: z.enum(["0-100", "0-1", "categorical", "seconds", "ratio"]),
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

export const providerMappingSchema = z.strictObject({
  providerId: z.string().min(1),
  modelId: z.string().optional(),
  executionAdapter: z.string().min(1),
  maturity: z.enum(["reference", "stable", "experimental", "planned"]),
  conformanceStatus: z.enum(["unverified", "self-verified", "certified", "below-threshold"]),
  notes: z.string().optional(),
});

export const conformanceScenarioRefSchema = z.strictObject({
  id: z.string().regex(new RegExp(SCENARIO_ID_PATTERN)),
  path: z.string(),
});

export const capabilityConformanceSchema = z.strictObject({
  scenarios: z.array(conformanceScenarioRefSchema),
  certification: z.enum(["none", "self", "certified"]),
});

/** spec/schemas/capability.schema.json — CapabilityDescriptor (editor domain). */
export const capabilityDescriptorSchema = z.strictObject({
  id: z.string().regex(new RegExp(CAPABILITY_ID_PATTERN)),
  version: z.string().regex(new RegExp(SEMVER_PATTERN)),
  status: z.enum(["draft", "active", "deprecated"]),
  domain: z.enum(["video", "image", "audio", "editor", "orchestration"]),
  summary: z.string().min(10),
  inputs: z.array(artifactPortSchema),
  outputs: z.array(artifactPortSchema).min(1),
  parameters: z.array(paramSpecSchema).optional(),
  qualityDimensions: z.array(qualityDimensionSchema).min(1),
  costModel: costModelSchema.optional(),
  latencyClass: z.enum(["subsecond", "seconds", "minutes", "hours", "interactive"]),
  providerMappings: z.array(providerMappingSchema),
  conformance: capabilityConformanceSchema,
  notes: z.string().optional(),
});

export type ZodCapabilityDescriptor = z.infer<typeof capabilityDescriptorSchema>;

/** The launch set this package owns (editor-adapter-contract.md §1). */
export const EDITOR_CAPABILITY_IDS = [
  "editor.cut-video",
  "editor.track-object",
  "editor.composite-layer",
  "editor.create-animation",
  "editor.render-project",
] as const;

export type EditorCapabilityId = (typeof EDITOR_CAPABILITY_IDS)[number];

/** Parse + validate one descriptor; issues are precise, never silent. */
export function validateCapabilityDescriptor(
  input: unknown,
): { ok: true; descriptor: ZodCapabilityDescriptor } | { ok: false; issues: string[] } {
  const result = capabilityDescriptorSchema.safeParse(input);
  if (result.success) return { ok: true, descriptor: result.data };
  return {
    ok: false,
    issues: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
  };
}
