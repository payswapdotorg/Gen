/**
 * Capability-gap schema parity tests (lock §6): the zod mirror must accept the
 * committed spec example and reject what the JSON Schema rejects.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CapabilityGapReportSchema,
  ExpertSessionRecordSchema,
} from "../src/domain/schema/capability-gap.js";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNulls);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, stripNulls(v)]),
    );
  }
  return value;
}

async function specExample(name: string): Promise<Record<string, unknown>> {
  const raw = JSON.parse(await readFile(join(repoRoot, "spec", "examples", name), "utf8")) as unknown;
  return stripNulls(raw) as Record<string, unknown>;
}

test("spec example: capability-gap parses with the zod mirror", async () => {
  const example = await specExample("capability-gap.ref-frame-segment-3.json");
  const parsed = CapabilityGapReportSchema.safeParse(example);
  assert.ok(parsed.success, parsed.success ? "" : parsed.error.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
});

test("the zod mirror rejects schema-invalid gap reports", async () => {
  const example = await specExample("capability-gap.ref-frame-segment-3.json");
  // gapId pattern violation.
  assert.equal(CapabilityGapReportSchema.safeParse({ ...example, gapId: "Not A Gap" }).success, false);
  // Missing required field.
  const { failureEvidence: _omit, ...withoutEvidence } = example;
  assert.equal(CapabilityGapReportSchema.safeParse(withoutEvidence).success, false);
  // Unknown kind enum value.
  assert.equal(
    CapabilityGapReportSchema.safeParse({ ...example, kind: "mystery-gap" }).success,
    false,
  );
  // Unknown severity.
  assert.equal(
    CapabilityGapReportSchema.safeParse({
      ...example,
      impact: { ...(example.impact as object), severity: "apocalyptic" },
    }).success,
    false,
  );
  // Unknown arena state.
  assert.equal(
    CapabilityGapReportSchema.safeParse({
      ...example,
      arena: { ...(example.arena as object), state: "teleported" },
    }).success,
    false,
  );
  // additionalProperties: false.
  assert.equal(
    CapabilityGapReportSchema.safeParse({ ...example, extraField: true }).success,
    false,
  );
});

test("the committed T4 gap record is schema-valid", async () => {
  const raw = JSON.parse(
    await readFile(
      join(
        repoRoot,
        "packages",
        "arena-bridge",
        "src",
        "domain",
        "gaps",
        "gap.forced-failure-video-character-replacement.json",
      ),
      "utf8",
    ),
  ) as unknown;
  const parsed = CapabilityGapReportSchema.safeParse(raw);
  assert.ok(parsed.success, parsed.success ? "" : parsed.error.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
});

test("expert-session records validate and reject bad shapes", () => {
  const valid = {
    sessionId: "session.test",
    gapIds: ["gap.test-01"],
    decision: "propose-capability",
    rationale: "r",
    recordedAt: "2026-10-04T00:00:00.000Z",
  };
  assert.equal(ExpertSessionRecordSchema.safeParse(valid).success, true);
  assert.equal(ExpertSessionRecordSchema.safeParse({ ...valid, gapIds: [] }).success, false);
  assert.equal(ExpertSessionRecordSchema.safeParse({ ...valid, decision: "maybe" }).success, false);
  assert.equal(ExpertSessionRecordSchema.safeParse({ ...valid, rationale: "" }).success, false);
});
