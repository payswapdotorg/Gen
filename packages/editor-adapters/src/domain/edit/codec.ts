/**
 * editor-adapters domain — native project codec contract.
 *
 * A codec is the PURE half of an editor adapter: edit-model ↔ native-format
 * conversion, command application, render-plan compilation. The app-layer
 * BaseEditorAdapter (side effects through ports) drives it; the adapters-layer
 * class supplies ports + binary names. No IO here.
 */

import type { EditorCommand, EditorId, RenderProfile } from "../../contract.js";
import type { EditorErrorKind, EditorErrorCode } from "../errors.js";
import type { EditProject } from "./edit-model.js";
import type { OtioFidelity } from "../otio/parse.js";

export interface SourceAssetMeta {
  readonly artifactId: string;
  readonly mediaType: string;
  readonly durationSeconds: number;
  readonly fps: number;
  readonly width: number;
  readonly height: number;
}

/** Everything a codec may ask the environment for (pure lookups). */
export interface CodecEnv {
  readonly workingDir: string;
  /** Absolute materialized path of an asset, when it exists on disk. */
  readonly assetPathOf: (artifactId: string) => string | undefined;
  readonly assetMetaOf: (artifactId: string) => SourceAssetMeta | undefined;
}

export interface CodecState {
  readonly project: EditProject;
  /** Codec-native extras (e.g. blender tracking ops) — declared in fidelity. */
  readonly extensions?: Readonly<Record<string, unknown>>;
}

export interface EditorCapabilityMapping {
  readonly capabilityId: string;
  readonly maturity: "reference" | "stable" | "experimental" | "planned";
  readonly modeNotes: string;
}

export interface RenderSupportFile {
  readonly relativePath: string;
  readonly content: string;
}

export interface RenderArgsPlan {
  readonly command: string;
  readonly args: readonly string[];
  /** Relative to workingDir. */
  readonly outputRelativePath: string;
  readonly supportFiles: readonly RenderSupportFile[];
}

export type ApplyResult =
  | { readonly ok: true; readonly state: CodecState }
  | { readonly ok: false; readonly kind: EditorErrorKind; readonly code: EditorErrorCode; readonly message: string };

export type RenderPlanResult =
  | { readonly ok: true; readonly plan: RenderArgsPlan }
  | {
      readonly ok: false;
      readonly reason: "no-render-surface" | "unsupported-profile";
      readonly message: string;
      readonly gapId?: string;
    };

export type ParseResult =
  | { readonly ok: true; readonly state: CodecState }
  | { readonly ok: false; readonly issues: readonly string[] };

export interface NativeProjectCodec {
  readonly editorId: EditorId;
  /** Native project file extension (no dot). */
  readonly fileExtension: string;
  /** Declared editorProject media type (editor-adapter-contract.md §3). */
  readonly nativeMediaType: string;
  readonly servedCapabilities: readonly EditorCapabilityMapping[];
  /** OTIO round-trip fidelity declaration — lossy is declared, never silent. */
  readonly fidelity: OtioFidelity;
  projectFromAsset(asset: SourceAssetMeta & { readonly path: string }): CodecState;
  applyCommand(state: CodecState, command: EditorCommand, env: CodecEnv): ApplyResult;
  serialize(state: CodecState, env: CodecEnv): string;
  parse(content: string): ParseResult;
  renderPlan(state: CodecState, profile: RenderProfile, env: CodecEnv): RenderPlanResult;
}

/** Flat clip indexing: clips of all tracks in canonical order (documented in
 *  the editor.cut-video descriptor constraints). */
export function flatClips(project: EditProject): readonly { trackIndex: number; clipIndex: number }[] {
  const out: { trackIndex: number; clipIndex: number }[] = [];
  project.tracks.forEach((track, trackIndex) => {
    track.clips.forEach((_, clipIndex) => out.push({ trackIndex, clipIndex }));
  });
  return out;
}

export function failure(kind: EditorErrorKind, code: EditorErrorCode, message: string): ApplyResult {
  return { ok: false, kind, code, message };
}
