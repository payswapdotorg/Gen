/**
 * App-layer ports for media provider adapters. Adapters execute against
 * these ports; tests and the harness inject fakes. No adapter touches
 * global fetch/process.env directly.
 */
import type { RecordedFixture, EvaluationRecord } from "../contract.js";

export interface HttpRequest {
  readonly method: "GET" | "POST" | "DELETE";
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
}

export interface HttpResponse {
  readonly status: number;
  readonly body: string;
}

export interface HttpPort {
  request(request: HttpRequest): Promise<HttpResponse>;
}

/** Environment access — env var VALUES never appear in logs or records. */
export interface EnvPort {
  get(name: string): string | undefined;
}

export interface ClockPort {
  nowIso(): string;
}

/** Loads raw provider descriptors / capability descriptors / scenarios. */
export interface ProviderPlaneSource {
  loadProviders(): Promise<readonly { source: string; data: unknown }[]>;
  listCapabilityIds(): Promise<readonly string[]>;
  loadCapabilityDescriptor(capabilityId: string): Promise<unknown>;
  loadScenario(capabilityId: string, scenarioId: string): Promise<unknown>;
  loadFixtures(capabilityId: string, scenarioId: string): Promise<readonly { source: string; data: unknown }[]>;
  loadEvaluations(): Promise<readonly { source: string; data: unknown }[]>;
}

/** Writes committed evaluation records (the harness output sink). */
export interface EvaluationRecordSink {
  write(record: EvaluationRecord): Promise<string>;
}

/** Adapter factory lookup used by the comparison harness. */
export interface AdapterResolver {
  resolve(fixture: RecordedFixture): import("../contract.js").MediaExecutionAdapter;
}
