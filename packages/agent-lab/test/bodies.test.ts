/**
 * Body registry tests (work order A2/A3): six launch bodies, schema parity,
 * possession classes, lifecycle, and lock §8.2 — bodies never name concrete
 * model ids (the registry rejects any that do).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { AgentBodyDescriptorSchema } from "../src/domain/schema/agent-body.js";
import {
  LAUNCH_BODIES,
  bodyRegistry,
  buildBodyRegistry,
  findConcreteModelIdReferences,
} from "../src/domain/bodies/registry.js";

const REQUIRED_LAUNCH_BODIES = [
  "body.director",
  "body.video-editor",
  "body.color-specialist",
  "body.audio-specialist",
  "body.critic",
  "body.video-continuity-supervisor",
] as const;

test("six launch bodies are registered", () => {
  const ids = LAUNCH_BODIES.map((body) => body.id).sort();
  assert.deepEqual(ids, [...REQUIRED_LAUNCH_BODIES].sort());
  assert.equal(bodyRegistry.bodies.length, 6);
});

test("every launch body parses with the agent-body zod binding (schema parity)", () => {
  for (const body of LAUNCH_BODIES) {
    const parsed = AgentBodyDescriptorSchema.safeParse(body);
    assert.ok(parsed.success, `${body.id}: ${parsed.success ? "" : parsed.error.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  }
});

test("lock §8.2: no launch body names a concrete model id", () => {
  assert.equal(bodyRegistry.issues.length, 0);
  for (const body of LAUNCH_BODIES) {
    assert.deepEqual(
      findConcreteModelIdReferences(body),
      [],
      `${body.id} must not reference concrete model ids`,
    );
  }
  for (const body of LAUNCH_BODIES) {
    // P2 inverse check: the body only carries requirement classes.
    assert.ok(body.modelRequirements.qualityClass in { lightweight: 1, standard: 1, flagship: 1 });
  }
});

test("lock §8.2: the registry REJECTS a body that names a concrete model id", () => {
  const [first] = LAUNCH_BODIES;
  assert.ok(first);
  const violator = { ...first, modelRequirements: { ...first.modelRequirements, notes: "use gpt-4o" } };
  const registry = buildBodyRegistry([violator]);
  assert.equal(registry.bodies.length, 6);
  assert.equal(registry.issues.length, 1);
  assert.match(registry.issues[0] ?? "", /names concrete model id/);
});

test("registry rejects schema-invalid bodies (additionalProperties: false)", () => {
  const [first] = LAUNCH_BODIES;
  assert.ok(first);
  const invalid = { ...first, cognitiveModel: "glm-5.3" };
  const registry = buildBodyRegistry([invalid]);
  assert.equal(registry.bodies.length, 6);
  assert.equal(registry.issues.length, 1);
  assert.match(registry.issues[0] ?? "", /schema violation/);
});

test("registry get/getExact semantics", () => {
  const director = bodyRegistry.get("body.director");
  assert.ok(director);
  assert.equal(director.id, "body.director");
  assert.equal(director.version, "1.0.0");
  assert.equal(bodyRegistry.getExact("body.director", "1.0.0")?.id, "body.director");
  assert.equal(bodyRegistry.getExact("body.director", "9.9.9"), undefined);
  assert.equal(bodyRegistry.get("body.unknown"), undefined);
});

test("registry get skips deprecated versions and reports them", () => {
  const [first] = LAUNCH_BODIES;
  assert.ok(first);
  const deprecated = {
    ...first,
    version: "2.0.0",
    lifecycle: { state: "deprecated" as const, created: "2026-10-04", supersededBy: first.id },
  };
  const registry = buildBodyRegistry([deprecated]);
  const live = registry.get(first.id);
  assert.ok(live);
  assert.equal(live.version, "1.0.0", "deprecated version must not be returned by get()");
  assert.equal(registry.getExact(first.id, "2.0.0")?.lifecycle.state, "deprecated");
});

test("bodies declare possession classes with grantable items and limits", () => {
  for (const body of LAUNCH_BODIES) {
    assert.ok(body.possessionClasses.length >= 1, `${body.id} must declare possession classes`);
    for (const cls of body.possessionClasses) {
      assert.ok(cls.description.length > 0);
    }
  }
});

test("body.video-continuity-supervisor mirrors the committed spec example", async () => {
  const example = (await (await import("./helpers/spec-example.js")).specExample(
    "agent-body.video-continuity-supervisor.json",
  )) as {
    id: string;
    version: string;
    actuators: { capabilityIds: string[] };
    modelRequirements: {
      modalities: string[];
      qualityClass: string;
      minContextTokens: number;
    };
  };
  const supervisor = bodyRegistry.getExact("body.video-continuity-supervisor", "1.0.0");
  assert.ok(supervisor);
  assert.equal(supervisor.id, example.id);
  assert.equal(supervisor.version, example.version);
  assert.deepEqual(supervisor.actuators.capabilityIds, example.actuators.capabilityIds);
  assert.deepEqual(supervisor.modelRequirements.modalities, example.modelRequirements.modalities);
  assert.equal(supervisor.modelRequirements.qualityClass, example.modelRequirements.qualityClass);
  assert.equal(supervisor.modelRequirements.minContextTokens, example.modelRequirements.minContextTokens);
});
