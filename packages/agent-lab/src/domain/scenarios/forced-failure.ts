import type { ScenarioDescriptor } from "../simulation/scenario-types.js";
import { FROZEN_CAPABILITY_CATALOG, FROZEN_MODEL_CATALOG } from "./frozen-catalog.js";

/**
 * T4 scenario (work order D13): forced capability failure — the character
 * replacement capability has NO acceptable mapping under the cheapest-reliable
 * policy for profile-view-only reference inputs. The simulation MUST emit a
 * schema-valid gap signal with evidence (P5: never a fabricated result) and
 * the certification bar MUST refuse to certify while the gap is unresolved.
 */
export const forcedFailureScenario: ScenarioDescriptor = {
  id: "forced-failure",
  goalClass: "character-replacement-edit",
  goal: "Replace the interviewed actor with the user's character across the documentary sequence.",
  seed: "t4-forced-failure-2026-10-04",
  clockEpochIso: "2026-10-04T00:00:00.000Z",
  latencyScaleMs: 600000,
  budgetEnvelopeUsd: 20,
  inputArtifacts: ["artifacts/art.src-sequence.json", "artifacts/art.character-ref.json"],
  modelCatalog: FROZEN_MODEL_CATALOG,
  capabilityCatalog: FROZEN_CAPABILITY_CATALOG,
  capabilityMocks: [
    { capabilityId: "editor.cut-video", costUsd: 0.4, latencyMs: 12000, quality: 0.9, outcome: "ok" },
    {
      capabilityId: "video.character-replacement",
      costUsd: 0,
      latencyMs: 0,
      quality: 0,
      outcome: "fail",
      failure: {
        kind: "mapping-shortfall",
        summary:
          "Router trace: all candidate mappings rejected under the cheapest-reliable policy — identity-preservation would fall below 80 given only profile-view reference frames.",
        routerDecisionTrace:
          "policy=cheapest-reliable; input-class=profile-view-only-reference; candidates=3; rejected=3 (identity-preservation below threshold).",
        comparisonTableRef:
          "media-capabilities/evaluations/video.character-replacement.comparison.json",
        adapterErrorRecords: [],
      },
      mappingCandidates: [
        {
          providerId: "higgsfield",
          modelId: "genjutsu",
          rejectedBecause: "identity-preservation 72 < 80 on profile-view-only references",
        },
        {
          providerId: "open-models",
          modelId: "wan-2.2-animate",
          rejectedBecause: "identity-preservation 63 < 80 on profile-view-only references",
        },
        {
          providerId: "open-models",
          modelId: "vace",
          rejectedBecause: "reference handling below threshold (profile-view only)",
        },
      ],
    },
    { capabilityId: "editor.render-project", costUsd: 0.8, latencyMs: 30000, quality: 0.92, outcome: "ok" },
    { capabilityId: "video.restyle", costUsd: 1.5, latencyMs: 45000, quality: 0.86, outcome: "ok" },
    { capabilityId: "video.reference-handling", costUsd: 0.2, latencyMs: 10000, quality: 0.8, outcome: "ok" },
  ],
  approvals: [{ gate: "final-delivery", response: "approve" }],
  defects: [],
  successCriteria: [
    { id: "goal-class-served", description: "The character replacement pipeline delivered without capability gaps." },
    { id: "no-capability-gaps", description: "No capability gap reports were emitted." },
    { id: "reviews-completed", description: "Review loops produced verdicts." },
    { id: "budget-adhered", description: "Simulated spend stayed within the budget envelope." },
    {
      id: "required-capabilities-invoked",
      description: "The organization actually attempted the character replacement the goal requires — dodging it (minimal tool profile) is not goal achievement.",
    },
  ],
  requiredCapabilities: ["video.character-replacement"],
  alternatives: [
    {
      path: "Premium-first: force a premium mapping with relaxed identity threshold",
      tradeoffs: "Higher identity-preservation expected, ~3.1x cost, still fails the current policy bar.",
    },
    {
      path: "Supply a frontal reference frame and retry cheapest-reliable",
      tradeoffs: "No extra spend, requires a new input from the user (missing input).",
    },
  ],
};
