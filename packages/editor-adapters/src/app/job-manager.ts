/**
 * editor-adapters app layer — render job manager.
 *
 * Owns the in-memory job records (single state owner for job lifecycle);
 * transitions are validated by the domain state machine. Render idempotency:
 * a (handle, profile) digest keys the job — retrying the same render returns
 * the same job (contract: render() has no caller key; the derived key is
 * deterministic and recorded on the handle — see adapter-base.ts).
 */

import type { EditorJobStatus } from "../contract.js";
import { isTerminal, transition } from "../domain/job-state.js";
import type { SpawnedProcess } from "./ports.js";

export interface JobRecord {
  readonly jobId: string;
  readonly editorId: string;
  readonly capabilityId: string;
  readonly idempotencyKey: string;
  readonly handleId: string;
  readonly outputRelativePath: string;
  readonly workingDir: string;
  status: EditorJobStatus;
  process?: SpawnedProcess;
  outputArtifactIds: string[];
  error?: string;
  readonly startedAt: number;
}

export class JobManager {
  private readonly jobs = new Map<string, JobRecord>();

  register(record: Omit<JobRecord, "status" | "outputArtifactIds" | "startedAt"> & { startedAt?: number }): JobRecord {
    const existing = this.jobs.get(record.jobId);
    if (existing !== undefined) return existing;
    const job: JobRecord = {
      ...record,
      startedAt: record.startedAt ?? Date.now(),
      status: "queued",
      outputArtifactIds: [],
    };
    this.jobs.set(job.jobId, job);
    return job;
  }

  get(jobId: string): JobRecord | undefined {
    return this.jobs.get(jobId);
  }

  markRunning(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (job === undefined || isTerminal(job.status)) return false;
    const result = transition(job.status, "running");
    if (!result.ok) return false;
    job.status = result.status;
    return true;
  }

  complete(jobId: string, outputArtifactIds: readonly string[]): boolean {
    const job = this.jobs.get(jobId);
    if (job === undefined || isTerminal(job.status)) return false;
    const result = transition(job.status, "succeeded");
    if (!result.ok) return false;
    job.status = result.status;
    job.outputArtifactIds = [...outputArtifactIds];
    return true;
  }

  fail(jobId: string, error: string): boolean {
    const job = this.jobs.get(jobId);
    if (job === undefined || isTerminal(job.status)) return false;
    const result = transition(job.status, "failed");
    if (!result.ok) return false;
    job.status = result.status;
    job.error = error;
    return true;
  }

  /** Poll: syncs the record with the observed process, returns the status. */
  poll(jobId: string): EditorJobStatus | undefined {
    const job = this.jobs.get(jobId);
    if (job === undefined) return undefined;
    if (isTerminal(job.status)) return job.status;
    if (job.process === undefined) return job.status;
    if (!job.process.hasExited) {
      if (job.status === "queued") this.markRunning(jobId);
      return "running";
    }
    if (job.process.exitCode === 0) {
      this.complete(jobId, job.outputArtifactIds);
    } else {
      this.fail(jobId, `render process exited with code ${String(job.process.exitCode ?? "signal")}`);
    }
    return job.status;
  }
}
