/**
 * timeline domain — timeline bundle vocabulary (work order W5 §2.5).
 *
 * A TIMELINE BUNDLE artifact (application/vnd.gen.timeline-bundle+json)
 * aggregates timeline-articulate children: every artifact whose
 * `timelineRef.timelineArtifactId` names the bundle is a member, anchored at
 * its `timelineRef.otioPath`. Editor projects (application/vnd.gen.editor-
 * project) and raw OTIO documents (application/otio) reference the bundle;
 * the P1 chain terminates here.
 */
import type { ArtifactDescriptor } from "../types.js";

export const TIMELINE_BUNDLE_MEDIA_TYPE = "application/vnd.gen.timeline-bundle+json";
export const TIMELINE_TRACK_MEDIA_TYPE = "application/vnd.gen.timeline-track+json";
export const TIMELINE_ITEM_MEDIA_TYPE = "application/vnd.gen.timeline-item+json";
export const EDITOR_PROJECT_MEDIA_TYPE = "application/vnd.gen.editor-project";
export const OTIO_MEDIA_TYPE = "application/otio";

export function isTimelineBundle(artifact: ArtifactDescriptor): boolean {
  return artifact.mediaType === TIMELINE_BUNDLE_MEDIA_TYPE;
}

/** Timeline-articulate: carries a timelineRef anchor into a bundle. */
export function isTimelineArticulate(artifact: ArtifactDescriptor): boolean {
  const ref = artifact.timelineRef;
  return ref !== undefined && (ref.timelineArtifactId !== undefined || ref.otioPath !== undefined);
}

/**
 * Deterministic otioPath ordering for workspace rendering: segment-wise,
 * numeric-aware ("tracks/1" < "tracks/2" < "tracks/10"), lexical fallback.
 */
export function compareOtioPath(a: string, b: string): number {
  const pa = a.split("/");
  const pb = b.split("/");
  const len = Math.min(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const sa = pa[i] ?? "";
    const sb = pb[i] ?? "";
    const na = Number(sa);
    const nb = Number(sb);
    const bothNumeric = sa !== "" && sb !== "" && Number.isFinite(na) && Number.isFinite(nb);
    const cmp = bothNumeric ? na - nb : sa < sb ? -1 : sa > sb ? 1 : 0;
    if (cmp !== 0) return cmp;
  }
  return pa.length - pb.length;
}
