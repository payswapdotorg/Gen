/**
 * Zod bindings for spec/schemas/task-plan.schema.json (lock §6 parity, work
 * order task 9 — mirroring the pattern in @gen/media-capabilities/src/domain/schema.ts).
 *
 * The JSON Schema is the source of truth; these bindings mirror it field by
 * field (strict objects, required lists, patterns, enums, item minimums).
 * Parity is asserted by test/schema-parity.test.ts: the committed spec
 * example must parse, and the shapes the schema rejects (additionalProperties,
 * blocked-kind enum, planId pattern, evidence minItems) must be rejected here.
 *
 * `updatedAt` carries JSON-Schema `format: "date-time"`, which the program's
 * canonical validators treat as annotation (ajv runs without format plugins);
 * the binding mirrors the enforced constraint set (non-empty string).
 */
import { z } from "zod";

const planIdPattern = /^plan\.[a-z0-9-]+$/;

export const PlanCompletedItemSchema = z
  .object({
    item: z.string().min(1),
    evidence: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const PlanNextActionSchema = z
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

export const PlanAlternativeSchema = z
  .object({
    path: z.string().min(1),
    tradeoffs: z.string().min(1),
  })
  .strict();

/** TaskPlan (spec/schemas/task-plan.schema.json — P4). */
export const TaskPlanSchema = z
  .object({
    planId: z.string().regex(planIdPattern),
    goal: z.string().min(5),
    currentStep: z.string().min(3),
    completed: z.array(PlanCompletedItemSchema),
    next: z.array(PlanNextActionSchema),
    blocked: z.array(PlanBlockedItemSchema),
    alternative: z.array(PlanAlternativeSchema),
    updatedAt: z.string().min(1),
    runRecordRef: z.string().optional(),
  })
  .strict();

export type TaskPlanInput = z.input<typeof TaskPlanSchema>;
