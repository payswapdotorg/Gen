/**
 * timeline app layer — the Phase 2 entrypoint over the domain.
 *
 * Composes record sources (ports) into the ArtifactGraph, then exposes the
 * interchange + lineage surface the workspace consumes: OTIO import (with
 * media lineage linking), OTIO export, lineage/evidence queries. Every
 * domain result type flows through unchanged — this class adds orchestration
 * (await ports, mutate the in-memory graph), never policy.
 */
import type {
  ArtifactDescriptor,
  LineageQuery,
} from "../domain/types.js";
import type { LineageEvidence, LineageReport } from "../domain/graph/lineage.js";
import { ArtifactGraph } from "../domain/graph/store.js";
import type { GraphLoadResult, GraphStats, ArtifactSubtree, DanglingAnchor } from "../domain/graph/store.js";
import {
  lineageEvidence,
  lineageOf,
  queryArtifacts,
  taskPlanEvidenceRefs,
} from "../domain/graph/lineage.js";
import { importOtioTimeline } from "../domain/otio-import.js";
import type { OtioImportOptions, OtioImportResult } from "../domain/otio-import.js";
import { exportOtioSubgraph } from "../domain/otio-export.js";
import type { OtioExportOptions, OtioExportResult } from "../domain/otio-export.js";
import type { TimelineServiceDeps } from "./ports.js";

export class TimelineGraphService {
  readonly #deps: TimelineServiceDeps;
  #graph?: ArtifactGraph;

  constructor(deps: TimelineServiceDeps) {
    this.#deps = deps;
  }

  /** Load every record source into a fresh graph (single write path per record). */
  async bootstrap(): Promise<GraphLoadResult> {
    const graph = new ArtifactGraph();
    const results: GraphLoadResult[] = [];
    for (const source of this.#deps.recordSources) {
      const records = await source.load();
      results.push(graph.load(records));
    }
    this.#graph = graph;
    return {
      ok: results.every((result) => result.ok),
      loaded: results.reduce((sum, result) => sum + result.loaded, 0),
      errors: Object.freeze(results.flatMap((result) => [...result.errors])),
    };
  }

  /** The bootstrapped graph (throws if bootstrap was not called yet). */
  get graph(): ArtifactGraph {
    if (this.#graph === undefined) throw new Error("TimelineGraphService.bootstrap() was not called");
    return this.#graph;
  }

  /**
   * Import an OTIO timeline into the graph: bundle + track/item children,
   * then link media lineage for every referenced artifact already present.
   * Returns the import result plus the link outcomes (P5 — surfaced).
   */
  importOtio(input: string | unknown, options: Omit<OtioImportOptions, "contentAddressOf">): OtioImportResult & {
    readonly added: readonly { readonly artifactId: string; readonly ok: boolean; readonly message?: string }[];
    readonly linkedMedia: readonly { readonly itemId: string; readonly mediaId: string; readonly ok: boolean; readonly message?: string }[];
  } {
    const imported = importOtioTimeline(input, { ...options, contentAddressOf: this.#deps.contentAddressOf });
    if (!imported.ok) {
      return { ...imported, added: Object.freeze([]), linkedMedia: Object.freeze([]) };
    }
    const added = imported.children.map((child) => {
      const result = this.graph.add(child, `otio:${child.artifactId}`);
      return result.ok
        ? { artifactId: child.artifactId, ok: true }
        : { artifactId: child.artifactId, ok: false, message: result.error.message };
    });
    const linkedMedia: { itemId: string; mediaId: string; ok: boolean; message?: string }[] = [];
    for (const item of imported.items) {
      for (const reference of item.references) {
        if (!this.graph.has(reference)) continue;
        const link = this.graph.linkLineage(item.artifact.artifactId, reference, "otio-media");
        linkedMedia.push(
          link.ok
            ? { itemId: item.artifact.artifactId, mediaId: reference, ok: true }
            : { itemId: item.artifact.artifactId, mediaId: reference, ok: false, message: link.error.message },
        );
      }
    }
    return { ...imported, added: Object.freeze(added), linkedMedia: Object.freeze(linkedMedia) };
  }

  exportOtio(bundleId: string, options?: OtioExportOptions): OtioExportResult {
    return exportOtioSubgraph(this.graph, bundleId, options);
  }

  lineageOf(artifactId: string): LineageReport | undefined {
    return lineageOf(this.graph, artifactId);
  }

  lineageEvidence(artifactId: string): LineageEvidence | undefined {
    return lineageEvidence(this.graph, artifactId);
  }

  taskPlanEvidenceRefs(artifactId: string): readonly string[] | undefined {
    return taskPlanEvidenceRefs(this.graph, artifactId);
  }

  queryArtifacts(query: LineageQuery): readonly ArtifactDescriptor[] {
    return queryArtifacts(this.graph, query);
  }

  subtreeOf(artifactId: string): ArtifactSubtree {
    return this.graph.subtreeOf(artifactId);
  }

  timelineChildrenOf(bundleId: string): readonly ArtifactDescriptor[] {
    return this.graph.timelineChildrenOf(bundleId);
  }

  danglingTimelineAnchors(): readonly DanglingAnchor[] {
    return this.graph.danglingTimelineAnchors();
  }

  stats(): GraphStats {
    return this.graph.stats();
  }
}
