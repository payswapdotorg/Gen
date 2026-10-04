/**
 * Routing-facts derivation (pure): provider descriptors + committed
 * evaluation records → the RoutingFacts input of the capability router.
 *
 * The router (in @gen/media-capabilities) stays provider-agnostic; this
 * module is where provider-plane knowledge (kind → tier, evaluation rows →
 * quality/reliability/cost/latency) is reduced to router facts.
 */
import type {
  CreativeProviderDescriptor,
  EvaluationRecord,
} from "../contract.js";
import type { RoutingCandidateFacts, ProviderMapping } from "@gen/media-capabilities";
import { creativeProviderDescriptorSchema, evaluationRecordSchema } from "./schema.js";

type ProviderKind = CreativeProviderDescriptor["kind"];

const TIER_BY_KIND: Readonly<Record<ProviderKind, RoutingCandidateFacts["tier"]>> = {
  api: "premium",
  "open-model": "open",
  "software-tool": "local",
  custom: "local",
};

export interface ParsedProviderPlane {
  readonly providers: readonly CreativeProviderDescriptor[];
  readonly evaluations: readonly EvaluationRecord[];
  readonly errors: readonly string[];
}

/** Parse + validate raw provider descriptors and evaluation records. */
export function parseProviderPlane(
  rawProviders: readonly { source: string; data: unknown }[],
  rawEvaluations: readonly { source: string; data: unknown }[] = [],
): ParsedProviderPlane {
  const providers: CreativeProviderDescriptor[] = [];
  const evaluations: EvaluationRecord[] = [];
  const errors: string[] = [];
  for (const { source, data } of rawProviders) {
    const parsed = creativeProviderDescriptorSchema.safeParse(data);
    if (parsed.success) providers.push(parsed.data);
    else errors.push(`${source}: ${parsed.error.message}`);
  }
  for (const { source, data } of rawEvaluations) {
    const parsed = evaluationRecordSchema.safeParse(data);
    if (parsed.success) evaluations.push(parsed.data);
    else errors.push(`${source}: ${parsed.error.message}`);
  }
  return { providers, evaluations, errors };
}

function rowKey(row: { providerId: string; modelId?: string }): string {
  return row.modelId === undefined ? row.providerId : `${row.providerId}/${row.modelId}`;
}

function mappingKey(mapping: ProviderMapping): string {
  return mapping.modelId === undefined ? mapping.providerId : `${mapping.providerId}/${mapping.modelId}`;
}

function latestRowFor(
  evaluations: readonly EvaluationRecord[],
  capabilityId: string,
  key: string,
): EvaluationRecord["rows"][number] | undefined {
  let latest: EvaluationRecord["rows"][number] | undefined;
  for (const record of evaluations) {
    if (record.capabilityId !== capabilityId) continue;
    for (const row of record.rows) {
      if (rowKey(row) === key) latest = row;
    }
  }
  return latest;
}

/**
 * Derive router facts for one capability. Evaluation rows win over descriptor
 * defaults; providers without evaluation rows still contribute facts derived
 * from their descriptor (tier + conformance-derived defaults in the router).
 * modelIds come from the capability descriptor's provider mappings.
 */
export function deriveRoutingFacts(
  capabilityId: string,
  mappings: readonly ProviderMapping[],
  plane: ParsedProviderPlane,
): RoutingCandidateFacts[] {
  const facts: RoutingCandidateFacts[] = [];
  for (const mapping of mappings) {
    const provider = plane.providers.find((item) => item.providerId === mapping.providerId);
    if (provider === undefined) continue;
    const row = latestRowFor(plane.evaluations, capabilityId, mappingKey(mapping));
    facts.push({
      providerId: mapping.providerId,
      modelId: mapping.modelId,
      tier: TIER_BY_KIND[provider.kind],
      qualityScore: row?.normalizedQuality,
      reliability: row?.reliability,
      estimatedCost: row?.cost.estimate,
      latencyClass: row?.latency.class,
      available: true,
    });
  }
  return facts;
}
