import assert from "node:assert/strict";
import { test } from "node:test";
import { CapabilityRegistry } from "../src/domain/registry.js";
import type { CapabilityDescriptor } from "../src/contract.js";

const base: CapabilityDescriptor = {
  id: "video.test-capability",
  version: "1.0.0",
  status: "draft",
  domain: "video",
  summary: "A minimal valid descriptor used to exercise the registry.",
  inputs: [],
  outputs: [{ name: "resultVideo", mediaType: "video/mp4", cardinality: "one" }],
  qualityDimensions: [{ id: "quality", description: "overall quality", scale: "0-100" }],
  latencyClass: "minutes",
  providerMappings: [
    { providerId: "p1", executionAdapter: "a1", maturity: "experimental", conformanceStatus: "unverified" },
  ],
  conformance: { scenarios: [], certification: "none" },
};

test("register validates and indexes descriptors", () => {
  const registry = new CapabilityRegistry();
  const result = registry.register(base, "test");
  assert.ok(result.ok);
  assert.equal(registry.getCapability("video.test-capability")?.id, "video.test-capability");
  assert.equal(registry.listCapabilities().length, 1);
  assert.equal(registry.listByDomain("video").length, 1);
  assert.equal(registry.listByDomain("image").length, 0);
});

test("register rejects invalid descriptors without mutating state", () => {
  const registry = new CapabilityRegistry();
  const bad = { ...base, version: "not-semver" };
  const result = registry.register(bad, "test");
  assert.equal(result.ok, false);
  assert.equal(registry.listCapabilities().length, 0);
  assert.equal(registry.getView().revision, 0);
});

test("duplicate ids are rejected by the single write path", () => {
  const registry = new CapabilityRegistry();
  assert.ok(registry.register(base, "test").ok);
  const again = registry.register({ ...base, summary: "another summary for the same id" }, "test2");
  assert.equal(again.ok, false);
  assert.equal(registry.listCapabilities().length, 1);
});

test("revision increments on every accepted load change", () => {
  const registry = new CapabilityRegistry();
  assert.equal(registry.getView().revision, 0);
  assert.ok(registry.register(base, "a").ok);
  const r1 = registry.getView().revision;
  assert.ok(r1 > 0);
  const second: CapabilityDescriptor = {
    ...base,
    id: "image.test-capability",
    domain: "image",
    outputs: [{ name: "resultImage", mediaType: "image/png", cardinality: "one" }],
  };
  const load = registry.load([
    { source: "b", data: second },
    { source: "c", data: { ...base, version: "bad" } },
  ]);
  assert.equal(load.ok, false);
  assert.equal(load.loaded, 1);
  assert.equal(load.errors.length, 1);
  assert.ok(registry.getView().revision > r1);
  assert.equal(registry.listCapabilities().length, 2);
});

test("views are frozen snapshots", () => {
  const registry = new CapabilityRegistry([base]);
  const view = registry.getView();
  assert.equal(view.revision, 1);
  assert.throws(() => {
    (view.capabilities as unknown as { pop(): unknown }).pop();
  });
});
