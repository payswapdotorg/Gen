import type { CapabilityCatalogEntry, ModelCatalogEntry } from "../../contract.js";

/**
 * Frozen provider-plane projection for the committed scenarios (P1/P2: models
 * live in catalogs and organization graphs — NEVER in agent bodies). Provider
 * and model names here are simulation data, not body requirements.
 */
export const FROZEN_MODEL_CATALOG: readonly ModelCatalogEntry[] = [
  {
    providerId: "zai",
    modelId: "glm-5.3",
    modalities: ["text-in", "image-in", "video-in", "audio-in", "text-out"],
    qualityClass: "flagship",
    contextTokens: 128000,
    latencyClass: "seconds",
    costPerDecisionUsd: 1.2,
  },
  {
    providerId: "zai",
    modelId: "glm-5.3-air",
    modalities: ["text-in", "image-in", "video-in", "text-out"],
    qualityClass: "standard",
    contextTokens: 64000,
    latencyClass: "seconds",
    costPerDecisionUsd: 0.25,
  },
  {
    providerId: "zai",
    modelId: "glm-5.3-voice",
    modalities: ["text-in", "image-in", "audio-in", "video-in", "text-out", "audio-out"],
    qualityClass: "standard",
    contextTokens: 32000,
    latencyClass: "seconds",
    costPerDecisionUsd: 0.3,
  },
  {
    providerId: "open-models",
    modelId: "wan-vace-14b",
    modalities: ["text-in", "image-in", "video-in", "text-out"],
    qualityClass: "standard",
    contextTokens: 32000,
    latencyClass: "minutes",
    costPerDecisionUsd: 0.1,
  },
  {
    providerId: "open-models",
    modelId: "vace-frame-edit",
    modalities: ["text-in", "image-in", "video-in", "image-out", "text-out"],
    qualityClass: "standard",
    contextTokens: 16000,
    latencyClass: "minutes",
    costPerDecisionUsd: 0.08,
  },
];

/** Frozen capability catalog view (P3 — the registry lives in @gen/media-capabilities). */
export const FROZEN_CAPABILITY_CATALOG: readonly CapabilityCatalogEntry[] = [
  { capabilityId: "orchestration.plan-workflow", domain: "orchestration", status: "draft" },
  { capabilityId: "orchestration.allocate-budget", domain: "orchestration", status: "draft" },
  { capabilityId: "orchestration.review-artifact", domain: "orchestration", status: "draft" },
  { capabilityId: "editor.cut-video", domain: "editor", status: "draft" },
  { capabilityId: "editor.composite-layer", domain: "editor", status: "draft" },
  { capabilityId: "editor.render-project", domain: "editor", status: "draft" },
  { capabilityId: "video.restyle", domain: "video", status: "draft" },
  { capabilityId: "video.reference-handling", domain: "video", status: "draft" },
  { capabilityId: "video.character-replacement", domain: "video", status: "draft" },
  { capabilityId: "image.restyle", domain: "image", status: "draft" },
  { capabilityId: "audio.dialogue-cleanup", domain: "audio", status: "draft" },
  { capabilityId: "audio.ambient-mix", domain: "audio", status: "draft" },
];
