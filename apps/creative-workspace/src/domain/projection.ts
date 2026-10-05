/**
 * Projection (pure, domain): turns a WorkspaceRecordBundle of committed
 * records into the workspace view models (contract.ts). No IO — every link
 * is resolved against records the adapter already loaded.
 *
 * Lock P4 obligations encoded here:
 *  - completed items carry evidence links; an item with NO evidence is marked
 *    unverified and gets no completion mark (claims without evidence are
 *    lock violations);
 *  - blocked items with kind=capability resolve their gap report link;
 *  - alternative paths carry their deltas (shown before switching).
 */
import type {
  AlternativeView,
  BlockedItemView,
  CompletedItemView,
  EvidenceLink,
  GapLink,
  GapReportView,
  OrganizationView,
  RunRecordView,
  TaskPlanView,
  WorkspaceMount,
} from "../contract.js";
import type { SimulationEvent, SimulationRunRecord, OrganizationGraph } from "@gen/agent-lab";
import type { CapabilityGapReport } from "@gen/arena-bridge";
import type { WorkspaceRecordBundle } from "./records.js";
import { WORKSPACE_SCENARIO_META } from "./records.js";

const RUN_EVENT_REF = /^agent-lab\/runs\/([^#]+)#evt-(\d+)$/;
const ARTIFACT_REF = /^artifacts\//;

function eventKindOf(event: SimulationEvent): EvidenceLink["kind"] {
  if (event.type === "approval-recorded") return "gate-result";
  return "run-event";
}

/** Resolve one evidence ref against the bundle's loaded records. */
export function resolveEvidenceLink(ref: string, bundle: WorkspaceRecordBundle): EvidenceLink {
  const run = bundle.run;
  const eventRef = RUN_EVENT_REF.exec(ref);
  if (eventRef) {
    const seq = Number.parseInt(eventRef[2] ?? "", 10);
    const event = run?.events.find((candidate) => candidate.seq === seq);
    if (run && event) {
      return {
        ref,
        kind: eventKindOf(event),
        label: `evt-${seq} · ${event.type}`,
        sourcePaths: bundle.runProvenance,
        detail: event.detail,
      };
    }
    return {
      ref,
      kind: "declared-ref",
      label: `evt-${seq} · run record not loaded`,
      sourcePaths: bundle.runProvenance.length > 0 ? bundle.runProvenance : [bundle.planSourcePath],
    };
  }
  if (ARTIFACT_REF.test(ref)) {
    const produced = run?.artifacts.includes(ref);
    const producedEvent = run?.events.find(
      (event) => event.type === "artifact-produced" && event.detail.includes(ref),
    );
    if (run && produced) {
      return {
        ref,
        kind: "run-artifact",
        label: ref,
        sourcePaths: bundle.runProvenance,
        detail: producedEvent?.detail,
      };
    }
  }
  return {
    ref,
    kind: "declared-ref",
    label: ref,
    sourcePaths: [bundle.planSourcePath],
  };
}

/** Resolve a capabilityGapRef ("gaps/<gapId>.json") against loaded gap reports. */
export function resolveGapLink(
  ref: string,
  gapReports: readonly CapabilityGapReport[],
  gapSourcePaths: readonly string[],
): GapLink | undefined {
  const gapId = ref.split("/").pop()?.replace(/\.json$/, "");
  if (gapId === undefined) return undefined;
  const index = gapReports.findIndex((report) => report.gapId === gapId);
  const report = gapReports[index];
  if (!report) return undefined;
  return {
    ref,
    gapId: report.gapId,
    gapKind: report.kind,
    arenaState: report.arena.state,
    summary: report.failureEvidence.summary,
    severity: report.impact.severity,
    goalClass: report.impact.goalClass,
    requestedCapabilityId: report.requestedCapability.capabilityId,
    proposedCapabilityId: report.arena.proposedCapabilityId,
    sourcePath: gapSourcePaths[index] ?? `arena-bridge/src/domain/gaps/${report.gapId}.json`,
  };
}

function buildCompleted(bundle: WorkspaceRecordBundle): readonly CompletedItemView[] {
  return bundle.plan.completed.map((item) => ({
    item: item.item,
    verified: item.evidence.length > 0,
    evidence: item.evidence.map((ref) => resolveEvidenceLink(ref, bundle)),
  }));
}

function buildBlocked(bundle: WorkspaceRecordBundle): readonly BlockedItemView[] {
  return bundle.plan.blocked.map((item) => ({
    reason: item.reason,
    kind: item.kind,
    ...(item.capabilityGapRef !== undefined ? { capabilityGapRef: item.capabilityGapRef } : {}),
    ...(item.missingInput !== undefined ? { missingInput: item.missingInput } : {}),
    ...(item.kind === "capability" && item.capabilityGapRef !== undefined
      ? {
          gap: resolveGapLink(item.capabilityGapRef, bundle.gapReports, bundle.gapSourcePaths),
        }
      : {}),
  }));
}

function buildAlternatives(bundle: WorkspaceRecordBundle): readonly AlternativeView[] {
  const hint = bundle.activeAlternativeHint?.toLowerCase();
  return bundle.plan.alternative.map((alternative) => {
    // Deltas attach by exact plan path (adapters construct sets with the
    // verbatim schema paths); no match → declared tradeoff metadata only.
    const deltas = bundle.alternativeDeltas.find((set) => set.path === alternative.path);
    const active = hint !== undefined && alternative.path.toLowerCase().includes(hint);
    return {
      path: alternative.path,
      tradeoffs: alternative.tradeoffs,
      deltas: deltas?.deltas ?? [],
      active,
    };
  });
}

function stageIdOfCurrentStep(currentStep: string, fallback: string): string {
  const match = /^Stage ([^\s]+) executing/.exec(currentStep);
  return match?.[1] ?? fallback;
}

function buildRunView(run: SimulationRunRecord): RunRecordView {
  const totalStages = Math.max(run.taskPlans.length, 1);
  return {
    runId: run.runId,
    runRecordRef: `agent-lab/runs/${run.runId}`,
    scenarioId: run.scenarioId,
    organizationId: run.organizationId,
    seed: run.seed,
    replayHash: run.replayHash,
    finished: run.finished,
    ...(run.failureReason !== undefined ? { failureReason: run.failureReason } : {}),
    totalSpendUsd: run.telemetry.totalSpendUsd,
    approvalCount: run.telemetry.approvalCount,
    artifacts: [...run.artifacts],
    events: run.events.map((event) => ({
      seq: event.seq,
      type: event.type,
      atMs: event.atMs,
      detail: event.detail,
      ...(event.node !== undefined ? { node: event.node } : {}),
      ...(event.stage !== undefined ? { stage: event.stage } : {}),
    })),
    criteriaResults: run.criteriaResults.map((criterion) => ({ ...criterion })),
    planSnapshots: run.taskPlans.map((plan, index) => ({
      stageId: stageIdOfCurrentStep(plan.currentStep, `snapshot-${index + 1}`),
      completedCount: plan.completed.length,
      totalStages,
      currentStep: plan.currentStep,
    })),
  };
}

function buildOrganizationView(
  graph: OrganizationGraph,
  summary: WorkspaceRecordBundle["organizationEvaluation"],
): OrganizationView {
  return {
    id: graph.id,
    goal: graph.goal,
    goalClass: graph.goalClass,
    certified: summary?.certified ?? graph.evaluation?.certified ?? false,
    ...(summary?.fitness !== undefined || graph.evaluation?.fitness !== undefined
      ? { fitness: summary?.fitness ?? graph.evaluation?.fitness }
      : {}),
    ...(summary?.note !== undefined ? { certificationNote: summary.note } : {}),
    ...(summary?.certificationEvidence !== undefined || graph.evaluation?.certificationEvidence !== undefined
      ? {
          certificationEvidence: {
            scenarioSetRef:
              summary?.certificationEvidence?.scenarioSetRef ??
              graph.evaluation?.certificationEvidence?.scenarioSetRef ??
              "",
            replayRef:
              summary?.certificationEvidence?.replayRef ??
              graph.evaluation?.certificationEvidence?.replayRef ??
              "",
            ...(summary?.certificationEvidence?.certifiedAt !== undefined ||
            graph.evaluation?.certificationEvidence?.certifiedAt !== undefined
              ? {
                  certifiedAt:
                    summary?.certificationEvidence?.certifiedAt ??
                    graph.evaluation?.certificationEvidence?.certifiedAt,
                }
              : {}),
            ...(summary?.certificationEvidence?.gapReportsResolved !== undefined ||
            graph.evaluation?.certificationEvidence?.gapReportsResolved !== undefined
              ? {
                  gapReportsResolved:
                    summary?.certificationEvidence?.gapReportsResolved ??
                    graph.evaluation?.certificationEvidence?.gapReportsResolved,
                }
              : {}),
          },
        }
      : {}),
    nodes: graph.nodes.map((node) => ({
      nodeId: node.nodeId,
      kind: node.kind,
      label:
        node.agentInstance?.bodyId ??
        node.human?.role ??
        node.capabilityInvocation?.capabilityId ??
        node.nodeId,
      ...(node.agentInstance?.bodyId !== undefined ? { bodyId: node.agentInstance.bodyId } : {}),
      ...(node.agentInstance !== undefined
        ? {
            model: `${node.agentInstance.cognitiveModel.providerId}/${node.agentInstance.cognitiveModel.modelId}`,
          }
        : {}),
      ...(node.human?.role !== undefined ? { role: node.human.role } : {}),
    })),
    stages: graph.allocations.executionOrder.map((stage) => ({
      stageId: stage.stageId,
      nodeIds: [...stage.nodeIds],
    })),
  };
}

function buildGapReportViews(bundle: WorkspaceRecordBundle): readonly GapReportView[] {
  return bundle.gapReports.map((report, index) => ({
    gapId: report.gapId,
    gapKind: report.kind,
    detectedAt: report.detectedAt,
    arenaState: report.arena.state,
    summary: report.failureEvidence.summary,
    ...(report.failureEvidence.routerDecisionTrace !== undefined
      ? { routerDecisionTrace: report.failureEvidence.routerDecisionTrace }
      : {}),
    severity: report.impact.severity,
    goalClass: report.impact.goalClass,
    ...(report.requestedCapability.capabilityId !== undefined
      ? { requestedCapabilityId: report.requestedCapability.capabilityId }
      : {}),
    ...(report.arena.proposedCapabilityId !== undefined
      ? { proposedCapabilityId: report.arena.proposedCapabilityId }
      : {}),
    ...(report.arena.expertSessionRef !== undefined
      ? { expertSessionRef: report.arena.expertSessionRef }
      : {}),
    ...(report.arena.certificationEvidence !== undefined
      ? { certificationEvidence: report.arena.certificationEvidence }
      : {}),
    sourcePath: bundle.gapSourcePaths[index] ?? `arena-bridge/src/domain/gaps/${report.gapId}.json`,
  }));
}

function buildProvenance(bundle: WorkspaceRecordBundle): readonly string[] {
  const paths: string[] = [bundle.planSourcePath];
  if (bundle.organizationSourcePath !== undefined) paths.push(bundle.organizationSourcePath);
  if (bundle.evaluationSourcePath !== undefined) paths.push(bundle.evaluationSourcePath);
  paths.push(...bundle.gapSourcePaths);
  paths.push(...bundle.runProvenance);
  return [...new Set(paths)];
}

/** Build the full workspace mount view from a loaded record bundle. */
export function buildWorkspaceMount(bundle: WorkspaceRecordBundle): WorkspaceMount {
  const meta = WORKSPACE_SCENARIO_META[bundle.scenarioId];
  const planView: TaskPlanView = {
    plan: bundle.plan,
    completed: buildCompleted(bundle),
    next: bundle.plan.next.map((action) => ({ ...action })),
    blocked: buildBlocked(bundle),
    alternative: buildAlternatives(bundle),
  };
  return {
    scenarioId: bundle.scenarioId,
    title: meta.title,
    summary: meta.summary,
    planView,
    ...(bundle.run !== undefined ? { run: buildRunView(bundle.run) } : {}),
    ...(bundle.organization !== undefined
      ? { organization: buildOrganizationView(bundle.organization, bundle.organizationEvaluation) }
      : {}),
    gapReports: buildGapReportViews(bundle),
    provenance: buildProvenance(bundle),
  };
}
