/**
 * Zod binding for spec/schemas/agent-body.schema.json (lock §6: parity mandatory;
 * the JSON Schema is the source of truth — this mirror must not drift).
 */
import { z } from "zod";

const bodyIdPattern = /^body\.[a-z0-9]+(-[a-z0-9]+)*$/;
const semverPattern = /^\d+\.\d+\.\d+$/;
const possessionClassIdPattern = /^[a-z][a-z0-9-]*$/;
const evaluationCriterionIdPattern = /^[a-z][a-z0-9-]*$/;
const capabilityIdPattern = /^(video|image|audio|editor|orchestration)\.[a-z0-9.-]+/;

export const AgentBodyDecisionInterfaceSchema = z
  .object({
    inputSchema: z.string().min(1),
    outputSchema: z.string().min(1),
    notes: z.string().optional(),
  })
  .strict();

export const AgentBodyPerceptSchema = z
  .object({
    kind: z.enum([
      "artifact",
      "task-plan-state",
      "capability-result",
      "human-message",
      "org-event",
      "environment",
    ]),
    description: z.string(),
  })
  .strict();

export const AgentBodyActuatorsSchema = z
  .object({
    capabilityIds: z.array(z.string().regex(capabilityIdPattern)),
    tools: z.array(z.string()).optional(),
  })
  .strict();

export const AgentBodyPossessionClassSchema = z
  .object({
    id: z.string().regex(possessionClassIdPattern),
    description: z.string(),
    grants: z.array(z.string()).optional(),
    limits: z.string().optional(),
  })
  .strict();

export const AgentBodyModelRequirementsSchema = z
  .object({
    modalities: z
      .array(
        z.enum([
          "text-in",
          "image-in",
          "video-in",
          "audio-in",
          "text-out",
          "image-out",
          "video-out",
          "audio-out",
        ]),
      )
      .min(1),
    qualityClass: z.enum(["lightweight", "standard", "flagship"]),
    minContextTokens: z.number().int().min(0).optional(),
    latencyClass: z.enum(["subsecond", "seconds", "minutes", "hours", "interactive"]).optional(),
    notes: z.string().optional(),
  })
  .strict();

export const AgentBodyEvaluationCriterionSchema = z
  .object({
    id: z.string().regex(evaluationCriterionIdPattern),
    description: z.string(),
    measurement: z.string().optional(),
  })
  .strict();

export const AgentBodyLifecycleSchema = z
  .object({
    state: z.enum(["created", "active", "deprecated"]),
    created: z.string().optional(),
    deprecated: z.string().optional(),
    supersededBy: z.string().optional(),
  })
  .strict();

export const AgentBodyDescriptorSchema = z
  .object({
    id: z.string().regex(bodyIdPattern),
    version: z.string().regex(semverPattern),
    role: z.string().min(5),
    summary: z.string(),
    decisionInterface: AgentBodyDecisionInterfaceSchema,
    percepts: z.array(AgentBodyPerceptSchema).min(1),
    actuators: AgentBodyActuatorsSchema,
    possessionClasses: z.array(AgentBodyPossessionClassSchema).min(1),
    modelRequirements: AgentBodyModelRequirementsSchema,
    contextSchema: z.string(),
    evaluationCriteria: z.array(AgentBodyEvaluationCriterionSchema).min(1),
    lifecycle: AgentBodyLifecycleSchema,
  })
  .strict();

export type AgentBodyDescriptorInput = z.input<typeof AgentBodyDescriptorSchema>;
