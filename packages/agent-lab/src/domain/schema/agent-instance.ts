/**
 * Zod binding for spec/schemas/agent-instance.schema.json (lock §6: parity mandatory).
 * Runtime state is NEVER part of the persisted descriptor (agent-body-model.md §1).
 */
import { z } from "zod";

const instanceIdPattern = /^[a-z0-9][a-z0-9-]*$/;
const bodyIdPattern = /^body\.[a-z0-9]+(-[a-z0-9]+)*$/;
const semverPattern = /^\d+\.\d+\.\d+$/;

export const CognitiveModelBindingSchema = z
  .object({
    providerId: z.string().min(1),
    modelId: z.string().min(1),
  })
  .strict();

export const PossessionGrantSchema = z
  .object({
    class: z.string(),
    items: z.array(z.string()).optional(),
  })
  .strict();

export const PossessionBudgetSchema = z
  .object({
    currency: z.string().optional(),
    maxSpend: z.number().min(0).optional(),
    computeMinutes: z.number().min(0).optional(),
  })
  .strict();

export const PossessionConfigSchema = z
  .object({
    grants: z.array(PossessionGrantSchema),
    budget: PossessionBudgetSchema.optional(),
  })
  .strict();

export const InstanceEnvironmentSchema = z
  .object({
    workspaceRef: z.string().optional(),
    artifactStoreRef: z.string().optional(),
    sandboxRef: z.string().optional(),
  })
  .strict();

export const RuntimeStatePointerSchema = z
  .object({
    runRecordRef: z.string().optional(),
    phase: z
      .enum(["idle", "thinking", "acting", "waiting-human", "done", "failed"])
      .optional(),
  })
  .strict();

export const AgentInstanceDescriptorSchema = z
  .object({
    instanceId: z.string().regex(instanceIdPattern),
    bodyId: z.string().regex(bodyIdPattern),
    bodyVersion: z.string().regex(semverPattern),
    cognitiveModel: CognitiveModelBindingSchema,
    possessionConfig: PossessionConfigSchema,
    environment: InstanceEnvironmentSchema,
    runtimeStatePointer: RuntimeStatePointerSchema.optional(),
  })
  .strict();

export type AgentInstanceDescriptorInput = z.input<typeof AgentInstanceDescriptorSchema>;
