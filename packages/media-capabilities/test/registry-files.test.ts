import assert from "node:assert/strict";
import { test } from "node:test";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { FsDescriptorSource, defaultRegistryDir } from "../src/adapters/fs-descriptor-source.js";
import { CapabilityRegistry } from "../src/domain/registry.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const EXPECTED_IDS = [
  "video.character-replacement",
  "video.motion-transfer",
  "video.object-replacement",
  "video.restyle",
  "video.reference-handling",
];

test("the git-tracked registry loads and validates completely", async () => {
  const source = new FsDescriptorSource(defaultRegistryDir());
  const records = await source.load();
  assert.equal(records.length, EXPECTED_IDS.length);
  const registry = new CapabilityRegistry();
  const result = registry.load(records);
  assert.deepEqual(
    result.errors.map((error) => error.message),
    [],
  );
  assert.equal(result.loaded, EXPECTED_IDS.length);
  assert.deepEqual(
    registry.listCapabilities().map((item) => item.id).sort(),
    [...EXPECTED_IDS].sort(),
  );
});

test("every descriptor is draft (active requires TL review, lock §7)", async () => {
  const registry = new CapabilityRegistry();
  registry.load(await new FsDescriptorSource(defaultRegistryDir()).load());
  for (const capability of registry.listCapabilities()) {
    assert.equal(capability.status, "draft", `${capability.id} must be draft until TL review`);
  }
});

test("every referenced scenario file exists on disk", async () => {
  const registry = new CapabilityRegistry();
  registry.load(await new FsDescriptorSource(defaultRegistryDir()).load());
  for (const capability of registry.listCapabilities()) {
    assert.ok(capability.conformance.scenarios.length >= 1, `${capability.id} must carry a conformance scenario`);
    for (const scenario of capability.conformance.scenarios) {
      await access(join(repoRoot, scenario.path));
    }
  }
});

test("every capability has at least one provider mapping (provider neutrality needs alternates)", async () => {
  const registry = new CapabilityRegistry();
  registry.load(await new FsDescriptorSource(defaultRegistryDir()).load());
  for (const capability of registry.listCapabilities()) {
    assert.ok(capability.providerMappings.length >= 2, `${capability.id} should map more than one provider`);
    const hasReference = capability.providerMappings.some((mapping) => mapping.maturity === "reference");
    assert.ok(hasReference, `${capability.id} must keep a reference (Higgsfield) mapping`);
  }
});
