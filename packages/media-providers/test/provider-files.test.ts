import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { Ajv2020 } from "ajv/dist/2020.js";
import { creativeProviderDescriptorSchema } from "../src/domain/schema.js";
import type { CreativeProviderDescriptor } from "../src/contract.js";
import { parseProviderPlane } from "../src/domain/routing-facts.js";
import { capabilityDescriptorSchema } from "@gen/media-capabilities";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

const PROVIDER_FILES = [
  "higgsfield.json",
  "wan-2.2.json",
  "vace.json",
  "ltx.json",
  "hunyuan.json",
] as const;

async function loadProviders(): Promise<{ source: string; data: unknown }[]> {
  const dir = join(repoRoot, "packages", "media-providers", "src", "domain", "providers");
  return Promise.all(
    PROVIDER_FILES.map(async (file) => ({ source: file, data: JSON.parse(await readFile(join(dir, file), "utf8")) })),
  );
}

test("every provider descriptor passes ajv (JSON Schema 2020-12) AND the zod mirror", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const schema = JSON.parse(
    await readFile(join(repoRoot, "spec", "schemas", "creative-provider.schema.json"), "utf8"),
  ) as object;
  const validate = ajv.compile(schema);
  for (const { source: file, data } of await loadProviders()) {
    assert.equal(validate(data), true, `${file}: ${JSON.stringify(validate.errors ?? [])}`);
    const zodResult = creativeProviderDescriptorSchema.safeParse(data);
    assert.ok(zodResult.success, `${file}: ${zodResult.success ? "" : zodResult.error.message}`);
  }
});

test("zod-inferred descriptors satisfy the hand-mirrored contract interface (parity)", async () => {
  const providers = (await loadProviders()).map(({ data }) => creativeProviderDescriptorSchema.parse(data));
  const asContract: readonly CreativeProviderDescriptor[] = providers;
  assert.equal(asContract.length, 5);
});

test("env var NAMES only — descriptors never carry credential values (P8)", async () => {
  for (const { source: file, data } of await loadProviders()) {
    const raw = JSON.stringify(data);
    assert.equal(/(secret|password|token)"\s*:\s*"[^"]+"/i.test(raw), false, `${file} looks like it carries a credential value`);
    const provider = creativeProviderDescriptorSchema.parse(data);
    for (const name of provider.access.envVars ?? []) {
      assert.match(name, /^[A-Z][A-Z0-9_]*$/);
    }
  }
});

test("higgsfield is the reference provider with the full Genjutsu set + planned entries", async () => {
  const providers = parseProviderPlane(await loadProviders()).providers;
  const higgsfield = providers.find((provider) => provider.providerId === "higgsfield");
  assert.ok(higgsfield);
  assert.equal(higgsfield.kind, "api");
  assert.equal(higgsfield.executionAdapter.transport, "http");
  assert.deepEqual(higgsfield.generationLifecycle, ["submit", "poll", "stream", "cancel", "retrieve"]);
  const mapped = higgsfield.capabilities.filter((item) => item.maturity === "reference").map((item) => item.capabilityId);
  assert.deepEqual([...mapped].sort(), [
    "video.character-replacement",
    "video.motion-transfer",
    "video.object-replacement",
    "video.reference-handling",
    "video.restyle",
  ]);
  const planned = higgsfield.capabilities.filter((item) => item.maturity === "planned");
  assert.equal(planned.length, 3);
});

test("open-model providers are declared experimental with remote-service transports", async () => {
  const providers = parseProviderPlane(await loadProviders()).providers;
  for (const provider of providers.filter((item) => item.kind === "open-model")) {
    assert.equal(provider.executionAdapter.transport, "remote-service");
    for (const mapping of provider.capabilities) {
      assert.equal(mapping.maturity, "experimental");
    }
  }
});

test("every non-planned provider capability exists in the canonical registry", async () => {
  const registryDir = join(repoRoot, "packages", "media-capabilities", "src", "domain", "registry");
  const { readdir } = await import("node:fs/promises");
  const known = new Set<string>();
  for (const file of (await readdir(registryDir)).filter((name) => name.endsWith(".json"))) {
    const descriptor = capabilityDescriptorSchema.parse(JSON.parse(await readFile(join(registryDir, file), "utf8")));
    known.add(descriptor.id);
  }
  for (const provider of parseProviderPlane(await loadProviders()).providers) {
    for (const mapping of provider.capabilities) {
      if (mapping.maturity === "planned") continue;
      assert.ok(known.has(mapping.capabilityId), `${provider.providerId} → ${mapping.capabilityId} missing from registry`);
    }
  }
});
