/**
 * Mock adapter — replays a recorded fixture set through the real
 * MediaExecutionAdapter interface. Used by the conformance runner and tests
 * when no live credentials exist (work order: "mock/record fixtures for
 * scenarios"). The fixture's provenance marker follows the data everywhere.
 */
import type { JobHandle, JobStatus, MediaExecutionAdapter, RecordedFixture } from "../../contract.js";
import { MediaAdapterError } from "../../domain/errors.js";
import { recordedFixtureSchema } from "../../domain/schema.js";

interface MockJob {
  readonly handle: JobHandle;
  pollIndex: number;
  cancelled: boolean;
  retrieved: boolean;
}

export class MockAdapter implements MediaExecutionAdapter {
  readonly #fixture: RecordedFixture;
  readonly #jobs = new Map<string, MockJob>();
  readonly #byIdempotencyKey = new Map<string, JobHandle>();
  #submits = 0;

  constructor(fixture: unknown) {
    const parsed = recordedFixtureSchema.safeParse(fixture);
    if (!parsed.success) {
      throw new MediaAdapterError("validation", `recorded fixture invalid: ${parsed.error.message}`);
    }
    this.#fixture = parsed.data;
  }

  get provenance(): RecordedFixture["provenance"] {
    return this.#fixture.provenance;
  }

  get submitCount(): number {
    return this.#submits;
  }

  async submit(
    capabilityId: string,
    modelId: string | undefined,
    params: Readonly<Record<string, unknown>>,
    inputArtifactRefs: readonly string[],
    idempotencyKey: string,
  ): Promise<JobHandle> {
    const existing = this.#byIdempotencyKey.get(idempotencyKey);
    if (existing !== undefined) return existing;
    if (capabilityId !== this.#fixture.capabilityId) {
      throw new MediaAdapterError("unsupported", `mock fixture covers ${this.#fixture.capabilityId}, not ${capabilityId}`, {
        gapSignal: true,
      });
    }
    this.#submits += 1;
    const handle: JobHandle = {
      jobId: this.#fixture.lifecycle.submit.requestId,
      providerId: this.#fixture.providerId,
      modelId: modelId ?? this.#fixture.modelId,
      capabilityId,
      idempotencyKey,
    };
    void params;
    void inputArtifactRefs;
    this.#jobs.set(handle.jobId, { handle, pollIndex: 0, cancelled: false, retrieved: false });
    this.#byIdempotencyKey.set(idempotencyKey, handle);
    return handle;
  }

  #job(handle: JobHandle): MockJob {
    const job = this.#jobs.get(handle.jobId);
    if (job === undefined) {
      throw new MediaAdapterError("validation", `unknown mock job ${handle.jobId}`);
    }
    return job;
  }

  async poll(handle: JobHandle): Promise<JobStatus> {
    const job = this.#job(handle);
    if (job.cancelled) return "cancelled";
    const polls = this.#fixture.lifecycle.polls;
    const index = Math.min(job.pollIndex, polls.length - 1);
    job.pollIndex += 1;
    const raw = polls[index]?.status ?? "succeeded";
    if (raw === "queued") return "queued";
    if (raw === "running") return "running";
    if (raw === "failed") return "failed";
    if (raw === "cancelled") return "cancelled";
    return "succeeded";
  }

  async *stream(handle: JobHandle): AsyncIterable<{ kind: "progress" | "status"; payload: unknown }> {
    for (;;) {
      const status = await this.poll(handle);
      const job = this.#job(handle);
      const polls = this.#fixture.lifecycle.polls;
      const progress = polls[Math.min(job.pollIndex, polls.length) - 1]?.progress;
      yield { kind: "progress", payload: { status, progress } };
      if (status === "succeeded" || status === "failed" || status === "cancelled") return;
    }
  }

  async cancel(handle: JobHandle): Promise<"cancelled" | "terminal"> {
    const job = this.#job(handle);
    const current = await this.poll(handle);
    if (current === "succeeded" || current === "failed") return "terminal";
    job.cancelled = true;
    return "cancelled";
  }

  async retrieve(handle: JobHandle): Promise<readonly string[]> {
    const job = this.#job(handle);
    const status = await this.poll(handle);
    if (status !== "succeeded") {
      throw new MediaAdapterError("validation", `retrieve called on mock job in status "${status}"`);
    }
    job.retrieved = true;
    return this.#fixture.lifecycle.artifacts.map((artifact) => artifact.ref);
  }
}
