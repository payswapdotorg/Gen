/**
 * Decision bundle construction (spec/human-escalation-contract.md §3, work
 * order W6 task B): at each approval edge the engine snapshots the TaskPlan
 * delta (completed-with-evidence, next, blocked — reusing buildPlanUpdate so
 * the bundle and the P4 plan stream share one shape), the cost impact (spend
 * so far vs envelope, projected remaining from the frozen mocks and current
 * model bindings), and the alternatives available at that decision point:
 * the scenario's routing alternatives plus model-swap options within each
 * present body's model requirement class (P2 — bodies stay model-agnostic;
 * existing domain types are reused, none invented). Pure: no IO, no engine
 * state mutation, deterministic for a given context.
 */
import type {
  CognitiveModelBinding,
  GapSignalDraft,
  ModelCatalogEntry,
  OrganizationGraph,
} from "../../contract.js";
import type { ScenarioDescriptor } from "./scenario-types.js";
import { bodyBehavior, mockFor } from "./scenario-types.js";
import { modelSatisfiesRequirements } from "../binding.js";
import type { BodyRegistry } from "../bodies/registry.js";
import type { BundleAlternative, DecisionBundle } from "./decision-types.js";
import { buildPlanUpdate } from "./task-plan.js";

/** Everything the builder needs from the engine at the approval edge. */
export interface DecisionBundleContext {
  readonly scenario: ScenarioDescriptor;
  readonly graph: OrganizationGraph;
  readonly bodyRegistry: BodyRegistry;
  readonly runId: string;
  readonly gate: string;
  readonly stageId: string;
  readonly approver: { readonly nodeId: string; readonly role: string };
  readonly currentStage: { readonly stageId: string; readonly nodeIds: readonly string[] };
  readonly completedStages: readonly {
    readonly stageId: string;
    readonly evidenceEventSeqs: readonly number[];
  }[];
  /** Stages strictly after the one hosting the gate (it is still in flight). */
  readonly upcomingStages: readonly { readonly stageId: string; readonly nodeIds: readonly string[] }[];
  readonly gapSignals: readonly GapSignalDraft[];
  readonly spendUsd: number;
  readonly clockMs: number;
  readonly modelByNode: ReadonlyMap<string, CognitiveModelBinding>;
  readonly ownerOfNode: (nodeId: string) => string;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function catalogModelFor(
  catalog: readonly ModelCatalogEntry[],
  binding: CognitiveModelBinding | undefined,
): ModelCatalogEntry | undefined {
  if (binding === undefined) return undefined;
  return catalog.find(
    (entry) => entry.providerId === binding.providerId && entry.modelId === binding.modelId,
  );
}

/**
 * Build the bundle presented at one approval gate. The stage hosting the gate
 * is mid-flight, so it leads the plan delta's "next" list; "completed" lists
 * only fully completed stages with their evidence refs; "blocked" mirrors the
 * gap signals raised so far (P5 tie-in).
 */
export function buildDecisionBundle(context: DecisionBundleContext): DecisionBundle {
  const plan = buildPlanUpdate({
    scenario: context.scenario,
    graphId: context.graph.id,
    runId: context.runId,
    currentStage: context.currentStage,
    completedStages: context.completedStages,
    upcomingStages: [context.currentStage, ...context.upcomingStages],
    gapSignals: context.gapSignals,
    clockMs: context.clockMs,
    ownerOfNode: context.ownerOfNode,
  });
  return {
    gate: { id: context.gate, stageId: context.stageId, approver: context.approver },
    planDelta: { completed: plan.completed, next: plan.next, blocked: plan.blocked },
    costImpact: {
      spendUsd: round4(context.spendUsd),
      envelopeUsd: context.scenario.budgetEnvelopeUsd,
      projectedRemainingUsd: projectRemainingSpendUsd(context),
    },
    alternatives: bundleAlternatives(context),
  };
}

/**
 * Project the remaining spend from the not-yet-executed stages: one decision
 * per remaining agent node (at its CURRENT effective model binding — a model
 * swap changes the projection) plus the frozen mock cost of every capability
 * still allocated to it. A projection, not a promise (hermetic environment).
 */
export function projectRemainingSpendUsd(context: DecisionBundleContext): number {
  let projected = 0;
  for (const stage of context.upcomingStages) {
    for (const nodeId of stage.nodeIds) {
      const node = context.graph.nodes.find((candidate) => candidate.nodeId === nodeId);
      if (node?.kind === "agent-instance" && node.agentInstance) {
        projected += bodyBehavior(
          context.scenario,
          node.agentInstance.bodyId,
          catalogModelFor(context.scenario.modelCatalog, context.modelByNode.get(nodeId)),
        ).decisionCostUsd;
        for (const capabilityId of context.graph.allocations.toolAllocation?.[nodeId] ?? []) {
          projected += mockFor(context.scenario, capabilityId)?.costUsd ?? 0;
        }
      } else if (node?.kind === "capability-invocation" && node.capabilityInvocation) {
        projected += mockFor(context.scenario, node.capabilityInvocation.capabilityId)?.costUsd ?? 0;
      }
    }
  }
  return round4(projected);
}

function bindingKey(binding: CognitiveModelBinding | undefined): string {
  return binding === undefined ? "?" : `${binding.providerId}/${binding.modelId}`;
}

/**
 * Alternatives available at the decision point: routing alternatives from the
 * scenario (in order), then model-swap options per body present in the
 * organization (graph node order, catalog order). Swap options list catalog
 * models that satisfy the body's requirement class and are not already bound
 * to one of its nodes. The "current" binding shown is the first node's.
 */
export function bundleAlternatives(context: DecisionBundleContext): BundleAlternative[] {
  const alternatives: BundleAlternative[] = context.scenario.alternatives.map((alternative, index) => ({
    id: `alt-routing-${index + 1}`,
    kind: "routing",
    path: alternative.path,
    tradeoffs: alternative.tradeoffs,
  }));
  const seenBodies = new Set<string>();
  for (const node of context.graph.nodes) {
    if (node.kind !== "agent-instance" || node.agentInstance === undefined) continue;
    const bodyId = node.agentInstance.bodyId;
    if (seenBodies.has(bodyId)) continue;
    seenBodies.add(bodyId);
    const body = context.bodyRegistry.get(bodyId);
    const current = context.modelByNode.get(node.nodeId);
    if (body === undefined || current === undefined) continue;
    const bound = new Set(
      context.graph.nodes
        .filter(
          (candidate) =>
            candidate.kind === "agent-instance" &&
            candidate.agentInstance?.bodyId === bodyId &&
            context.modelByNode.has(candidate.nodeId),
        )
        .map((candidate) => bindingKey(context.modelByNode.get(candidate.nodeId))),
    );
    for (const model of context.scenario.modelCatalog) {
      if (bound.has(`${model.providerId}/${model.modelId}`)) continue;
      if (modelSatisfiesRequirements(model, body).length > 0) continue;
      const currentModel = catalogModelFor(context.scenario.modelCatalog, current);
      const currentCost = currentModel?.costPerDecisionUsd ?? 0.5;
      const cost = model.costPerDecisionUsd ?? 0.5;
      const ratio = currentCost === 0 ? cost : cost / currentCost;
      alternatives.push({
        id: `alt-swap-${bodyId}-${model.modelId}`,
        kind: "model-swap",
        bodyId,
        current,
        candidate: { providerId: model.providerId, modelId: model.modelId },
        tradeoffs: `quality ${model.qualityClass}, $${cost.toFixed(2)} per decision (${ratio.toFixed(1)}x current), ${model.latencyClass ?? "unspecified"} latency`,
      });
    }
  }
  return alternatives;
}
