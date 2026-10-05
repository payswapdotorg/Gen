/**
 * Redirect semantics (spec/human-escalation-contract.md §3, work order W6
 * task D): humans may redirect, not just approve/reject. Payload kinds:
 *  - policyPatch — routing-policy change, keyed "*" (run-wide) or by
 *    capability-invocation node id; values must be known routing policies;
 *  - modelSwap — rebind every node inhabited by a body to another model,
 *    validated against the body's model requirement class (P2: bodies never
 *    name models; invalid swaps are recorded with reasons, never applied);
 *  - inputSupply — supply a missing input artifact.
 *
 * Pure: application returns the NEXT run state (maps replaced, never mutated)
 * plus the before/after diffs and rejection reasons the decision trail
 * requires. In the hermetic lab a policy patch updates the effective routing
 * policy carried on the run (visible in the trail); frozen capability mocks
 * stay frozen — the environment does not re-route on policy.
 */
import type {
  CognitiveModelBinding,
  ModelCatalogEntry,
  OrganizationGraph,
} from "../../contract.js";
import type { BodyRegistry } from "../bodies/registry.js";
import { modelSatisfiesRequirements } from "../binding.js";
import type { AppliedRedirect, PolicyDiffEntry, RedirectPayload } from "./decision-types.js";

/** Routing policies the lab recognizes for capability-invocation nodes (mirrors the search plane's AllocationPolicy). */
export const ROUTING_POLICIES: readonly string[] = ["premium-first", "cheapest-reliable", "quality-first"];

/** Engine state a redirect may act on. Maps are replaced on application. */
export interface RedirectableRunState {
  readonly modelByNode: ReadonlyMap<string, CognitiveModelBinding>;
  readonly routingPolicyByNode: ReadonlyMap<string, string>;
  readonly suppliedInputs: readonly string[];
}

/** Everything redirect validation/application needs (all read-only). */
export interface RedirectDeps {
  readonly modelCatalog: readonly ModelCatalogEntry[];
  readonly bodyRegistry: BodyRegistry;
  readonly graph: OrganizationGraph;
  /** Inputs the run already carries (scenario.inputArtifacts). */
  readonly existingInputs: readonly string[];
}

function capabilityInvocationNodeIds(deps: RedirectDeps): string[] {
  return deps.graph.nodes
    .filter((node) => node.kind === "capability-invocation")
    .map((node) => node.nodeId);
}

/** Resolve policy-patch keys to the capability-invocation node ids they target (rejecting unknown targets). */
function policyTargetsOf(
  patch: Readonly<Record<string, string>>,
  deps: RedirectDeps,
  rejectedBecause: string[],
): ReadonlyMap<string, readonly string[]> {
  const invocationNodes = capabilityInvocationNodeIds(deps);
  const targets = new Map<string, readonly string[]>();
  for (const key of Object.keys(patch)) {
    if (key === "*") {
      targets.set(key, invocationNodes);
    } else if (invocationNodes.includes(key)) {
      targets.set(key, [key]);
    } else {
      rejectedBecause.push(
        `policy patch target "${key}" is neither "*" nor a capability-invocation node id in ${deps.graph.id}`,
      );
    }
  }
  return targets;
}

function applyPolicyPatch(
  patch: Readonly<Record<string, string>>,
  state: RedirectableRunState,
  deps: RedirectDeps,
): { readonly state: RedirectableRunState; readonly application: AppliedRedirect } {
  const rejectedBecause: string[] = [];
  if (Object.keys(patch).length === 0) {
    rejectedBecause.push("policyPatch carries no entries");
  }
  const targets = policyTargetsOf(patch, deps, rejectedBecause);
  const diff: PolicyDiffEntry[] = [];
  const nextPolicy = new Map(state.routingPolicyByNode);
  for (const [key, value] of Object.entries(patch)) {
    if (!ROUTING_POLICIES.includes(value)) {
      rejectedBecause.push(
        `unsupported routing policy "${value}" for target "${key}" (expected one of ${ROUTING_POLICIES.join(", ")})`,
      );
      continue;
    }
    for (const nodeId of targets.get(key) ?? []) {
      const before = state.routingPolicyByNode.get(nodeId) ?? "(unset)";
      if (before === value) continue;
      diff.push({ nodeId, before, after: value });
      nextPolicy.set(nodeId, value);
    }
  }
  return {
    state: { ...state, routingPolicyByNode: nextPolicy },
    application: {
      payload: { policyPatch: patch },
      applied: diff.length > 0,
      policyDiff: diff,
      modelBindingDiff: [],
      suppliedInputs: [],
      rejectedBecause,
    },
  };
}

function applyModelSwap(
  swap: { readonly bodyId: string; readonly modelId: string },
  state: RedirectableRunState,
  deps: RedirectDeps,
): { readonly state: RedirectableRunState; readonly application: AppliedRedirect } {
  const rejectedBecause: string[] = [];
  const body = deps.bodyRegistry.get(swap.bodyId);
  if (body === undefined) {
    rejectedBecause.push(`body ${swap.bodyId} not found in the body registry`);
  }
  const candidates = deps.modelCatalog.filter((entry) => entry.modelId === swap.modelId);
  if (candidates.length === 0) {
    rejectedBecause.push(`model ${swap.modelId} does not resolve in the model catalog`);
  } else if (candidates.length > 1) {
    rejectedBecause.push(
      `model id ${swap.modelId} is ambiguous across providers: ${candidates
        .map((entry) => `${entry.providerId}/${entry.modelId}`)
        .join(", ")}`,
    );
  }
  const inhabitedNodes = deps.graph.nodes.filter(
    (node) => node.kind === "agent-instance" && node.agentInstance?.bodyId === swap.bodyId,
  );
  if (inhabitedNodes.length === 0) {
    rejectedBecause.push(`no node inhabited by body ${swap.bodyId} in organization ${deps.graph.id}`);
  }
  const model = candidates[0];
  if (body === undefined || model === undefined || inhabitedNodes.length === 0) {
    return {
      state,
      application: {
        payload: { modelSwap: swap },
        applied: false,
        policyDiff: [],
        modelBindingDiff: [],
        suppliedInputs: [],
        rejectedBecause,
      },
    };
  }
  rejectedBecause.push(...modelSatisfiesRequirements(model, body));
  if (rejectedBecause.length > 0) {
    return {
      state,
      application: {
        payload: { modelSwap: swap },
        applied: false,
        policyDiff: [],
        modelBindingDiff: [],
        suppliedInputs: [],
        rejectedBecause,
      },
    };
  }
  const after: CognitiveModelBinding = { providerId: model.providerId, modelId: model.modelId };
  const diff = [];
  const nextModels = new Map(state.modelByNode);
  for (const node of inhabitedNodes) {
    const before = state.modelByNode.get(node.nodeId);
    if (before === undefined) continue;
    if (before.providerId === after.providerId && before.modelId === after.modelId) continue;
    diff.push({ nodeId: node.nodeId, bodyId: swap.bodyId, before, after });
    nextModels.set(node.nodeId, after);
  }
  return {
    state: { ...state, modelByNode: nextModels },
    application: {
      payload: { modelSwap: swap },
      applied: diff.length > 0,
      policyDiff: [],
      modelBindingDiff: diff,
      suppliedInputs: [],
      rejectedBecause,
    },
  };
}

function applyInputSupply(
  artifactRef: string,
  state: RedirectableRunState,
  deps: RedirectDeps,
): { readonly state: RedirectableRunState; readonly application: AppliedRedirect } {
  const rejectedBecause: string[] = [];
  const supplied: string[] = [];
  if (typeof artifactRef !== "string" || artifactRef.length === 0) {
    rejectedBecause.push("inputSupply artifactRef must be a non-empty string");
  } else if (state.suppliedInputs.includes(artifactRef) || deps.existingInputs.includes(artifactRef)) {
    rejectedBecause.push(`input ${artifactRef} is already available to the run`);
  } else {
    supplied.push(artifactRef);
  }
  return {
    state:
      supplied.length > 0
        ? { ...state, suppliedInputs: [...state.suppliedInputs, ...supplied] }
        : state,
    application: {
      payload: { inputSupply: { artifactRef } },
      applied: supplied.length > 0,
      policyDiff: [],
      modelBindingDiff: [],
      suppliedInputs: supplied,
      rejectedBecause,
    },
  };
}

/**
 * Validate and apply one redirect payload against the current run state.
 * Returns the next state plus the audit application (before/after diffs and
 * rejection reasons). Unknown payload shapes are rejected, never thrown —
 * the trail records the refusal (P5: no silent failures, no fabricated
 * application).
 */
export function applyRedirect(
  redirect: RedirectPayload,
  state: RedirectableRunState,
  deps: RedirectDeps,
): { readonly state: RedirectableRunState; readonly application: AppliedRedirect } {
  if ("policyPatch" in redirect) {
    return applyPolicyPatch(redirect.policyPatch, state, deps);
  }
  if ("modelSwap" in redirect) {
    return applyModelSwap(redirect.modelSwap, state, deps);
  }
  if ("inputSupply" in redirect) {
    return applyInputSupply(redirect.inputSupply.artifactRef, state, deps);
  }
  return {
    state,
    application: {
      payload: redirect,
      applied: false,
      policyDiff: [],
      modelBindingDiff: [],
      suppliedInputs: [],
      rejectedBecause: ["unsupported redirect payload shape"],
    },
  };
}
