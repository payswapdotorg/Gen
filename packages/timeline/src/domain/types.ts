/**
 * timeline domain — hand-mirrored public types (lock §6).
 *
 * These mirror spec/schemas/artifact.schema.json as TypeScript types; the
 * zod bindings in schema.ts are the machine-checked twin (the parity harness
 * in adapters/ajv-validate.ts cross-checks both against the JSON Schema —
 * parity is mandatory, the schema is the source of truth).
 *
 * Phase 0 note: `ArtifactDescriptor`, `ArtifactProducer`, `TimelineRef` are
 * already consumed by @gen/editor-adapters (app/ports.ts, LocalArtifactStore)
 * — their names/shapes are a frozen compatibility surface.
 */

/** Producing metadata (P3 tie-in): capabilityId mandatory, the rest optional. */
export interface ArtifactProducer {
  readonly capabilityId: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly executionAdapter?: string;
  readonly executionId?: string;
  readonly agentInstanceId?: string;
}

/** OTIO anchor for timeline-articulate artifacts (artifact.schema.json). */
export interface TimelineRef {
  readonly otioPath?: string;
  readonly timelineArtifactId?: string;
}

export interface ArtifactStorage {
  readonly storeRef?: string;
  readonly sizeBytes?: number;
}

/** Project artifact graph node (spec/schemas/artifact.schema.json). */
export interface ArtifactDescriptor {
  readonly artifactId: string;
  readonly contentAddress: string;
  readonly mediaType: string;
  readonly producedBy: ArtifactProducer;
  readonly derivedFrom?: readonly string[];
  readonly timelineRef?: TimelineRef;
  readonly metadata?: Record<string, unknown>;
  readonly storage?: ArtifactStorage;
}

/** OTIO interchange anchor for editor cooperation (editor-adapter-contract §3). */
export interface OtioProjection {
  readonly timelineArtifactId: string;
  readonly otioVersion: string;
  readonly trackCount: number;
  readonly assetManifestArtifactId: string;
}

/** Lineage filter surface (who produced what, from what). */
export interface LineageQuery {
  readonly derivedFromArtifactId?: string;
  readonly producedByCapabilityId?: string;
  readonly agentInstanceId?: string;
}
