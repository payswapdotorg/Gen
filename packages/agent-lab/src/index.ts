/**
 * @gen/agent-lab — public entrypoint (ARCHITECTURE_LOCK.md §5).
 * Consumers import ONLY from this surface / contract.ts.
 */
export * from "./contract.js";
export type {
  AllocationPolicy,
  OrganizationSearchRequest,
  OrganizationSearchDimensions,
  OrganizationSearchResult,
  SearchCandidate,
  FitnessWeights,
  EvaluationMetrics,
  CertificationBar,
  CertificationScenarioResult,
  CertificationOutcome,
  EvaluationRecord,
  EvaluationStore,
} from "./domain/lab-api.js";
export { DEFAULT_FITNESS_WEIGHTS, DEFAULT_CERTIFICATION_BAR } from "./domain/lab-api.js";
export * from "./domain/schema/index.js";
export {
  LAUNCH_BODIES,
  bodyRegistry,
  buildBodyRegistry,
  findConcreteModelIdReferences,
} from "./domain/bodies/registry.js";
export {
  bindAgentInstance,
  modelSatisfiesRequirements,
  validatePossessionGrants,
} from "./domain/binding.js";
export { validateOrganizationGraph } from "./domain/org-graph.js";
export { searchOrganizations, DEFAULT_DIMENSIONS } from "./domain/search.js";
export { ROLE_TEMPLATES, findRoleTemplate } from "./domain/search-templates.js";
export { runSimulation } from "./domain/simulation/engine.js";
export type {
  BodyBehavior,
  CapabilityMock,
  MockMappingCandidate,
  ScenarioApproval,
  ScenarioCriterion,
  ScenarioDefect,
  ScenarioDescriptor,
} from "./domain/simulation/scenario-types.js";
export { bodyBehavior, mockFor } from "./domain/simulation/scenario-types.js";
export { canonicalJson, fnv1a32, replayHash, seedFromString } from "./domain/simulation/rng.js";
export {
  SCENARIOS,
  documentaryCinematicScenario,
  findScenario,
  forcedFailureScenario,
} from "./domain/scenarios/index.js";
export { evaluateRun, meanFitness } from "./domain/evaluation.js";
export { certifyOrganization, withCertification } from "./domain/certification.js";
export { createLabService } from "./app/lab-service.js";
export type {
  EvaluationPipelineOptions,
  EvaluationPipelineResult,
  LabService,
  LabServiceDeps,
  RankedCandidate,
} from "./app/lab-service.js";
export {
  createFsEvaluationStore,
  listEvaluationRecordFiles,
  readEvaluationRecordFile,
  readOrganizationGraphFile,
} from "./adapters/fs-evaluation-store.js";
export { registryViewToCapabilityCatalog } from "./adapters/registry-catalog-adapter.js";
