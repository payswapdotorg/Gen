/**
 * Agent instance binding tests (agent-body-model.md §3): the LAB performs
 * binding; grants must be within the body's possession classes; the cognitive
 * model must resolve in the catalog and satisfy the body's requirement classes
 * (P2 — the body stays model-agnostic, the lab assigns).
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { ModelCatalogEntry } from "../src/contract.js";
import { bodyRegistry } from "../src/domain/bodies/registry.js";
import {
  bindAgentInstance,
  findModelInCatalog,
  modelSatisfiesRequirements,
  validatePossessionGrants,
} from "../src/domain/binding.js";
import { FROZEN_MODEL_CATALOG } from "../src/domain/scenarios/frozen-catalog.js";

const flagship: ModelCatalogEntry = FROZEN_MODEL_CATALOG[0]!;
const air: ModelCatalogEntry = FROZEN_MODEL_CATALOG[1]!;
const voice: ModelCatalogEntry = FROZEN_MODEL_CATALOG[2]!;

test("modelSatisfiesRequirements: modalities, quality class, context budget", () => {
  const director = bodyRegistry.get("body.director");
  assert.ok(director);
  // flagship glm-5.3: text-in/image-in/text-out, flagship, 128k — satisfies director.
  assert.deepEqual(modelSatisfiesRequirements(flagship, director), []);
  // air is standard (below flagship) and lacks nothing else — quality issue only.
  const issues = modelSatisfiesRequirements(air, director);
  assert.equal(issues.length, 1);
  assert.match(issues[0] ?? "", /quality class standard below body requirement flagship/);
  // vace-frame-edit: 16k context < director's 64k, and lacks audio… (modalities text-in/image-in/video-in/image-out/text-out)
  const vace = FROZEN_MODEL_CATALOG[4]!;
  assert.ok(vace);
  const vaceIssues = modelSatisfiesRequirements(vace, director);
  assert.ok(vaceIssues.some((issue) => /context/.test(issue)));
});

test("modelSatisfiesRequirements: missing modalities are reported", () => {
  const editor = bodyRegistry.get("body.video-editor");
  assert.ok(editor);
  const textOnly: ModelCatalogEntry = {
    providerId: "x",
    modelId: "text-only",
    modalities: ["text-in", "text-out"],
    qualityClass: "flagship",
    contextTokens: 200000,
  };
  const issues = modelSatisfiesRequirements(textOnly, editor);
  assert.ok(issues.length > 0);
  assert.match(issues[0] ?? "", /lacks modalities/);
});

test("validatePossessionGrants: unknown class and non-grantable items", () => {
  const editor = bodyRegistry.get("body.video-editor");
  assert.ok(editor);
  assert.deepEqual(
    validatePossessionGrants(editor, [{ class: "edit-basic", items: ["editor.cut-video"] }]),
    [],
  );
  assert.equal(validatePossessionGrants(editor, [{ class: "no-such-class" }]).length, 1);
  const issues = validatePossessionGrants(editor, [
    { class: "edit-basic", items: ["audio.ambient-mix"] },
  ]);
  assert.equal(issues.length, 1);
  assert.match(issues[0] ?? "", /not grantable in class/);
});

test("bindAgentInstance: happy path binds a valid instance (P2)", () => {
  const result = bindAgentInstance(bodyRegistry, FROZEN_MODEL_CATALOG, {
    instanceId: "run-0001-director",
    bodyId: "body.director",
    bodyVersion: "1.0.0",
    cognitiveModel: { providerId: flagship.providerId, modelId: flagship.modelId },
    grants: [{ class: "planning", items: ["orchestration.plan-workflow"] }],
    environment: { workspaceRef: "workspace/run-0001" },
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.instance.bodyId, "body.director");
    assert.equal(result.instance.cognitiveModel.modelId, flagship.modelId);
    assert.equal(result.instance.possessionConfig.grants.length, 1);
    // Runtime state is never part of the persisted descriptor (§1).
    assert.equal(result.instance.runtimeStatePointer, undefined);
  }
});

test("bindAgentInstance: model not resolving in the catalog is rejected (P1)", () => {
  const result = bindAgentInstance(bodyRegistry, FROZEN_MODEL_CATALOG, {
    instanceId: "run-0002",
    bodyId: "body.critic",
    bodyVersion: "1.0.0",
    cognitiveModel: { providerId: "unknown", modelId: "nope" },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => /does not resolve in the model catalog/.test(issue)));
  }
});

test("bindAgentInstance: model below requirement class is rejected", () => {
  const result = bindAgentInstance(bodyRegistry, FROZEN_MODEL_CATALOG, {
    instanceId: "run-0003",
    bodyId: "body.director",
    bodyVersion: "1.0.0",
    cognitiveModel: { providerId: air.providerId, modelId: air.modelId },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => /quality class/.test(issue)));
  }
});

test("bindAgentInstance: unknown body version is rejected", () => {
  const result = bindAgentInstance(bodyRegistry, FROZEN_MODEL_CATALOG, {
    instanceId: "run-0004",
    bodyId: "body.director",
    bodyVersion: "9.9.9",
    cognitiveModel: { providerId: flagship.providerId, modelId: flagship.modelId },
  });
  assert.equal(result.ok, false);
});

test("bindAgentInstance: grants outside possession classes are rejected", () => {
  const result = bindAgentInstance(bodyRegistry, FROZEN_MODEL_CATALOG, {
    instanceId: "run-0005",
    bodyId: "body.critic",
    bodyVersion: "1.0.0",
    cognitiveModel: { providerId: voice.providerId, modelId: voice.modelId },
    grants: [{ class: "planning", items: ["orchestration.plan-workflow"] }],
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((issue) => /not a possession class/.test(issue)));
  }
});

test("findModelInCatalog resolves by (providerId, modelId)", () => {
  const found = findModelInCatalog(FROZEN_MODEL_CATALOG, {
    providerId: "open-models",
    modelId: "wan-vace-14b",
  });
  assert.ok(found);
  assert.equal(found.qualityClass, "standard");
  assert.equal(
    findModelInCatalog(FROZEN_MODEL_CATALOG, { providerId: "x", modelId: "y" }),
    undefined,
  );
});
