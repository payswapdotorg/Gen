/**
 * timeline app layer — ports (architecture-governance: side-effect decisions
 * live here, execution in adapters; the domain sees neither).
 */
import type { RawArtifactRecordSource } from "../domain/graph/store.js";
import type { ContentAddresser } from "../domain/otio-import.js";

/** Loads raw artifact record JSON (git-tracked files, editor feeds, …). */
export interface ArtifactRecordSource {
  load(): Promise<RawArtifactRecordSource>;
}

export type { ContentAddresser };

/** Timeline service wiring: record sources + a content addresser. */
export interface TimelineServiceDeps {
  readonly recordSources: readonly ArtifactRecordSource[];
  readonly contentAddressOf: ContentAddresser;
}
