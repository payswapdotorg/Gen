/**
 * @gen/timeline — public contract (lock §6).
 *
 * Mirrors spec/schemas/artifact.schema.json: the project artifact graph —
 * content-addressed artifacts with lineage + OpenTimelineIO anchors.
 * TL-owned shared surface; W2/W3 consume it via targeted PRs (lock §5).
 */

export interface ArtifactProducer {
  readonly capabilityId: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly executionAdapter?: string;
  readonly executionId?: string;
  readonly agentInstanceId?: string;
}

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

/** Lineage query surface (who produced what, from what). */
export interface LineageQuery {
  readonly derivedFromArtifactId?: string;
  readonly producedByCapabilityId?: string;
  readonly agentInstanceId?: string;
}
