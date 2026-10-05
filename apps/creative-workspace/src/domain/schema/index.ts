/**
 * Zod bindings for the workspace's TL-owned schemas (lock §6). JSON Schemas in
 * spec/schemas/ are the source of truth — parity is mandatory and tested.
 */
export { PlanAlternativeSchema, PlanBlockedItemSchema, PlanCompletedItemSchema, PlanNextActionSchema, TaskPlanSchema } from "./task-plan.js";
export type { TaskPlanInput } from "./task-plan.js";
