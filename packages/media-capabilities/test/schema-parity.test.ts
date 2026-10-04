import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import {
  capabilityDescriptorSchema,
  conformanceScenarioSchema,
} from "../src/domain/schema.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const schemaPath = join(repoRoot, "spec", "schemas", "capability.schema.json");

async function ajvValidate(): Promise<(data: unknown) => string | null> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as object;
  const validate = ajv.compile(schema);
  return (data: unknown) => (validate(data) ? null : JSON.stringify(validate.errors ?? []));
}

test("zod bindings accept the locked spec example", async () => {
  const examplePath = join(repoRoot, "spec", "examples", "capability.video-character-replacement.json");
  const example = JSON.parse(await readFile(examplePath, "utf8")) as unknown;
  const result = capabilityDescriptorSchema.safeParse(example);
  assert.ok(result.success, `spec example must satisfy zod mirror: ${result.success ? "" : result.error.message}`);
});

test("zod mirror agrees with the JSON Schema on the spec example", async () => {
  const validate = await ajvValidate();
  const examplePath = join(repoRoot, "spec", "examples", "capability.video-character-replacement.json");
  const example = JSON.parse(await readFile(examplePath, "utf8")) as unknown;
  assert.equal(validate(example), null);
});

test("zod mirror rejects the same malformed descriptors as the JSON Schema", async () => {
  const validate = await ajvValidate();
  const bad: unknown[] = [
    { /* empty object */ },
    { id: "not-a-domain.thing", version: "1.0.0", status: "draft", domain: "video", summary: "too short fields fail anyway", inputs: [], outputs: [], qualityDimensions: [], latencyClass: "minutes", providerMappings: [], conformance: { scenarios: [], certification: "none" } },
    { id: "video.bad-extra", version: "1.0", status: "draft", domain: "video", summary: "long enough summary here", inputs: [], outputs: [{ name: "out", mediaType: "video/mp4", cardinality: "one", extra: "no" }], qualityDimensions: [{ id: "q", description: "d", scale: "0-100" }], latencyClass: "minutes", providerMappings: [], conformance: { scenarios: [], certification: "none" }, unknownField: true },
  ];
  for (const descriptor of bad) {
    assert.equal(validate(descriptor) === null, false, "ajv should reject");
    assert.equal(capabilityDescriptorSchema.safeParse(descriptor).success, false, "zod should reject");
  }
});

test("scenario fixtures satisfy the conformance scenario schema", async () => {
  const scenarioPath = join(
    repoRoot,
    "packages/media-capabilities/src/domain/conformance/video.character-replacement/identity-basic.json",
  );
  const scenario = JSON.parse(await readFile(scenarioPath, "utf8")) as unknown;
  assert.ok(conformanceScenarioSchema.safeParse(scenario).success);
});
