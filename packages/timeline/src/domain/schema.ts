/**
 * Zod bindings for spec/schemas/artifact.schema.json (lock §6 parity).
 *
 * The JSON Schema is the source of truth; these bindings mirror it field by
 * field (strict objects, required lists, patterns, integer/minimum bounds) —
 * pattern per @gen/media-capabilities/src/domain/schema.ts. The parity
 * harness (adapters/ajv-validate.ts) cross-checks every descriptor against
 * BOTH validators; a divergence here is a lock violation.
 */
import { z } from "zod";

/** artifact.schema.json `artifactId` pattern. */
export const ARTIFACT_ID_PATTERN = /^art\.[a-z0-9-]+$/;
/** artifact.schema.json `contentAddress` pattern: sha256 of bytes, refs only. */
export const CONTENT_ADDRESS_PATTERN = /^sha256:[0-9a-f]{64}$/;

/** producedBy (P3 tie-in): capabilityId required, siblings optional. */
export const artifactProducerSchema = z.strictObject({
  capabilityId: z.string(),
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  executionAdapter: z.string().optional(),
  executionId: z.string().optional(),
  agentInstanceId: z.string().optional(),
});

/** timelineRef: the OTIO anchor (both members optional, no extras). */
export const timelineRefSchema = z.strictObject({
  otioPath: z.string().optional(),
  timelineArtifactId: z.string().optional(),
});

/** storage: content store reference + size (never a secret). */
export const artifactStorageSchema = z.strictObject({
  storeRef: z.string().optional(),
  sizeBytes: z.number().int().min(0).optional(),
});

/** Canonical artifact descriptor (spec/schemas/artifact.schema.json). */
export const artifactDescriptorSchema = z.strictObject({
  artifactId: z.string().regex(ARTIFACT_ID_PATTERN),
  contentAddress: z.string().regex(CONTENT_ADDRESS_PATTERN),
  mediaType: z.string(),
  producedBy: artifactProducerSchema,
  derivedFrom: z.array(z.string()).optional(),
  timelineRef: timelineRefSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  storage: artifactStorageSchema.optional(),
});

export type ArtifactProducerBinding = z.infer<typeof artifactProducerSchema>;
export type TimelineRefBinding = z.infer<typeof timelineRefSchema>;
export type ArtifactStorageBinding = z.infer<typeof artifactStorageSchema>;
export type ArtifactDescriptorBinding = z.infer<typeof artifactDescriptorSchema>;
