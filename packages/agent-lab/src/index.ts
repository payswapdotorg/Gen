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
  SearchMethodOptions,
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
export { runOrganizationSearch, registerSearchMethod, listSearchMethodNames } from "./domain/search/method-registry.js";
export type {
  SearchMethod,
  SearchMethodName,
  SearchMethodTelemetry,
  MethodSearchResult,
} from "./domain/search/method-types.js";
export {
  learnedSearchMethod,
  armLearnedMethodLedger,
  bindLearnedMethodResolver,
} from "./domain/search/learned-method.js";
export type {
  MethodResolver,
  SelectionLedgerSource,
} from "./domain/search/learned-method.js";
export type {
  MethodRankingEntry,
  MethodSelectionRecord,
  MethodSelectionRecordInput,
  SelectionAppendResult,
  SelectionLedgerStore,
  SelectionRecordIdentity,
} from "./domain/method-selection/selection-ledger.js";
export {
  DEFAULT_SELECTION_METHOD,
  LEARNED_METHOD_NAME,
  MethodSelectionRecordSchema,
  appendSelectionRecord,
  rankMethodsForGoalClass,
  selectBestMethod,
  selectionRecordFingerprint,
  selectionRecordId,
  selectionRecordKey,
} from "./domain/method-selection/selection-ledger.js";
export { ROLE_TEMPLATES, findRoleTemplate } from "./domain/search-templates.js";
export { runSimulation } from "./domain/simulation/engine.js";
export type { SimulationConfig } from "./domain/simulation/engine.js";
export type {
  AppliedRedirect,
  BundleAlternative,
  DecisionBundle,
  DecisionBundleRecord,
  DecisionPort,
  DecisionRecordInput,
  HumanDecision,
  HumanDecisionRecord,
  ModelBindingDiff,
  PolicyDiffEntry,
  RedirectPayload,
  RunRecordWithOptionalTrail,
  SimulationRunRecordWithDecisions,
} from "./domain/simulation/decision-types.js";
export { buildDecisionRecord, decisionTrailOf } from "./domain/simulation/decision-types.js";
export { buildDecisionBundle, projectRemainingSpendUsd } from "./domain/simulation/decision-bundle.js";
export { ROUTING_POLICIES, applyRedirect } from "./domain/simulation/decision-redirect.js";
export type { RedirectableRunState, RedirectDeps } from "./domain/simulation/decision-redirect.js";
export type {
  BodyBehavior,
  CapabilityMock,
  MockMappingCandidate,
  ScenarioApproval,
  ScenarioCriterion,
  ScenarioDefect,
  ScenarioDescriptor,
} from "./domain/simulation/scenario-types.js";
export { bodyBehavior, mockFor, nextScriptedDecision } from "./domain/simulation/scenario-types.js";
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
export { createInteractiveDecisionPort, createScriptedDecisionPort } from "./app/decision-ports.js";
export type { DecisionHandler, InteractiveDecisionPort } from "./app/decision-ports.js";
export {
  createFsEvaluationStore,
  listEvaluationRecordFiles,
  readEvaluationRecordFile,
  readOrganizationGraphFile,
} from "./adapters/fs-evaluation-store.js";
export {
  committedSelectionRecordsDir,
  createFsSelectionLedgerStore,
  listSelectionRecordFiles,
  readSelectionRecordFile,
} from "./adapters/fs-selection-ledger-store.js";
export { registryViewToCapabilityCatalog } from "./adapters/registry-catalog-adapter.js";
