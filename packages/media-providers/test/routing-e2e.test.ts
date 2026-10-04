import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { routeCapability, CapabilityRegistry, capabilityDescriptorSchema } from "@gen/media-capabilities";
import type { ProviderMapping } from "@gen/media-capabilities";
import { FsProviderPlaneSource } from "../src/adapters/fs-plane-source.js";
import { deriveRoutingFacts, parseProviderPlane } from "../src/domain/routing-facts.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

async function buildRegistry(): Promise<CapabilityRegistry> {
  const source = new FsProviderPlaneSource(repoRoot);
  const registry = new CapabilityRegistry();
  for (const capabilityId of await source.listCapabilityIds()) {
    const descriptor = capabilityDescriptorSchema.parse(await source.loadCapabilityDescriptor(capabilityId));
    assert.ok(registry.register(descriptor, capabilityId).ok);
  }
  return registry;
}

async function buildPlane() {
  const source = new FsProviderPlaneSource(repoRoot);
  const providers = await source.loadProviders();
  const evaluations = await source.loadEvaluations();
  const plane = parseProviderPlane(providers, evaluations);
  assert.deepEqual(plane.errors, []);
  return plane;
}

test("T1: premium-first routes character replacement to the Higgsfield reference", async () => {
  const registry = await buildRegistry();
  const plane = await buildPlane();
  const capability = registry.getCapability("video.character-replacement");
  assert.ok(capability);
  const facts = { candidates: deriveRoutingFacts("video.character-replacement", capability.providerMappings as readonly ProviderMapping[], plane) };
  const result = routeCapability(
    { capabilityId: "video.character-replacement", parameters: {}, inputArtifactIds: [], policy: "premium-first" },
    registry.getView(),
    facts,
  );
  assert.ok(result.ok);
  assert.equal(result.mapping.providerId, "higgsfield");
  assert.equal(result.mapping.modelId, "genjutsu");
  assert.ok(result.alternatives.length >= 2, "provider neutrality: alternates must exist");
});

test("T3: cheapest-reliable routes to the open model over the premium provider", async () => {
  const registry = await buildRegistry();
  const plane = await buildPlane();
  const capability = registry.getCapability("video.character-replacement");
  assert.ok(capability);
  const facts = { candidates: deriveRoutingFacts("video.character-replacement", capability.providerMappings as readonly ProviderMapping[], plane) };
  const result = routeCapability(
    { capabilityId: "video.character-replacement", parameters: {}, inputArtifactIds: [], policy: "cheapest-reliable" },
    registry.getView(),
    facts,
  );
  assert.ok(result.ok);
  assert.equal(result.mapping.providerId, "wan-2.2");
  assert.ok(result.decisionTrace.includes("reliable=["));
  // The decision trace is the gap-report evidence trail (P5).
  assert.match(result.decisionTrace, /policy=cheapest-reliable/);
});

test("quality-first also picks the reference mapping under measured facts", async () => {
  const registry = await buildRegistry();
  const plane = await buildPlane();
  const capability = registry.getCapability("video.character-replacement");
  assert.ok(capability);
  const facts = { candidates: deriveRoutingFacts("video.character-replacement", capability.providerMappings as readonly ProviderMapping[], plane) };
  const result = routeCapability(
    { capabilityId: "video.character-replacement", parameters: {}, inputArtifactIds: [], policy: "quality-first" },
    registry.getView(),
    facts,
  );
  assert.ok(result.ok);
  assert.equal(result.mapping.providerId, "higgsfield");
});

test("motion transfer routes premium-first to higgsfield and cheapest-reliable to wan", async () => {
  const registry = await buildRegistry();
  const plane = await buildPlane();
  const capability = registry.getCapability("video.motion-transfer");
  assert.ok(capability);
  const candidates = deriveRoutingFacts("video.motion-transfer", capability.providerMappings as readonly ProviderMapping[], plane);
  assert.ok(candidates.length >= 3);
  const premium = routeCapability(
    { capabilityId: "video.motion-transfer", parameters: {}, inputArtifactIds: [], policy: "premium-first" },
    registry.getView(),
    { candidates },
  );
  assert.ok(premium.ok);
  assert.equal(premium.mapping.providerId, "higgsfield");
  const cheap = routeCapability(
    { capabilityId: "video.motion-transfer", parameters: {}, inputArtifactIds: [], policy: "cheapest-reliable" },
    registry.getView(),
    { candidates },
  );
  assert.ok(cheap.ok);
  assert.equal(cheap.mapping.providerId, "wan-2.2");
});
