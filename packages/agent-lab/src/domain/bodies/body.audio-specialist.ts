import type { AgentBodyDescriptor } from "../../contract.js";

/**
 * body.audio-specialist — dialogue and ambience for the sequence.
 * Model-agnostic per lock P2.
 */
export const audioSpecialistBody: AgentBodyDescriptor = {
  id: "body.audio-specialist",
  version: "1.0.0",
  role: "Deliver clean dialogue and a balanced mix for the sequence.",
  summary:
    "Cleans dialogue, lays ambience and mixes levels around the final cut; flags audio artifacts to the critic loop and requests corrective audio capabilities through the router.",
  decisionInterface: {
    inputSchema: "https://payswap.org/gen/spec/schemas/agent-body-percept.example.json",
    outputSchema: "https://payswap.org/gen/spec/schemas/agent-body-decision.example.json",
    notes: "Decision bundle: audio treatment plan + corrective capability requests.",
  },
  percepts: [
    { kind: "artifact", description: "Cut segments with audio tracks and loudness profiles." },
    { kind: "capability-result", description: "Outcomes of audio capability passes." },
    { kind: "org-event", description: "Stage transitions and review verdicts." },
  ],
  actuators: {
    capabilityIds: ["audio.dialogue-cleanup", "audio.ambient-mix"],
    tools: [],
  },
  possessionClasses: [
    {
      id: "audio-treatment",
      description: "Audio cleanup and mixing capabilities.",
      grants: ["audio.dialogue-cleanup", "audio.ambient-mix"],
      limits: "Budget-capped per stage.",
    },
  ],
  modelRequirements: {
    modalities: ["text-in", "audio-in", "video-in", "text-out", "audio-out"],
    qualityClass: "standard",
    minContextTokens: 16000,
    latencyClass: "minutes",
    notes: "Requirement classes only — naming a concrete model id here is a lock violation (§8.2).",
  },
  contextSchema: "https://payswap.org/gen/spec/schemas/agent-body-context.example.json",
  evaluationCriteria: [
    { id: "dialogue-clarity", description: "Dialogue intelligibility after cleanup.", measurement: "Simulation: audio capability quality dimensions." },
  ],
  lifecycle: { state: "created", created: "2026-10-04" },
};
