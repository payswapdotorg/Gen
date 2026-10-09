/**
 * @gen/arena-bridge — public entrypoint (ARCHITECTURE_LOCK.md §5).
 * Consumers import ONLY from this surface / contract.ts.
 */
export * from "./contract.js";
export {
  CapabilityGapReportSchema,
  ExpertSessionRecordSchema,
} from "./domain/schema/capability-gap.js";
export type {
  CapabilityGapReportInput,
  ExpertSessionRecordInput,
} from "./domain/schema/capability-gap.js";
export {
  ARENA_CHAIN,
  TERMINAL_STATES,
  canTransition,
  isTerminal,
  reportGap,
  requestArena,
  ingestExpertSession,
  proposeCapability,
  submitCertification,
  certifyGap,
  publishAvailability,
  closeGap,
} from "./domain/state-machine.js";
export type { TransitionResult } from "./domain/state-machine.js";
export type { CertificationProposal, CertificationValidation } from "./domain/certification.js";
export { validateCapabilityCertification } from "./domain/certification.js";
export type {
  AvailableCapabilityMapping,
  CapabilityCatalogEntryView,
  LabAvailabilityPublication,
  PublishResult,
} from "./domain/publisher.js";
export {
  buildLabAvailabilityPublication,
  mergeIntoCapabilityCatalog,
} from "./domain/publisher.js";
export type { ArenaService, ArenaServiceDeps } from "./app/arena-service.js";
export { createArenaService, catalogWithPublication } from "./app/arena-service.js";
export { createFsGapStore, readGapReport, readTransitionLog } from "./adapters/fs-gap-store.js";
export type {
  MethodSelectionEvidenceChain,
  MethodSelectionLedgerEntry,
  MethodSelectionLedgerEntryInput,
  MethodSelectionProvenanceInput,
  MethodSelectionProvenanceRecord,
  MethodSelectionProvenanceState,
  ProvenanceTelemetry,
} from "./domain/schema/method-selection-provenance.js";
export {
  MethodSelectionEvidenceChainSchema,
  MethodSelectionLedgerEntrySchema,
  MethodSelectionProvenanceSchema,
  MethodSelectionProvenanceStateSchema,
  ProvenanceTelemetrySchema,
} from "./domain/schema/method-selection-provenance.js";
export type {
  MethodSelectionProvenanceMappingInput,
  ProvenanceMappingResult,
  ProvenanceTransitionResult,
} from "./domain/method-selection-provenance.js";
export {
  PROVENANCE_CHAIN,
  PROVENANCE_TERMINAL_STATES,
  canTransitionProvenance,
  certifyProvenance,
  isProvenanceTerminal,
  mapSelectionToProvenance,
  provenanceIdOf,
  publishProvenance,
} from "./domain/method-selection-provenance.js";
