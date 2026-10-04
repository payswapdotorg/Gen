import type { AgentBodyDescriptor } from "../../contract.js";

/**
 * body.director — owns the creative goal, plans the workflow, delegates to
 * specialists and guards the budget. Model-agnostic per lock P2.
 */
export const directorBody: AgentBodyDescriptor = {
  id: "body.director",
  version: "1.0.0",
  role: "Turn a user creative goal into a staged execution plan and steer the organization to delivery.",
  summary:
    "The director interprets intent, decomposes the goal into stages, delegates work to editor/color/audio bodies, watches the TaskPlan and budget, and escalates to the human operator at approval gates.",
  decisionInterface: {
    inputSchema: "https://payswap.org/gen/spec/schemas/agent-body-percept.example.json",
    outputSchema: "https://payswap.org/gen/spec/schemas/agent-body-decision.example.json",
    notes: "Decision bundle: stage plan, per-node delegations, budget envelope, approval requests. Any model that can emit this bundle can inhabit the body.",
  },
  percepts: [
    { kind: "task-plan-state", description: "Live TaskPlan state for the run (current step, blocked items, alternatives)." },
    { kind: "artifact", description: "Source and in-flight artifacts with lineage refs." },
    { kind: "org-event", description: "Stage transitions, review verdicts and gap signals from the organization." },
    { kind: "human-message", description: "Operator redirects, approvals and supplied inputs." },
  ],
  actuators: {
    capabilityIds: ["orchestration.plan-workflow", "orchestration.allocate-budget"],
    tools: [],
  },
  possessionClasses: [
    {
      id: "planning",
      description: "Request workflow planning and budget allocation for the run.",
      grants: ["orchestration.plan-workflow", "orchestration.allocate-budget"],
      limits: "One active plan per stage; budget envelope is set by the organization, never exceeded.",
    },
  ],
  modelRequirements: {
    modalities: ["text-in", "image-in", "text-out"],
    qualityClass: "flagship",
    minContextTokens: 64000,
    latencyClass: "seconds",
    notes: "Requirement classes only — naming a concrete model id here is a lock violation (§8.2).",
  },
  contextSchema: "https://payswap.org/gen/spec/schemas/agent-body-context.example.json",
  evaluationCriteria: [
    { id: "plan-coverage", description: "Every delegated stage is covered by the plan.", measurement: "Simulation: fraction of stages planned before execution." },
    { id: "budget-adherence", description: "Plans stay inside the allocated envelope.", measurement: "Simulation telemetry: spend vs budget allocation." },
  ],
  lifecycle: { state: "created", created: "2026-10-04" },
};
