/**
 * @gen/timeline — public contract (lock §6).
 *
 * Pure re-export root (pattern per @gen/media-capabilities): hand-mirrored
 * types in domain/types.ts, zod bindings in domain/schema.ts + domain/otio.ts,
 * the graph store + lineage queries in domain/graph/, OTIO interchange in
 * domain/otio-{import,export}.ts. One import direction (contract → domain).
 *
 * Frozen compatibility surface: ArtifactDescriptor / ArtifactProducer /
 * TimelineRef are consumed by @gen/editor-adapters (app/ports.ts,
 * LocalArtifactStore) — names/shapes must not break.
 */
export type {
  ArtifactDescriptor,
  ArtifactProducer,
  ArtifactStorage,
  LineageQuery,
  OtioProjection,
  TimelineRef,
} from "./domain/types.js";

export {
  ARTIFACT_ID_PATTERN,
  CONTENT_ADDRESS_PATTERN,
  artifactDescriptorSchema,
  artifactProducerSchema,
  artifactStorageSchema,
  timelineRefSchema,
} from "./domain/schema.js";

export {
  EDITOR_PROJECT_MEDIA_TYPE,
  OTIO_MEDIA_TYPE,
  TIMELINE_BUNDLE_MEDIA_TYPE,
  TIMELINE_ITEM_MEDIA_TYPE,
  TIMELINE_TRACK_MEDIA_TYPE,
  compareOtioPath,
  isTimelineArticulate,
  isTimelineBundle,
} from "./domain/graph/bundle.js";

export { ArtifactGraph } from "./domain/graph/store.js";
export type {
  ArtifactSubtree,
  DanglingAnchor,
  GraphAddResult,
  GraphIssue,
  GraphLoadResult,
  GraphStats,
  RawArtifactRecordSource,
} from "./domain/graph/store.js";

export {
  MAX_LINEAGE_CHAINS,
  artifactRef,
  lineageEvidence,
  lineageOf,
  queryArtifacts,
  taskPlanEvidenceRefs,
} from "./domain/graph/lineage.js";
export type { LineageAncestor, LineageEvidence, LineageReport } from "./domain/graph/lineage.js";

export {
  importOtioTimeline,
} from "./domain/otio-import.js";
export type {
  ContentAddresser,
  OtioImportedChild,
  OtioImportIssue,
  OtioImportOptions,
  OtioImportResult,
} from "./domain/otio-import.js";

export { exportOtioSubgraph } from "./domain/otio-export.js";
export type { OtioExportIssue, OtioExportOptions, OtioExportResult } from "./domain/otio-export.js";

export {
  otioClipSchema,
  otioExternalReferenceSchema,
  otioGapSchema,
  otioItemSchema,
  otioMediaReferenceSchema,
  otioRationalTimeSchema,
  otioSourceRefSchema,
  otioStackSchema,
  otioTimeRangeSchema,
  otioTimelineSchema,
  otioTrackSchema,
  rationalTime,
  serializeOtioCanonical,
  serializeOtioItemCanonical,
  serializeOtioTrackCanonical,
  timeRange,
} from "./domain/otio.js";
export type {
  OtioClip,
  OtioExternalReference,
  OtioGap,
  OtioItem,
  OtioMediaReference,
  OtioRationalTime,
  OtioSourceRef,
  OtioStack,
  OtioTimeRange,
  OtioTimeline,
  OtioTrack,
} from "./domain/otio.js";

export { TimelineGraphService } from "./app/graph-service.js";
export type { ArtifactRecordSource, TimelineServiceDeps } from "./app/ports.js";
