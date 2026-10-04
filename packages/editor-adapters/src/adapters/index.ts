/**
 * editor-adapters adapters layer — the six editor adapters (priority order,
 * spec/editor-adapter-contract.md §2) + factory. Each class wires its pure
 * codec (domain) into BaseEditorAdapter (app) with its binary names and
 * declared mode. All launch adapters are `cli` mode; the mode evaluation
 * (evaluations/) records why, per editor, with evidence.
 */

import type { EditorAdapter, EditorId } from "../contract.js";
import { BaseEditorAdapter } from "../app/adapter-base.js";
import type { EditorAdapterContext } from "../app/ports.js";
import { createMltCodec } from "../domain/adapters/mlt.js";
import { createBlenderCodec } from "../domain/adapters/blender.js";
import { createFfmpegCodec } from "../domain/adapters/ffmpeg.js";
import { createNatronCodec } from "../domain/adapters/natron.js";
import { createKdenliveCodec } from "../domain/adapters/kdenlive.js";
import { createLosslessCutCodec } from "../domain/adapters/losslesscut.js";

export class MltEditorAdapter extends BaseEditorAdapter {
  readonly editorId: EditorId = "mlt";
  readonly mode = "cli" as const;
  protected readonly binaryNames = ["melt"] as const;

  constructor(ctx: EditorAdapterContext) {
    super(ctx, createMltCodec());
  }
}

export class BlenderEditorAdapter extends BaseEditorAdapter {
  readonly editorId: EditorId = "blender";
  readonly mode = "cli" as const;
  protected readonly binaryNames = ["blender"] as const;

  constructor(ctx: EditorAdapterContext) {
    super(ctx, createBlenderCodec());
  }
}

export class FfmpegEditorAdapter extends BaseEditorAdapter {
  readonly editorId: EditorId = "ffmpeg";
  readonly mode = "cli" as const;
  protected readonly binaryNames = ["ffmpeg"] as const;

  constructor(ctx: EditorAdapterContext) {
    super(ctx, createFfmpegCodec());
  }
}

export class NatronEditorAdapter extends BaseEditorAdapter {
  readonly editorId: EditorId = "natron";
  readonly mode = "cli" as const;
  /** NatronRenderer is the headless render binary; `natron -b` is the fallback. */
  protected readonly binaryNames = ["NatronRenderer", "natron"] as const;

  constructor(ctx: EditorAdapterContext) {
    super(ctx, createNatronCodec());
  }
}

export class KdenliveEditorAdapter extends BaseEditorAdapter {
  readonly editorId: EditorId = "kdenlive";
  readonly mode = "cli" as const;
  /** melt renders kdenlive (MLT) projects; kdenlive_render is the wrapper alternative. */
  protected readonly binaryNames = ["kdenlive_render", "melt"] as const;

  constructor(ctx: EditorAdapterContext) {
    super(ctx, createKdenliveCodec());
  }
}

export class LosslessCutEditorAdapter extends BaseEditorAdapter {
  readonly editorId: EditorId = "losslesscut";
  readonly mode = "cli" as const;
  /** No headless execution surface — render() fails unsupported with the gap report. */
  protected readonly binaryNames = [] as const;

  constructor(ctx: EditorAdapterContext) {
    super(ctx, createLosslessCutCodec());
  }
}

const FACTORIES: Readonly<Record<EditorId, (ctx: EditorAdapterContext) => EditorAdapter>> = {
  mlt: (ctx) => new MltEditorAdapter(ctx),
  blender: (ctx) => new BlenderEditorAdapter(ctx),
  ffmpeg: (ctx) => new FfmpegEditorAdapter(ctx),
  natron: (ctx) => new NatronEditorAdapter(ctx),
  kdenlive: (ctx) => new KdenliveEditorAdapter(ctx),
  losslesscut: (ctx) => new LosslessCutEditorAdapter(ctx),
};

export function createEditorAdapter(editorId: EditorId, ctx: EditorAdapterContext): EditorAdapter {
  const factory = FACTORIES[editorId];
  if (factory === undefined) {
    throw new Error(`unknown editor: ${editorId}`);
  }
  return factory(ctx);
}

/** All six adapters over one context (shared working store / job space). */
export function createEditorAdapters(ctx: EditorAdapterContext): readonly EditorAdapter[] {
  return (Object.keys(FACTORIES) as EditorId[]).map((editorId) => createEditorAdapter(editorId, ctx));
}

export const EDITOR_ADAPTER_IDS: readonly EditorId[] = Object.keys(FACTORIES) as EditorId[];
