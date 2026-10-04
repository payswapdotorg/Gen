/**
 * Organization graph invariants (work order B4) on top of the zod structural
 * binding: edges reference existing nodes, stages reference existing nodes,
 * stage dependsOn is a DAG (no cycles), kind-specific payloads are present,
 * allocation maps reference existing nodes/stages, and the model allocation is
 * consistent with the inline agent-instance bindings.
 */
import type { OrganizationGraph } from "../contract.js";

export interface GraphIssue {
  readonly code:
    | "edge-node-unknown"
    | "stage-node-unknown"
    | "stage-dep-unknown"
    | "stage-cycle"
    | "node-payload-missing"
    | "node-payload-unexpected"
    | "allocation-target-unknown"
    | "model-allocation-mismatch"
    | "duplicate-node"
    | "duplicate-stage";
  readonly detail: string;
}

export function validateOrganizationGraph(graph: OrganizationGraph): readonly GraphIssue[] {
  const issues: GraphIssue[] = [];
  const nodes = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  if (nodes.size !== graph.nodes.length) {
    issues.push({ code: "duplicate-node", detail: "node ids are not unique" });
  }
  for (const node of graph.nodes) {
    const has = {
      "agent-instance": node.agentInstance !== undefined,
      human: node.human !== undefined,
      "capability-invocation": node.capabilityInvocation !== undefined,
    };
    const present = Object.entries(has).filter(([, value]) => value).map(([key]) => key);
    if (!present.includes(node.kind)) {
      issues.push({ code: "node-payload-missing", detail: `${node.nodeId} (${node.kind}) lacks its payload` });
    }
    if (present.length > 1) {
      issues.push({ code: "node-payload-unexpected", detail: `${node.nodeId} carries payloads for ${present.join(", ")}` });
    }
  }
  for (const edge of graph.edges) {
    for (const endpoint of [edge.from, edge.to]) {
      if (!nodes.has(endpoint)) {
        issues.push({ code: "edge-node-unknown", detail: `edge ${edge.from}->${edge.to} references unknown node ${endpoint}` });
      }
    }
  }
  const stages = new Map(graph.allocations.executionOrder.map((stage) => [stage.stageId, stage]));
  if (stages.size !== graph.allocations.executionOrder.length) {
    issues.push({ code: "duplicate-stage", detail: "stage ids are not unique" });
  }
  for (const stage of graph.allocations.executionOrder) {
    for (const nodeId of stage.nodeIds) {
      if (!nodes.has(nodeId)) {
        issues.push({ code: "stage-node-unknown", detail: `stage ${stage.stageId} references unknown node ${nodeId}` });
      }
    }
    for (const dep of stage.dependsOn ?? []) {
      if (!stages.has(dep)) {
        issues.push({ code: "stage-dep-unknown", detail: `stage ${stage.stageId} depends on unknown stage ${dep}` });
      }
    }
  }
  const color = new Map<string, 0 | 1 | 2>();
  const visit = (stageId: string, stack: string[]): void => {
    const state = color.get(stageId);
    if (state === 2) return;
    if (state === 1) {
      issues.push({
        code: "stage-cycle",
        detail: `cycle in executionOrder: ${[...stack, stageId].join(" -> ")}`,
      });
      return;
    }
    color.set(stageId, 1);
    const stage = stages.get(stageId);
    for (const dep of stage?.dependsOn ?? []) visit(dep, [...stack, stageId]);
    color.set(stageId, 2);
  };
  for (const stage of graph.allocations.executionOrder) visit(stage.stageId, []);

  for (const target of Object.keys(graph.allocations.toolAllocation ?? {})) {
    if (!nodes.has(target) && !stages.has(target)) {
      issues.push({ code: "allocation-target-unknown", detail: `toolAllocation references unknown target ${target}` });
    }
  }
  for (const target of Object.keys(graph.allocations.budgetAllocation ?? {})) {
    if (!nodes.has(target) && !stages.has(target)) {
      issues.push({ code: "allocation-target-unknown", detail: `budgetAllocation references unknown target ${target}` });
    }
  }
  for (const [target, binding] of Object.entries(graph.allocations.modelAllocation ?? {})) {
    const node = nodes.get(target);
    if (!node) {
      issues.push({ code: "allocation-target-unknown", detail: `modelAllocation references unknown node ${target}` });
      continue;
    }
    if (node.kind !== "agent-instance" || !node.agentInstance) continue;
    const inline = node.agentInstance.cognitiveModel;
    if (inline.providerId !== binding.providerId || inline.modelId !== binding.modelId) {
      issues.push({
        code: "model-allocation-mismatch",
        detail: `modelAllocation for ${target} disagrees with the inline agent-instance binding`,
      });
    }
  }
  return issues;
}
