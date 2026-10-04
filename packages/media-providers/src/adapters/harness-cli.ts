/**
 * Gate + harness CLIs (adapters layer):
 *   validate — ajv × zod validation of provider descriptors + arena gap stubs
 *              + registry cross-check (declared capabilities must exist).
 *   harness  — run a capability's conformance scenario across all mappings
 *              and commit the evaluation record (mock mode).
 */
import { access, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { creativeProviderDescriptorSchema } from "../domain/schema.js";
import { parseProviderPlane } from "../domain/routing-facts.js";
import { FsProviderPlaneSource, FsEvaluationRecordSink, repoRoot } from "./fs-plane-source.js";
import { ComparisonService } from "../app/comparison-service.js";
import { MockAdapter } from "./mock/mock-adapter.js";
import type { AdapterResolver } from "../app/ports.js";
import type { RecordedFixture } from "../contract.js";
import { capabilityDescriptorSchema } from "@gen/media-capabilities";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function loadJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

const command = process.argv[2] ?? "validate";
const root = repoRoot();

if (command === "validate") {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  // The only formats used across spec/schemas/**: date + date-time (RFC 3339).
  ajv.addFormat("date", { type: "string", validate: (data: string) => /^\d{4}-\d{2}-\d{2}$/.test(data) });
  ajv.addFormat("date-time", { type: "string", validate: (data: string) => !Number.isNaN(Date.parse(data)) });
  const providerSchema = JSON.parse(
    await readFile(join(root, "spec", "schemas", "creative-provider.schema.json"), "utf8"),
  ) as object;
  const gapSchema = JSON.parse(
    await readFile(join(root, "spec", "schemas", "capability-gap.schema.json"), "utf8"),
  ) as object;
  const validateProvider = ajv.compile(providerSchema);
  const validateGap = ajv.compile(gapSchema);

  const findings: string[] = [];
  const source = new FsProviderPlaneSource(root);
  const rawProviders = await source.loadProviders();

  for (const { source: file, data } of rawProviders) {
    if (!validateProvider(data)) {
      findings.push(`[ajv] ${file}: ${JSON.stringify(validateProvider.errors ?? [])}`);
    }
    const zodResult = creativeProviderDescriptorSchema.safeParse(data);
    if (!zodResult.success) findings.push(`[zod] ${file}: ${zodResult.error.message}`);
  }

  // Registry cross-check: every provider-declared capability must exist in
  // the canonical registry (media + planned both resolve to descriptors or
  // gap reports — never silently dangling).
  const plane = parseProviderPlane(rawProviders);
  findings.push(...plane.errors.map((error) => `[parse] ${error}`));
  const registryDir = join(root, "packages", "media-capabilities", "src", "domain", "registry");
  const registryFiles = (await readdir(registryDir)).filter((name) => name.endsWith(".json"));
  const knownCapabilities = new Set<string>();
  for (const file of registryFiles) {
    const descriptor = capabilityDescriptorSchema.parse(await loadJson(join(registryDir, file)));
    knownCapabilities.add(descriptor.id);
  }
  for (const provider of plane.providers) {
    for (const mapping of provider.capabilities) {
      if (!knownCapabilities.has(mapping.capabilityId)) {
        const gapPath = join(root, "packages", "arena-bridge", "src", "domain", "gaps");
        const gapFiles = (await readdir(gapPath)).filter((name) => name.endsWith(".json"));
        const gapIds = gapFiles.map((name) => name.replace(/\.json$/, ""));
        const expectedGap = `gap.${mapping.capabilityId.split(".")[1]}`;
        if (!gapIds.includes(expectedGap)) {
          findings.push(`[registry] ${provider.providerId} declares ${mapping.capabilityId} with no registry descriptor and no gap report`);
        }
      }
    }
  }

  // Gap stubs validate against the locked schema (arena-bridge data files).
  const gapDir = join(root, "packages", "arena-bridge", "src", "domain", "gaps");
  if (await fileExists(gapDir)) {
    for (const file of (await readdir(gapDir)).filter((name) => name.endsWith(".json"))) {
      const gap = await loadJson(join(gapDir, file));
      if (!validateGap(gap)) {
        findings.push(`[ajv] ${file}: ${JSON.stringify(validateGap.errors ?? [])}`);
      }
    }
  }

  for (const finding of findings) console.error(`error ${finding}`);
  console.log(
    `validate-providers: ${findings.length === 0 ? "OK" : "FAILED"} ` +
      `(${rawProviders.length} provider descriptors checked)`,
  );
  process.exitCode = findings.length === 0 ? 0 : 1;
} else if (command === "harness") {
  const capabilityId = process.argv[3];
  const scenarioId = process.argv[4];
  if (capabilityId === undefined || scenarioId === undefined) {
    console.error("usage: harness-cli.ts harness <capabilityId> <scenarioId>");
    process.exitCode = 1;
  } else {
    const resolver: AdapterResolver = {
      resolve: (fixture: RecordedFixture) => new MockAdapter(fixture),
    };
    const clock = { nowIso: () => new Date().toISOString() };
    const service = new ComparisonService(
      new FsProviderPlaneSource(root),
      resolver,
      new FsEvaluationRecordSink(root),
      clock,
    );
    const run = await service.run(capabilityId, scenarioId);
    console.log(`harness: ${run.record.rows.length} mappings evaluated → ${run.writePath}`);
    for (const row of run.record.rows) {
      const dims = Object.entries(row.qualityScores)
        .map(([dimension, score]) => `${dimension}=${score}`)
        .join(" ");
      console.log(
        `  ${row.providerId}${row.modelId === undefined ? "" : `/${row.modelId}`}: quality=${row.normalizedQuality} ` +
          `(${dims}) cost=${row.cost.estimate}${row.cost.unit === "per-second-of-output" ? "/s" : ""} ` +
          `latency=${row.latency.class} reliability=${row.reliability} ` +
          `invariants=${row.invariants.schema}/${row.invariants.qualityThresholds} provenance=${row.provenance}`,
      );
    }
  }
} else {
  console.error(`unknown command "${command}" (expected validate | harness)`);
  process.exitCode = 1;
}
