/**
 * Lab-availability publisher tests (work order C11): certified capabilities
 * become visible to organization search through contract-surface projections
 * — the registry index itself stays in @gen/media-capabilities.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CapabilityDescriptor } from "@gen/media-capabilities";
import type { CapabilityGapReport } from "../src/contract.js";
import type { LabAvailabilityPublication } from "../src/domain/publisher.js";
import {
  buildLabAvailabilityPublication,
  mergeIntoCapabilityCatalog,
} from "../src/domain/publisher.js";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

async function descriptor(): Promise<CapabilityDescriptor> {
  return JSON.parse(
    await readFile(
      join(
        repoRoot,
        "packages",
        "arena-bridge",
        "src",
        "domain",
        "proposals",
        "video.profile-reference-replacement.json",
      ),
      "utf8",
    ),
  ) as CapabilityDescriptor;
}

function certifiedGap(): CapabilityGapReport {
  return {
    gapId: "gap.test-publisher",
    detectedAt: "2026-10-04T00:00:00.000Z",
    requestedCapability: { intent: "Test intent." },
    kind: "missing-capability",
    failureEvidence: { summary: "Test evidence." },
    impact: { goalClass: "generic-edit", severity: "low" },
    arena: {
      state: "certified",
      proposedCapabilityId: "video.profile-reference-replacement",
    },
  };
}

test("a certified gap publishes its capability + mappings", async () => {
  const result = buildLabAvailabilityPublication(
    certifiedGap(),
    await descriptor(),
    "2026-10-04T10:00:00.000Z",
  );
  assert.ok(result.ok);
  if (result.ok) {
    assert.equal(result.publication.capabilityId, "video.profile-reference-replacement");
    assert.equal(result.publication.gapId, "gap.test-publisher");
    assert.deepEqual(result.publication.mappings, [
      { providerId: "higgsfield", modelId: "genjutsu", executionAdapter: "higgsfield-http", maturity: "reference" },
    ]);
    assert.equal(result.publication.registryIngestRef, "media-capabilities/registry-ingest");
  }
});

test("uncertified gaps cannot publish", async () => {
  const gap = { ...certifiedGap(), arena: { ...certifiedGap().arena, state: "proposed" as const } };
  const result = buildLabAvailabilityPublication(gap, await descriptor(), "2026-10-04T10:00:00.000Z");
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.issue, /requires a certified gap/);
});

test("descriptor mismatch with the proposed capability is refused", async () => {
  const gap = {
    ...certifiedGap(),
    arena: { ...certifiedGap().arena, proposedCapabilityId: "video.someone-else" },
  };
  const result = buildLabAvailabilityPublication(gap, await descriptor(), "2026-10-04T10:00:00.000Z");
  assert.equal(result.ok, false);
});

test("the catalog projection makes the capability visible to organization search", async () => {
  const descriptorValue = await descriptor();
  const result = buildLabAvailabilityPublication(
    certifiedGap(),
    descriptorValue,
    "2026-10-04T10:00:00.000Z",
  );
  assert.ok(result.ok);
  if (!result.ok) return;
  const catalogBefore = [
    { capabilityId: "editor.cut-video", domain: "editor", status: "draft" },
    { capabilityId: "video.character-replacement", domain: "video", status: "draft" },
  ];
  const catalogAfter = mergeIntoCapabilityCatalog(catalogBefore, result.publication);
  assert.equal(catalogAfter.length, catalogBefore.length + 1);
  const entry = catalogAfter.find((item) => item.capabilityId === "video.profile-reference-replacement");
  assert.ok(entry);
  assert.equal(entry.domain, "video");
  assert.equal(entry.status, "draft", "lock §7: published-by-Arena capabilities stay draft until TL review");
  // Idempotent: a second publication does not duplicate the entry.
  const again = mergeIntoCapabilityCatalog(catalogAfter, result.publication);
  assert.equal(again.length, catalogAfter.length);
});

test("the committed availability publication matches the fixture-derived one", async () => {
  const committed = JSON.parse(
    await readFile(
      join(
        repoRoot,
        "packages",
        "arena-bridge",
        "src",
        "domain",
        "availability",
        "pub.video-profile-reference-replacement.json",
      ),
      "utf8",
    ),
  ) as LabAvailabilityPublication;
  const expected = buildLabAvailabilityPublication(
    {
      ...certifiedGap(),
      gapId: "gap.forced-failure-video-character-replacement",
    },
    await descriptor(),
    "2026-10-04T10:00:00.000Z",
  );
  assert.ok(expected.ok && committed);
  if (expected.ok) {
    assert.equal(committed.capabilityId, expected.publication.capabilityId);
    assert.equal(committed.gapId, expected.publication.gapId);
    assert.equal(committed.publishedAt, expected.publication.publishedAt);
    assert.deepEqual(committed.mappings, expected.publication.mappings);
  }
});
