/**
 * @gen/media-providers — public contract (lock §6).
 *
 * Pure re-export root: hand-mirrored types in domain/types.ts, zod bindings
 * in domain/schema.ts, the error class in domain/errors.ts. One import
 * direction only (contract → domain) — no cycles.
 */

export * from "./domain/types.js";
export {
  creativeProviderDescriptorSchema,
  creativeProviderKindSchema,
  evaluationRecordSchema,
  evaluationRowSchema,
  executionAdapterDescriptorSchema,
  executionTransportSchema,
  generationLifecycleOpSchema,
  mediaProviderErrorKindSchema,
  providerAccessSchema,
  providerCapabilityMappingSchema,
  providerFactsSchema,
  recordedFixtureSchema,
  recordedLifecycleSchema,
  recordedObservationSchema,
} from "./domain/schema.js";
export { MediaAdapterError } from "./domain/errors.js";

