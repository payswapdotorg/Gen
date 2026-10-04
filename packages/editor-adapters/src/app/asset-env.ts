/**
 * editor-adapters app layer — working-dir asset environment.
 *
 * Materializes content-addressed assets into per-project working dirs and
 * builds the pure CodecEnv lookups the codecs see. Split from
 * adapter-base.ts to respect the module file-size budget; same layer rules
 * (ports only, no direct node:* usage).
 */

import { EditorAdapterError } from "../domain/errors.js";
import type { CodecEnv, SourceAssetMeta } from "../domain/edit/codec.js";
import type { EditorAdapterContext } from "./ports.js";
import type { ArtifactDescriptor } from "@gen/timeline";

export interface MaterializedAsset {
  readonly artifactId: string;
  readonly path: string;
  readonly meta: SourceAssetMeta;
}

export function extensionFor(mediaType: string): string {
  if (mediaType.includes("mp4")) return "mp4";
  if (mediaType.includes("webm")) return "webm";
  if (mediaType.includes("quicktime")) return "mov";
  return "bin";
}

/** Ingest the OPEN source artifact (media asset) with full probe metadata. */
export async function ingestSourceAsset(
  ctx: EditorAdapterContext,
  editorId: string,
  workingDir: string,
  descriptor: ArtifactDescriptor,
  artifactId: string,
): Promise<MaterializedAsset> {
  const meta = descriptor.metadata ?? {};
  for (const key of ["durationSeconds", "fps", "width", "height"] as const) {
    if (typeof meta[key] !== "number") {
      throw new EditorAdapterError({
        kind: "validation",
        code: "bad-artifact",
        editorId,
        message: `media asset ${artifactId} is missing probe metadata "${key}" — ingestion must probe (ffprobe) before open (lock P5: no guessing)`,
      });
    }
  }
  const assetsDir = ctx.fs.join(workingDir, "assets");
  await ctx.fs.mkdirp(assetsDir);
  const path = await ctx.artifacts.materialize(artifactId, assetsDir, extensionFor(descriptor.mediaType));
  if (path === undefined) {
    throw new EditorAdapterError({ kind: "validation", code: "bad-artifact", editorId, message: `media asset ${artifactId} could not be materialized` });
  }
  return {
    artifactId,
    path,
    meta: {
      artifactId,
      mediaType: descriptor.mediaType,
      durationSeconds: meta.durationSeconds as number,
      fps: meta.fps as number,
      width: meta.width as number,
      height: meta.height as number,
    },
  };
}

/** Materialize every store-known asset id into workingDir/assets. */
export async function syncAssets(ctx: EditorAdapterContext, workingDir: string, artifactIds: readonly string[]): Promise<void> {
  const assetsDir = ctx.fs.join(workingDir, "assets");
  await ctx.fs.mkdirp(assetsDir);
  for (const artifactId of artifactIds) {
    const stored = await ctx.artifacts.get(artifactId);
    if (stored === undefined) continue;
    await ctx.artifacts.materialize(artifactId, assetsDir, extensionFor(stored.descriptor.mediaType));
  }
}

/** Scan workingDir/assets back into the materialized-asset index. */
export async function trackedAssets(ctx: EditorAdapterContext, workingDir: string): Promise<MaterializedAsset[]> {
  const assetsDir = ctx.fs.join(workingDir, "assets");
  if (!(await ctx.fs.exists(assetsDir))) return [];
  const out: MaterializedAsset[] = [];
  for (const file of await ctx.fs.listDir(assetsDir)) {
    const artifactId = file.replace(/\.[a-z0-9]+$/, "");
    const stored = await ctx.artifacts.get(artifactId);
    const meta = stored?.descriptor.metadata ?? {};
    out.push({
      artifactId,
      path: ctx.fs.join(assetsDir, file),
      meta: {
        artifactId,
        mediaType: stored?.descriptor.mediaType ?? "video/mp4",
        durationSeconds: typeof meta.durationSeconds === "number" ? meta.durationSeconds : 0,
        fps: typeof meta.fps === "number" ? meta.fps : 25,
        width: typeof meta.width === "number" ? meta.width : 1280,
        height: typeof meta.height === "number" ? meta.height : 720,
      },
    });
  }
  return out;
}

/** CodecEnv over the current working dir (asset lookups are pure closures). */
export async function codecEnvFor(ctx: EditorAdapterContext, workingDir: string): Promise<CodecEnv> {
  const assets = await trackedAssets(ctx, workingDir);
  return {
    workingDir,
    assetPathOf: (artifactId: string) => assets.find((asset) => asset.artifactId === artifactId)?.path,
    assetMetaOf: (artifactId: string) => assets.find((asset) => asset.artifactId === artifactId)?.meta,
  };
}
