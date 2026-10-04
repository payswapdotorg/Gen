/**
 * Comparison service (app layer): runs one capability's conformance scenario
 * across ALL its mappings and produces the normalized score table — the
 * T1/T3 evidence machine. All IO flows through ports (source, resolver, sink).
 */
import type { EvaluationRecord, EvaluationRow, RecordedFixture } from "../contract.js";
import { scoreMapping, type ScenarioRunOutcome } from "../domain/scoring.js";
import { recordedFixtureSchema } from "../domain/schema.js";
import { MediaAdapterError } from "../domain/errors.js";
import type {
  AdapterResolver,
  ClockPort,
  EvaluationRecordSink,
  ProviderPlaneSource,
} from "./ports.js";
import { capabilityDescriptorSchema, conformanceScenarioSchema } from "@gen/media-capabilities";

export const HARNESS_GENERATOR = "@gen/media-providers comparison harness v1 (mock mode)";

async function pollUntilTerminal(adapter: import("../contract.js").MediaExecutionAdapter, handle: import("../contract.js").JobHandle): Promise<"succeeded" | "failed" | "cancelled"> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const status = await adapter.poll(handle);
    if (status === "succeeded" || status === "failed" || status === "cancelled") return status;
  }
  throw new MediaAdapterError("provider-internal", "job did not reach a terminal state within the poll budget");
}

export interface ComparisonRun {
  readonly record: EvaluationRecord;
  readonly writePath?: string;
}

export class ComparisonService {
  readonly #source: ProviderPlaneSource;
  readonly #resolver: AdapterResolver;
  readonly #sink: EvaluationRecordSink;
  readonly #clock: ClockPort;

  constructor(
    source: ProviderPlaneSource,
    resolver: AdapterResolver,
    sink: EvaluationRecordSink,
    clock: ClockPort,
  ) {
    this.#source = source;
    this.#resolver = resolver;
    this.#sink = sink;
    this.#clock = clock;
  }

  async run(capabilityId: string, scenarioId: string): Promise<ComparisonRun> {
    const rawDescriptor = await this.#source.loadCapabilityDescriptor(capabilityId);
    const descriptor = capabilityDescriptorSchema.parse(rawDescriptor);
    const rawScenario = await this.#source.loadScenario(capabilityId, scenarioId);
    const scenario = conformanceScenarioSchema.parse(rawScenario);

    const rows: EvaluationRow[] = [];
    const fixtures = await this.#source.loadFixtures(capabilityId, scenarioId);
    for (const { source, data } of fixtures) {
      const fixture: RecordedFixture = recordedFixtureSchema.parse(data);
      const mapping = descriptor.providerMappings.find(
        (item) => item.providerId === fixture.providerId && (item.modelId ?? undefined) === (fixture.modelId ?? undefined),
      );
      if (mapping === undefined) {
        throw new MediaAdapterError(
          "validation",
          `fixture ${source} maps ${fixture.providerId} which is not a providerMapping of ${capabilityId}`,
        );
      }
      const adapter = this.#resolver.resolve(fixture);
      const idempotencyKey = `harness-${capabilityId}-${scenarioId}-${fixture.providerId}`;
      const handle = await adapter.submit(capabilityId, fixture.modelId, scenario.parameters, Object.keys(scenario.inputs), idempotencyKey);
      const terminal = await pollUntilTerminal(adapter, handle);
      if (terminal !== "succeeded") {
        throw new MediaAdapterError("provider-internal", `mapping ${fixture.providerId} ended in ${terminal} for ${scenarioId}`);
      }
      const refs = await adapter.retrieve(handle);
      const artifacts = fixture.lifecycle.artifacts.filter((artifact) => refs.includes(artifact.ref));
      const outcome: ScenarioRunOutcome = { artifactRefs: artifacts };
      rows.push(scoreMapping(scenario, fixture, outcome, mapping));
    }

    const record: EvaluationRecord = {
      evaluationId: `eval.${capabilityId}.${scenarioId}.v1`,
      capabilityId,
      scenarioId,
      mode: "mock",
      generatedAt: this.#clock.nowIso(),
      generator: HARNESS_GENERATOR,
      rows,
      notes:
        "Mock-mode conformance: adapters replay recorded fixture sets (no live credentials). " +
        "Provenance stays 'simulated' until live calibration replaces the fixtures.",
    };
    const writePath = await this.#sink.write(record);
    return { record, writePath };
  }
}
