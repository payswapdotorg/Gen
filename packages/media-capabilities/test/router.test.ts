import assert from "node:assert/strict";
import { test } from "node:test";
import { CapabilityRegistry } from "../src/domain/registry.js";
import { routeCapability } from "../src/domain/router.js";
import type { CapabilityDescriptor, RoutingCandidateFacts, RoutingFacts } from "../src/contract.js";

const descriptor: CapabilityDescriptor = {
  id: "video.character-replacement",
  version: "1.0.0",
  status: "draft",
  domain: "video",
  summary: "Replace a character identity across a source video with a reference character.",
  inputs: [],
  outputs: [{ name: "resultVideo", mediaType: "video/mp4", cardinality: "one" }],
  qualityDimensions: [{ id: "identity-preservation", description: "identity fidelity", scale: "0-100" }],
  latencyClass: "minutes",
  providerMappings: [
    { providerId: "higgsfield", modelId: "genjutsu", executionAdapter: "higgsfield-http", maturity: "reference", conformanceStatus: "self-verified" },
    { providerId: "wan-2.2", modelId: "animate", executionAdapter: "wan-open-exec", maturity: "experimental", conformanceStatus: "self-verified" },
    { providerId: "vace", executionAdapter: "vace-open-exec", maturity: "experimental", conformanceStatus: "unverified" },
  ],
  conformance: { scenarios: [], certification: "none" },
};

function facts(candidates: RoutingCandidateFacts[]): RoutingFacts {
  return { candidates };
}

const premium: RoutingCandidateFacts = { providerId: "higgsfield", modelId: "genjutsu", tier: "premium", qualityScore: 88, reliability: 0.97, estimatedCost: 12, latencyClass: "minutes" };
const openWan: RoutingCandidateFacts = { providerId: "wan-2.2", modelId: "animate", tier: "open", qualityScore: 72, reliability: 0.8, estimatedCost: 0.4, latencyClass: "minutes" };
const openVace: RoutingCandidateFacts = { providerId: "vace", tier: "open", qualityScore: 60, reliability: 0.55, estimatedCost: 0.3, latencyClass: "hours" };

function registry(): CapabilityRegistry {
  return new CapabilityRegistry([descriptor]);
}

const request = {
  capabilityId: "video.character-replacement",
  parameters: {},
  inputArtifactIds: [],
} as const;

test("premium-first routes to the premium provider (T1 reference path)", () => {
  const result = routeCapability({ ...request, policy: "premium-first" }, registry().getView(), facts([premium, openWan, openVace]));
  assert.ok(result.ok);
  assert.equal(result.mapping.providerId, "higgsfield");
  assert.ok(result.alternatives.length >= 1);
  assert.match(result.decisionTrace, /policy=premium-first/);
});

test("cheapest-reliable routes to the open model and skips unreliable mappings (T3)", () => {
  const result = routeCapability({ ...request, policy: "cheapest-reliable" }, registry().getView(), facts([premium, openWan, openVace]));
  assert.ok(result.ok);
  assert.equal(result.mapping.providerId, "wan-2.2");
  assert.match(result.decisionTrace, /reliable=\[/);
});

test("cheapest-reliable fails with a trace when nothing meets the threshold", () => {
  const flaky: RoutingCandidateFacts[] = [
    { ...premium, reliability: 0.4 },
    { ...openWan, reliability: 0.5 },
  ];
  const result = routeCapability({ ...request, policy: "cheapest-reliable" }, registry().getView(), facts(flaky));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "policy-unsatisfiable");
  assert.match(result.decisionTrace, /reliability>=0.7/);
});

test("quality-first picks the highest conformance score", () => {
  const result = routeCapability({ ...request, policy: "quality-first" }, registry().getView(), facts([premium, openWan, openVace]));
  assert.ok(result.ok);
  assert.equal(result.mapping.providerId, "higgsfield");
});

test("latency-first prefers the fastest class, then quality", () => {
  const fast: RoutingCandidateFacts = { ...openVace, latencyClass: "seconds", qualityScore: 61 };
  const result = routeCapability({ ...request, policy: "latency-first" }, registry().getView(), facts([premium, openWan, fast]));
  assert.ok(result.ok);
  assert.equal(result.mapping.providerId, "vace");
});

test("local-first ranks local before open before premium", () => {
  const withLocal: CapabilityDescriptor = {
    ...descriptor,
    providerMappings: [
      ...descriptor.providerMappings,
      { providerId: "local-tool", executionAdapter: "editor-local", maturity: "experimental", conformanceStatus: "unverified" },
    ],
  };
  const local: RoutingCandidateFacts = { providerId: "local-tool", tier: "local", qualityScore: 55, estimatedCost: 0.1, latencyClass: "minutes" };
  const result = routeCapability({ ...request, policy: "local-first" }, new CapabilityRegistry([withLocal]).getView(), facts([premium, openWan, local]));
  assert.ok(result.ok);
  assert.equal(result.mapping.providerId, "local-tool");
});

test("unavailable providers are rejected with a trace", () => {
  const result = routeCapability({ ...request, policy: "premium-first" }, registry().getView(), facts([{ ...premium, available: false }, openWan]));
  assert.ok(result.ok);
  assert.equal(result.mapping.providerId, "wan-2.2");
  assert.match(result.decisionTrace, /higgsfield\/genjutsu:unavailable/);
});

test("all mappings unavailable → provider-unavailable failure (feeds gap report)", () => {
  const result = routeCapability({ ...request, policy: "premium-first" }, registry().getView(), facts([{ ...premium, available: false }, { ...openWan, available: false }, { ...openVace, available: false }]));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "provider-unavailable");
  assert.match(result.decisionTrace, /all-mappings-unavailable/);
});

test("unknown capability id → no-mapping failure with trace", () => {
  const result = routeCapability({ ...request, capabilityId: "video.does-not-exist", policy: "quality-first" }, registry().getView(), facts([]));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "no-mapping");
  assert.match(result.decisionTrace, /capability-not-in-registry/);
});

test("below-threshold mappings are excluded; exclusion of all → policy-unsatisfiable", () => {
  const below: CapabilityDescriptor = {
    ...descriptor,
    providerMappings: descriptor.providerMappings.map((mapping) => ({ ...mapping, conformanceStatus: "below-threshold" as const })),
  };
  const result = routeCapability({ ...request, policy: "quality-first" }, new CapabilityRegistry([below]).getView(), facts([premium, openWan]));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "policy-unsatisfiable");
  assert.match(result.decisionTrace, /below-threshold/);
});

test("mappings without facts are rejected, not silently routed", () => {
  const result = routeCapability({ ...request, policy: "premium-first" }, registry().getView(), facts([]));
  assert.equal(result.ok, false);
  assert.match(result.decisionTrace, /no-facts/);
});

test("routing is deterministic", () => {
  const view = registry().getView();
  const f = facts([premium, openWan, openVace]);
  const one = routeCapability({ ...request, policy: "premium-first" }, view, f);
  const two = routeCapability({ ...request, policy: "premium-first" }, view, f);
  assert.deepEqual(one, two);
});
