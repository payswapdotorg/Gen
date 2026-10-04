/**
 * Capability router (spec/capability-model.md §4) — a PURE decision function.
 *
 * Chooses a provider mapping by policy over (descriptor mappings × routing
 * facts). No IO, no clocks, no randomness: same inputs → same decision, with
 * a full decision trace. Routing failures return RoutingFailure (P5) whose
 * trace feeds CapabilityGapReport — never a thrown-and-swallowed error.
 */
import type {
  CapabilityRegistryView,
  LatencyClass,
  ProviderMapping,
  RoutingCandidateFacts,
  RoutingFacts,
  RoutingPolicy,
  RoutingRequest,
  RoutingResult,
} from "./types.js";

/** cheapest-reliable: mappings below this reliability are not "reliable". */
export const RELIABILITY_THRESHOLD = 0.7;

const LATENCY_RANK: Readonly<Record<LatencyClass, number>> = {
  subsecond: 0,
  seconds: 1,
  minutes: 2,
  hours: 3,
  interactive: 4,
};

const TIER_RANK: Readonly<Record<RoutingCandidateFacts["tier"], number>> = {
  local: 0,
  open: 1,
  premium: 2,
};

/** Base scores used when a mapping carries no measured facts yet. */
const CONFORMANCE_BASE: Readonly<Record<ProviderMapping["conformanceStatus"], number>> = {
  certified: 90,
  "self-verified": 75,
  unverified: 50,
  "below-threshold": 25,
};

interface Candidate {
  readonly mapping: ProviderMapping;
  readonly facts: RoutingCandidateFacts;
  readonly quality: number;
  readonly reliability: number;
}

function qualityOf(mapping: ProviderMapping, facts: RoutingCandidateFacts): number {
  if (facts.qualityScore !== undefined) return facts.qualityScore;
  return CONFORMANCE_BASE[mapping.conformanceStatus];
}

function reliabilityOf(mapping: ProviderMapping, facts: RoutingCandidateFacts): number {
  if (facts.reliability !== undefined) return facts.reliability;
  return CONFORMANCE_BASE[mapping.conformanceStatus] / 100;
}

function factsKey(facts: RoutingCandidateFacts): string {
  return facts.modelId === undefined ? facts.providerId : `${facts.providerId}/${facts.modelId}`;
}

function mappingKey(mapping: ProviderMapping): string {
  return mapping.modelId === undefined ? mapping.providerId : `${mapping.providerId}/${mapping.modelId}`;
}

function findFactsFor(facts: RoutingFacts, mapping: ProviderMapping): RoutingCandidateFacts | undefined {
  return facts.candidates.find((candidate) => factsKey(candidate) === mappingKey(mapping));
}

function policyScore(policy: RoutingPolicy, candidate: Candidate): number {
  const { facts, quality, reliability } = candidate;
  const latency = facts.latencyClass === undefined ? 4 : LATENCY_RANK[facts.latencyClass];
  const cost = facts.estimatedCost ?? Number.POSITIVE_INFINITY;
  switch (policy) {
    case "premium-first":
      return TIER_RANK[facts.tier] * 1000 + quality;
    case "quality-first":
      return quality * 10 + reliability;
    case "cheapest-reliable":
      return -cost;
    case "local-first":
      return -TIER_RANK[facts.tier] * 1000 - cost;
    case "latency-first":
      return -latency * 1000 + quality;
  }
}

/**
 * Route a capability invocation. Deterministic: candidates are ranked by
 * policy score, tie-broken by (quality desc, cost asc, provider/model key).
 */
export function routeCapability(
  request: RoutingRequest,
  view: CapabilityRegistryView,
  facts: RoutingFacts,
): RoutingResult {
  const capability = view.capabilities.find((item) => item.id === request.capabilityId);
  const trace: string[] = [
    `policy=${request.policy} capability=${request.capabilityId} registryRevision=${view.revision}`,
  ];
  if (capability === undefined) {
    trace.push("rejection=capability-not-in-registry");
    return { ok: false, reason: "no-mapping", decisionTrace: trace.join("; ") };
  }

  const available: Candidate[] = [];
  const rejected: string[] = [];
  for (const mapping of capability.providerMappings) {
    const mappingFacts = findFactsFor(facts, mapping);
    if (mappingFacts === undefined) {
      rejected.push(`${mappingKey(mapping)}:no-facts`);
      continue;
    }
    if (mappingFacts.available === false) {
      rejected.push(`${mappingKey(mapping)}:unavailable`);
      continue;
    }
    if (mapping.conformanceStatus === "below-threshold") {
      rejected.push(`${mappingKey(mapping)}:below-threshold`);
      continue;
    }
    available.push({
      mapping,
      facts: mappingFacts,
      quality: qualityOf(mapping, mappingFacts),
      reliability: reliabilityOf(mapping, mappingFacts),
    });
  }
  trace.push(`mappings=[${capability.providerMappings.map(mappingKey).join(",")}]`);
  trace.push(`rejected=[${rejected.join(",")}]`);

  if (capability.providerMappings.length === 0) {
    trace.push("rejection=capability-has-no-mappings");
    return { ok: false, reason: "no-mapping", decisionTrace: trace.join("; ") };
  }
  if (available.length === 0) {
    const allDown = capability.providerMappings.every((mapping) => {
      const f = findFactsFor(facts, mapping);
      return f !== undefined && f.available === false;
    });
    trace.push(allDown ? "rejection=all-mappings-unavailable" : "rejection=no-eligible-mapping");
    return {
      ok: false,
      reason: allDown ? "provider-unavailable" : "policy-unsatisfiable",
      decisionTrace: trace.join("; "),
    };
  }

  let pool = available;
  if (request.policy === "cheapest-reliable") {
    const reliable = available.filter((candidate) => candidate.reliability >= RELIABILITY_THRESHOLD);
    if (reliable.length === 0) {
      trace.push(
        `rejection=no-mapping-meets-reliability>=${RELIABILITY_THRESHOLD} (observed: ${available
          .map((candidate) => `${mappingKey(candidate.mapping)}:${candidate.reliability.toFixed(2)}`)
          .join(",")})`,
      );
      return { ok: false, reason: "policy-unsatisfiable", decisionTrace: trace.join("; ") };
    }
    trace.push(
      `reliable=[${reliable.map((candidate) => `${mappingKey(candidate.mapping)}:${candidate.reliability.toFixed(2)}`).join(",")}]`,
    );
    pool = reliable;
  }

  const ranked = [...pool].sort((a, b) => {
    const byPolicy = policyScore(request.policy, b) - policyScore(request.policy, a);
    if (byPolicy !== 0) return byPolicy;
    if (b.quality !== a.quality) return b.quality - a.quality;
    const costA = a.facts.estimatedCost ?? Number.POSITIVE_INFINITY;
    const costB = b.facts.estimatedCost ?? Number.POSITIVE_INFINITY;
    if (costA !== costB) return costA - costB;
    return mappingKey(a.mapping).localeCompare(mappingKey(b.mapping));
  });

  const chosen = ranked[0];
  if (chosen === undefined) {
    return { ok: false, reason: "policy-unsatisfiable", decisionTrace: trace.join("; ") };
  }
  trace.push(
    `chosen=${mappingKey(chosen.mapping)} ranking=[${ranked
      .map((candidate) => mappingKey(candidate.mapping))
      .join(">")}]`,
  );

  return {
    ok: true,
    mapping: chosen.mapping,
    estimatedCost: chosen.facts.estimatedCost,
    estimatedLatencyClass: chosen.facts.latencyClass,
    alternatives: ranked.slice(1).map((candidate) => candidate.mapping),
    decisionTrace: trace.join("; "),
  };
}
