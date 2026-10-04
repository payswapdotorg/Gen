/**
 * Zod binding for spec/schemas/organization-graph.schema.json (lock §6: parity
 * mandatory). Cross-field invariants (edge/stage references, dependsOn acyclicity)
 * are NOT expressible in JSON Schema — they are enforced by
 * domain/org-graph.ts validateOrganizationGraph on top of this structural binding.
 */
import { z } from "zod";

const orgIdPattern = /^org\.[a-z0-9]+(-[a-z0-9]+)*$/;
const goalClassPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const nodeIdPattern = /^n[0-9]+[a-z0-9-]*$/;
const bodyIdPattern = /^body\.[a-z0-9]+(-[a-z0-9]+)*$/;
const semverPattern = /^\d+\.\d+\.\d+$/;

export const OrgCognitiveModelSchema = z
  .object({
    providerId: z.string().min(1),
    modelId: z.string().min(1),
  })
  .strict();

export const OrgAgentInstanceSchema = z
  .object({
    bodyId: z.string().regex(bodyIdPattern),
    bodyVersion: z.string().regex(semverPattern).optional(),
    instanceId: z.string().optional(),
    cognitiveModel: OrgCognitiveModelSchema,
  })
  .strict();

export const OrgHumanSchema = z
  .object({
    role: z.string().min(1),
    decisionInterface: z.string().optional(),
    approvalGates: z.array(z.string()).optional(),
  })
  .strict();

export const OrgCapabilityInvocationSchema = z
  .object({
    capabilityId: z.string().min(1),
    parameterBindings: z.record(z.string(), z.unknown()).optional(),
    providerPolicy: z.string().optional(),
  })
  .strict();

export const OrganizationNodeSchema = z
  .object({
    nodeId: z.string().regex(nodeIdPattern),
    kind: z.enum(["agent-instance", "human", "capability-invocation"]),
    agentInstance: OrgAgentInstanceSchema.optional(),
    human: OrgHumanSchema.optional(),
    capabilityInvocation: OrgCapabilityInvocationSchema.optional(),
  })
  .strict();

export const OrganizationEdgeSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    kind: z.enum(["delegation", "review", "artifact-flow", "approval"]),
    notes: z.string().optional(),
  })
  .strict();

export const OrganizationStageSchema = z
  .object({
    stageId: z.string().min(1),
    nodeIds: z.array(z.string().min(1)).min(1),
    dependsOn: z.array(z.string().min(1)).optional(),
    checkpoint: z.boolean().optional(),
  })
  .strict();

export const ModelAllocationSchema = z.record(z.string(), OrgCognitiveModelSchema);

export const BudgetAllocationSchema = z.record(
  z.string(),
  z
    .object({
      maxSpend: z.number().min(0).optional(),
      computeMinutes: z.number().min(0).optional(),
    })
    .strict(),
);

export const SimulationRefSchema = z
  .object({
    seed: z.string().optional(),
    scenarioRefs: z.array(z.string()).optional(),
  })
  .strict();

export const CertificationEvidenceSchema = z
  .object({
    scenarioSetRef: z.string().min(1),
    replayRef: z.string().min(1),
    certifiedAt: z.string().optional(),
    gapReportsResolved: z.boolean().optional(),
  })
  .strict();

export const OrganizationEvaluationSchema = z
  .object({
    certified: z.boolean(),
    fitness: z.number().optional(),
    weights: z.record(z.string(), z.number()).optional(),
    metrics: z.record(z.string(), z.number()).optional(),
    certificationEvidence: CertificationEvidenceSchema.optional(),
  })
  .strict();

export const OrganizationGraphSchema = z
  .object({
    id: z.string().regex(orgIdPattern),
    goal: z.string().min(5),
    goalClass: z.string().regex(goalClassPattern),
    nodes: z.array(OrganizationNodeSchema).min(1),
    edges: z.array(OrganizationEdgeSchema),
    allocations: z
      .object({
        modelAllocation: ModelAllocationSchema.optional(),
        toolAllocation: z.record(z.string(), z.array(z.string())).optional(),
        budgetAllocation: BudgetAllocationSchema.optional(),
        executionOrder: z.array(OrganizationStageSchema).min(1),
      })
      .strict(),
    simulation: SimulationRefSchema.optional(),
    evaluation: OrganizationEvaluationSchema.optional(),
  })
  .strict();

export type OrganizationGraphInput = z.input<typeof OrganizationGraphSchema>;
