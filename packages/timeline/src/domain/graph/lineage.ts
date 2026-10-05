/**
 * timeline domain — lineage queries (work order W5 §2.9–§2.11, Phase 2
 * consumers): the audit view (lineageOf), workspace rendering sets
 * (childrenOf/subtreeOf live on the store), the Phase 0 LineageQuery filter,
 * and the TaskPlan evidence descriptor (P4 tie-in: `completed[].evidence`
 * links artifact refs — spec/task-plan.md "evidence = artifact refs").
 */
import type { ArtifactDescriptor, ArtifactProducer, LineageQuery } from "../types.js";
import type { ArtifactGraph } from "./store.js";

/** Chain enumeration guard: dense DAGs can produce exponentially many paths. */
export const MAX_LINEAGE_CHAINS = 64;

export interface LineageAncestor {
  readonly artifactId: string;
  readonly depth: number;
  readonly mediaType: string;
  readonly contentAddress: string;
  /** Producing metadata — the audit view: what made this, with which capability. */
  readonly producedBy: ArtifactProducer;
  readonly derivedFrom: readonly string[];
}

export interface LineageReport {
  readonly artifactId: string;
  readonly mediaType: string;
  readonly contentAddress: string;
  readonly producedBy: ArtifactProducer;
  readonly directParents: readonly string[];
  /** All ancestors, depth-ascending then id — the full producing chain. */
  readonly ancestors: readonly LineageAncestor[];
  /** Every derivation path root → … → artifactId (bounded, see MAX_LINEAGE_CHAINS). */
  readonly chains: readonly (readonly string[])[];
  readonly truncatedChains: boolean;
}

/**
 * The audit view of one artifact: what made it (producedBy, full chain of
 * ancestors with their producing metadata, every derivation path). Unknown
 * ids return undefined — callers surface that (P5), never a fabricated chain.
 */
export function lineageOf(graph: ArtifactGraph, artifactId: string): LineageReport | undefined {
  const artifact = graph.get(artifactId);
  if (artifact === undefined) return undefined;

  const depths = new Map<string, number>();
  let frontier = new Set<string>(artifact.derivedFrom ?? []);
  let depth = 1;
  while (frontier.size > 0) {
    for (const id of frontier) depths.set(id, depth);
    const next = new Set<string>();
    for (const id of frontier) {
      for (const parent of graph.get(id)?.derivedFrom ?? []) {
        if (!depths.has(parent)) next.add(parent);
      }
    }
    frontier = next;
    depth += 1;
  }

  const ancestors: LineageAncestor[] = [...depths.entries()]
    .map(([id, ancestorDepth]) => {
      const node = graph.get(id) as ArtifactDescriptor;
      return {
        artifactId: id,
        depth: ancestorDepth,
        mediaType: node.mediaType,
        contentAddress: node.contentAddress,
        producedBy: node.producedBy,
        derivedFrom: node.derivedFrom ?? [],
      };
    })
    .sort((a, b) => a.depth - b.depth || a.artifactId.localeCompare(b.artifactId));

  const chains: string[][] = [];
  let truncated = false;
  // path = suffix BELOW the current node (toward the artifact); roots emit root→…→artifact.
  function walk(nodeId: string, path: string[]): void {
    if (truncated) return;
    if (chains.length >= MAX_LINEAGE_CHAINS) {
      truncated = true;
      return;
    }
    const node = graph.get(nodeId);
    const parents = node?.derivedFrom ?? [];
    if (parents.length === 0) {
      chains.push([nodeId, ...path]);
      return;
    }
    for (const parent of parents) walk(parent, [nodeId, ...path]);
  }
  walk(artifactId, []);

  return {
    artifactId,
    mediaType: artifact.mediaType,
    contentAddress: artifact.contentAddress,
    producedBy: artifact.producedBy,
    directParents: artifact.derivedFrom ?? [],
    ancestors: Object.freeze(ancestors),
    chains: Object.freeze(chains.map((chain) => Object.freeze(chain))),
    truncatedChains: truncated,
  };
}

/**
 * TaskPlan evidence descriptor (P4 tie-in): what the workspace links for a
 * completed item. `artifactRef` is the string that goes into
 * `completed[].evidence` (spec example style: "artifacts/<id>.json"); the
 * rest is the auditable descriptor behind that ref.
 */
export interface LineageEvidence {
  readonly artifactRef: string;
  readonly artifactId: string;
  readonly contentAddress: string;
  readonly mediaType: string;
  readonly producedBy: ArtifactProducer;
  readonly derivedFrom: readonly string[];
  readonly timelineArtifactId?: string;
  readonly otioPath?: string;
}

/** The evidence ref format for TaskPlan completed items (spec example style). */
export function artifactRef(artifactId: string): string {
  return `artifacts/${artifactId}.json`;
}

export function lineageEvidence(graph: ArtifactGraph, artifactId: string): LineageEvidence | undefined {
  const artifact = graph.get(artifactId);
  if (artifact === undefined) return undefined;
  return {
    artifactRef: artifactRef(artifactId),
    artifactId,
    contentAddress: artifact.contentAddress,
    mediaType: artifact.mediaType,
    producedBy: artifact.producedBy,
    derivedFrom: artifact.derivedFrom ?? [],
    timelineArtifactId: artifact.timelineRef?.timelineArtifactId,
    otioPath: artifact.timelineRef?.otioPath,
  };
}

/** Evidence refs for a completed item: the artifact + its full ancestor chain. */
export function taskPlanEvidenceRefs(graph: ArtifactGraph, artifactId: string): readonly string[] | undefined {
  const report = lineageOf(graph, artifactId);
  if (report === undefined) return undefined;
  const refs = [artifactRef(artifactId), ...report.ancestors.map((ancestor) => artifactRef(ancestor.artifactId))];
  return Object.freeze(refs);
}

/** Phase 0 LineageQuery filter (who produced what, from what). */
export function queryArtifacts(graph: ArtifactGraph, query: LineageQuery): readonly ArtifactDescriptor[] {
  return graph
    .listArtifacts()
    .filter((artifact) => {
      if (
        query.derivedFromArtifactId !== undefined &&
        !(artifact.derivedFrom ?? []).includes(query.derivedFromArtifactId)
      ) {
        return false;
      }
      if (query.producedByCapabilityId !== undefined && artifact.producedBy.capabilityId !== query.producedByCapabilityId) {
        return false;
      }
      if (query.agentInstanceId !== undefined && artifact.producedBy.agentInstanceId !== query.agentInstanceId) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.artifactId.localeCompare(b.artifactId));
}
