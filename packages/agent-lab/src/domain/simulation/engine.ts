/**
 * Deterministic simulation engine (organization-lab §3, work order B6):
 * seeded scenario, frozen capability mocks, virtual clock, no network.
 * Produces run records: event traces, artifacts, cost/latency accounting,
 * per-node telemetry (bounded) and TaskPlan streams (P4). Failures surface as
 * gap signals (P5) — never fabricated results.
 *
 * W6 (spec/human-escalation-contract.md §3): approval gates surface a
 * DecisionBundle (plan delta, cost impact, alternatives) and pause for a
 * HumanDecision through a DecisionPort. The default port replays
 * scenario.approvals — bit-exact with the pre-W6 engine (regression-locked).
 * Redirects (policy patch / model swap / input supply) are applied between
 * the same deterministic loop's steps; the decision bundles and trail are
 * run-record extensions keyed by approval-event seq and NEVER enter the
 * replayHash input.
 */
import type {
  CognitiveModelBinding,
  GapSignalDraft,
  OrganizationGraph,
  SimulationEvent,
  SimulationRunRecord,
  TaskPlan,
} from "../../contract.js";
import type { CapabilityMock, ScenarioDescriptor } from "./scenario-types.js";
import { bodyBehavior, mockFor, nextScriptedDecision } from "./scenario-types.js";
import { buildPlanUpdate } from "./task-plan.js";
import { replayHash, seedFromString } from "./rng.js";
import { bodyRegistry } from "../bodies/registry.js";
import { evaluateCriteria } from "./criteria.js";
import { buildGapSignal } from "./gap-signal.js";
import { buildDecisionBundle } from "./decision-bundle.js";
import { applyRedirect } from "./decision-redirect.js";
import type { RedirectableRunState, RedirectDeps } from "./decision-redirect.js";
import { buildDecisionRecord } from "./decision-types.js";
import type {
  DecisionBundleRecord,
  DecisionPort,
  HumanDecisionRecord,
  SimulationRunRecordWithDecisions,
} from "./decision-types.js";

export interface SimulationConfig {
  /** Bound on recorded events (telemetry is bounded, organization-lab §3). */
  readonly maxEvents?: number;
  /**
   * Port resolving human decisions at approval gates. Defaults to the
   * scripted replay of scenario.approvals (bit-exact with the committed
   * records) — supply an interactive port to drive redirects.
   */
  readonly decisionPort?: DecisionPort;
}

const DEFAULT_MAX_EVENTS = 500;

function topoStages(graph: OrganizationGraph): OrganizationGraph["allocations"]["executionOrder"] {
  const declared = graph.allocations.executionOrder;
  const done = new Set<string>();
  type Stage = OrganizationGraph["allocations"]["executionOrder"][number];
  const out: Stage[] = [];
  let progress = true;
  while (out.length < declared.length && progress) {
    progress = false;
    for (const stage of declared) {
      if (done.has(stage.stageId)) continue;
      if ((stage.dependsOn ?? []).every((dep) => done.has(dep))) {
        done.add(stage.stageId);
        out.push(stage);
        progress = true;
      }
    }
  }
  return out.length === declared.length ? out : declared;
}

export function runSimulation(
  scenario: ScenarioDescriptor,
  graph: OrganizationGraph,
  config: SimulationConfig = {},
): SimulationRunRecordWithDecisions {
  const maxEvents = config.maxEvents ?? DEFAULT_MAX_EVENTS;
  const rng = seedFromString(`${scenario.seed}::${graph.id}`);
  const runId = `run-${scenario.id}-${replayHash({ graph: graph.id, seed: scenario.seed }).slice(0, 6)}`;
  const runRef = `agent-lab/runs/${runId}`;
  const events: SimulationEvent[] = [];
  const artifacts: string[] = [];
  const producerOf = new Map<string, string>();
  const taskPlans: TaskPlan[] = [];
  const gapSignals: GapSignalDraft[] = [];
  const defectiveArtifacts = new Set<string>();
  const caughtDefects = new Set<string>();
  const spendByNode = new Map<string, number>();
  const qualityByNode = new Map<string, number[]>();
  const invocationsByNode = new Map<string, number>();
  const decisionsByNode = new Map<string, number>();
  const bodyByNode = new Map<string, string>();
  const invokedCapabilities = new Set<string>();
  const decisionBundles: DecisionBundleRecord[] = [];
  const decisionTrail: HumanDecisionRecord[] = [];
  const redirectDeps: RedirectDeps = {
    modelCatalog: scenario.modelCatalog,
    bodyRegistry,
    graph,
    existingInputs: scenario.inputArtifacts,
  };
  const modelByNode = new Map<string, CognitiveModelBinding>();
  const routingPolicyByNode = new Map<string, string>();
  for (const node of graph.nodes) {
    if (node.agentInstance) modelByNode.set(node.nodeId, node.agentInstance.cognitiveModel);
    if (node.capabilityInvocation?.providerPolicy) {
      routingPolicyByNode.set(node.nodeId, node.capabilityInvocation.providerPolicy);
    }
  }
  let runState: RedirectableRunState = { modelByNode, routingPolicyByNode, suppliedInputs: [] };
  let clockMs = 0;
  let totalSpend = 0;
  let approvalCount = 0;
  let approvalCursor = 0;
  let finished = true;
  let failureReason: string | undefined;
  let artifactSeq = 0;
  const decisionPort: DecisionPort = config.decisionPort ?? {
    resolveDecision: () => {
      const decision = nextScriptedDecision(scenario.approvals, approvalCursor);
      approvalCursor += 1;
      return decision;
    },
  };
  const catalogModelOf = (binding: CognitiveModelBinding) =>
    scenario.modelCatalog.find(
      (entry) => entry.providerId === binding.providerId && entry.modelId === binding.modelId,
    );

  const emit = (event: Omit<SimulationEvent, "seq">): number => {
    const seq = events.length + 1;
    if (events.length < maxEvents) events.push({ ...event, seq });
    return seq;
  };
  const nodeLabel = (nodeId: string): string => {
    const node = graph.nodes.find((candidate) => candidate.nodeId === nodeId);
    if (!node) return nodeId;
    if (node.agentInstance) return `${nodeId} (${node.agentInstance.bodyId})`;
    if (node.human) return `${nodeId} (human ${node.human.role})`;
    return `${nodeId} (${node.capabilityInvocation?.capabilityId ?? "invocation"})`;
  };

  const invokeMock = (nodeId: string, mock: CapabilityMock, parameters: Record<string, unknown>): void => {
    invocationsByNode.set(nodeId, (invocationsByNode.get(nodeId) ?? 0) + 1);
    // The capability WAS invoked — required-capability coverage counts attempts,
    // not successes (a failed attempt surfaces as a gap signal, P5).
    invokedCapabilities.add(mock.capabilityId);
    clockMs += mock.latencyMs;
    totalSpend += mock.costUsd;
    spendByNode.set(nodeId, (spendByNode.get(nodeId) ?? 0) + mock.costUsd);
    emit({
      type: "capability-invoked",
      atMs: clockMs,
      node: nodeId,
      detail: `${mock.capabilityId} via frozen mock — cost $${mock.costUsd.toFixed(2)}, ${mock.latencyMs}ms, outcome ${mock.outcome}.`,
    });
    if (mock.outcome === "ok") {
      artifactSeq += 1;
      const artifact = `artifacts/${mock.capabilityId}.${String(artifactSeq).padStart(2, "0")}.json`;
      artifacts.push(artifact);
      producerOf.set(artifact, nodeId);
      qualityByNode.set(nodeId, [...(qualityByNode.get(nodeId) ?? []), mock.quality]);
      const defect = scenario.defects.find((entry) => entry.onCapability === mock.capabilityId);
      if (defect) defectiveArtifacts.add(artifact);
      emit({
        type: "artifact-produced",
        atMs: clockMs,
        node: nodeId,
        detail: `${artifact} (quality ${(mock.quality * 100).toFixed(0)}/100)${defect ? " with seeded defect" : ""}.`,
      });
      return;
    }
    const signal = buildGapSignal({ scenario, mock, parameters, clockMs, runRef });
    gapSignals.push(signal);
    emit({
      type: "gap-signaled",
      atMs: clockMs,
      node: nodeId,
      detail: `Capability gap ${signal.gapId} (${signal.kind}): ${signal.failureEvidence.summary}`,
    });
  };

  const stages = topoStages(graph);
  const completedStages: { stageId: string; evidenceEventSeqs: number[] }[] = [];
  for (const stage of stages) {
    const stageSeqs: number[] = [];
    stageSeqs.push(
      emit({
        type: "stage-started",
        atMs: clockMs,
        stage: stage.stageId,
        detail: `Stage ${stage.stageId} starting (nodes ${stage.nodeIds.join(", ")}).`,
      }),
    );
    for (const nodeId of stage.nodeIds) {
      const node = graph.nodes.find((candidate) => candidate.nodeId === nodeId);
      if (!node) continue;
      if (node.kind === "agent-instance" && node.agentInstance) {
        const bodyId = node.agentInstance.bodyId;
        bodyByNode.set(nodeId, bodyId);
        const binding = runState.modelByNode.get(nodeId) ?? node.agentInstance.cognitiveModel;
        const behavior = bodyBehavior(scenario, bodyId, catalogModelOf(binding));
        decisionsByNode.set(nodeId, (decisionsByNode.get(nodeId) ?? 0) + 1);
        clockMs += behavior.decisionLatencyMs;
        totalSpend += behavior.decisionCostUsd;
        spendByNode.set(nodeId, (spendByNode.get(nodeId) ?? 0) + behavior.decisionCostUsd);
        emit({
          type: "node-acted",
          atMs: clockMs,
          node: nodeId,
          detail: `${nodeLabel(nodeId)} acted (model ${binding.providerId}/${binding.modelId}).`,
        });
        for (const capabilityId of graph.allocations.toolAllocation?.[nodeId] ?? []) {
          const mock = mockFor(scenario, capabilityId);
          if (mock) invokeMock(nodeId, mock, {});
        }
      } else if (node.kind === "capability-invocation" && node.capabilityInvocation) {
        const mock = mockFor(scenario, node.capabilityInvocation.capabilityId);
        if (mock) {
          invokeMock(nodeId, mock, { ...node.capabilityInvocation.parameterBindings });
        } else {
          emit({
            type: "gap-signaled",
            atMs: clockMs,
            node: nodeId,
            detail: `Capability ${node.capabilityInvocation.capabilityId} has no frozen mock in scenario ${scenario.id}.`,
          });
          finished = false;
          failureReason = `Capability ${node.capabilityInvocation.capabilityId} unavailable in scenario.`;
        }
      }
    }
    for (const edge of graph.edges) {
      if (edge.kind !== "review" || !stage.nodeIds.includes(edge.from)) continue;
      const reviewer = graph.nodes.find((candidate) => candidate.nodeId === edge.from);
      if (!reviewer?.agentInstance) continue;
      const binding = runState.modelByNode.get(edge.from) ?? reviewer.agentInstance.cognitiveModel;
      const behavior = bodyBehavior(scenario, reviewer.agentInstance.bodyId, catalogModelOf(binding));
      const producedByTarget = artifacts.filter((artifact) => producerOf.get(artifact) === edge.to);
      for (const artifact of producedByTarget) {
        if (defectiveArtifacts.has(artifact)) {
          const defect = scenario.defects.find((entry) => artifact.startsWith(`artifacts/${entry.onCapability}.`));
          const caught = rng() < (behavior.defectCatchRate ?? 0.8);
          if (caught && defect) caughtDefects.add(defect.description);
          emit({
            type: "review-verdict",
            atMs: clockMs,
            node: edge.from,
            detail: `${nodeLabel(edge.from)} reviewed ${artifact}: ${caught ? "defect caught" : "defect missed"}${defect ? ` (${defect.description})` : ""}.`,
          });
        } else {
          const falsePositive = rng() < (behavior.falsePositiveRate ?? 0.05);
          emit({
            type: "review-verdict",
            atMs: clockMs,
            node: edge.from,
            detail: `${nodeLabel(edge.from)} reviewed ${artifact}: accepted${falsePositive ? " (with an unnecessary corrective request)" : ""}.`,
          });
        }
      }
    }
    const upcomingStages = stages
      .slice(stages.indexOf(stage) + 1)
      .map((entry) => ({ stageId: entry.stageId, nodeIds: [...entry.nodeIds] }));
    for (const edge of graph.edges) {
      if (edge.kind !== "approval" || !stage.nodeIds.includes(edge.from)) continue;
      const gate = edge.notes ?? "approval";
      const approver = {
        nodeId: edge.to,
        role: graph.nodes.find((candidate) => candidate.nodeId === edge.to)?.human?.role ?? "human",
      };
      const bundle = buildDecisionBundle({
        scenario,
        graph,
        bodyRegistry,
        runId,
        gate,
        stageId: stage.stageId,
        approver,
        currentStage: { stageId: stage.stageId, nodeIds: [...stage.nodeIds] },
        completedStages: completedStages.map((entry) => ({
          stageId: entry.stageId,
          evidenceEventSeqs: [...entry.evidenceEventSeqs],
        })),
        upcomingStages,
        gapSignals: [...gapSignals],
        spendUsd: totalSpend,
        clockMs,
        modelByNode: runState.modelByNode,
        ownerOfNode: nodeLabel,
      });
      const decision = decisionPort.resolveDecision(bundle);
      approvalCount += 1;
      const response = decision.kind;
      const eventSeq = emit({
        type: "approval-recorded",
        atMs: clockMs,
        node: edge.to,
        detail: `Human ${nodeLabel(edge.to)} gate "${gate}": ${response}.`,
      });
      stageSeqs.push(eventSeq);
      const applied =
        decision.kind === "redirect" ? applyRedirect(decision.redirect, runState, redirectDeps) : undefined;
      if (applied) runState = applied.state;
      decisionBundles.push({ eventSeq, bundle });
      decisionTrail.push(
        buildDecisionRecord({
          gate,
          nodeId: approver.nodeId,
          role: approver.role,
          eventSeq,
          clockMs,
          decision,
          bundle,
          ...(applied === undefined ? {} : { appliedRedirect: applied.application }),
        }),
      );
      if (response === "reject") {
        finished = false;
        failureReason = `Human approval rejected at stage ${stage.stageId}.`;
      }
    }
    stageSeqs.push(
      emit({
        type: "stage-completed",
        atMs: clockMs,
        stage: stage.stageId,
        detail: `Stage ${stage.stageId} completed.`,
      }),
    );
    completedStages.push({ stageId: stage.stageId, evidenceEventSeqs: stageSeqs });
    taskPlans.push(
      buildPlanUpdate({
        scenario,
        graphId: graph.id,
        runId,
        currentStage: { stageId: stage.stageId, nodeIds: [...stage.nodeIds] },
        completedStages: completedStages.map((entry) => ({
          stageId: entry.stageId,
          evidenceEventSeqs: [...entry.evidenceEventSeqs],
        })),
        upcomingStages,
        gapSignals: [...gapSignals],
        clockMs,
        ownerOfNode: nodeLabel,
      }),
    );
    emit({
      type: "plan-updated",
      atMs: clockMs,
      detail: `TaskPlan updated at stage ${stage.stageId} (completed ${completedStages.length}/${stages.length}).`,
    });
  }
  emit({
    type: "run-finished",
    atMs: clockMs,
    detail: `Run ${runId} ${finished ? "finished" : "aborted"}: ${artifacts.length} artifacts, ${gapSignals.length} gap signal(s), $${totalSpend.toFixed(2)} spend.`,
  });

  const byNode: Record<string, SimulationRunRecord["telemetry"]["byNode"][string]> = {};
  for (const node of graph.nodes) {
    byNode[node.nodeId] = {
      node: node.nodeId,
      bodyId: bodyByNode.get(node.nodeId),
      decisions: decisionsByNode.get(node.nodeId) ?? 0,
      capabilityInvocations: invocationsByNode.get(node.nodeId) ?? 0,
      spendUsd: Math.round((spendByNode.get(node.nodeId) ?? 0) * 10000) / 10000,
      qualityScores: qualityByNode.get(node.nodeId) ?? [],
    };
  }
  const record: Omit<SimulationRunRecord, "replayHash" | "criteriaResults"> & {
    criteriaResults: SimulationRunRecord["criteriaResults"];
  } = {
    runId,
    organizationId: graph.id,
    scenarioId: scenario.id,
    seed: scenario.seed,
    virtualClockMs: clockMs,
    events,
    telemetry: { byNode, totalSpendUsd: Math.round(totalSpend * 10000) / 10000, approvalCount },
    artifacts,
    taskPlans,
    gapSignals,
    criteriaResults: [],
    finished,
    ...(failureReason !== undefined ? { failureReason } : {}),
  };
  record.criteriaResults = evaluateCriteria(scenario, record, caughtDefects, invokedCapabilities);
  // Determinism law (W6 §2): the decision-plane extensions ride alongside the
  // hashed core — replayHash sees exactly the pre-W6 field set.
  return { ...record, replayHash: replayHash(record), decisionBundles, decisionTrail };
}
