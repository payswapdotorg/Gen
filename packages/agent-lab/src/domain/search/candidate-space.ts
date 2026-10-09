/**
 * Shared candidate space for every search method (W13, organization-lab §2):
 * the five binding dimensions as an explicit DimensionProfile space plus the
 * single factory that turns a profile into a schema-valid candidate
 * OrganizationGraph. Extracted verbatim from the rule search so all methods
 * emit byte-identical graph shapes (the OUTPUT contract is frozen by the
 * schema; only the ENGINE is pluggable).
 */
import type {
  AgentBodyDescriptor,
  ModelCatalogEntry,
  OrganizationGraph,
} from "../../contract.js";
import type {
  AllocationPolicy,
  OrganizationSearchDimensions,
  OrganizationSearchRequest,
  SearchCandidate,
} from "../lab-api.js";
import type { BodyRegistry } from "../bodies/registry.js";
import { modelSatisfiesRequirements } from "../binding.js";
import { validateOrganizationGraph } from "../org-graph.js";
import { ROLE_BUDGET_WEIGHTS } from "../search-templates.js";
import type { RoleTemplate } from "../search-templates.js";

const QUALITY_RANK: Readonly<Record<string, number>> = {
  lightweight: 0,
  standard: 1,
  flagship: 2,
};

export type ToolProfile = "minimal" | "standard";
export type ExecProfile = "sequential" | "parallel";
export type BudgetProfile = "even" | "role-weighted";
export type ReviewTopology = "critic-reviews-all" | "critic-reviews-editor";

/** All five dimensions searched by default (organization-lab §2). */
export const DEFAULT_DIMENSIONS: OrganizationSearchDimensions = {
  roleStructure: true,
  toolAllocation: true,
  modelAllocation: true,
  executionOrdering: true,
  budgetAllocation: true,
};

/** One point in the five-dimension search space (spec §2). */
export interface DimensionProfile {
  /** role structure: which optional bodies are present (subset of template). */
  readonly optionalRoles: readonly string[];
  /** role structure: review topology. */
  readonly topology: ReviewTopology;
  readonly toolProfile: ToolProfile;
  readonly execProfile: ExecProfile;
  readonly budgetProfile: BudgetProfile;
}

/** Per-body model allocation override (model-allocation dimension, P2). */
export type ModelOverrides = Readonly<Record<string, ModelCatalogEntry>>;

function selectModel(
  body: AgentBodyDescriptor,
  models: readonly ModelCatalogEntry[],
  policy: AllocationPolicy,
): ModelCatalogEntry | undefined {
  const eligible = models.filter((model) => modelSatisfiesRequirements(model, body).length === 0);
  const cost = (model: ModelCatalogEntry): number => model.costPerDecisionUsd ?? 1;
  const rank = (model: ModelCatalogEntry): number => QUALITY_RANK[model.qualityClass] ?? 0;
  const byIds = (a: ModelCatalogEntry, b: ModelCatalogEntry): number =>
    `${a.providerId}/${a.modelId}`.localeCompare(`${b.providerId}/${b.modelId}`);
  const sorted = [...eligible].sort((a, b) => {
    if (policy === "cheapest-reliable") {
      return cost(a) - cost(b) || rank(b) - rank(a) || byIds(a, b);
    }
    return rank(b) - rank(a) || cost(a) - cost(b) || byIds(a, b);
  });
  return sorted[0];
}

/** The policy-default model for a body (the rule engine's choice, P2 binding). */
export function policyModelFor(
  body: AgentBodyDescriptor,
  models: readonly ModelCatalogEntry[],
  policy: AllocationPolicy,
): ModelCatalogEntry | undefined {
  return selectModel(body, models, policy);
}

/** Eligible models for a body (requirement classes satisfied, P2), deterministically ordered. */
export function eligibleModelsFor(
  body: AgentBodyDescriptor,
  models: readonly ModelCatalogEntry[],
): readonly ModelCatalogEntry[] {
  const eligible = models.filter((model) => modelSatisfiesRequirements(model, body).length === 0);
  return [...eligible].sort((a, b) =>
    `${a.providerId}/${a.modelId}`.localeCompare(`${b.providerId}/${b.modelId}`),
  );
}

function grantsForProfile(body: AgentBodyDescriptor, profile: ToolProfile): { class: string; items: string[] }[] {
  const classes = profile === "minimal" ? body.possessionClasses.slice(0, 1) : body.possessionClasses;
  return classes.map((cls) => ({ class: cls.id, items: [...(cls.grants ?? [])] }));
}

/** All subsets of items in deterministic mask order (empty set first). */
export function subsets(items: readonly string[]): readonly (readonly string[])[] {
  const out: string[][] = [];
  const total = 1 << items.length;
  for (let mask = 0; mask < total; mask += 1) {
    out.push(items.filter((_, bit) => (mask & (1 << bit)) !== 0));
  }
  return out;
}

/** Catalog-shortfall issues every method must surface (never silently ignored). */
export function catalogShortfallIssues(template: RoleTemplate, request: OrganizationSearchRequest): string[] {
  const issues: string[] = [];
  for (const need of template.capabilityNeeds) {
    if (!request.catalogs.capabilities.some((capability) => capability.capabilityId === need)) {
      issues.push(`catalog lacks capability ${need} required for goal class ${template.goalClass}`);
    }
  }
  return issues;
}

/** Canonical serialization of a profile (dedupe keys, deterministic tie-breaks). */
export function profileKey(profile: DimensionProfile): string {
  return `opt=[${[...profile.optionalRoles].sort().join(",")}];top=${profile.topology};tool=${profile.toolProfile};exec=${profile.execProfile};budget=${profile.budgetProfile}`;
}

/**
 * The rule enumeration order (frozen): optional-role subsets (mask order) ×
 * topologies × tool × exec × budget, with dimension off-switches collapsing
 * each axis to its frozen default choice. This exact order is what the rule
 * method iterates — candidate indices are positions in it.
 */
export function enumerateDimensionProfiles(
  template: RoleTemplate,
  dims: OrganizationSearchDimensions,
): DimensionProfile[] {
  const optionalSets = dims.roleStructure ? subsets(template.optionalRoles) : [template.optionalRoles];
  const topologies: ReviewTopology[] = dims.roleStructure
    ? ["critic-reviews-all", "critic-reviews-editor"]
    : ["critic-reviews-all"];
  const toolProfiles: ToolProfile[] = dims.toolAllocation ? ["standard", "minimal"] : ["standard"];
  const execProfiles: ExecProfile[] = dims.executionOrdering ? ["parallel", "sequential"] : ["parallel"];
  const budgetProfiles: BudgetProfile[] = dims.budgetAllocation ? ["role-weighted", "even"] : ["role-weighted"];
  const profiles: DimensionProfile[] = [];
  for (const optional of optionalSets) {
    for (const topology of topologies) {
      for (const toolProfile of toolProfiles) {
        for (const execProfile of execProfiles) {
          for (const budgetProfile of budgetProfiles) {
            profiles.push({ optionalRoles: optional, topology, toolProfile, execProfile, budgetProfile });
          }
        }
      }
    }
  }
  return profiles;
}

interface BuildArgs {
  readonly request: OrganizationSearchRequest;
  readonly template: RoleTemplate;
  readonly registry: BodyRegistry;
  readonly profile: DimensionProfile;
  /** Position of this profile in the method's build sequence (ids, seeds). */
  readonly index: number;
  /** Emitting method — "rule" keeps the legacy id/seed strings byte-identical. */
  readonly method: string;
  /** Per-body model allocation overrides (validated for eligibility). */
  readonly modelOverrides?: ModelOverrides;
}

/**
 * The single candidate factory. rule-method calls with method "rule" and no
 * overrides reproduce the pre-W13 searchOrganizations output byte-for-byte.
 */
export function buildCandidateFromProfile(args: BuildArgs): SearchCandidate | undefined {
  const { request, template, registry, profile, index, method } = args;
  const { optionalRoles, topology, toolProfile, execProfile, budgetProfile } = profile;
  const agentBodyIds = ["body.director", ...template.pipeline, ...optionalRoles, template.reviewerBodyId];
  const bodies = agentBodyIds.map((bodyId) => registry.get(bodyId)).filter((body) => body !== undefined);
  if (bodies.length !== agentBodyIds.length) return undefined;
  const nodeIdOf = new Map<string, string>();
  let counter = 1;
  const humanNode = `n${counter}`;
  counter += 1;
  nodeIdOf.set("human", humanNode);
  for (const body of bodies) {
    nodeIdOf.set(body.id, `n${counter}`);
    counter += 1;
  }
  const renderNode = `n${counter}`;
  const directorId = nodeIdOf.get("body.director") ?? "n2";
  const renderBody = template.terminalCapability;
  const modelAllocation: Record<string, { providerId: string; modelId: string }> = {};
  const toolAllocation: Record<string, string[]> = {};
  const nodes: OrganizationGraph["nodes"][number][] = [
    {
      nodeId: humanNode,
      kind: "human",
      human: { role: template.humanRole.role, approvalGates: [...template.humanRole.approvalGates] },
    },
  ];
  for (const body of bodies) {
    const nodeId = nodeIdOf.get(body.id) as string;
    const override = args.modelOverrides?.[body.id];
    const model =
      override !== undefined && modelSatisfiesRequirements(override, body).length === 0
        ? override
        : selectModel(body, request.catalogs.models, request.policy);
    if (!model) return undefined;
    const grants = grantsForProfile(body, toolProfile);
    modelAllocation[nodeId] = { providerId: model.providerId, modelId: model.modelId };
    toolAllocation[nodeId] = grants.flatMap((grant) => grant.items);
    nodes.push({
      nodeId,
      kind: "agent-instance",
      agentInstance: {
        bodyId: body.id,
        bodyVersion: body.version,
        instanceId:
          method === "rule"
            ? `cand-${String(index).padStart(2, "0")}-${nodeId}`
            : `cand-${method}-${String(index).padStart(2, "0")}-${nodeId}`,
        cognitiveModel: { providerId: model.providerId, modelId: model.modelId },
      },
    });
  }
  nodes.push({
    nodeId: renderNode,
    kind: "capability-invocation",
    capabilityInvocation: {
      capabilityId: renderBody.capabilityId,
      parameterBindings: { ...renderBody.parameterBindings },
      providerPolicy: request.policy,
    },
  });
  const edges: OrganizationGraph["edges"][number][] = [
    { from: humanNode, to: directorId, kind: "delegation", notes: "Operator hands the goal to the director." },
    { from: directorId, to: humanNode, kind: "approval", notes: "Final delivery approval gate." },
  ];
  for (const specialist of template.pipeline) {
    edges.push({ from: directorId, to: nodeIdOf.get(specialist) as string, kind: "delegation" });
  }
  for (let i = 0; i + 1 < template.pipeline.length; i += 1) {
    edges.push({
      from: nodeIdOf.get(template.pipeline[i] as string) as string,
      to: nodeIdOf.get(template.pipeline[i + 1] as string) as string,
      kind: "artifact-flow",
    });
  }
  const lastPipeline = template.pipeline[template.pipeline.length - 1] as string;
  edges.push({ from: nodeIdOf.get(lastPipeline) as string, to: renderNode, kind: "artifact-flow" });
  const reviewTargets =
    topology === "critic-reviews-all"
      ? [...template.pipeline, ...optionalRoles]
      : [template.pipeline[0] as string];
  for (const target of reviewTargets) {
    edges.push({ from: nodeIdOf.get(template.reviewerBodyId) as string, to: nodeIdOf.get(target) as string, kind: "review" });
  }
  for (const optional of optionalRoles) {
    edges.push({ from: nodeIdOf.get(optional) as string, to: nodeIdOf.get(template.pipeline[0] as string) as string, kind: "review" });
  }
  const stages = buildStages(template, nodeIdOf, optionalRoles, execProfile, renderNode, directorId);
  const budgetAllocation = buildBudget(bodies, nodeIdOf, stages, request.budgetEnvelopeUsd, budgetProfile);
  const idTag = method === "rule" ? "cand" : `${method}-cand`;
  const seedTag = method === "rule" ? "" : `${method}-`;
  const graph: OrganizationGraph = {
    id: `org.${request.goalClass}-${idTag}-${String(index).padStart(2, "0")}`,
    goal: request.goal,
    goalClass: request.goalClass,
    nodes,
    edges,
    allocations: { modelAllocation, toolAllocation, budgetAllocation, executionOrder: stages },
    simulation: { seed: `${request.goalClass}-${request.policy}-${seedTag}${index}` },
  };
  const problems = validateOrganizationGraph(graph);
  if (problems.length > 0) return undefined;
  const costProxy = bodies.reduce(
    (sum, body) =>
      sum +
      (request.catalogs.models.find(
        (model) =>
          model.providerId === modelAllocation[nodeIdOf.get(body.id) as string]?.providerId &&
          model.modelId === modelAllocation[nodeIdOf.get(body.id) as string]?.modelId,
      )?.costPerDecisionUsd ?? 1),
    0,
  );
  const roleCoverage = bodies.length / (2 + template.pipeline.length + template.optionalRoles.length);
  const toolCoverage = toolProfile === "standard" ? 1 : 0.6;
  const preScore = round4(0.4 * roleCoverage + 0.3 * toolCoverage + 0.3 * (1 / (1 + costProxy)));
  return {
    graph,
    preScore,
    dimensionChoices: {
      roleStructure: optionalRoles.length > 0 ? "with-optional-roles" : "required-roles-only",
      reviewTopology: topology,
      toolAllocation: toolProfile,
      modelAllocation:
        args.modelOverrides !== undefined && Object.keys(args.modelOverrides).length > 0
          ? `${request.policy}+per-body-override`
          : request.policy,
      executionOrdering: execProfile,
      budgetAllocation: budgetProfile,
    },
  };
}

function buildStages(
  template: RoleTemplate,
  nodeIdOf: Map<string, string>,
  optionalRoles: readonly string[],
  execProfile: ExecProfile,
  renderNode: string,
  directorId: string,
): OrganizationGraph["allocations"]["executionOrder"] {
  type Stage = OrganizationGraph["allocations"]["executionOrder"][number];
  const stages: Stage[] = [];
  stages.push({ stageId: "stage-plan", nodeIds: [directorId], dependsOn: [], checkpoint: true });
  if (execProfile === "parallel" && template.parallelizable.length > 0) {
    const parallelBodies = new Set(template.parallelizable.flat());
    const solo = template.pipeline.filter((bodyId) => !parallelBodies.has(bodyId));
    const joined: string[] = [];
    for (const pair of template.parallelizable) {
      for (const bodyId of pair) if (template.pipeline.includes(bodyId)) joined.push(bodyId);
    }
    let previous = "stage-plan";
    if (solo.length > 0) {
      stages.push({ stageId: "stage-edit", nodeIds: solo.map((id) => nodeIdOf.get(id) as string), dependsOn: [previous] });
      previous = "stage-edit";
    }
    if (joined.length > 0) {
      stages.push({ stageId: "stage-specialists", nodeIds: joined.map((id) => nodeIdOf.get(id) as string), dependsOn: [previous] });
      previous = "stage-specialists";
    }
    const reviewers = [template.reviewerBodyId, ...optionalRoles];
    stages.push({ stageId: "stage-review", nodeIds: reviewers.map((id) => nodeIdOf.get(id) as string), dependsOn: [previous] });
    stages.push({ stageId: "stage-deliver", nodeIds: [renderNode], dependsOn: ["stage-review"], checkpoint: true });
    return stages;
  }
  let previous = "stage-plan";
  template.pipeline.forEach((bodyId, i) => {
    const stageId = `stage-${i}`;
    stages.push({ stageId, nodeIds: [nodeIdOf.get(bodyId) as string], dependsOn: [previous] });
    previous = stageId;
  });
  const reviewers = [template.reviewerBodyId, ...optionalRoles];
  stages.push({ stageId: "stage-review", nodeIds: reviewers.map((id) => nodeIdOf.get(id) as string), dependsOn: [previous] });
  stages.push({ stageId: "stage-deliver", nodeIds: [renderNode], dependsOn: ["stage-review"], checkpoint: true });
  return stages;
}

function buildBudget(
  bodies: readonly AgentBodyDescriptor[],
  nodeIdOf: Map<string, string>,
  stages: OrganizationGraph["allocations"]["executionOrder"],
  envelope: number,
  profile: BudgetProfile,
): Record<string, { maxSpend?: number; computeMinutes?: number }> {
  const allocation: Record<string, { maxSpend?: number; computeMinutes?: number }> = {};
  if (envelope <= 0) return allocation;
  const weightOf = (body: AgentBodyDescriptor): number =>
    profile === "even" ? 1 : (ROLE_BUDGET_WEIGHTS[body.id] ?? 0.1);
  const total = bodies.reduce((sum, body) => sum + weightOf(body), 0);
  for (const body of bodies) {
    const nodeId = nodeIdOf.get(body.id) as string;
    allocation[nodeId] = { maxSpend: round2((envelope * weightOf(body)) / total) };
  }
  for (const stage of stages) {
    const spend = stage.nodeIds.reduce((sum, nodeId) => sum + (allocation[nodeId]?.maxSpend ?? 0), 0);
    if (spend > 0) allocation[stage.stageId] = { maxSpend: round2(spend) };
  }
  return allocation;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
