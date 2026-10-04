#!/usr/bin/env node
/**
 * validate-spec-examples.mjs — ARCHITECTURE_LOCK.md §6/§9 gate.
 *
 * Pure-node (zero-deps) structural validation:
 *   1. every spec/schemas/*.schema.json parses and declares $schema/$id/title;
 *   2. every spec/examples/*.json parses;
 *   3. each example is structurally checked against the fields its schema
 *      marks as `required` (top level + one level into $defs-backed objects
 *      where the schema uses inline object requireds);
 *   4. lock P8: no secret-shaped values in spec files.
 *
 * Full JSON-Schema validation (ajv) is Worker 1's harness deliverable; this
 * gate exists so the contracts are enforceable from day one.
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const schemaDir = join(root, "spec", "schemas");
const exampleDir = join(root, "spec", "examples");

const SECRET_PATTERNS = [
  /ghp_[A-Za-z0-9]{20,}/,
  /sk-or-v1-[A-Za-z0-9-]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /napi_[A-Za-z0-9]{20,}/,
  /e2b_[A-Za-z0-9]{20,}/,
  /ak_[A-Za-z0-9-]{20,}/,
  /ck_[A-Za-z0-9-]{20,}/,
  /apify_api_[A-Za-z0-9-]{20,}/,
  /cfat_[A-Za-z0-9-]{20,}/,
  /vcp_[A-Za-z0-9-]{20,}/,
  /re_[A-Za-z0-9]{20,}/,
];

const errors = [];
const warnings = [];

const schemaFiles = (await readdir(schemaDir)).filter((f) => f.endsWith(".schema.json"));
const exampleFiles = (await readdir(exampleDir)).filter((f) => f.endsWith(".json"));

/** Collect required property names at the top level of a schema. */
function topLevelRequired(schema) {
  return Array.isArray(schema.required) ? schema.required : [];
}

/** Required-set checkers: array items whose schema is a $ref into $defs, and inline nested objects. */
function nestedRequired(schema) {
  const out = [];
  const defs = schema.$defs ?? {};
  const props = schema.properties ?? {};
  for (const [name, sub] of Object.entries(props)) {
    if (sub && typeof sub === "object" && sub.type === "array" && sub.items) {
      const ref = typeof sub.items.$ref === "string" ? sub.items.$ref : undefined;
      const defName = ref?.startsWith("#/$defs/") ? ref.slice("#/$defs/".length) : undefined;
      const target = defName ? defs[defName] : sub.items;
      if (target && typeof target === "object" && Array.isArray(target.required)) {
        out.push({ path: name, required: target.required });
      }
    }
    if (sub && typeof sub === "object" && sub.type === "object" && Array.isArray(sub.required)) {
      out.push({ path: name, required: sub.required });
    }
    if (sub && typeof sub === "object" && sub.type === "array" && sub.items && sub.items.type === "object" && Array.isArray(sub.items.required)) {
      out.push({ path: name, required: sub.items.required });
    }
  }
  return out;
}

const schemas = {};
for (const file of schemaFiles) {
  const raw = await readFile(join(schemaDir, file), "utf8");
  let schema;
  try {
    schema = JSON.parse(raw);
  } catch (e) {
    errors.push(`schema ${file}: JSON parse error: ${e.message}`);
    continue;
  }
  schemas[file] = schema;
  if (!schema.$schema) errors.push(`schema ${file}: missing $schema`);
  if (!schema.$id) errors.push(`schema ${file}: missing $id`);
  if (!schema.title) errors.push(`schema ${file}: missing title`);
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(raw)) errors.push(`schema ${file}: secret-shaped value present (lock P8)`);
  }
}

/** Map an example file to its schema by name prefix (see spec/examples naming). */
function schemaForExample(exampleName) {
  const stem = exampleName.replace(/\.json$/, "");
  if (stem.startsWith("capability.")) return schemas["capability.schema.json"];
  if (stem.startsWith("creative-provider.")) return schemas["creative-provider.schema.json"];
  if (stem.startsWith("agent-body.")) return schemas["agent-body.schema.json"];
  if (stem.startsWith("agent-instance.")) return schemas["agent-instance.schema.json"];
  if (stem.startsWith("organization-graph.")) return schemas["organization-graph.schema.json"];
  if (stem.startsWith("task-plan.")) return schemas["task-plan.schema.json"];
  if (stem.startsWith("capability-gap.")) return schemas["capability-gap.schema.json"];
  if (stem.startsWith("artifact.")) return schemas["artifact.schema.json"];
  return undefined;
}

for (const file of exampleFiles) {
  const raw = await readFile(join(exampleDir, file), "utf8");
  let example;
  try {
    example = JSON.parse(raw);
  } catch (e) {
    errors.push(`example ${file}: JSON parse error: ${e.message}`);
    continue;
  }
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(raw)) errors.push(`example ${file}: secret-shaped value present (lock P8)`);
  }
  const schema = schemaForExample(file);
  if (!schema) {
    warnings.push(`example ${file}: no schema mapping (name prefix unknown)`);
    continue;
  }
  for (const key of topLevelRequired(schema)) {
    if (!(key in example)) errors.push(`example ${file}: missing required top-level "${key}" (${basename(Object.keys(schemas).find((k) => schemas[k] === schema) ?? "?")})`);
  }
  for (const { path, required } of nestedRequired(schema)) {
    const value = example[path];
    if (value === undefined) continue; // optional property absent — fine
    const targets = Array.isArray(value) ? value : [value];
    for (const target of targets) {
      if (target && typeof target === "object") {
        for (const key of required) {
          if (!(key in target)) errors.push(`example ${file}: missing "${key}" in ${path}`);
        }
      }
    }
  }
}

if (exampleFiles.length === 0) errors.push("spec/examples: no examples found");
if (schemaFiles.length < 8) warnings.push(`spec/schemas: expected 8 schemas, found ${schemaFiles.length}`);

for (const w of warnings) console.warn(`warn: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\nvalidate-spec-examples: FAILED (${errors.length} error(s))`);
  process.exit(1);
}
console.log(
  `validate-spec-examples: OK (${schemaFiles.length} schemas, ${exampleFiles.length} examples validated)`,
);
