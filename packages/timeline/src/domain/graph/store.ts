/**
 * timeline domain — the project artifact graph store (work order W5 §2.3).
 *
 * Pure in-memory index over git-tracked record files (one JSON per artifact,
 * src/domain/graph/records/ — the same single-owner pattern as
 * @gen/media-capabilities' registry). This class never performs IO: records
 * are loaded through the app-layer ArtifactRecordSource port. Invariants
 * enforced on every write path (P5 — surfaced, never silently swallowed):
 *
 *   1. schema: every artifact satisfies artifact.schema.json (zod binding);
 *      contentAddress is therefore always `sha256:<64 hex>` — FORMAT only,
 *      bytes are never stored here (binary content lives behind refs).
 *   2. identity: artifactId is unique.
 *   3. lineage: every derivedFrom parent exists (in the graph, or in the same
 *      load batch) — no dangling lineage edges.
 *   4. acyclicity: the derivation graph is a DAG (cycle participants are
 *      rejected with per-source errors).
 *
 * Timeline bundle aggregation (timelineRef.timelineArtifactId) is an ANCHOR,
 * not a lineage edge: anchors may legitimately precede their bundle (e.g.
 * loading the committed spec example, whose bundle lands later) — dangling
 * anchors are queryable via danglingTimelineAnchors() instead of being
 * rejected or hidden.
 */
import { artifactDescriptorSchema } from "../schema.js";
import type { ArtifactDescriptor } from "../types.js";
import { compareOtioPath } from "./bundle.js";

export interface GraphIssue {
  readonly source: string;
  readonly message: string;
}

export type GraphAddResult =
  | { readonly ok: true; readonly artifact: ArtifactDescriptor }
  | { readonly ok: false; readonly error: GraphIssue };

export interface GraphLoadResult {
  readonly ok: boolean;
  readonly loaded: number;
  readonly errors: readonly GraphIssue[];
}

export type RawArtifactRecordSource = readonly { readonly source: string; readonly data: unknown }[];

export interface GraphStats {
  readonly artifacts: number;
  readonly edges: number;
  readonly revision: number;
}

export interface ArtifactSubtree {
  readonly root: string;
  readonly nodes: readonly ArtifactDescriptor[];
}

export interface DanglingAnchor {
  readonly artifactId: string;
  readonly timelineArtifactId: string;
}

function freezeDescriptor(artifact: ArtifactDescriptor): ArtifactDescriptor {
  return Object.freeze({
    ...artifact,
    producedBy: Object.freeze({ ...artifact.producedBy }),
    derivedFrom: artifact.derivedFrom === undefined ? undefined : Object.freeze([...artifact.derivedFrom]),
    timelineRef: artifact.timelineRef === undefined ? undefined : Object.freeze({ ...artifact.timelineRef }),
    storage: artifact.storage === undefined ? undefined : Object.freeze({ ...artifact.storage }),
    metadata: artifact.metadata === undefined ? undefined : Object.freeze({ ...artifact.metadata }),
  });
}

export class ArtifactGraph {
  #byId = new Map<string, ArtifactDescriptor>();
  #children = new Map<string, string[]>();
  #timelineChildren = new Map<string, string[]>();
  #revision = 0;

  /** Construct from pre-validated descriptors; throws on any invariant break. */
  constructor(initial: readonly ArtifactDescriptor[] = []) {
    const records = initial.map((artifact, index) => ({ source: `initial[${index}]`, data: artifact }));
    const result = this.load(records);
    if (!result.ok) {
      throw new Error(`ArtifactGraph construction failed: ${result.errors.map((e) => `${e.source}: ${e.message}`).join("; ")}`);
    }
  }

  /** Single write path for one artifact: schema → identity → parents → cycles. */
  add(raw: unknown, source = "inline"): GraphAddResult {
    const parsed = artifactDescriptorSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: { source, message: `descriptor validation failed: ${parsed.error.message}` } };
    }
    const artifact = parsed.data;
    if (this.#byId.has(artifact.artifactId)) {
      return { ok: false, error: { source, message: `duplicate artifact id: ${artifact.artifactId}` } };
    }
    for (const parent of artifact.derivedFrom ?? []) {
      if (!this.#byId.has(parent)) {
        return { ok: false, error: { source, message: `unknown parent artifact: ${parent}` } };
      }
    }
    const frozen = this.#accept(artifact);
    return { ok: true, artifact: frozen };
  }

  /**
   * Bulk load in ANY order: batch-aware validation (parents may arrive after
   * children), per-source errors reported, never thrown. Cycle participants
   * and their dependents are rejected deterministically.
   */
  load(records: RawArtifactRecordSource): GraphLoadResult {
    const errors: GraphIssue[] = [];
    const candidates = new Map<string, { source: string; artifact: ArtifactDescriptor }>();
    for (const { source, data } of records) {
      const parsed = artifactDescriptorSchema.safeParse(data);
      if (!parsed.success) {
        errors.push({ source, message: `descriptor validation failed: ${parsed.error.message}` });
        continue;
      }
      const artifact = parsed.data;
      if (this.#byId.has(artifact.artifactId) || candidates.has(artifact.artifactId)) {
        errors.push({ source, message: `duplicate artifact id: ${artifact.artifactId}` });
        continue;
      }
      candidates.set(artifact.artifactId, { source, artifact });
    }

    // Fixpoint: parents must exist in graph ∪ accepted candidates; removing a
    // candidate can orphan others, so re-check until stable.
    let accepted = [...candidates.values()];
    let changed = true;
    while (changed) {
      changed = false;
      const ids = new Set<string>([...this.#byId.keys(), ...accepted.map((c) => c.artifact.artifactId)]);
      accepted = accepted.filter(({ source, artifact }) => {
        for (const parent of artifact.derivedFrom ?? []) {
          if (!ids.has(parent)) {
            errors.push({ source, message: `unknown parent artifact: ${parent}` });
            changed = true;
            return false;
          }
        }
        return true;
      });
    }

    // Cycle rejection over graph ∪ accepted (graph alone is already acyclic).
    const parentsOf = (id: string): readonly string[] => {
      const candidate = candidates.get(id);
      return candidate?.artifact.derivedFrom ?? this.#byId.get(id)?.derivedFrom ?? [];
    };
    const inCycle = findCycleParticipants(accepted.map((c) => c.artifact.artifactId), parentsOf);
    if (inCycle.size > 0) {
      for (const entry of accepted) {
        if (inCycle.has(entry.artifact.artifactId)) {
          errors.push({ source: entry.source, message: `lineage cycle involving: ${entry.artifact.artifactId}` });
        }
      }
      accepted = accepted.filter((c) => !inCycle.has(c.artifact.artifactId));
    }

    for (const { artifact } of accepted) this.#accept(artifact);
    return { ok: errors.length === 0, loaded: accepted.length, errors: Object.freeze(errors) };
  }

  /** Post-hoc lineage edge (work order §2.3 "link lineage"); DAG-safe. */
  linkLineage(childArtifactId: string, parentArtifactId: string, source = "link"): GraphAddResult {
    const child = this.#byId.get(childArtifactId);
    if (child === undefined) {
      return { ok: false, error: { source, message: `unknown artifact: ${childArtifactId}` } };
    }
    if (!this.#byId.has(parentArtifactId)) {
      return { ok: false, error: { source, message: `unknown parent artifact: ${parentArtifactId}` } };
    }
    if (childArtifactId === parentArtifactId) {
      return { ok: false, error: { source, message: "self-lineage is not a DAG edge" } };
    }
    if ((child.derivedFrom ?? []).includes(parentArtifactId)) {
      return { ok: false, error: { source, message: `already linked: ${childArtifactId} -> ${parentArtifactId}` } };
    }
    if (this.ancestorsOf(parentArtifactId).includes(childArtifactId)) {
      return { ok: false, error: { source, message: `link would create a cycle: ${childArtifactId} -> ${parentArtifactId}` } };
    }
    const updated: ArtifactDescriptor = {
      ...child,
      derivedFrom: Object.freeze([...(child.derivedFrom ?? []), parentArtifactId]),
    };
    this.#byId.set(childArtifactId, updated);
    this.#children.get(parentArtifactId)?.push(childArtifactId);
    this.#bumpAnchorIndex(updated);
    this.#revision += 1;
    return { ok: true, artifact: updated };
  }

  #accept(artifact: ArtifactDescriptor): ArtifactDescriptor {
    const frozen = freezeDescriptor(artifact);
    this.#byId.set(frozen.artifactId, frozen);
    for (const parent of frozen.derivedFrom ?? []) {
      const bucket = this.#children.get(parent) ?? [];
      bucket.push(frozen.artifactId);
      this.#children.set(parent, bucket);
    }
    this.#bumpAnchorIndex(frozen);
    this.#revision += 1;
    return frozen;
  }

  #bumpAnchorIndex(artifact: ArtifactDescriptor): void {
    const bundleId = artifact.timelineRef?.timelineArtifactId;
    if (bundleId === undefined) return;
    const bucket = (this.#timelineChildren.get(bundleId) ?? []).filter((id) => id !== artifact.artifactId);
    bucket.push(artifact.artifactId);
    this.#timelineChildren.set(bundleId, bucket);
  }

  get(artifactId: string): ArtifactDescriptor | undefined {
    return this.#byId.get(artifactId);
  }

  has(artifactId: string): boolean {
    return this.#byId.has(artifactId);
  }

  listArtifacts(): readonly ArtifactDescriptor[] {
    return Object.freeze([...this.#byId.values()]);
  }

  /** Derivation children: artifacts whose derivedFrom names this one. */
  childrenOf(artifactId: string): readonly string[] {
    return Object.freeze([...(this.#children.get(artifactId) ?? [])]);
  }

  /** All derivation ancestors (deduped, breadth-first order). */
  ancestorsOf(artifactId: string): readonly string[] {
    const seen: string[] = [];
    const queue = [...(this.#byId.get(artifactId)?.derivedFrom ?? [])];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      if (seen.includes(id)) continue;
      seen.push(id);
      queue.push(...(this.#byId.get(id)?.derivedFrom ?? []));
    }
    return Object.freeze(seen);
  }

  /** All derivation descendants (deduped, breadth-first order). */
  descendantsOf(artifactId: string): readonly string[] {
    const seen: string[] = [];
    const queue = [...(this.#children.get(artifactId) ?? [])];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      if (seen.includes(id)) continue;
      seen.push(id);
      queue.push(...(this.#children.get(id) ?? []));
    }
    return Object.freeze(seen);
  }

  /** Root + derivation subtree, breadth-first (workspace rendering view). */
  subtreeOf(artifactId: string): ArtifactSubtree {
    const root = this.#byId.get(artifactId);
    const nodes: ArtifactDescriptor[] = root === undefined ? [] : [root];
    for (const id of this.descendantsOf(artifactId)) {
      const artifact = this.#byId.get(id);
      if (artifact !== undefined) nodes.push(artifact);
    }
    return { root: artifactId, nodes: Object.freeze(nodes) };
  }

  /**
   * Timeline bundle members: artifacts anchored into the bundle via
   * timelineRef.timelineArtifactId, ordered by otioPath then artifactId.
   */
  timelineChildrenOf(bundleId: string): readonly ArtifactDescriptor[] {
    const ids = this.#timelineChildren.get(bundleId) ?? [];
    const members = ids
      .map((id) => this.#byId.get(id))
      .filter((a): a is ArtifactDescriptor => a !== undefined)
      .sort((a, b) => {
        const pathA = a.timelineRef?.otioPath ?? "";
        const pathB = b.timelineRef?.otioPath ?? "";
        return pathA === pathB ? a.artifactId.localeCompare(b.artifactId) : compareOtioPath(pathA, pathB);
      });
    return Object.freeze(members);
  }

  /** Anchors whose bundle is not in the graph (diagnostics; P5 surfacing). */
  danglingTimelineAnchors(): readonly DanglingAnchor[] {
    const dangling: DanglingAnchor[] = [];
    for (const artifact of this.#byId.values()) {
      const bundleId = artifact.timelineRef?.timelineArtifactId;
      if (bundleId !== undefined && !this.#byId.has(bundleId)) {
        dangling.push({ artifactId: artifact.artifactId, timelineArtifactId: bundleId });
      }
    }
    return Object.freeze(dangling);
  }

  stats(): GraphStats {
    let edges = 0;
    for (const artifact of this.#byId.values()) edges += artifact.derivedFrom?.length ?? 0;
    return { artifacts: this.#byId.size, edges, revision: this.#revision };
  }
}

/** Nodes of `seeds` (plus anything reachable through parentsOf) on a cycle. */
function findCycleParticipants(
  seeds: readonly string[],
  parentsOf: (id: string) => readonly string[],
): Set<string> {
  const participants = new Set<string>();
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  function visit(node: string): void {
    state.set(node, 1);
    stack.push(node);
    for (const parent of parentsOf(node)) {
      if (state.get(parent) === 1) {
        const index = stack.indexOf(parent);
        for (let i = index; i < stack.length; i += 1) {
          const id = stack[i];
          if (id !== undefined) participants.add(id);
        }
        participants.add(parent);
      } else if (!state.has(parent)) {
        visit(parent);
      }
    }
    stack.pop();
    state.set(node, 2);
  }
  for (const seed of seeds) if (!state.has(seed)) visit(seed);
  return participants;
}
