/**
 * editor-adapters app layer — BaseEditorAdapter.
 *
 * Implements the EditorAdapter surface (contract.ts) once, for every editor:
 * working-dir lifecycle, immutable handles, idempotency ledger, OTIO
 * import/export through @gen/timeline artifact descriptors, render job
 * orchestration through ports. Editors differ only through their pure
 * NativeProjectCodec (domain) and their binary names (adapters layer).
 * All IO goes through ports (FsPort/ProcessPort/ArtifactStorePort).
 */

import type {
  EditorAdapter,
  EditorCommand,
  EditorJobHandle,
  EditorJobStatus,
  EditorProjectHandle,
  RenderProfile,
} from "../contract.js";
import type { EditorId } from "../contract.js";
import { EditorAdapterError } from "../domain/errors.js";
import {
  commandDigest,
  makeHandleId,
  nextHandleId,
  parseHandleId,
  projectFileFor,
  stateFileFor,
} from "../domain/handle.js";
import type { AppliedCommandRecord, WorkingProjectState } from "../domain/handle.js";
import { editProjectToOtio, parseOtioToEditProject } from "../domain/edit/otio-convert.js";
import { serializeOtio } from "../domain/otio/model.js";
import type { CodecState, NativeProjectCodec } from "../domain/edit/codec.js";
import { codecEnvFor, ingestSourceAsset, syncAssets, trackedAssets as trackedAssetsFor } from "./asset-env.js";
import { isTerminal } from "../domain/job-state.js";
import { JobManager } from "./job-manager.js";
import type { EditorAdapterContext } from "./ports.js";

const OTIO_MEDIA_TYPE = "application/otio";
const MANIFEST_MEDIA_TYPE = "application/vnd.gen.asset-manifest+json";

export interface RenderJobResult {
  readonly status: EditorJobStatus;
  readonly outputArtifactIds: readonly string[];
  readonly error?: string;
}

export abstract class BaseEditorAdapter implements EditorAdapter {
  abstract readonly editorId: EditorId;
  abstract readonly mode: "embedded" | "cli" | "mcp" | "remote-service";
  /** Binary names to probe, in preference order (empty = no binary needed). */
  protected abstract readonly binaryNames: readonly string[];

  protected readonly jobs = new JobManager();

  protected constructor(
    protected readonly ctx: EditorAdapterContext,
    protected readonly codec: NativeProjectCodec,
  ) {}

  capabilities(): readonly { capabilityId: string; maturity: "reference" | "stable" | "experimental" | "planned"; modeNotes: string }[] {
    return this.codec.servedCapabilities;
  }

  async open(projectArtifactId: string): Promise<EditorProjectHandle> {
    const stored = await this.ctx.artifacts.get(projectArtifactId);
    if (stored === undefined) {
      throw new EditorAdapterError({ kind: "validation", code: "artifact-not-found", editorId: this.editorId, message: `artifact ${projectArtifactId} not found in the working store` });
    }
    const seq = await this.nextProjectSeq();
    const workingDir = this.ctx.fs.join(this.ctx.workingRoot, this.editorId, `p${seq}`);
    await this.ctx.fs.mkdirp(workingDir);
    let state: CodecState;
    if (stored.descriptor.mediaType === this.codec.nativeMediaType) {
      const parsed = this.codec.parse(stored.content);
      if (!parsed.ok) {
        throw new EditorAdapterError({ kind: "validation", code: "native-parse-failed", editorId: this.editorId, message: `native project parse failed: ${parsed.issues.join("; ")}` });
      }
      state = parsed.state;
      await syncAssets(this.ctx, workingDir, assetIdsOf(state));
    } else {
      const asset = await ingestSourceAsset(this.ctx, this.editorId, workingDir, stored.descriptor, projectArtifactId);
      state = this.codec.projectFromAsset({ ...asset.meta, path: asset.path });
    }
    return this.initializeProject(workingDir, seq, state, projectArtifactId);
  }

  async importOtio(timelineArtifactId: string): Promise<EditorProjectHandle> {
    const stored = await this.ctx.artifacts.get(timelineArtifactId);
    if (stored === undefined) {
      throw new EditorAdapterError({ kind: "validation", code: "artifact-not-found", editorId: this.editorId, message: `timeline artifact ${timelineArtifactId} not found` });
    }
    const parsed = parseOtioToEditProject(stored.content, (targetUrl) => /art\.[a-z0-9-]+/.exec(targetUrl)?.[0]);
    if (!parsed.ok) {
      throw new EditorAdapterError({
        kind: "validation",
        code: "native-parse-failed",
        editorId: this.editorId,
        message: `OTIO import failed: ${parsed.issues.map((issue) => `${issue.path}: ${issue.problem}`).join("; ")}`,
      });
    }
    const seq = await this.nextProjectSeq();
    const workingDir = this.ctx.fs.join(this.ctx.workingRoot, this.editorId, `p${seq}`);
    await this.ctx.fs.mkdirp(workingDir);
    const state: CodecState = { project: parsed.project };
    await syncAssets(this.ctx, workingDir, assetIdsOf(state));
    return this.initializeProject(workingDir, seq, state, timelineArtifactId);
  }

  async apply(handle: EditorProjectHandle, command: EditorCommand): Promise<EditorProjectHandle> {
    const { workingDir, workingState } = await this.loadForHandle(handle);
    if (!this.codec.servedCapabilities.some((cap) => cap.capabilityId === command.capabilityId)) {
      throw new EditorAdapterError({ kind: "unsupported", code: "capability-not-served", editorId: this.editorId, message: `${this.editorId} does not serve ${command.capabilityId}` });
    }
    const digest = commandDigest(command.capabilityId, command.params);
    const replay = workingState.appliedCommands.find((record) => record.idempotencyKey === command.idempotencyKey);
    if (replay !== undefined) {
      if (replay.commandDigest === digest) {
        return { ...handle, handleId: replay.resultingHandleId, projectArtifactId: replay.resultingProjectArtifactId };
      }
      throw new EditorAdapterError({ kind: "validation", code: "idempotency-conflict", editorId: this.editorId, message: `idempotency key ${command.idempotencyKey} was already used for a different command` });
    }
    const state = await this.readProject(workingDir, workingState);
    const extraAssets =
      command.capabilityId === "editor.composite-layer" && typeof command.params.layerArtifactRef === "string"
        ? [command.params.layerArtifactRef]
        : [];
    await syncAssets(this.ctx, workingDir, [...assetIdsOf(state), ...extraAssets]);
    const env = await codecEnvFor(this.ctx, workingDir);
    const applied = this.codec.applyCommand(state, command, env);
    if (!applied.ok) {
      throw new EditorAdapterError({ kind: applied.kind, code: applied.code, editorId: this.editorId, message: applied.message });
    }
    const newHandleId = nextHandleId(handle.handleId, command.idempotencyKey);
    if (newHandleId === undefined) {
      throw new EditorAdapterError({ kind: "provider-internal", code: "internal", editorId: this.editorId, message: `unparseable handle id ${handle.handleId}` });
    }
    const nextRevision = workingState.revision + 1;
    const projectFile = projectFileFor(nextRevision, this.codec.fileExtension);
    const serialized = this.codec.serialize(applied.state, env);
    await this.ctx.fs.writeFile(this.ctx.fs.join(workingDir, projectFile), serialized);
    const artifact = await this.ctx.artifacts.put(serialized, this.codec.nativeMediaType, {
      producedBy: { capabilityId: command.capabilityId, executionAdapter: `${this.editorId}-adapter`, executionId: command.idempotencyKey },
      derivedFrom: [handle.projectArtifactId],
      metadata: { revision: nextRevision, handleId: newHandleId },
    });
    const record: AppliedCommandRecord = {
      idempotencyKey: command.idempotencyKey,
      commandDigest: digest,
      capabilityId: command.capabilityId,
      resultingHandleId: newHandleId,
      resultingProjectArtifactId: artifact.artifactId,
    };
    await this.writeState(workingDir, {
      ...workingState,
      revision: nextRevision,
      projectFile,
      appliedCommands: [...workingState.appliedCommands, record],
    });
    return { handleId: newHandleId, editorId: this.editorId, projectArtifactId: artifact.artifactId, workingDir };
  }

  async exportOtio(handle: EditorProjectHandle): Promise<string> {
    const { workingDir, workingState } = await this.loadForHandle(handle);
    const state = await this.readProject(workingDir, workingState);
    const assets = await trackedAssetsFor(this.ctx, workingDir);
    const otio = editProjectToOtio(state.project, (assetId) => assets.find((asset) => asset.artifactId === assetId)?.path);
    const otioJson = serializeOtio(otio);
    const manifestJson = `${JSON.stringify(
      { manifestVersion: 1, artifacts: assets.map((asset) => ({ artifactId: asset.artifactId, mediaType: asset.meta.mediaType })) },
      null,
      2,
    )}\n`;
    const source = await this.ctx.artifacts.get(handle.projectArtifactId);
    const producingCapability = source?.descriptor.producedBy.capabilityId ?? "editor.render-project";
    const executionId = `export-${handle.handleId}`;
    const timelineArtifact = await this.ctx.artifacts.put(otioJson, OTIO_MEDIA_TYPE, {
      producedBy: { capabilityId: producingCapability, executionAdapter: `${this.editorId}-adapter`, executionId },
      derivedFrom: [handle.projectArtifactId],
      metadata: { editorId: this.editorId, handleId: handle.handleId },
    });
    await this.ctx.artifacts.put(manifestJson, MANIFEST_MEDIA_TYPE, {
      producedBy: { capabilityId: producingCapability, executionAdapter: `${this.editorId}-adapter`, executionId },
      derivedFrom: [timelineArtifact.artifactId],
    });
    await this.ctx.fs.writeFile(this.ctx.fs.join(workingDir, `otio.r${workingState.revision}.json`), otioJson);
    return otioJson;
  }

  async render(handle: EditorProjectHandle, profile: RenderProfile): Promise<EditorJobHandle> {
    const { workingDir, workingState } = await this.loadForHandle(handle);
    const state = await this.readProject(workingDir, workingState);
    const plan = this.codec.renderPlan(state, profile, await codecEnvFor(this.ctx, workingDir));
    if (!plan.ok) {
      throw new EditorAdapterError({
        kind: "unsupported",
        code: plan.reason === "no-render-surface" ? "render-surface-absent" : "unsupported-profile",
        editorId: this.editorId,
        message: plan.message,
        gapId: plan.gapId,
      });
    }
    const binary = await this.resolveRenderBinary();
    if (binary === undefined) {
      throw new EditorAdapterError({
        kind: "unsupported",
        code: "binary-missing",
        editorId: this.editorId,
        message: `no binary found for ${this.editorId} (probed: ${this.binaryNames.join(", ")})`,
        detail: "install the editor or point its GEN_EDITOR_*_BIN env override at it",
      });
    }
    for (const file of plan.plan.supportFiles) {
      await this.ctx.fs.writeFile(this.ctx.fs.join(workingDir, file.relativePath), file.content);
    }
    const renderKey = `render:${handle.handleId}:${profile.format}:${profile.resolution ?? ""}:${profile.codec ?? ""}`;
    const jobId = `job-${this.editorId}-${slug(renderKey)}`;
    if (this.jobs.get(jobId) !== undefined) {
      return { jobId, editorId: this.editorId, capabilityId: "editor.render-project", idempotencyKey: renderKey };
    }
    await this.ctx.fs.mkdirp(this.ctx.fs.join(workingDir, "render"));
    const process = await this.ctx.process.start(binary, plan.plan.args, { cwd: workingDir });
    this.jobs.register({
      jobId,
      editorId: this.editorId,
      capabilityId: "editor.render-project",
      idempotencyKey: renderKey,
      handleId: handle.handleId,
      outputRelativePath: plan.plan.outputRelativePath,
      workingDir,
      process,
    });
    this.jobs.markRunning(jobId);
    return { jobId, editorId: this.editorId, capabilityId: "editor.render-project", idempotencyKey: renderKey };
  }

  async pollJob(handle: EditorJobHandle): Promise<EditorJobStatus> {
    const job = this.jobs.get(handle.jobId);
    if (job === undefined) {
      throw new EditorAdapterError({ kind: "validation", code: "internal", editorId: this.editorId, message: `unknown job ${handle.jobId}` });
    }
    if (isTerminal(job.status)) return job.status;
    if (job.process === undefined) return job.status;
    if (!job.process.hasExited) {
      this.jobs.markRunning(handle.jobId);
      return "running";
    }
    if (job.process.exitCode !== 0) {
      this.jobs.fail(handle.jobId, `render process exited with code ${String(job.process.exitCode)}`);
      return "failed";
    }
    const outputs = await this.registerOutputs(job.workingDir, job.outputRelativePath, handle.jobId, handle.idempotencyKey);
    if (outputs.length === 0) {
      this.jobs.fail(handle.jobId, `render reported success but produced no output at ${job.outputRelativePath}`);
      return "failed";
    }
    this.jobs.complete(handle.jobId, outputs);
    return "succeeded";
  }

  async jobResult(handle: EditorJobHandle): Promise<RenderJobResult> {
    const job = this.jobs.get(handle.jobId);
    if (job === undefined) {
      throw new EditorAdapterError({ kind: "validation", code: "internal", editorId: this.editorId, message: `unknown job ${handle.jobId}` });
    }
    return { status: job.status, outputArtifactIds: job.outputArtifactIds, error: job.error };
  }

  // --- shared internals -------------------------------------------------

  private async initializeProject(workingDir: string, seq: number, state: CodecState, sourceArtifactId: string): Promise<EditorProjectHandle> {
    const projectFile = projectFileFor(0, this.codec.fileExtension);
    await this.ctx.fs.writeFile(this.ctx.fs.join(workingDir, projectFile), this.codec.serialize(state, await codecEnvFor(this.ctx, workingDir)));
    await this.writeState(workingDir, {
      editorId: this.editorId,
      projectSeq: seq,
      revision: 0,
      projectFile,
      appliedCommands: [],
    });
    return { handleId: makeHandleId(this.editorId, seq, 0), editorId: this.editorId, projectArtifactId: sourceArtifactId, workingDir };
  }

  private async loadForHandle(handle: EditorProjectHandle): Promise<{ workingDir: string; workingState: WorkingProjectState }> {
    const parsed = parseHandleId(handle.handleId);
    if (parsed === undefined || parsed.editorId !== this.editorId) {
      throw new EditorAdapterError({ kind: "validation", code: "internal", editorId: this.editorId, message: `handle ${handle.handleId} does not belong to ${this.editorId}` });
    }
    const raw = await this.ctx.fs.readFile(this.ctx.fs.join(handle.workingDir, stateFileFor(parsed.projectSeq)));
    return { workingDir: handle.workingDir, workingState: JSON.parse(raw) as WorkingProjectState };
  }

  private async readProject(workingDir: string, workingState: WorkingProjectState): Promise<CodecState> {
    const content = await this.ctx.fs.readFile(this.ctx.fs.join(workingDir, workingState.projectFile));
    const parsed = this.codec.parse(content);
    if (!parsed.ok) {
      throw new EditorAdapterError({ kind: "provider-internal", code: "native-parse-failed", editorId: this.editorId, message: `working project parse failed: ${parsed.issues.join("; ")}` });
    }
    return parsed.state;
  }

  private async writeState(workingDir: string, state: WorkingProjectState): Promise<void> {
    await this.ctx.fs.writeFile(this.ctx.fs.join(workingDir, stateFileFor(state.projectSeq)), `${JSON.stringify(state, null, 2)}\n`);
  }

  private async nextProjectSeq(): Promise<number> {
    const editorRoot = this.ctx.fs.join(this.ctx.workingRoot, this.editorId);
    await this.ctx.fs.mkdirp(editorRoot);
    const seqs = (await this.ctx.fs.listDir(editorRoot)).flatMap((entry) => /^p(\d+)$/.exec(entry)?.slice(1) ?? []).map(Number);
    return seqs.length === 0 ? 1 : Math.max(...seqs) + 1;
  }

  private async resolveRenderBinary(): Promise<string | undefined> {
    for (const name of this.binaryNames) {
      const resolved = await this.ctx.binaries.resolveBinary(name);
      if (resolved !== undefined) return resolved;
    }
    return undefined;
  }

  private async registerOutputs(workingDir: string, outputRelativePath: string, jobId: string, renderKey: string): Promise<string[]> {
    const absolute = this.ctx.fs.join(workingDir, outputRelativePath);
    if (!(await this.ctx.fs.exists(absolute))) return [];
    const bytes = await this.ctx.fs.readBinary(absolute);
    const artifact = await this.ctx.artifacts.putBinary(bytes, "video/mp4", {
      producedBy: { capabilityId: "editor.render-project", executionAdapter: `${this.editorId}-adapter`, executionId: jobId },
      derivedFrom: [renderKey],
      metadata: { outputRelativePath },
    });
    return [artifact.artifactId];
  }

}

function assetIdsOf(state: CodecState): string[] {
  const ids = new Set<string>();
  for (const track of state.project.tracks) {
    for (const clip of track.clips) ids.add(clip.assetId);
  }
  return [...ids];
}

function slug(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "k";
}

