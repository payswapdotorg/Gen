/**
 * Schema parity tests (lock §6, work order task 9): the zod bindings in
 * domain/schema mirror spec/schemas/task-plan.schema.json — the committed
 * spec example must parse, and the shapes the schema rejects
 * (additionalProperties, enums, patterns, item minimums, required lists)
 * must be rejected here. JSON Schema is the source of truth.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readJson, specExample } from "./helpers/spec-example.js";
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

test("parity: the spec example task-plan parses with the zod mirror", async () => {
  const example = await specExample("task-plan.replace-actor.json");
  const parsed = TaskPlanSchema.safeParse(example);
  assert.ok(parsed.success, parsed.success ? "" : parsed.error.issues.map((i) => `${i.path}: ${i.message}`).join("; "));
  assert.equal(parsed.data?.planId, "plan.replace-actor-0001");
  assert.equal(parsed.data?.blocked[0]?.kind, "capability");
  assert.equal(parsed.data?.blocked[0]?.capabilityGapRef, "gaps/gap.ref-frame-segment-3.json");
});

test("parity: blocked kinds match the JSON schema enum exactly", async () => {
  const schema = await readJson("spec", "schemas", "task-plan.schema.json");
  const kinds = enumAt(schema, "properties", "blocked", "items", "properties", "kind", "enum") ?? [];
  assert.deepEqual([...kinds].sort(), ["capability", "human-approval", "input", "provider"]);
});

test("parity: planId pattern is enforced (schema ^plan\\.[a-z0-9-]+$)", async () => {
  const example = await specExample("task-plan.replace-actor.json");
  assert.equal(TaskPlanSchema.safeParse({ ...example, planId: "not-a-plan-id" }).success, false);
  assert.equal(TaskPlanSchema.safeParse({ ...example, planId: "plan.Replace-Actor" }).success, false);
  assert.equal(TaskPlanSchema.safeParse({ ...example, planId: "plan.replace-actor-0001" }).success, true);
});

test("parity: additionalProperties is strict — extra fields are rejected", async () => {
  const example = await specExample("task-plan.replace-actor.json");
  assert.equal(TaskPlanSchema.safeParse({ ...example, extraTopLevel: "x" }).success, false);
  const completed = (example.completed as { item: string; evidence: string[] }[])[0];
  assert.ok(completed);
  assert.equal(
    TaskPlanSchema.safeParse({
      ...example,
      completed: [{ ...completed, extraField: true }],
    }).success,
    false,
  );
  assert.equal(
    TaskPlanSchema.safeParse({
      ...example,
      blocked: [{ ...(example.blocked as object[])[0], extraField: true }],
    }).success,
    false,
  );
});

test("parity: evidence-less completed claims are rejected (schema minItems on evidence)", async () => {
  const example = await specExample("task-plan.replace-actor.json");
  const [first] = example.completed as { item: string; evidence: string[] }[];
  assert.ok(first);
  const hollow = { ...example, completed: [{ item: first.item, evidence: [] }] };
  assert.equal(TaskPlanSchema.safeParse(hollow).success, false);
});

test("parity: required fields and length minimums mirror the schema", async () => {
  const example = await specExample("task-plan.replace-actor.json");
  const { currentStep, ...withoutCurrentStep } = example as Record<string, unknown>;
  assert.ok(currentStep);
  assert.equal(TaskPlanSchema.safeParse(withoutCurrentStep).success, false);
  assert.equal(TaskPlanSchema.safeParse({ ...example, goal: "tiny" }).success, false);
  assert.equal(TaskPlanSchema.safeParse({ ...example, currentStep: "ab" }).success, false);
  const { updatedAt, ...withoutUpdatedAt } = example as Record<string, unknown>;
  assert.ok(updatedAt);
  assert.equal(TaskPlanSchema.safeParse(withoutUpdatedAt).success, false);
});

test("parity: optional blocked fields stay optional, unknown kind rejected", async () => {
  const example = await specExample("task-plan.replace-actor.json");
  const blocked = (example.blocked as { reason: string; kind: string; capabilityGapRef?: string }[])[0];
  assert.ok(blocked);
  const { capabilityGapRef, ...blockedWithoutRef } = blocked;
  assert.ok(capabilityGapRef);
  assert.equal(
    TaskPlanSchema.safeParse({ ...example, blocked: [blockedWithoutRef] }).success,
    true,
  );
  assert.equal(
    TaskPlanSchema.safeParse({ ...example, blocked: [{ ...blocked, kind: "model" }] }).success,
    false,
  );
});

test("parity: simulation plans (runtime-shaped) parse too — same schema in sim and runtime", async () => {
  const { runSimulation, documentaryCinematicScenario } = await import("@gen/agent-lab");
  const { readOrganizationGraphFile } = await import("@gen/agent-lab");
  const { join } = await import("node:path");
  const { repoRootPath } = await import("./helpers/spec-example.js");
  const graph = await readOrganizationGraphFile(
    join(
      repoRootPath,
      "packages/agent-lab/src/domain/organizations/org.documentary-cinematic-remaster-cand-04.json",
    ),
  );
  const run = runSimulation(documentaryCinematicScenario, graph);
  for (const plan of run.taskPlans) {
    const parsed = TaskPlanSchema.safeParse(plan);
    assert.ok(parsed.success, `plan ${plan.planId} must parse: ${parsed.success ? "" : parsed.error.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);
  }
});
