/**
 * @gen/editor-adapters — public contract (lock §6).
 *
 * Mirrors the editor capability descriptors (spec/editor-adapter-contract.md,
 * same capability schema, `editor.*` domain) and the adapter interface.
 * Worker 2 additions over the Phase 0 skeleton (both reported as CCRs in the
 * completion report):
 *  - `importOtio` — MANDATED by spec/editor-adapter-contract.md §3/§4 but
 *    missing from the Phase 0 contract.ts; aligned here to the spec.
 *  - `jobResult` — render output retrieval; the spec §4 interface defines no
 *    way to obtain output artifacts from a render job. Extension pending
 *    TL review (see work/worker-2 report).
 * JSON Schemas in spec/schemas/ remain the source of truth (lock §6).
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

/** Render output retrieval (Worker 2 extension — CCR #2 in the completion report). */
export interface EditorRenderResult {
  readonly status: EditorJobStatus;
  readonly outputArtifactIds: readonly string[];
  readonly error?: string;
}

/** Adapter surface for render binary facts (mode evaluation evidence inputs). */
export interface EditorBinaryFacts {
  readonly editorId: EditorId;
  readonly binaryNames: readonly string[];
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
  importOtio(timelineArtifactId: string): Promise<EditorProjectHandle>;
  render(handle: EditorProjectHandle, profile: RenderProfile): Promise<EditorJobHandle>;
  pollJob(handle: EditorJobHandle): Promise<EditorJobStatus>;
  jobResult(handle: EditorJobHandle): Promise<EditorRenderResult>;
  capabilities(): readonly {
    capabilityId: string;
    maturity: "reference" | "stable" | "experimental" | "planned";
    modeNotes: string;
  }[];
}
