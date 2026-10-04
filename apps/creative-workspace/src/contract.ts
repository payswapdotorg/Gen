/**
 * @gen/creative-workspace — public contract (lock §6).
 *
 * Mirrors spec/schemas/task-plan.schema.json (P4: no black-box generation)
 * for the user-facing workspace surface. Phase 2 build-out is TL-led.
 */

export type BlockedKind = "capability" | "provider" | "input" | "human-approval";

export interface TaskPlanCompletedItem {
  readonly item: string;
  readonly evidence: readonly string[];
}

export interface TaskPlanNextAction {
  readonly action: string;
  readonly ownerNode?: string;
  readonly eta?: string;
}

export interface TaskPlanBlockedItem {
  readonly reason: string;
  readonly kind: BlockedKind;
  /** REQUIRED when kind=capability (P5 tie-in). */
  readonly capabilityGapRef?: string;
  readonly missingInput?: string;
}

export interface TaskPlanAlternative {
  readonly path: string;
  readonly tradeoffs: string;
}

/** The Zcode-style task plan every user-facing workflow must expose. */
export interface TaskPlan {
  readonly planId: string;
  readonly goal: string;
  readonly currentStep: string;
  readonly completed: readonly TaskPlanCompletedItem[];
  readonly next: readonly TaskPlanNextAction[];
  readonly blocked: readonly TaskPlanBlockedItem[];
  readonly alternative: readonly TaskPlanAlternative[];
  readonly updatedAt: string;
  readonly runRecordRef?: string;
}
