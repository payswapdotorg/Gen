/**
 * editor-adapters app layer — ports.
 *
 * Side effects are decided here and EXECUTED by adapters-layer
 * implementations (governance skill: "needs await? not domain; knows it is
 * child_process? adapters"). The domain never sees these interfaces'
 * implementations, only their pure results.
 */

import type { ArtifactDescriptor, ArtifactProducer, TimelineRef } from "@gen/timeline";

export interface ProcessResult {
  readonly command: string;
  readonly args: readonly string[];
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}

export interface SpawnedProcess {
  readonly hasExited: boolean;
  readonly exitCode: number | null;
  readonly kill: () => void;
  readonly completion: Promise<ProcessResult>;
}

export interface ProcessPort {
  /** Run to completion (short operations: probes, ffprobe, validations). */
  run(command: string, args: readonly string[], options?: { cwd?: string; timeoutMs?: number }): Promise<ProcessResult>;
  /** Start and observe (render jobs can take minutes). */
  start(command: string, args: readonly string[], options?: { cwd?: string }): Promise<SpawnedProcess>;
}

export interface FsPort {
  readFile(path: string): Promise<string>;
  readBinary(path: string): Promise<Uint8Array>;
  writeFile(path: string, content: string): Promise<void>;
  mkdirp(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  listDir(path: string): Promise<readonly string[]>;
  join(...parts: readonly string[]): string;
}

/** Binary resolution: env override (name only, P8) → PATH scan. */
export interface BinaryProbe {
  hasBinary(name: string): Promise<boolean>;
  resolveBinary(name: string): Promise<string | undefined>;
}

export interface PutArtifactMeta {
  readonly producedBy: ArtifactProducer;
  readonly derivedFrom?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly timelineRef?: TimelineRef;
}

export interface StoredArtifact {
  readonly descriptor: ArtifactDescriptor;
  readonly content: string;
}

/**
 * Working artifact store for adapter execution: content-addressed blobs +
 * descriptor index. This is NOT a second capability/provider registry (lock
 * §8.1) — it stores bytes + lineage using @gen/timeline's descriptor types;
 * Phase 2 wires the platform store in its place (see report CCR #4).
 */
export interface ArtifactStorePort {
  put(content: string, mediaType: string, meta: PutArtifactMeta): Promise<ArtifactDescriptor>;
  putBinary(content: Uint8Array, mediaType: string, meta: PutArtifactMeta): Promise<ArtifactDescriptor>;
  get(artifactId: string): Promise<StoredArtifact | undefined>;
  /** Materialize an artifact's bytes into a directory; returns the local path. */
  materialize(artifactId: string, targetDir: string, preferredExtension?: string): Promise<string | undefined>;
}

/** Everything an editor adapter needs from its environment. */
export interface EditorAdapterContext {
  readonly process: ProcessPort;
  readonly fs: FsPort;
  readonly artifacts: ArtifactStorePort;
  readonly binaries: BinaryProbe;
  /** Root directory under which per-project working dirs are created. */
  readonly workingRoot: string;
}
