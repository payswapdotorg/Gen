/**
 * Deterministic simulation engine (organization-lab §3, work order B6):
 * seeded scenario, frozen capability mocks, virtual clock, no network.
 * Produces run records: event traces, artifacts, cost/latency accounting,
 * per-node telemetry (bounded) and TaskPlan streams (P4). Failures surface as
 * gap signals (P5) — never fabricated results.
 */
import type {
  GapSignalDraft,
  OrganizationGraph,
  SimulationEvent,
  SimulationRunRecord,
  TaskPlan,
} from "../../contract.js";
import type { CapabilityMock, ScenarioDescriptor } from "./scenario-types.js";
import { bodyBehavior, mockFor, severityFor } from "./scenario-types.js";
import { buildPlanUpdate, isoFromClock } from "./task-plan.js";
import { replayHash, seedFromString } from "./rng.js";

export interface SimulationConfig {
  /** Bound on recorded events (telemetry is bounded, organization-lab §3). */
  readonly maxEvents?: number;
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
): SimulationRunRecord {
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
  let clockMs = 0;
  let totalSpend = 0;
  let approvalCount = 0;
  let finished = true;
  let failureReason: string | undefined;
  let artifactSeq = 0;

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
    const failure = mock.failure ?? {
      kind: "missing-capability" as const,
      summary: `Capability ${mock.capabilityId} is not available for this goal class.`,
    };
    const gapId = `gap.${scenario.id}-${mock.capabilityId.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
    const comparison = (mock.mappingCandidates ?? [])
      .map((candidate) => `${candidate.providerId}${candidate.modelId ? `/${candidate.modelId}` : ""} rejected: ${candidate.rejectedBecause}`)
      .join(" | ");
    gapSignals.push({
      gapId,
      detectedAt: isoFromClock(scenario.clockEpochIso, clockMs),
      requestedCapability: {
        intent: `${scenario.goal} (capability ${mock.capabilityId})`,
        capabilityId: mock.capabilityId,
        parameters,
      },
      kind: failure.kind,
      failureEvidence: {
        summary: failure.summary,
        routerDecisionTrace: failure.routerDecisionTrace ?? (comparison ? `Mock router trace: ${comparison}` : undefined),
        comparisonTableRef: failure.comparisonTableRef,
        adapterErrorRecords: failure.adapterErrorRecords,
        organizationRunRef: runRef,
        artifactRefs: [...scenario.inputArtifacts],
      },
      impact: {
        goalClass: scenario.goalClass,
        severity: severityFor(failure.kind),
        frequency: "Forced by scenario fixture.",
      },
    });
    emit({
      type: "gap-signaled",
      atMs: clockMs,
      node: nodeId,
      detail: `Capability gap ${gapId} (${failure.kind}): ${failure.summary}`,
    });
  };

  const stages = topoStages(graph);
  const completedStages: { stageId: string; evidenceEventSeqs: number[] }[] = [];
  let approvalCursor = 0;
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
        const model = scenario.modelCatalog.find(
          (entry) =>
            entry.providerId === node.agentInstance?.cognitiveModel.providerId &&
            entry.modelId === node.agentInstance?.cognitiveModel.modelId,
        );
        const behavior = bodyBehavior(scenario, bodyId, model);
        decisionsByNode.set(nodeId, (decisionsByNode.get(nodeId) ?? 0) + 1);
        clockMs += behavior.decisionLatencyMs;
        totalSpend += behavior.decisionCostUsd;
        spendByNode.set(nodeId, (spendByNode.get(nodeId) ?? 0) + behavior.decisionCostUsd);
        emit({
          type: "node-acted",
          atMs: clockMs,
          node: nodeId,
          detail: `${nodeLabel(nodeId)} acted (model ${node.agentInstance.cognitiveModel.providerId}/${node.agentInstance.cognitiveModel.modelId}).`,
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
      const model = scenario.modelCatalog.find(
        (entry) =>
          entry.providerId === reviewer.agentInstance?.cognitiveModel.providerId &&
          entry.modelId === reviewer.agentInstance?.cognitiveModel.modelId,
      );
      const behavior = bodyBehavior(scenario, reviewer.agentInstance.bodyId, model);
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
    for (const edge of graph.edges) {
      if (edge.kind !== "approval" || !stage.nodeIds.includes(edge.from)) continue;
      const response =
        scenario.approvals[approvalCursor % Math.max(scenario.approvals.length, 1)]?.response ?? "approve";
      approvalCursor += 1;
      approvalCount += 1;
      stageSeqs.push(
        emit({
          type: "approval-recorded",
          atMs: clockMs,
          node: edge.to,
          detail: `Human ${nodeLabel(edge.to)} gate "${edge.notes ?? "approval"}": ${response}.`,
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
    const index = stages.indexOf(stage);
    const upcoming = stages
      .slice(index + 1)
      .map((entry) => ({ stageId: entry.stageId, nodeIds: [...entry.nodeIds] }));
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
        upcomingStages: upcoming,
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
  return { ...record, replayHash: replayHash(record) };
}

function evaluateCriteria(
  scenario: ScenarioDescriptor,
  record: Omit<SimulationRunRecord, "replayHash" | "criteriaResults">,
  caughtDefects: Set<string>,
  invokedCapabilities: ReadonlySet<string>,
): SimulationRunRecord["criteriaResults"] {
  return scenario.successCriteria.map((criterion) => {
    let met = false;
    if (criterion.id === "goal-class-served") {
      met = record.finished && record.gapSignals.length === 0 && record.artifacts.length > 0;
    } else if (criterion.id === "no-capability-gaps") {
      met = record.gapSignals.length === 0;
    } else if (criterion.id === "all-defects-caught") {
      met = scenario.defects.every((defect) => caughtDefects.has(defect.description));
    } else if (criterion.id === "budget-adhered") {
      met = record.telemetry.totalSpendUsd <= scenario.budgetEnvelopeUsd;
    } else if (criterion.id === "reviews-completed") {
      met = record.events.some((event) => event.type === "review-verdict");
    } else if (criterion.id === "required-capabilities-invoked") {
      met = (scenario.requiredCapabilities ?? []).every((capabilityId) =>
        invokedCapabilities.has(capabilityId),
      );
    }
    return { id: criterion.id, description: criterion.description, met };
  });
}
