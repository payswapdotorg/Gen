/**
 * ajv parity harness (lock §6, work order W5 §2.1–§2.2): full JSON-Schema
 * 2020-12 validation of every committed artifact record against
 * spec/schemas/artifact.schema.json, cross-checked with the zod bindings,
 * plus graph integrity per record directory (DAG: parents exist, no cycles,
 * contentAddress format) and the committed spec example.
 *
 * This is the package gate that enforces artifact-schema parity: the JSON
 * Schema is the source of truth, the zod mirror must agree with it, and
 * every record file must pass BOTH validators.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { artifactDescriptorSchema } from "../domain/schema.js";
import { ArtifactGraph } from "../domain/graph/store.js";
import { FsArtifactRecordSource, defaultExamplesDir, defaultRecordsDir } from "./fs-record-source.js";

export interface HarnessFinding {
  readonly kind: "ajv" | "zod" | "graph" | "io" | "spec-example";
  readonly source: string;
  readonly message: string;
  /** true = informational only (TL-owned spec data; CCR filed) — does not gate. */
  readonly informational?: boolean;
}

/** CCR #1: artifactId pattern rejects the committed spec example (see README). */
export const SPEC_EXAMPLE_CCR =
  "CCR#1: spec/schemas/artifact.schema.json artifactId pattern ^art\\.[a-z0-9-]+$ rejects the committed example artifact.seg1.replaced.v1 (dotted ids) and the timelineArtifactId it cites (art.timeline.run-0009) — both validators agree; schema fix is TL-owned.";

/** Repo root (packages/timeline/src/adapters → 4 levels up). */
export function repoRoot(): string {
  const here = new URL(".", import.meta.url);
  return join(here.pathname, "..", "..", "..", "..");
}

export interface HarnessResult {
  readonly records: number;
  readonly specExamples: number;
  readonly findings: readonly HarnessFinding[];
  /** Findings that gate the package (informational spec-data findings excluded). */
  readonly gatingFindings: readonly HarnessFinding[];
}

async function loadSchema(schemaPath: string): Promise<object> {
  const raw = await readFile(schemaPath, "utf8");
  return JSON.parse(raw) as object;
}

/**
 * Validate the committed record sets + the committed spec example. Pure data
 * in, findings out — the CLI wrapper decides exit codes.
 */
export async function validateArtifactRecords(options: { repoRootDir?: string } = {}): Promise<HarnessResult> {
  const root = options.repoRootDir ?? repoRoot();
  const findings: HarnessFinding[] = [];
  let records = 0;
  let specExamples = 0;

  let ajvValidate: { (data: unknown): boolean; errors?: unknown[] | null };
  try {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const schema = await loadSchema(join(root, "spec", "schemas", "artifact.schema.json"));
    ajvValidate = ajv.compile(schema) as (data: unknown) => boolean & { errors?: unknown[] | null };
  } catch (error) {
    const finding: HarnessFinding = { kind: "io", source: "spec/schemas/artifact.schema.json", message: String(error) };
    return { records: 0, specExamples: 0, findings: Object.freeze([finding]), gatingFindings: Object.freeze([finding]) };
  }

  // 1. The committed spec example, cross-checked against BOTH validators.
  //    NOTE (CCR #1): the committed example currently VIOLATES the schema's
  //    artifactId pattern (dotted id) — ajv and the zod mirror agree on the
  //    rejection (parity holds). The finding is reported INFORMATIONALLY:
  //    spec/** is TL-owned; this package's gate covers its own records. The
  //    launch graph carries the schema-conformant adaptation
  //    (art.seg1-replaced-v1, records/art.seg1-replaced-v1.json).
  const specExamplePath = join(root, "spec", "examples", "artifact.segment-replaced.json");
  try {
    const specExample = JSON.parse(await readFile(specExamplePath, "utf8")) as unknown;
    specExamples += 1;
    if (!ajvValidate(specExample)) {
      findings.push({
        kind: "spec-example",
        source: "spec/examples/artifact.segment-replaced.json",
        message: `ajv rejects: ${JSON.stringify(ajvValidate.errors ?? [])} — ${SPEC_EXAMPLE_CCR}`,
        informational: true,
      });
    }
    const zodSpec = artifactDescriptorSchema.safeParse(specExample);
    if (!zodSpec.success) {
      findings.push({
        kind: "spec-example",
        source: "spec/examples/artifact.segment-replaced.json",
        message: `zod mirror agrees with the rejection (parity): ${zodSpec.error.message} — ${SPEC_EXAMPLE_CCR}`,
        informational: true,
      });
    }
  } catch (error) {
    findings.push({ kind: "io", source: specExamplePath, message: String(error) });
  }

  // 2. Every record directory: per-file ajv × zod parity, then DAG integrity.
  const directories: readonly { readonly label: string; readonly dir: string }[] = [
    { label: "records", dir: defaultRecordsDir() },
    { label: "examples", dir: defaultExamplesDir() },
  ];
  for (const { label, dir } of directories) {
    let loaded: { source: string; data: unknown }[];
    try {
      loaded = [...(await new FsArtifactRecordSource(dir).load())] as { source: string; data: unknown }[];
    } catch (error) {
      findings.push({ kind: "io", source: dir, message: String(error) });
      continue;
    }
    records += loaded.length;
    for (const { source, data } of loaded) {
      if (!ajvValidate(data)) {
        findings.push({ kind: "ajv", source, message: `ajv: ${JSON.stringify(ajvValidate.errors ?? [])}` });
      }
      const zodResult = artifactDescriptorSchema.safeParse(data);
      if (!zodResult.success) {
        findings.push({ kind: "zod", source, message: `zod: ${zodResult.error.message}` });
      }
    }
    const graph = new ArtifactGraph();
    const result = graph.load(loaded);
    if (!result.ok) {
      for (const error of result.errors) findings.push({ kind: "graph", source: error.source, message: error.message });
    }
    const dangling = graph.danglingTimelineAnchors();
    for (const anchor of dangling) {
      findings.push({
        kind: "graph",
        source: `${label}:${anchor.artifactId}`,
        message: `dangling timeline anchor: ${anchor.timelineArtifactId}`,
      });
    }
  }

  const gatingFindings = findings.filter((finding) => finding.informational !== true);
  return { records, specExamples, findings: Object.freeze(findings), gatingFindings: Object.freeze(gatingFindings) };
}
