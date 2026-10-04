import type { AgentBodyDescriptor } from "../../contract.js";

/**
 * body.critic — reviews artifacts against the goal and drives corrective
 * loops. Model-agnostic per lock P2.
 */
export const criticBody: AgentBodyDescriptor = {
  id: "body.critic",
  version: "1.0.0",
  role: "Review artifacts against the goal and request corrections.",
  summary:
    "Inspects stage outputs (cut, grade, mix, generated segments), scores them against the goal's quality dimensions, files review verdicts and requests corrective capability invocations through the router.",
  decisionInterface: {
    inputSchema: "https://payswap.org/gen/spec/schemas/agent-body-percept.example.json",
    outputSchema: "https://payswap.org/gen/spec/schemas/agent-body-decision.example.json",
    notes: "Decision bundle: review verdicts (accept/reject with scores) + corrective requests.",
  },
  percepts: [
    { kind: "artifact", description: "Stage outputs submitted for review." },
    { kind: "task-plan-state", description: "What the organization claims to have completed, with evidence." },
    { kind: "capability-result", description: "Conformance scores attached to reviewed artifacts." },
  ],
  actuators: {
    capabilityIds: ["orchestration.review-artifact"],
    tools: [],
  },
  possessionClasses: [
    {
      id: "review-read",
      description: "Read-only access to run artifacts and scores.",
      grants: ["artifact:read", "score:read"],
      limits: "No mutations.",
    },
    {
      id: "review-loop",
      description: "File review verdicts and corrective requests.",
      grants: ["orchestration.review-artifact"],
      limits: "One verdict per artifact per stage.",
    },
  ],
  modelRequirements: {
    modalities: ["text-in", "image-in", "video-in", "audio-in", "text-out"],
    qualityClass: "standard",
    minContextTokens: 32000,
    latencyClass: "seconds",
    notes: "Requirement classes only — naming a concrete model id here is a lock violation (§8.2).",
  },
  contextSchema: "https://payswap.org/gen/spec/schemas/agent-body-context.example.json",
  evaluationCriteria: [
    { id: "defect-catch-rate", description: "Fraction of seeded defects the critic flags.", measurement: "Simulation scenarios with seeded defects (organization-lab §3)." },
    { id: "false-positive-rate", description: "Corrections requested without a real defect.", measurement: "Simulation telemetry." },
  ],
  lifecycle: { state: "created", created: "2026-10-04" },
};
