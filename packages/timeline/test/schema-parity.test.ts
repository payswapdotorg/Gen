/**
 * Schema parity gate tests (lock §6, W5 §2.1–§2.2): the zod mirror must agree
 * with spec/schemas/artifact.schema.json (ajv 2020-12) on everything — the
 * committed spec example (currently a DOCUMENTED negative: CCR #1), every
 * committed record/example file, and the malformed-descriptor corpus.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { artifactDescriptorSchema } from "../src/domain/schema.js";
import type { ArtifactDescriptor } from "../src/domain/types.js";
import { FsArtifactRecordSource, defaultExamplesDir, defaultRecordsDir } from "../src/adapters/fs-record-source.js";
import { validateArtifactRecords } from "../src/adapters/ajv-validate.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const schemaPath = join(repoRoot, "spec", "schemas", "artifact.schema.json");

async function ajvValidate(): Promise<(data: unknown) => string | null> {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as object;
  const validate = ajv.compile(schema);
  return (data: unknown) => (validate(data) ? null : JSON.stringify(validate.errors ?? []));
}

test("harness: every committed record/example passes ajv AND zod; graphs are DAGs", async () => {
  const result = await validateArtifactRecords();
  assert.equal(result.records, 12, "7 launch-graph records + 5 examples");
  assert.equal(result.specExamples, 1);
  assert.equal(result.gatingFindings.length, 0, `gating findings: ${JSON.stringify(result.gatingFindings)}`);
});

test("committed spec example: ajv and zod AGREE on the rejection (CCR #1 parity evidence)", async () => {
  const validate = await ajvValidate();
  const example = JSON.parse(
    await readFile(join(repoRoot, "spec", "examples", "artifact.segment-replaced.json"), "utf8"),
  ) as unknown;
  const ajvResult = validate(example);
  assert.notEqual(ajvResult, null, "ajv rejects the dotted artifactId (schema pattern ^art\\.[a-z0-9-]+$)");
  assert.equal(artifactDescriptorSchema.safeParse(example).success, false, "zod mirror rejects identically");
});

test("every record and example file passes BOTH validators", async () => {
  const validate = await ajvValidate();
  for (const dir of [defaultRecordsDir(), defaultExamplesDir()]) {
    const records = await new FsArtifactRecordSource(dir).load();
    for (const { source, data } of records) {
      assert.equal(validate(data), null, `ajv: ${source}`);
      const parsed = artifactDescriptorSchema.safeParse(data);
      assert.ok(parsed.success, `zod: ${source}: ${parsed.success ? "" : parsed.error.message}`);
    }
  }
});

test("zod mirror rejects the same malformed descriptors as the JSON Schema", async () => {
  const validate = await ajvValidate();
  const base = {
    artifactId: "art.base",
    contentAddress: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    mediaType: "video/mp4",
    producedBy: { capabilityId: "video.character-replacement" },
  };
  const bad: readonly { readonly label: string; readonly data: unknown }[] = [
    { label: "empty object", data: {} },
    { label: "dotted artifactId (the spec-example defect)", data: { ...base, artifactId: "art.seg1.replaced.v1" } },
    { label: "artifactId without art. prefix", data: { ...base, artifactId: "artifact-1" } },
    { label: "contentAddress not sha256", data: { ...base, contentAddress: "md5:abc" } },
    { label: "contentAddress short hex", data: { ...base, contentAddress: "sha256:abcd" } },
    { label: "uppercase hex contentAddress", data: { ...base, contentAddress: `sha256:${"A".repeat(64)}` } },
    { label: "missing producedBy", data: { ...base, producedBy: undefined } },
    { label: "producedBy without capabilityId", data: { ...base, producedBy: { providerId: "higgsfield" } } },
    { label: "producedBy extra field", data: { ...base, producedBy: { capabilityId: "c", extra: 1 } } },
    { label: "unknown top-level field", data: { ...base, extra: true } },
    { label: "timelineRef extra field", data: { ...base, timelineRef: { otioPath: "tracks/0", extra: 1 } } },
    { label: "negative sizeBytes", data: { ...base, storage: { sizeBytes: -1 } } },
    { label: "non-integer sizeBytes", data: { ...base, storage: { sizeBytes: 1.5 } } },
    { label: "derivedFrom non-string item", data: { ...base, derivedFrom: [42] } },
  ];
  for (const { label, data } of bad) {
    assert.equal(validate(data) === null, false, `ajv should reject: ${label}`);
    assert.equal(artifactDescriptorSchema.safeParse(data).success, false, `zod should reject: ${label}`);
  }
});

test("type parity: zod output satisfies the hand-mirrored contract type", async () => {
  const records = await new FsArtifactRecordSource(defaultExamplesDir()).load();
  const video = records.find(({ data }) => (data as { artifactId?: string }).artifactId === "art.example-source-video");
  assert.ok(video !== undefined);
  const parsed = artifactDescriptorSchema.safeParse(video.data);
  assert.ok(parsed.success);
  // Compile-time: ArtifactDescriptorBinding is assignable to ArtifactDescriptor
  // (every zod-validated value satisfies the public contract type).
  const asContract: ArtifactDescriptor = parsed.data;
  assert.equal(asContract.producedBy.capabilityId, "orchestration.ingest-media");
  assert.equal(asContract.mediaType, "video/mp4");
  // Optional-but-validated producedBy siblings type-check on the contract type.
  const producer: ArtifactDescriptor["producedBy"] = { capabilityId: "editor.cut-video", executionAdapter: "mlt-melt-cli" };
  assert.equal(producer.executionAdapter, "mlt-melt-cli");
});
