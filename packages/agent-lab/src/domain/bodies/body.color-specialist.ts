import type { AgentBodyDescriptor } from "../../contract.js";

/**
 * body.color-specialist — grades and harmonizes the look of the sequence.
 * Model-agnostic per lock P2.
 */
export const colorSpecialistBody: AgentBodyDescriptor = {
  id: "body.color-specialist",
  version: "1.0.0",
  role: "Grade the sequence into a coherent cinematic look.",
  summary:
    "Applies color grading and restyle passes over edited segments, keeps look consistency across cuts, and reports grading conformance back to the critic loop.",
  decisionInterface: {
    inputSchema: "https://payswap.org/gen/spec/schemas/agent-body-percept.example.json",
    outputSchema: "https://payswap.org/gen/spec/schemas/agent-body-decision.example.json",
    notes: "Decision bundle: grading instructions + restyle requests with reference handling.",
  },
  percepts: [
    { kind: "artifact", description: "Edited segments awaiting grading and reference stills." },
    { kind: "capability-result", description: "Quality-dimension scores of grading passes." },
    { kind: "org-event", description: "Review verdicts on graded segments." },
  ],
  actuators: {
    capabilityIds: ["video.restyle", "image.restyle", "video.reference-handling"],
    tools: [],
  },
  possessionClasses: [
    {
      id: "grading",
      description: "Grading and restyle capabilities.",
      grants: ["video.restyle", "image.restyle", "video.reference-handling"],
      limits: "Budget-capped per stage.",
    },
  ],
  modelRequirements: {
    modalities: ["text-in", "image-in", "video-in", "image-out", "text-out"],
    qualityClass: "standard",
    minContextTokens: 16000,
    latencyClass: "minutes",
    notes: "Requirement classes only — naming a concrete model id here is a lock violation (§8.2).",
  },
  contextSchema: "https://payswap.org/gen/spec/schemas/agent-body-context.example.json",
  evaluationCriteria: [
    { id: "grade-consistency", description: "Look consistency across graded segments.", measurement: "Simulation: variance of grading quality scores." },
  ],
  lifecycle: { state: "created", created: "2026-10-04" },
};
