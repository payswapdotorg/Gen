/**
 * Organization search tests (work order B5, organization-lab §2): the five
 * binding dimensions — role structure, tool allocation, model allocation,
 * execution ordering, budget allocation. The OUTPUT contract is the schema;
 * this rule-based engine enumerates candidates deterministically.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { searchOrganizations } from "../src/domain/search.js";
import { ROLE_TEMPLATES } from "../src/domain/search-templates.js";
import { documentaryCinematicScenario, forcedFailureScenario } from "../src/domain/scenarios/index.js";

const t2Catalogs = {
  models: documentaryCinematicScenario.modelCatalog,
  capabilities: documentaryCinematicScenario.capabilityCatalog,
};

function t2Request(policy: "cheapest-reliable" | "premium-first" = "cheapest-reliable") {
  return {
    goal: documentaryCinematicScenario.goal,
    goalClass: documentaryCinematicScenario.goalClass,
    catalogs: t2Catalogs,
    policy,
    budgetEnvelopeUsd: documentaryCinematicScenario.budgetEnvelopeUsd,
  } as const;
}

test("search returns ranked, schema-valid candidates for the documentary goal class", () => {
  const result = searchOrganizations(t2Request());
  assert.ok(result.candidates.length > 1);
  for (let i = 1; i < result.candidates.length; i += 1) {
    const prev = result.candidates[i - 1]!;
    const curr = result.candidates[i]!;
    assert.ok(
      prev.preScore >= curr.preScore || (prev.preScore === curr.preScore && prev.graph.id <= curr.graph.id),
      "candidates must be sorted by preScore then id",
    );
  }
  assert.deepEqual(result.issues, []);
});

test("dimension — role structure: optional roles enumerate both topologies", () => {
  const result = searchOrganizations(t2Request());
  const withSupervisor = result.candidates.filter((candidate) =>
    candidate.graph.nodes.some((node) => node.agentInstance?.bodyId === "body.video-continuity-supervisor"),
  );
  const withoutSupervisor = result.candidates.filter(
    (candidate) =>
      !candidate.graph.nodes.some((node) => node.agentInstance?.bodyId === "body.video-continuity-supervisor"),
  );
  assert.ok(withSupervisor.length > 0, "some candidates include the optional supervisor");
  assert.ok(withoutSupervisor.length > 0, "some candidates drop it");
  // Review topology dimension: critic-reviews-all vs critic-reviews-editor.
  const topologies = new Set(result.candidates.map((c) => c.dimensionChoices.reviewTopology));
  assert.deepEqual([...topologies].sort(), ["critic-reviews-all", "critic-reviews-editor"]);

  const frozen = searchOrganizations({ ...t2Request(), dimensions: { roleStructure: false } });
  for (const candidate of frozen.candidates) {
    assert.ok(
      candidate.graph.nodes.some((node) => node.agentInstance?.bodyId === "body.video-continuity-supervisor"),
      "with the dimension off, optional roles are all included (no enumeration)",
    );
  }
});

test("dimension — tool allocation: standard vs minimal grants", () => {
  const result = searchOrganizations(t2Request());
  const profiles = new Set(result.candidates.map((c) => c.dimensionChoices.toolAllocation));
  assert.deepEqual([...profiles].sort(), ["minimal", "standard"]);

  const frozen = searchOrganizations({ ...t2Request(), dimensions: { toolAllocation: false } });
  for (const candidate of frozen.candidates) {
    assert.equal(candidate.dimensionChoices.toolAllocation, "standard");
  }
  // Minimal profile grants fewer capabilities: the editor loses generative caps.
  const standard = result.candidates.find(
    (c) => c.dimensionChoices.toolAllocation === "standard" && !c.graph.nodes.some((n) => n.agentInstance?.bodyId === "body.video-continuity-supervisor"),
  );
  const minimal = result.candidates.find(
    (c) => c.dimensionChoices.toolAllocation === "minimal" && !c.graph.nodes.some((n) => n.agentInstance?.bodyId === "body.video-continuity-supervisor"),
  );
  assert.ok(standard && minimal);
  const editorStandard = standard.graph.nodes.find((n) => n.agentInstance?.bodyId === "body.video-editor");
  const editorMinimal = minimal.graph.nodes.find((n) => n.agentInstance?.bodyId === "body.video-editor");
  assert.ok(editorStandard?.nodeId && editorMinimal?.nodeId);
  const standardTools = standard.graph.allocations.toolAllocation?.[editorStandard.nodeId] ?? [];
  const minimalTools = minimal.graph.allocations.toolAllocation?.[editorMinimal.nodeId] ?? [];
  assert.ok(standardTools.length > minimalTools.length);
  assert.ok(standardTools.includes("video.character-replacement"));
});

test("dimension — model allocation: policy changes which model inhabits each body", () => {
  const cheapest = searchOrganizations(t2Request("cheapest-reliable"));
  const premium = searchOrganizations(t2Request("premium-first"));
  const pickEditor = (result: ReturnType<typeof searchOrganizations>) => {
    const candidate = result.candidates[0];
    assert.ok(candidate);
    const editor = candidate.graph.nodes.find((n) => n.agentInstance?.bodyId === "body.video-editor");
    assert.ok(editor?.agentInstance);
    return editor.agentInstance.cognitiveModel;
  };
  const cheapestModel = pickEditor(cheapest);
  const premiumModel = pickEditor(premium);
  assert.notDeepEqual(cheapestModel, premiumModel);
  const cheapestEntry = t2Catalogs.models.find(
    (m) => m.providerId === cheapestModel.providerId && m.modelId === cheapestModel.modelId,
  );
  assert.ok(cheapestEntry);
  assert.equal(cheapestEntry.qualityClass, "standard");
  assert.ok(cheapestEntry.costPerDecisionUsd !== undefined && cheapestEntry.costPerDecisionUsd < 1);
});

test("dimension — execution ordering: parallel vs sequential stage graphs", () => {
  const result = searchOrganizations(t2Request());
  const execProfiles = new Set(result.candidates.map((c) => c.dimensionChoices.executionOrdering));
  assert.deepEqual([...execProfiles].sort(), ["parallel", "sequential"]);

  const parallel = result.candidates.find((c) => c.dimensionChoices.executionOrdering === "parallel");
  const sequential = result.candidates.find((c) => c.dimensionChoices.executionOrdering === "sequential");
  assert.ok(parallel && sequential);
  // Parallel packs color+audio into one specialist stage (pipeline parallelism).
  const parallelSpecialistStage = parallel.graph.allocations.executionOrder.find(
    (stage) => stage.nodeIds.length > 1 && stage.stageId === "stage-specialists",
  );
  assert.ok(parallelSpecialistStage, "parallel profile must pack the parallelizable pair into one stage");
  assert.equal(parallelSpecialistStage.nodeIds.length, 2);
  // Sequential runs the pipeline one node per stage: plan + N pipeline stages + review + deliver.
  const sequentialPipelineStages = sequential.graph.allocations.executionOrder.filter(
    (stage) => stage.stageId.startsWith("stage-"),
  );
  for (const stage of sequentialPipelineStages) {
    if (stage.stageId !== "stage-review") {
      assert.equal(stage.nodeIds.length, 1, `pipeline stage ${stage.stageId} runs one node at a time`);
    }
  }
  assert.ok(
    sequential.graph.allocations.executionOrder.length > parallel.graph.allocations.executionOrder.length,
    "sequential must use more stages than parallel",
  );
});

test("dimension — budget allocation: even vs role-weighted envelopes", () => {
  const result = searchOrganizations(t2Request());
  const budgets = new Set(result.candidates.map((c) => c.dimensionChoices.budgetAllocation));
  assert.deepEqual([...budgets].sort(), ["even", "role-weighted"]);

  const roleWeighted = result.candidates.find((c) => c.dimensionChoices.budgetAllocation === "role-weighted");
  const even = result.candidates.find((c) => c.dimensionChoices.budgetAllocation === "even");
  assert.ok(roleWeighted && even);
  const sum = (graph: typeof roleWeighted.graph): number =>
    Object.entries(graph.allocations.budgetAllocation ?? {})
      .filter(([key]) => key.startsWith("n"))
      .reduce((total, [, value]) => total + (value.maxSpend ?? 0), 0);
  assert.ok(
    Math.abs(sum(roleWeighted.graph) - sum(even.graph)) < 1e-6,
    "both profiles distribute the same total envelope",
  );
  const directorEven = Object.entries(even.graph.allocations.budgetAllocation ?? {}).find(
    ([key]) =>
      key.startsWith("n") &&
      even.graph.nodes.find((n) => n.nodeId === key)?.agentInstance?.bodyId === "body.director",
  );
  const directorWeighted = Object.entries(roleWeighted.graph.allocations.budgetAllocation ?? {}).find(
    ([key]) =>
      key.startsWith("n") &&
      roleWeighted.graph.nodes.find((n) => n.nodeId === key)?.agentInstance?.bodyId === "body.director",
  );
  assert.ok(directorEven && directorWeighted);
  assert.notEqual(directorEven[1].maxSpend, directorWeighted[1].maxSpend);
});

test("search is deterministic: identical requests produce identical candidates", () => {
  const first = searchOrganizations(t2Request());
  const second = searchOrganizations(t2Request());
  assert.deepEqual(first, second);
});

test("maxCandidates bounds the result", () => {
  const full = searchOrganizations(t2Request());
  const bounded = searchOrganizations({ ...t2Request(), maxCandidates: 2 });
  assert.ok(full.candidates.length > 2);
  assert.equal(bounded.candidates.length, 2);
  assert.deepEqual(bounded.candidates[0], full.candidates[0]);
});

test("catalog shortfalls are surfaced as issues, not silently ignored", () => {
  const result = searchOrganizations({
    goal: documentaryCinematicScenario.goal,
    goalClass: documentaryCinematicScenario.goalClass,
    catalogs: {
      models: t2Catalogs.models,
      capabilities: t2Catalogs.capabilities.filter((c) => c.capabilityId !== "audio.dialogue-cleanup"),
    },
    policy: "cheapest-reliable",
    budgetEnvelopeUsd: 24,
  });
  assert.ok(result.issues.some((issue) => /catalog lacks capability audio\.dialogue-cleanup/.test(issue)));
});

test("role templates cover the T2 and T4 goal classes", () => {
  const classes = ROLE_TEMPLATES.map((template) => template.goalClass);
  assert.ok(classes.includes("documentary-cinematic-remaster"));
  assert.ok(classes.includes("character-replacement-edit"));
  const t4 = ROLE_TEMPLATES.find((t) => t.goalClass === "character-replacement-edit");
  assert.ok(t4);
  assert.ok(t4.capabilityNeeds.includes("video.character-replacement"));
  const t4Result = searchOrganizations({
    goal: forcedFailureScenario.goal,
    goalClass: forcedFailureScenario.goalClass,
    catalogs: {
      models: forcedFailureScenario.modelCatalog,
      capabilities: forcedFailureScenario.capabilityCatalog,
    },
    policy: "cheapest-reliable",
    budgetEnvelopeUsd: forcedFailureScenario.budgetEnvelopeUsd,
  });
  assert.ok(t4Result.candidates.length > 0);
  const attempting = t4Result.candidates.find((c) => c.dimensionChoices.toolAllocation === "standard");
  assert.ok(attempting, "a standard-profile candidate attempts the required capability");
  const editorNode = attempting.graph.nodes.find((n) => n.agentInstance?.bodyId === "body.video-editor");
  assert.ok(editorNode?.nodeId);
  const tools = attempting.graph.allocations.toolAllocation?.[editorNode.nodeId] ?? [];
  assert.ok(tools.includes("video.character-replacement"));
});
