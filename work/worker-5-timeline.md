# Worker 5 — Timeline (project artifact graph, P1 chain terminal)

## 1. Mission

Build out `@gen/timeline` (`packages/timeline/`): the PROJECT ARTIFACT
GRAPH — content-addressed artifacts with lineage over OpenTimelineIO
exchange. Every capability execution's output lands here with its
producing metadata; every derivation is an edge. The chain P1 → P3 →
P5 ends at this layer: gap reports cite artifacts, editor projects
reference the timeline bundle, and the workspace surfaces lineage.
Your work must make the artifact lineage chain real at Phase 2
integration.

## 2. Tasks (in order)

### A. Schema bindings
1. Zod binding for `spec/schemas/artifact.schema.json`
   (ArtifactDescriptor) — parity mandatory, JSON Schema is source of
   truth (pattern: `@gen/media-capabilities/src/domain/schema.ts`).
2. Validate the committed example artifacts if any exist; author the
   launch examples under `src/domain/examples/` mirroring the spec
   examples' style (video artifact, editor-project artifact,
   timeline-bundle artifact — each with `producedBy` + lineage edges).

### B. Artifact graph domain
3. Artifact graph store (in-memory + git-tracked record files under
   `src/domain/graph/`): add artifacts, link lineage, query lineage
   (ancestors/descendants), DAG validation (parent exists, no cycles,
   contentAddress format).
4. `producedBy` is REQUIRED and structured (capabilityId mandatory;
   providerId/modelId/executionAdapter/executionId/agentInstanceId
   optional but validated when present) — the P3 tie-in.
5. Timeline bundle handling: `application/vnd.gen.timeline-bundle+json`
   artifacts aggregate timeline-articulate children via `timelineRef`
   (otioPath + timelineArtifactId).

### C. OTIO interchange
6. OTIO import: accept an OTIO JSON timeline, map to artifact graph
   nodes (one bundle artifact + child artifacts per track/item with
   timelineRef anchors). Reuse/align with `@gen/editor-adapters` OTIO
   model types via dependency — do NOT duplicate the parser; if reuse
   is impractical, import its exported model types and map.
7. OTIO export: a subgraph (bundle + children) back to OTIO JSON.
8. Round-trip property: import(export(x)) is stable for the fields the
   graph owns (ids/refs may differ; structure must round-trip).

### D. Lineage queries (Phase 2 consumers)
9. `lineageOf(artifactId)`: full ancestor chain with producing
   metadata — the audit view (what made this, with which capability,
   which provider, which evidence).
10. `childrenOf(artifactId)` + `subtreeOf(bundleId)` for workspace
    rendering.
11. Lineage evidence for TaskPlan `completed` items: given an artifact
    ref, produce the evidence descriptor the workspace links (P4
    tie-in).

## 3. Boundaries (lock §5/§8 — binding)

- You own ONLY `packages/timeline/**`. No edits to `spec/**`, other
  packages, or root/shared files; requests go in the report.
- Binary content is NEVER inline: contentAddress refs only (sha256 of
  bytes; the store validates format, it does not store bytes).
- Reuse `@gen/editor-adapters` OTIO model via workspace dependency;
  add it to package.json deps. Do not modify it.
- No network, no fs in the domain layer (adapters/ports only, pattern
  per `@gen/media-capabilities`).
- No secrets (P8). Layer rules apply (governance skill).

## 4. Verification gates (must pass at your pushed SHA)

```bash
git clone https://github.com/payswapdotorg/Gen.git && cd Gen
git checkout <wave2-sha>          # base per your dispatch packet
corepack enable || npm i -g pnpm@10.33.2
pnpm install --ignore-scripts
pnpm --filter @gen/timeline typecheck && pnpm --filter @gen/timeline build
pnpm lint                        # zero NEW violations in your files
node scripts/architecture/architecture-check.mjs check   # 0 new violations
pnpm spec:validate
# + your own test entrypoints (declared in package.json scripts.test)
```

## 5. Report format (COMPLETION REPORT — last message, exact)

```
COMPLETION REPORT — Worker 5 (Timeline)
Base SHA: <wave2-sha>   Branch: w5-timeline   Head SHA: <sha>
Gate table:
  typecheck/build: <real numbers>
  lint: <violations before/after in YOUR files>
  architecture: <new violations count>
  spec:validate: OK/FAIL
  tests: <counts>
Schema parity: <artifact schema bound, examples valid>
Graph: <store ops, DAG validations, lineage queries — test coverage>
OTIO: <import/export/round-trip evidence, reuse of editor-adapters model>
Lineage evidence: <TaskPlan evidence descriptor shape>
Contract change requests: <none | list with rationale>
```
