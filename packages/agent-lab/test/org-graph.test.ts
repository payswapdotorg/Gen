/**
 * Organization graph invariant tests (work order B4): edges reference existing
 * nodes, stages reference existing nodes, dependsOn is a DAG, kind-specific
 * payloads present, allocation maps reference existing targets, and the model
 * allocation agrees with the inline agent-instance bindings.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { OrganizationGraph } from "../src/contract.js";
import { validateOrganizationGraph } from "../src/domain/org-graph.js";
import { searchOrganizations } from "../src/domain/search.js";
import { documentaryCinematicScenario } from "../src/domain/scenarios/index.js";
import { OrganizationGraphSchema } from "../src/domain/schema/organization-graph.js";

function baseGraph(overrides: {
  nodes?: OrganizationGraph["nodes"];
  edges?: OrganizationGraph["edges"];
  executionOrder?: OrganizationGraph["allocations"]["executionOrder"];
  allocations?: Partial<OrganizationGraph["allocations"]>;
}): OrganizationGraph {
  return {
    id: "org.test-graph",
    goal: "Test organization graph invariants.",
    goalClass: "generic-edit",
    nodes:
      overrides.nodes ?? [
        {
          nodeId: "n1",
          kind: "human",
          human: { role: "operator", approvalGates: ["final-delivery"] },
        },
        {
          nodeId: "n2",
          kind: "agent-instance",
          agentInstance: {
            bodyId: "body.director",
            bodyVersion: "1.0.0",
            instanceId: "run-t-n2",
            cognitiveModel: { providerId: "zai", modelId: "glm-5.3" },
          },
        },
        {
          nodeId: "n3",
          kind: "capability-invocation",
          capabilityInvocation: { capabilityId: "editor.render-project" },
        },
      ],
    edges:
      overrides.edges ?? [
        { from: "n1", to: "n2", kind: "delegation" },
        { from: "n2", to: "n1", kind: "approval" },
        { from: "n2", to: "n3", kind: "artifact-flow" },
      ],
    allocations: {
      modelAllocation: { n2: { providerId: "zai", modelId: "glm-5.3" } },
      toolAllocation: { n2: ["orchestration.plan-workflow"] },
      budgetAllocation: { n2: { maxSpend: 1 } },
      executionOrder:
        overrides.executionOrder ?? [
          { stageId: "stage-plan", nodeIds: ["n2"], dependsOn: [], checkpoint: true },
          { stageId: "stage-deliver", nodeIds: ["n3"], dependsOn: ["stage-plan"] },
        ],
      ...overrides.allocations,
    },
  };
}

test("a well-formed graph passes with zero issues", () => {
  assert.deepEqual(validateOrganizationGraph(baseGraph({})), []);
});

test("edges referencing unknown nodes are rejected", () => {
  const issues = validateOrganizationGraph(
    baseGraph({ edges: [{ from: "n1", to: "n99", kind: "delegation" }] }),
  );
  assert.ok(issues.some((issue) => issue.code === "edge-node-unknown"));
});

test("stages referencing unknown nodes are rejected", () => {
  const issues = validateOrganizationGraph(
    baseGraph({ executionOrder: [{ stageId: "stage-plan", nodeIds: ["n42"], dependsOn: [] }] }),
  );
  assert.ok(issues.some((issue) => issue.code === "stage-node-unknown"));
});

test("dependsOn referencing unknown stages is rejected", () => {
  const issues = validateOrganizationGraph(
    baseGraph({
      executionOrder: [
        { stageId: "stage-plan", nodeIds: ["n2"], dependsOn: ["stage-missing"] },
      ],
    }),
  );
  assert.ok(issues.some((issue) => issue.code === "stage-dep-unknown"));
});

test("cyclic dependsOn is rejected (DAG invariant)", () => {
  const issues = validateOrganizationGraph(
    baseGraph({
      executionOrder: [
        { stageId: "s1", nodeIds: ["n2"], dependsOn: ["s2"] },
        { stageId: "s2", nodeIds: ["n2"], dependsOn: ["s1"] },
      ],
    }),
  );
  assert.ok(issues.some((issue) => issue.code === "stage-cycle"));
});

test("missing kind payload and payload conflicts are rejected", () => {
  const missing = validateOrganizationGraph(
    baseGraph({
      nodes: [
        { nodeId: "n1", kind: "agent-instance" as const },
        { nodeId: "n2", kind: "human" as const, human: { role: "operator" } },
      ],
      edges: [],
      executionOrder: [{ stageId: "s1", nodeIds: ["n1", "n2"], dependsOn: [] }],
    }),
  );
  assert.ok(missing.some((issue) => issue.code === "node-payload-missing"));

  const conflict = validateOrganizationGraph(
    baseGraph({
      nodes: [
        {
          nodeId: "n1",
          kind: "human" as const,
          human: { role: "operator" },
          agentInstance: {
            bodyId: "body.director",
            cognitiveModel: { providerId: "zai", modelId: "glm-5.3" },
          },
        },
      ],
      edges: [],
      executionOrder: [{ stageId: "s1", nodeIds: ["n1"], dependsOn: [] }],
    }),
  );
  assert.ok(conflict.some((issue) => issue.code === "node-payload-unexpected"));
});

test("duplicate node and stage ids are rejected", () => {
  const issues = validateOrganizationGraph(
    baseGraph({
      nodes: [
        { nodeId: "n1", kind: "human", human: { role: "operator" } },
        { nodeId: "n1", kind: "human", human: { role: "operator" } },
      ],
      edges: [],
      executionOrder: [
        { stageId: "s1", nodeIds: ["n1"], dependsOn: [] },
        { stageId: "s1", nodeIds: ["n1"], dependsOn: [] },
      ],
    }),
  );
  assert.ok(issues.some((issue) => issue.code === "duplicate-node"));
  assert.ok(issues.some((issue) => issue.code === "duplicate-stage"));
});

test("allocation targets must reference known nodes or stages", () => {
  const issues = validateOrganizationGraph(
    baseGraph({
      allocations: {
        toolAllocation: { n77: ["editor.cut-video"] },
        budgetAllocation: { n88: { maxSpend: 1 } },
      },
    }),
  );
  assert.equal(issues.filter((issue) => issue.code === "allocation-target-unknown").length, 2);
});

test("modelAllocation must agree with the inline agent-instance binding", () => {
  const issues = validateOrganizationGraph(
    baseGraph({
      allocations: {
        modelAllocation: { n2: { providerId: "open-models", modelId: "wan-vace-14b" } },
      },
    }),
  );
  assert.ok(issues.some((issue) => issue.code === "model-allocation-mismatch"));
});

test("searched candidates all pass the invariants and the zod schema binding", () => {
  const result = searchOrganizations({
    goal: documentaryCinematicScenario.goal,
    goalClass: documentaryCinematicScenario.goalClass,
    catalogs: {
      models: documentaryCinematicScenario.modelCatalog,
      capabilities: documentaryCinematicScenario.capabilityCatalog,
    },
    policy: "cheapest-reliable",
    budgetEnvelopeUsd: documentaryCinematicScenario.budgetEnvelopeUsd,
  });
  assert.ok(result.candidates.length > 0);
  for (const candidate of result.candidates) {
    assert.deepEqual(
      validateOrganizationGraph(candidate.graph),
      [],
      `${candidate.graph.id} must be structurally valid`,
    );
    const parsed = OrganizationGraphSchema.safeParse(candidate.graph);
    assert.ok(parsed.success, `${candidate.graph.id}: schema violation`);
  }
});
