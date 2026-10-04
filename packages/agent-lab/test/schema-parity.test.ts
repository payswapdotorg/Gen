/**
 * Schema parity tests (lock §6): the zod bindings in domain/schema mirror the
 * spec JSON Schemas — the committed spec examples must parse, and the bindings
 * must reject the shapes the schemas reject (additionalProperties, enums,
 * patterns). JSON Schemas are the source of truth.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { specExample, readJson } from "./helpers/spec-example.js";
import { AgentBodyDescriptorSchema } from "../src/domain/schema/agent-body.js";
import { AgentInstanceDescriptorSchema } from "../src/domain/schema/agent-instance.js";
import { OrganizationGraphSchema } from "../src/domain/schema/organization-graph.js";
import { TaskPlanSchema } from "../src/domain/schema/task-plan.js";

/** Walk a parsed JSON value and return the enum array at a path, if any. */
function enumAt(value: unknown, ...path: string[]): string[] | undefined {
  let cursor: unknown = value;
  for (const key of path) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return Array.isArray(cursor) ? (cursor as string[]) : undefined;
}

test("spec example: agent-body parses with the zod mirror", async () => {
  const example = await specExample("agent-body.video-continuity-supervisor.json");
  const parsed = AgentBodyDescriptorSchema.safeParse(example);
  assert.ok(parsed.success, parsed.success ? "" : parsed.error.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
});

test("spec example: agent-instance parses with the zod mirror", async () => {
  const example = await specExample("agent-instance.continuity-supervisor.json");
  const parsed = AgentInstanceDescriptorSchema.safeParse(example);
  assert.ok(parsed.success, parsed.success ? "" : parsed.error.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
});

test("spec example: organization-graph parses with the zod mirror", async () => {
  const example = await specExample("organization-graph.documentary-cinematic.json");
  const parsed = OrganizationGraphSchema.safeParse(example);
  assert.ok(parsed.success, parsed.success ? "" : parsed.error.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
});

test("spec example: task-plan parses with the zod mirror", async () => {
  const example = await specExample("task-plan.replace-actor.json");
  const parsed = TaskPlanSchema.safeParse(example);
  assert.ok(parsed.success, parsed.success ? "" : parsed.error.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
});

test("parity: agent-body enums match the JSON schema exactly", async () => {
  const schema = await readJson("spec", "schemas", "agent-body.schema.json");
  const perceptKinds = enumAt(schema, "properties", "percepts", "items", "properties", "kind", "enum") ?? [];
  assert.deepEqual(
    [...perceptKinds].sort(),
    ["artifact", "capability-result", "environment", "human-message", "org-event", "task-plan-state"],
  );
  const modalities = enumAt(schema, "properties", "modelRequirements", "properties", "modalities", "items", "enum") ?? [];
  assert.deepEqual([...modalities].sort(), [
    "audio-in",
    "audio-out",
    "image-in",
    "image-out",
    "text-in",
    "text-out",
    "video-in",
    "video-out",
  ]);
  const qualityClass = enumAt(schema, "properties", "modelRequirements", "properties", "qualityClass", "enum") ?? [];
  assert.deepEqual([...qualityClass].sort(), ["flagship", "lightweight", "standard"]);
});

test("parity: additionalProperties is strict — extra fields are rejected", async () => {
  const example = await specExample("agent-body.video-continuity-supervisor.json");
  const withModelId = {
    ...example,
    modelRequirements: { ...(example.modelRequirements as object), modelId: "glm-5.3" },
  };
  assert.equal(AgentBodyDescriptorSchema.safeParse(withModelId).success, false);
  const withExtraTop = { ...example, cognitiveModel: "glm-5.3" };
  assert.equal(AgentBodyDescriptorSchema.safeParse(withExtraTop).success, false);
});

test("parity: id patterns are enforced", async () => {
  const example = await specExample("agent-body.video-continuity-supervisor.json");
  assert.equal(AgentBodyDescriptorSchema.safeParse({ ...example, id: "not-a-body-id" }).success, false);
  assert.equal(
    AgentBodyDescriptorSchema.safeParse({ ...example, version: "1.0" }).success,
    false,
  );
  const instance = await specExample("agent-instance.continuity-supervisor.json");
  assert.equal(
    AgentInstanceDescriptorSchema.safeParse({ ...instance, instanceId: "BAD_ID" }).success,
    false,
  );
});

test("parity: organization-graph kind payload enums match the schema", async () => {
  const schema = await readJson("spec", "schemas", "organization-graph.schema.json");
  assert.deepEqual(enumAt(schema, "properties", "nodes", "items", "properties", "kind", "enum"), [
    "agent-instance",
    "human",
    "capability-invocation",
  ]);
  assert.deepEqual(enumAt(schema, "properties", "edges", "items", "properties", "kind", "enum"), [
    "delegation",
    "review",
    "artifact-flow",
    "approval",
  ]);
});

test("parity: task-plan blocked kinds match the schema", async () => {
  const schema = await readJson("spec", "schemas", "task-plan.schema.json");
  assert.deepEqual(enumAt(schema, "properties", "blocked", "items", "properties", "kind", "enum"), [
    "capability",
    "provider",
    "input",
    "human-approval",
  ]);
});

test("parity: evidence-less completed claims are rejected (schema minItems on evidence)", async () => {
  const example = (await specExample("task-plan.replace-actor.json")) as {
    completed: { item: string; evidence: string[] }[];
  };
  const [first] = example.completed;
  assert.ok(first);
  const hollow = {
    ...example,
    completed: [{ item: first.item, evidence: [] }],
  };
  assert.equal(TaskPlanSchema.safeParse(hollow).success, false);
});
