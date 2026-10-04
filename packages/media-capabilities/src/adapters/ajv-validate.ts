/**
 * ajv validation harness (work order A.5): full JSON-Schema 2020-12 validation
 * of every registry descriptor against spec/schemas/capability.schema.json,
 * cross-checked with the zod bindings, plus scenario-reference integrity.
 *
 * This is the package gate that enforces lock §6 parity: the JSON Schema is
 * the source of truth, the zod mirror must agree with it, and every descriptor
 * file must pass BOTH validators.
 */
import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import { capabilityDescriptorSchema, conformanceScenarioSchema } from "../domain/schema.js";
import { defaultRegistryDir, FsDescriptorSource } from "./fs-descriptor-source.js";

export interface HarnessFinding {
  readonly kind: "ajv" | "zod" | "scenario-ref" | "io";
  readonly source: string;
  readonly message: string;
}

/** Repo root (packages/media-capabilities/src/adapters → 4 levels up). */
export function repoRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "..", "..", "..");
}

async function loadSchema(schemaPath: string): Promise<object> {
  const raw = await readFile(schemaPath, "utf8");
  return JSON.parse(raw) as object;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export interface ValidationResult {
  readonly descriptors: number;
  readonly scenarios: number;
  readonly findings: readonly HarnessFinding[];
}

/**
 * Validate the registry: descriptors against ajv + zod, and every referenced
 * conformance scenario fixture against the zod scenario schema. Pure data in,
 * findings out — the CLI wrapper decides exit codes.
 */
export async function validateRegistry(options: { registryDir?: string; repoRootDir?: string } = {}): Promise<ValidationResult> {
  const root = options.repoRootDir ?? repoRoot();
  const registryDir = options.registryDir ?? defaultRegistryDir();
  const findings: HarnessFinding[] = [];

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const schema = await loadSchema(join(root, "spec", "schemas", "capability.schema.json"));
  const validate = ajv.compile(schema);

  const records = await new FsDescriptorSource(registryDir).load();
  let scenarioCount = 0;

  for (const { source, data } of records) {
    if (!validate(data)) {
      findings.push({
        kind: "ajv",
        source,
        message: JSON.stringify(validate.errors ?? []),
      });
    }
    const zodResult = capabilityDescriptorSchema.safeParse(data);
    if (!zodResult.success) {
      findings.push({ kind: "zod", source, message: zodResult.error.message });
      continue;
    }
    for (const scenario of zodResult.data.conformance.scenarios) {
      scenarioCount += 1;
      const scenarioPath = join(root, scenario.path);
      if (!(await fileExists(scenarioPath))) {
        findings.push({ kind: "scenario-ref", source, message: `missing scenario file: ${scenario.path}` });
        continue;
      }
      const raw = await readFile(scenarioPath, "utf8");
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        findings.push({ kind: "scenario-ref", source, message: `invalid JSON in ${scenario.path}: ${(error as Error).message}` });
        continue;
      }
      const scenarioResult = conformanceScenarioSchema.safeParse(parsed);
      if (!scenarioResult.success) {
        findings.push({
          kind: "zod",
          source: scenario.path,
          message: `scenario fixture invalid: ${scenarioResult.error.message}`,
        });
      }
    }
  }

  return { descriptors: records.length, scenarios: scenarioCount, findings: Object.freeze(findings) };
}
