import type { AgentBodyDescriptor } from "../../contract.js";

/**
 * body.video-editor — assembles the narrative cut: edits, composites and
 * prepares renders. Model-agnostic per lock P2.
 */
export const videoEditorBody: AgentBodyDescriptor = {
  id: "body.video-editor",
  version: "1.0.0",
  role: "Assemble the narrative cut of a sequence within the director's plan.",
  summary:
    "Cuts and composites source segments, requests generative edits through the capability router, and hands approved cuts downstream for grading, mixing and rendering.",
  decisionInterface: {
    inputSchema: "https://payswap.org/gen/spec/schemas/agent-body-percept.example.json",
    outputSchema: "https://payswap.org/gen/spec/schemas/agent-body-decision.example.json",
    notes: "Decision bundle: edit list, capability requests with parameters, artifact handoffs.",
  },
  percepts: [
    { kind: "artifact", description: "Source segments and in-flight edited artifacts with lineage." },
    { kind: "task-plan-state", description: "Current stage, next actions and blocked items." },
    { kind: "capability-result", description: "Outcomes of requested edit capabilities." },
  ],
  actuators: {
    capabilityIds: [
      "editor.cut-video",
      "editor.composite-layer",
      "video.restyle",
      "video.character-replacement",
      "editor.render-project",
    ],
    tools: [],
  },
  possessionClasses: [
    {
      id: "edit-basic",
      description: "Structural edit operations on the timeline.",
      grants: ["editor.cut-video", "editor.composite-layer"],
      limits: "Read/write within the run workspace.",
    },
    {
      id: "generation",
      description: "Generative edit capabilities.",
      grants: ["video.restyle", "video.character-replacement"],
      limits: "Budget-capped per stage.",
    },
    {
      id: "render",
      description: "Project rendering.",
      grants: ["editor.render-project"],
      limits: "One render per checkpoint unless re-asked by the critic loop.",
    },
  ],
  modelRequirements: {
    modalities: ["text-in", "image-in", "video-in", "text-out"],
    qualityClass: "standard",
    minContextTokens: 32000,
    latencyClass: "minutes",
    notes: "Requirement classes only — naming a concrete model id here is a lock violation (§8.2).",
  },
  contextSchema: "https://payswap.org/gen/spec/schemas/agent-body-context.example.json",
  evaluationCriteria: [
    { id: "cut-quality", description: "Conformance scores of the produced cut.", measurement: "Simulation: quality dimensions of edit capability results." },
    { id: "continuity-preservation", description: "The cut preserves temporal continuity.", measurement: "Continuity supervisor review verdicts in simulation." },
  ],
  lifecycle: { state: "created", created: "2026-10-04" },
};
