/**
 * @gen/editor-adapters — public contract (lock §6).
 *
 * Mirrors the editor capability descriptors (spec/editor-adapter-contract.md,
 * same capability schema, `editor.*` domain) and the adapter interface.
 * Phase 0: core type mirror; Worker 2 implements MLT → Blender → FFmpeg →
 * Natron → Kdenlive → LosslessCut (work/worker-2-editing-ecosystem.md).
 */

export type EditorAdapterMode = "embedded" | "cli" | "mcp" | "remote-service";

/** Editor priority order (operator plan, binding — spec/editor-adapter-contract.md §2). */
export type EditorId =
  | "mlt"
  | "blender"
  | "ffmpeg"
  | "natron"
  | "kdenlive"
  | "losslesscut";

/** Native project wrapped as content-addressed artifact + OTIO projection. */
export interface EditorProjectHandle {
  readonly handleId: string;
  readonly editorId: EditorId;
  readonly projectArtifactId: string;
  readonly otioProjectionArtifactId?: string;
  readonly workingDir: string;
}

export interface RenderProfile {
  readonly format: string;
  readonly codec?: string;
  readonly resolution?: string;
  readonly fps?: number;
  readonly outArtifactMediaType: string;
}

/** Mutating ops return a NEW handle (immutability; idempotency key required). */
export interface EditorCommand {
  readonly capabilityId: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
}

/** Job lifecycle shared with media adapters (media-provider-contract §3). */
export type EditorJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface EditorJobHandle {
  readonly jobId: string;
  readonly editorId: EditorId;
  readonly capabilityId: string;
  readonly idempotencyKey: string;
}

/**
 * The editor adapter interface (spec/editor-adapter-contract.md §4).
 * GUI-only interactions are NOT capabilities — headless impossible = gap report.
 */
export interface EditorAdapter {
  readonly editorId: EditorId;
  readonly mode: EditorAdapterMode;
  open(projectArtifactId: string): Promise<EditorProjectHandle>;
  apply(handle: EditorProjectHandle, command: EditorCommand): Promise<EditorProjectHandle>;
  exportOtio(handle: EditorProjectHandle): Promise<string>;
  render(handle: EditorProjectHandle, profile: RenderProfile): Promise<EditorJobHandle>;
  pollJob(handle: EditorJobHandle): Promise<EditorJobStatus>;
  capabilities(): readonly {
    capabilityId: string;
    maturity: "reference" | "stable" | "experimental" | "planned";
    modeNotes: string;
  }[];
}
