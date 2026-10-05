/**
 * Shared end-to-end surface lib (work order §C.9): the Phase 2 surfaces the
 * T1–T4 chains exercise AFTER the domain layer —
 *
 *  - the creative-workspace mounts (apps/creative-workspace): committed
 *    record bundles projected into the TaskPlan view models (the P4 surface
 *    a user actually experiences — plan header, evidence links, blocked gap
 *    links, alternative deltas);
 *  - the committed timeline artifact graph (packages/timeline): the
 *    lineage-audit surface (lineageOf / subtreeOf / evidence descriptors).
 *
 * Domain-plane composition stays in lib/compose-registry.js + lib/plane.js
 * (reused, not duplicated). Nothing here reads fixtures or touches the
 * network — every record is a committed repository file.
 */
import { createWorkspaceService } from "../../../../apps/creative-workspace/src/app/workspace-service.js";
import { createFsRecordSource } from "../../../../apps/creative-workspace/src/adapters/fs-record-source.js";
import type { WorkspaceMount, WorkspaceScenarioId } from "../../../../apps/creative-workspace/src/contract.js";
import { TimelineGraphService } from "../../../../packages/timeline/src/app/graph-service.js";
import { FsArtifactRecordSource, defaultRecordsDir } from "../../../../packages/timeline/src/adapters/fs-record-source.js";
import { composePlane } from "./plane.js";

export type { WorkspaceMount, WorkspaceScenarioId };

/** The composed provider plane (media providers + local tools + evaluations). */
export type ComposedPlane = Awaited<ReturnType<typeof composePlane>>;

/** One measurement row of a committed media-providers evaluation record. */
export type EvaluationRow = ComposedPlane["evaluations"][number]["rows"][number];

// ---------------------------------------------------------------------------
// Workspace surface (scenario mounts)
// ---------------------------------------------------------------------------

let workspace: ReturnType<typeof createWorkspaceService> | undefined;

/** The workspace service over the committed record bundles (memoized per process). */
export function workspaceService(): ReturnType<typeof createWorkspaceService> {
  workspace ??= createWorkspaceService({ recordSource: createFsRecordSource() });
  return workspace;
}

/** Mount one committed workspace scenario (route → organize → plan → views). */
export function mountWorkspace(scenarioId: WorkspaceScenarioId): Promise<WorkspaceMount> {
  return workspaceService().mount(scenarioId);
}

// ---------------------------------------------------------------------------
// Timeline surface (committed artifact graph)
// ---------------------------------------------------------------------------

let timeline: TimelineGraphService | undefined;

/**
 * The committed timeline artifact graph — the launch records under
 * packages/timeline/src/domain/graph/records (the run-0009 documentary
 * interview chain), bootstrapped once through the Phase 2 service.
 */
export async function timelineGraph(): Promise<TimelineGraphService> {
  if (timeline === undefined) {
    const service = new TimelineGraphService({
      recordSources: [new FsArtifactRecordSource(defaultRecordsDir())],
    });
    const load = await service.bootstrap();
    if (!load.ok) {
      throw new Error(
        `timeline records failed to load: ${load.errors.map((e) => `${e.source}: ${e.message}`).join("; ")}`,
      );
    }
    timeline = service;
  }
  return timeline;
}

// ---------------------------------------------------------------------------
// Committed-record lookups + delta formatting (shared by the T1/T3 chains)
// ---------------------------------------------------------------------------

/** Find a measurement row in the committed media-providers evaluation records. */
export function evaluationRowFor(
  plane: ComposedPlane,
  capabilityId: string,
  providerId: string,
  modelId?: string,
): EvaluationRow {
  const rows = plane.evaluations
    .filter((record) => record.capabilityId === capabilityId)
    .flatMap((record) => record.rows);
  const row = rows.find(
    (candidate) =>
      candidate.providerId === providerId && (modelId === undefined || candidate.modelId === modelId),
  );
  if (row === undefined) {
    throw new Error(
      `no committed evaluation row for ${capabilityId} on ${providerId}${modelId === undefined ? "" : `/${modelId}`}`,
    );
  }
  return row;
}

/** `$X.XX unit` — the cost format the workspace delta table shows. */
export function costText(row: EvaluationRow): string {
  return `$${row.cost.estimate.toFixed(2)} ${row.cost.unit}`;
}

/** `N.N/100` — the normalized-quality format the workspace delta table shows. */
export function qualityText(row: EvaluationRow): string {
  return `${row.normalizedQuality.toFixed(1)}/100`;
}

/** `0.NN` — the reliability format the workspace delta table shows. */
export function reliabilityText(row: EvaluationRow): string {
  return row.reliability.toFixed(2);
}

/** Repo-relative path of a committed evaluation record (delta provenance). */
export function evaluationSourcePath(evaluationId: string): string {
  return `packages/media-providers/src/domain/evaluations/${evaluationId}.json`;
}
