/**
 * Registry conformance — descriptor files, scenario fixtures, gap data files.
 *
 * Validates the five editor.* descriptors against the zod mirror of
 * spec/schemas/capability.schema.json, checks the descriptor↔scenario
 * references resolve on disk, and structurally validates the two gap report
 * data files in packages/arena-bridge/src/domain/gaps/ against
 * spec/schemas/capability-gap.schema.json's required fields.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EDITOR_CAPABILITY_IDS, validateCapabilityDescriptor } from "../domain/schema/capability-schema.js";
import { createEditorAdapters } from "../adapters/index.js";
import { makeWorkspace } from "./helpers.js";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const repoRoot = path.resolve(packageRoot, "..", "..");

const DESCRIPTORS = [
  "editor.cut-video",
  "editor.track-object",
  "editor.composite-layer",
  "editor.create-animation",
  "editor.render-project",
] as const;

describe("editor.* capability descriptors", () => {
  for (const id of DESCRIPTORS) {
    test(`${id}: schema-valid, draft, mapped, scenarios resolve`, async () => {
      const raw = await readFile(path.join(packageRoot, "src", "domain", "registry", `${id}.json`), "utf8");
      const result = validateCapabilityDescriptor(JSON.parse(raw));
      assert.ok(result.ok, `descriptor ${id} invalid: ${result.ok ? "" : result.issues.join("; ")}`);
      if (!result.ok) return;
      const descriptor = result.descriptor;
      assert.equal(descriptor.id, id);
      assert.equal(descriptor.status, "draft", "launch descriptors are draft until TL review (lock §7)");
      assert.equal(descriptor.domain, "editor");
      assert.ok(descriptor.providerMappings.length >= 1, "at least one provider mapping");
      for (const scenario of descriptor.conformance.scenarios) {
        const scenarioRaw = await readFile(path.join(repoRoot, scenario.path), "utf8");
        const scenarioDoc = JSON.parse(scenarioRaw) as { capabilityId?: string; id?: string };
        assert.equal(scenarioDoc.id, scenario.id, "scenario id matches descriptor reference");
        assert.equal(scenarioDoc.capabilityId, id, "scenario belongs to this capability");
      }
    });
  }

  test("launch set matches the contract enum exactly", () => {
    assert.deepEqual([...EDITOR_CAPABILITY_IDS].sort(), [...DESCRIPTORS].sort());
  });

  test("adapter factory covers all six editors; served capabilities match mapped ones", async () => {
    const workspace = await makeWorkspace();
    try {
      const adapters = createEditorAdapters(workspace.ctx);
      assert.equal(adapters.length, 6);
      const served = new Set(adapters.flatMap((adapter) => adapter.capabilities().map((cap) => cap.capabilityId)));
      for (const id of DESCRIPTORS) {
        const descriptor = JSON.parse(
          await readFile(path.join(packageRoot, "src", "domain", "registry", `${id}.json`), "utf8"),
        ) as { providerMappings: unknown[] };
        if (descriptor.providerMappings.length > 0) {
          assert.ok(served.has(id), `${id} has mappings but no adapter serves it`);
        }
      }
      for (const id of ["editor.cut-video", "editor.composite-layer", "editor.render-project"] as const) {
        assert.ok(served.has(id), `${id} is served by at least one adapter`);
      }
    } finally {
      await workspace.cleanup();
    }
  });
});

describe("capability-gap data files (arena-bridge/src/domain/gaps)", () => {
  const gapFiles = [
    { file: "gap.losslesscut-headless-cut.json", gapId: "gap.losslesscut-headless-cut" },
    { file: "gap.editor-track-object-launch-coverage.json", gapId: "gap.editor-track-object-launch-coverage" },
  ];

  for (const expected of gapFiles) {
    test(`${expected.gapId}: structurally valid per capability-gap.schema.json`, async () => {
      const raw = await readFile(path.join(repoRoot, "packages", "arena-bridge", "src", "domain", "gaps", expected.file), "utf8");
      const gap = JSON.parse(raw) as Record<string, unknown>;
      assert.match(String(gap.gapId), /^gap\.[a-z0-9-]+$/);
      assert.equal(gap.gapId, expected.gapId);
      assert.equal(gap.kind, "editor-coverage-gap");
      assert.ok(!Number.isNaN(Date.parse(String(gap.detectedAt))), "detectedAt is a date-time");
      const requested = gap.requestedCapability as Record<string, unknown> | undefined;
      assert.ok(requested !== undefined && typeof requested.intent === "string");
      const evidence = gap.failureEvidence as Record<string, unknown> | undefined;
      assert.ok(evidence !== undefined && typeof evidence.summary === "string");
      const arena = gap.arena as Record<string, unknown> | undefined;
      assert.ok(arena !== undefined && typeof arena.state === "string");
      assert.ok(
        ["detected", "reported", "arena-requested", "expert-session", "proposed", "certifying", "certified", "available", "rejected", "wont-fix"].includes(String(arena.state)),
        "arena.state is a schema enum value",
      );
      if (gap.impact !== undefined) {
        const impact = gap.impact as Record<string, unknown>;
        assert.ok(typeof impact.goalClass === "string");
        assert.ok(["low", "medium", "high", "critical"].includes(String(impact.severity)));
      }
    });
  }
});
