/**
 * TaskPlan production in simulation (P4, work order B8): stages emit plan
 * updates with the same schema as the runtime. Completed items carry evidence
 * refs; capability blocks reference gap reports (P5 tie-in).
 */
import type { GapSignalDraft, TaskPlan } from "../../contract.js";
import type { ScenarioDescriptor } from "./scenario-types.js";
import { fnv1a32 } from "./rng.js";

export function planIdFor(scenario: ScenarioDescriptor, graphId: string): string {
  return `plan.${scenario.id}-${fnv1a32(`${scenario.seed}::${graphId}`)}`;
}

export function isoFromClock(epochIso: string, elapsedMs: number): string {
  return new Date(Date.parse(epochIso) + elapsedMs).toISOString();
}

export interface PlanUpdateInput {
  readonly scenario: ScenarioDescriptor;
  readonly graphId: string;
  readonly runId: string;
  readonly currentStage: { readonly stageId: string; readonly nodeIds: readonly string[] };
  readonly completedStages: readonly {
    readonly stageId: string;
    readonly evidenceEventSeqs: readonly number[];
  }[];
  readonly upcomingStages: readonly { readonly stageId: string; readonly nodeIds: readonly string[] }[];
  readonly gapSignals: readonly GapSignalDraft[];
  readonly clockMs: number;
  readonly ownerOfNode: (nodeId: string) => string;
}

export function buildPlanUpdate(input: PlanUpdateInput): TaskPlan {
  const { scenario } = input;
  const runRef = `agent-lab/runs/${input.runId}`;
  return {
    planId: planIdFor(scenario, input.graphId),
    goal: scenario.goal,
    currentStep: `Stage ${input.currentStage.stageId} executing (${input.currentStage.nodeIds.join(", ")}) — owner ${input.ownerOfNode(input.currentStage.nodeIds[0] ?? "n1")}.`,
    completed: input.completedStages.map((stage) => ({
      item: `Stage ${stage.stageId} completed.`,
      evidence: stage.evidenceEventSeqs.map((seq) => `${runRef}#evt-${seq}`),
    })),
    next: input.upcomingStages.map((stage) => ({
      action: `Run stage ${stage.stageId} (${stage.nodeIds.join(", ")}).`,
      ownerNode: stage.nodeIds[0],
      eta: "virtual-clock",
    })),
    blocked: input.gapSignals.map((signal) => ({
      reason: signal.failureEvidence.summary,
      kind: "capability" as const,
      capabilityGapRef: `gaps/${signal.gapId}.json`,
    })),
    alternative: scenario.alternatives.map((alternative) => ({ ...alternative })),
    updatedAt: isoFromClock(scenario.clockEpochIso, input.clockMs),
    runRecordRef: runRef,
  };
}
