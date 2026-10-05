/**
 * Gap-signal construction for a failed frozen-mock invocation (P5 — failure
 * produces evidence, never a fabricated result). Extracted verbatim from the
 * engine (W6) to keep engine.ts within the architecture line budget — pure,
 * deterministic, same outputs.
 */
import type { GapSignalDraft } from "../../contract.js";
import type { CapabilityMock, ScenarioDescriptor } from "./scenario-types.js";
import { severityFor } from "./scenario-types.js";
import { isoFromClock } from "./task-plan.js";

export interface GapSignalArgs {
  readonly scenario: ScenarioDescriptor;
  readonly mock: CapabilityMock;
  readonly parameters: Record<string, unknown>;
  readonly clockMs: number;
  readonly runRef: string;
}

export function buildGapSignal(args: GapSignalArgs): GapSignalDraft {
  const failure = args.mock.failure ?? {
    kind: "missing-capability" as const,
    summary: `Capability ${args.mock.capabilityId} is not available for this goal class.`,
  };
  const gapId = `gap.${args.scenario.id}-${args.mock.capabilityId.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
  const comparison = (args.mock.mappingCandidates ?? [])
    .map((candidate) => `${candidate.providerId}${candidate.modelId ? `/${candidate.modelId}` : ""} rejected: ${candidate.rejectedBecause}`)
    .join(" | ");
  return {
    gapId,
    detectedAt: isoFromClock(args.scenario.clockEpochIso, args.clockMs),
    requestedCapability: {
      intent: `${args.scenario.goal} (capability ${args.mock.capabilityId})`,
      capabilityId: args.mock.capabilityId,
      parameters: args.parameters,
    },
    kind: failure.kind,
    failureEvidence: {
      summary: failure.summary,
      routerDecisionTrace: failure.routerDecisionTrace ?? (comparison ? `Mock router trace: ${comparison}` : undefined),
      comparisonTableRef: failure.comparisonTableRef,
      adapterErrorRecords: failure.adapterErrorRecords,
      organizationRunRef: args.runRef,
      artifactRefs: [...args.scenario.inputArtifacts],
    },
    impact: {
      goalClass: args.scenario.goalClass,
      severity: severityFor(failure.kind),
      frequency: "Forced by scenario fixture.",
    },
  };
}
