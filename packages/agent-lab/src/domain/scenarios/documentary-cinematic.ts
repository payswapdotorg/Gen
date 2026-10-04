import type { ScenarioDescriptor } from "../simulation/scenario-types.js";
import { FROZEN_CAPABILITY_CATALOG, FROZEN_MODEL_CATALOG } from "./frozen-catalog.js";

/**
 * T2 scenario (work order D12): "Make this documentary cinematic." — the lab
 * must assemble + certify the Director / Editor / Color / Audio / Critic
 * organization for the documentary goal class. Seed mirrors the spec example
 * org (organization-graph.documentary-cinematic.json).
 */
export const documentaryCinematicScenario: ScenarioDescriptor = {
  id: "documentary-cinematic",
  goalClass: "documentary-cinematic-remaster",
  goal: "Make this documentary cinematic: color, pacing, audio and review organization for the remaster goal.",
  seed: "doc-cine-2026-10-04-a",
  clockEpochIso: "2026-10-04T00:00:00.000Z",
  latencyScaleMs: 600000,
  budgetEnvelopeUsd: 24,
  inputArtifacts: [
    "artifacts/art.src-interview-a.json",
    "artifacts/art.src-interview-b.json",
    "artifacts/art.src-broll.json",
  ],
  modelCatalog: FROZEN_MODEL_CATALOG,
  capabilityCatalog: FROZEN_CAPABILITY_CATALOG,
  capabilityMocks: [
    { capabilityId: "editor.cut-video", costUsd: 0.4, latencyMs: 12000, quality: 0.9, outcome: "ok" },
    { capabilityId: "editor.composite-layer", costUsd: 0.3, latencyMs: 8000, quality: 0.88, outcome: "ok" },
    { capabilityId: "video.restyle", costUsd: 1.5, latencyMs: 45000, quality: 0.86, outcome: "ok" },
    { capabilityId: "video.character-replacement", costUsd: 2.0, latencyMs: 60000, quality: 0.9, outcome: "ok" },
    { capabilityId: "editor.render-project", costUsd: 0.8, latencyMs: 30000, quality: 0.92, outcome: "ok" },
    { capabilityId: "audio.dialogue-cleanup", costUsd: 0.35, latencyMs: 20000, quality: 0.9, outcome: "ok" },
    { capabilityId: "audio.ambient-mix", costUsd: 0.25, latencyMs: 15000, quality: 0.85, outcome: "ok" },
    { capabilityId: "image.restyle", costUsd: 0.1, latencyMs: 5000, quality: 0.82, outcome: "ok" },
    { capabilityId: "video.reference-handling", costUsd: 0.2, latencyMs: 10000, quality: 0.8, outcome: "ok" },
  ],
  approvals: [{ gate: "final-delivery", response: "approve" }],
  defects: [
    {
      onCapability: "editor.cut-video",
      description: "Pacing break between interview A and the b-roll insert.",
    },
  ],
  successCriteria: [
    { id: "goal-class-served", description: "The documentary remaster pipeline delivered without capability gaps." },
    { id: "no-capability-gaps", description: "No capability gap reports were emitted." },
    { id: "all-defects-caught", description: "Every seeded continuity defect was caught by a reviewer." },
    { id: "budget-adhered", description: "Simulated spend stayed within the budget envelope." },
    { id: "reviews-completed", description: "Review loops produced verdicts." },
    {
      id: "required-capabilities-invoked",
      description: "The organization actually invoked every capability the documentary remaster requires (cut, restyle, audio cleanup, render).",
    },
  ],
  requiredCapabilities: [
    "editor.cut-video",
    "video.restyle",
    "audio.dialogue-cleanup",
    "editor.render-project",
  ],
  alternatives: [
    {
      path: "cheapest-reliable (open models + local tools)",
      tradeoffs: "Lower spend per pass, standard quality class, minutes-class latency on generative passes.",
    },
    {
      path: "premium-first (flagship models on planning and review)",
      tradeoffs: "Higher defect catch and planning quality, ~3x model spend, seconds-class latency.",
    },
  ],
};
