/**
 * @gen/media-capabilities — public contract (lock §6).
 *
 * Pure re-export root: the hand-mirrored types live in domain/types.ts, the
 * zod bindings in domain/schema.ts, the registry and router in domain/. One
 * import direction only (contract → domain) — no cycles.
 */

export * from "./domain/types.js";
export {
  artifactPortSchema,
  capabilityConformanceSchema,
  capabilityDescriptorSchema,
  capabilityDomainSchema,
  capabilityStatusSchema,
  conformanceRefSchema,
  conformanceScenarioSchema,
  costModelSchema,
  latencyClassSchema,
  mappingMaturitySchema,
  paramSpecSchema,
  providerMappingSchema,
  qualityDimensionSchema,
} from "./domain/schema.js";
export type { ConformanceScenario } from "./domain/schema.js";
export { CapabilityRegistry } from "./domain/registry.js";
export type { RawDescriptorSource } from "./domain/registry.js";
export { routeCapability, RELIABILITY_THRESHOLD } from "./domain/router.js";

