/**
 * Agent instance binding (agent-body-model.md §3): the LAB (not the caller)
 * performs binding in organization assembly. Validates:
 *  - the body (id + version) resolves in the registry;
 *  - grants are within the body's possessionClasses (subset check);
 *  - the cognitive model resolves in the model catalog (P1 projection) and
 *    satisfies the body's requirement classes (modalities + quality tier +
 *    context budget) — P2: the body stays model-agnostic, the lab assigns.
 */
import type {
  AgentBodyDescriptor,
  AgentInstanceDescriptor,
  ModelCatalogEntry,
} from "../contract.js";
import { AgentInstanceDescriptorSchema } from "./schema/agent-instance.js";
import type { BodyRegistry } from "./bodies/registry.js";

const QUALITY_RANK: Readonly<Record<string, number>> = {
  lightweight: 0,
  standard: 1,
  flagship: 2,
};

export type BindingResult =
  | { readonly ok: true; readonly instance: AgentInstanceDescriptor }
  | { readonly ok: false; readonly issues: readonly string[] };

export interface BindAgentInstanceRequest {
  readonly instanceId: string;
  readonly bodyId: string;
  readonly bodyVersion: string;
  readonly cognitiveModel: { readonly providerId: string; readonly modelId: string };
  readonly grants?: readonly { readonly class: string; readonly items?: readonly string[] }[];
  readonly budget?: { currency?: string; maxSpend?: number; computeMinutes?: number };
  readonly environment?: {
    workspaceRef?: string;
    artifactStoreRef?: string;
    sandboxRef?: string;
  };
}

/** Check a candidate model against a body's requirement classes (P2). */
export function modelSatisfiesRequirements(
  model: ModelCatalogEntry,
  body: AgentBodyDescriptor,
): string[] {
  const issues: string[] = [];
  const required = body.modelRequirements.modalities;
  const missing = required.filter((modality) => !model.modalities.includes(modality));
  if (missing.length > 0) {
    issues.push(`model ${model.providerId}/${model.modelId} lacks modalities ${missing.join(", ")}`);
  }
  if ((QUALITY_RANK[model.qualityClass] ?? -1) < (QUALITY_RANK[body.modelRequirements.qualityClass] ?? 0)) {
    issues.push(
      `model ${model.providerId}/${model.modelId} quality class ${model.qualityClass} below body requirement ${body.modelRequirements.qualityClass}`,
    );
  }
  const minContext = body.modelRequirements.minContextTokens;
  if (minContext !== undefined && (model.contextTokens ?? 0) < minContext) {
    issues.push(
      `model ${model.providerId}/${model.modelId} context ${String(model.contextTokens ?? 0)} below required ${minContext}`,
    );
  }
  return issues;
}

export function findModelInCatalog(
  catalog: readonly ModelCatalogEntry[],
  binding: { providerId: string; modelId: string },
): ModelCatalogEntry | undefined {
  return catalog.find(
    (entry) => entry.providerId === binding.providerId && entry.modelId === binding.modelId,
  );
}

/** Validate grants against the body's possession classes (agent-body-model.md §3). */
export function validatePossessionGrants(
  body: AgentBodyDescriptor,
  grants: readonly { class: string; items?: readonly string[] }[],
): string[] {
  const issues: string[] = [];
  const classes = new Map(body.possessionClasses.map((cls) => [cls.id, cls]));
  for (const grant of grants) {
    const cls = classes.get(grant.class);
    if (!cls) {
      issues.push(`grant class "${grant.class}" is not a possession class of ${body.id}`);
      continue;
    }
    const items = grant.items ?? [];
    if (items.length === 0) continue;
    if (cls.grants === undefined) {
      issues.push(`grant class "${grant.class}" has no enumerable grants; items must be empty`);
      continue;
    }
    const grantable = new Set(cls.grants);
    for (const item of items) {
      if (!grantable.has(item)) {
        issues.push(`grant item "${item}" is not grantable in class "${grant.class}" of ${body.id}`);
      }
    }
  }
  return issues;
}

export function bindAgentInstance(
  registry: BodyRegistry,
  modelCatalog: readonly ModelCatalogEntry[],
  request: BindAgentInstanceRequest,
): BindingResult {
  const issues: string[] = [];
  const body = registry.getExact(request.bodyId, request.bodyVersion);
  if (!body) {
    return {
      ok: false,
      issues: [`body ${request.bodyId}@${request.bodyVersion} not found in registry`],
    };
  }
  if (body.lifecycle.state === "deprecated") {
    issues.push(`body ${body.id}@${body.version} is deprecated`);
  }
  issues.push(...validatePossessionGrants(body, request.grants ?? []));
  const model = findModelInCatalog(modelCatalog, request.cognitiveModel);
  if (!model) {
    issues.push(
      `cognitive model ${request.cognitiveModel.providerId}/${request.cognitiveModel.modelId} does not resolve in the model catalog (P1)`,
    );
  } else {
    issues.push(...modelSatisfiesRequirements(model, body));
  }
  const draft = {
    instanceId: request.instanceId,
    bodyId: request.bodyId,
    bodyVersion: request.bodyVersion,
    cognitiveModel: request.cognitiveModel,
    possessionConfig: { grants: request.grants ?? [], budget: request.budget },
    environment: request.environment ?? {},
  };
  const parsed = AgentInstanceDescriptorSchema.safeParse(draft);
  if (!parsed.success) {
    issues.push(
      `instance descriptor schema violation: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
    return { ok: false, issues };
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, instance: parsed.data };
}
