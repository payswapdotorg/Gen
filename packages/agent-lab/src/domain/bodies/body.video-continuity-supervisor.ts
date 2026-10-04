import type { AgentBodyDescriptor } from "../../contract.js";

/**
 * body.video-continuity-supervisor — modeled on
 * spec/examples/agent-body.video-continuity-supervisor.json (work order A3).
 * Model-agnostic per lock P2.
 */
export const videoContinuitySupervisorBody: AgentBodyDescriptor = {
  id: "body.video-continuity-supervisor",
  version: "1.0.0",
  role: "Guard temporal continuity of an edited sequence across cuts, effects and generated segments.",
  summary:
    "Watches artifact flow in an organization run; flags continuity defects (flicker, identity drift, pacing breaks) to the critic loop and requests corrective capability invocations through the router.",
  decisionInterface: {
    inputSchema: "https://payswap.org/gen/spec/schemas/agent-body-percept.example.json",
    outputSchema: "https://payswap.org/gen/spec/schemas/agent-body-decision.example.json",
    notes: "Any model that can emit the decision bundle (continuity verdict + corrective requests) can inhabit this body — GPT-class, Claude-class, Gemini-class or a local VLM.",
  },
  percepts: [
    { kind: "artifact", description: "In-flight video segments and their lineage edges." },
    { kind: "capability-result", description: "Quality-dimension scores from conformance runs." },
    { kind: "org-event", description: "Stage transitions and review outcomes." },
  ],
  actuators: {
    capabilityIds: ["video.restyle", "video.reference-handling"],
    tools: [],
  },
  possessionClasses: [
    { id: "review-read", description: "Read-only access to run artifacts and scores.", grants: ["artifact:read", "score:read"], limits: "No mutations." },
    { id: "corrective-request", description: "Request corrective capability executions.", grants: ["video.restyle", "video.reference-handling"], limits: "Budget-capped per stage." },
  ],
  modelRequirements: {
    modalities: ["text-in", "image-in", "video-in", "text-out"],
    qualityClass: "standard",
    minContextTokens: 32000,
    latencyClass: "seconds",
    notes: "Requirement classes only — naming a concrete model id here is a lock violation.",
  },
  contextSchema: "https://payswap.org/gen/spec/schemas/agent-body-context.example.json",
  evaluationCriteria: [
    { id: "defect-catch-rate", description: "Fraction of seeded continuity defects the body flags.", measurement: "Simulation scenarios with seeded defects (organization-lab §3)." },
    { id: "false-positive-rate", description: "Corrections requested without a real defect.", measurement: "Simulation telemetry." },
  ],
  lifecycle: { state: "created", created: "2026-10-04" },
};
