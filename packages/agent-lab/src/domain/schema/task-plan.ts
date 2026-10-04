/**
 * Zod binding for spec/schemas/task-plan.schema.json (lock P4: simulation produces
 * TaskPlans too — same schema in sim and runtime, organization-lab §3).
 */
import { z } from "zod";

const planIdPattern = /^plan\.[a-z0-9-]+$/;

export const PlanCompletedItemSchema = z
  .object({
    item: z.string().min(1),
    evidence: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const PlanNextItemSchema = z
  .object({
    action: z.string().min(1),
    ownerNode: z.string().optional(),
    eta: z.string().optional(),
  })
  .strict();

export const PlanBlockedItemSchema = z
  .object({
    reason: z.string().min(1),
    kind: z.enum(["capability", "provider", "input", "human-approval"]),
    capabilityGapRef: z.string().optional(),
    missingInput: z.string().optional(),
  })
  .strict();

export const PlanAlternativeItemSchema = z
  .object({
    path: z.string().min(1),
    tradeoffs: z.string().min(1),
  })
  .strict();

export const TaskPlanSchema = z
  .object({
    planId: z.string().regex(planIdPattern),
    goal: z.string().min(5),
    currentStep: z.string().min(3),
    completed: z.array(PlanCompletedItemSchema),
    next: z.array(PlanNextItemSchema),
    blocked: z.array(PlanBlockedItemSchema),
    alternative: z.array(PlanAlternativeItemSchema),
    updatedAt: z.string().min(1),
    runRecordRef: z.string().optional(),
  })
  .strict();

export type TaskPlanInput = z.input<typeof TaskPlanSchema>;
