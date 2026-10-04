/**
 * editor-adapters domain — command parameter schemas per editor.* capability.
 *
 * The `parameters` arrays of the registry descriptors (data) and the adapter
 * runtime validators (these zod schemas) MUST stay in parity: same names,
 * same types, same enums. Conformance tests assert descriptor parameters are
 * accepted/rejected identically here.
 */

import { z } from "zod";

/** editor.cut-video — descriptor: registry/editor.cut-video.json. */
export const cutVideoParamsSchema = z.strictObject({
  clipIndex: z.number().int().min(0),
  start: z.number().min(0).optional(),
  end: z.number().min(0).optional(),
  mode: z.enum(["stream-copy", "reencode"]).default("reencode"),
});

export type CutVideoParams = z.infer<typeof cutVideoParamsSchema>;

/** editor.track-object — descriptor: registry/editor.track-object.json. */
export const trackObjectParamsSchema = z.strictObject({
  targetLabel: z.string().min(1),
  region: z.string().regex(/^\d+(\.\d+)?,\d+(\.\d+)?,\d+(\.\d+)?,\d+(\.\d+)?$/, "region must be x,y,w,h"),
  start: z.number().min(0).default(0),
  end: z.number().min(0).optional(),
});

export type TrackObjectParams = z.infer<typeof trackObjectParamsSchema>;

/** editor.composite-layer — descriptor: registry/editor.composite-layer.json. */
export const compositeLayerParamsSchema = z.strictObject({
  layerArtifactRef: z.string().min(1),
  trackIndex: z.number().int().min(0).default(1),
  opacity: z.number().min(0).max(1).default(1),
  transform: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,\d+(\.\d+)?,-?\d+(\.\d+)?$/, "transform must be tx,ty,scale,rotation")
    .optional(),
});

export type CompositeLayerParams = z.infer<typeof compositeLayerParamsSchema>;

/** editor.create-animation — descriptor: registry/editor.create-animation.json. */
export const animationKeyframePattern = /^\d+(\.\d+)?=-?\d+(\.\d+)?(;\d+(\.\d+)?=-?\d+(\.\d+)?)*$/;

export const createAnimationParamsSchema = z.strictObject({
  property: z.enum(["position", "scale", "rotation", "opacity"]),
  keyframes: z.string().regex(animationKeyframePattern, 'keyframes must be "t=v;t=v;..." (seconds=value)'),
  interpolation: z.enum(["linear", "bezier", "constant"]).default("linear"),
  target: z.string().min(1).default("clip-0"),
});

export type CreateAnimationParams = z.infer<typeof createAnimationParamsSchema>;

/** editor.render-project — render profiles are typed in contract.ts
 *  (RenderProfile); this schema validates the descriptor-level profile enum. */
export const renderFormatSchema = z.enum(["mp4", "webm", "mov", "png-sequence"]);

export type RenderFormat = z.infer<typeof renderFormatSchema>;

export const capabilityParamSchemas: Readonly<Record<string, z.ZodType>> = {
  "editor.cut-video": cutVideoParamsSchema,
  "editor.track-object": trackObjectParamsSchema,
  "editor.composite-layer": compositeLayerParamsSchema,
  "editor.create-animation": createAnimationParamsSchema,
};

/** Validate command params for a capability. Unknown capability = validation
 *  error (adapters additionally gate by the capabilities they serve). */
export function validateCommandParams(
  capabilityId: string,
  params: Readonly<Record<string, unknown>>,
): { ok: true; value: Record<string, unknown> } | { ok: false; issues: string[] } {
  const schema = capabilityParamSchemas[capabilityId];
  if (schema === undefined) {
    return { ok: true, value: { ...params } };
  }
  const result = schema.safeParse(params);
  if (result.success) return { ok: true, value: result.data as Record<string, unknown> };
  return { ok: false, issues: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) };
}

/** Parse "t=v;t=v" keyframe strings into numeric keys (seconds). */
export function parseKeyframes(spec: string): readonly { time: number; value: number }[] {
  return spec
    .split(";")
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const [timeText, valueText] = pair.split("=");
      return { time: Number(timeText ?? 0), value: Number(valueText ?? 0) };
    });
}

/** Parse "x,y,w,h" / "tx,ty,scale,rotation" tuples. */
export function parseTuple(spec: string, size: 4): readonly number[] {
  const parts = spec.split(",").map((part) => Number(part));
  if (parts.length !== size || parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`expected ${size}-tuple, got: ${spec}`);
  }
  return parts;
}
