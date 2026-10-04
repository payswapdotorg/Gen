/**
 * Zod bindings for the agent-lab's TL-owned schemas (lock §6).
 * JSON Schemas in spec/schemas/ are the source of truth — parity is mandatory.
 */
export {
  AgentBodyDescriptorSchema,
  AgentBodyDecisionInterfaceSchema,
  AgentBodyPerceptSchema,
  AgentBodyActuatorsSchema,
  AgentBodyPossessionClassSchema,
  AgentBodyModelRequirementsSchema,
  AgentBodyEvaluationCriterionSchema,
  AgentBodyLifecycleSchema,
} from "./agent-body.js";

export {
  AgentInstanceDescriptorSchema,
  CognitiveModelBindingSchema,
  PossessionConfigSchema,
  PossessionGrantSchema,
  PossessionBudgetSchema,
  InstanceEnvironmentSchema,
  RuntimeStatePointerSchema,
} from "./agent-instance.js";

export {
  OrganizationGraphSchema,
  OrganizationNodeSchema,
  OrganizationEdgeSchema,
  OrganizationStageSchema,
  OrgAgentInstanceSchema,
  OrgHumanSchema,
  OrgCapabilityInvocationSchema,
  OrganizationEvaluationSchema,
  CertificationEvidenceSchema,
} from "./organization-graph.js";

export { TaskPlanSchema } from "./task-plan.js";
