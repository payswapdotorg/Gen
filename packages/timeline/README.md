# @gen/timeline

Project artifact graph: the P1 chain terminal (`Provider → Model → Capability → Execution Adapter → Artifact`). Content-addressed artifacts with lineage over OpenTimelineIO interchange — every capability execution's output lands here with its producing metadata; every derivation is an edge.

Contract: [`src/contract.ts`](src/contract.ts) mirrors the TL-owned schemas in [spec/schemas/](../../spec/schemas/) (parity is mandatory) and re-exports the zod bindings, graph store, OTIO interchange and lineage surface.
Ownership + rules: [ARCHITECTURE_LOCK.md](../../ARCHITECTURE_LOCK.md) §5. Work order: [work/worker-5-timeline.md](../../work/worker-5-timeline.md).
Layers: `src/domain` (pure) → `src/app` (ports) → `src/adapters` (execution) per .agents/skills/architecture-governance/SKILL.md.

## Layout

| Path | Content |
|---|---|
| `src/domain/schema.ts` | Zod binding for `spec/schemas/artifact.schema.json` (ArtifactDescriptor — parity mandatory) |
| `src/domain/types.ts` | Hand-mirrored public types (frozen compatibility surface consumed by `@gen/editor-adapters`) |
| `src/domain/otio.ts` | Zod binding of the OTIO structural subset — field-for-field aligned with `@gen/editor-adapters`' OTIO model (see alignment note in the file; model reuse via dependency is CCR #2), canonical serializer with the same key-order contract |
| `src/domain/graph/store.ts` | `ArtifactGraph` — in-memory single-owner index: add / load (any order) / linkLineage, DAG invariants (parents exist, no cycles, contentAddress format), bundle aggregation queries |
| `src/domain/graph/lineage.ts` | `lineageOf` (audit view: ancestors + producing metadata + derivation chains), `lineageEvidence` / `taskPlanEvidenceRefs` (P4 tie-in), `queryArtifacts` (Phase 0 `LineageQuery`) |
| `src/domain/graph/bundle.ts` | Timeline-bundle vocabulary + media types + deterministic otioPath ordering |
| `src/domain/otio-import.ts` | OTIO JSON → bundle + track/item child artifacts with `timelineRef` anchors, verbatim fragments + structural slots, media-ref extraction (`metadata.gen.assetId`, `art.*` in `target_url`) |
| `src/domain/otio-export.ts` | Subgraph (bundle + children) → OTIO JSON; unplaced anchored members are reported, never dropped |
| `src/domain/graph/records/` | Git-tracked launch-graph record files (data, not code) — the run-0009 story incl. the schema-conformant adaptation of the committed spec example |
| `src/domain/examples/` | Launch examples (spec-example style): video, editor-project, timeline-bundle + bundle children |
| `src/app/ports.ts` + `src/app/graph-service.ts` | `ArtifactRecordSource` port, `ContentAddresser` port, `TimelineGraphService` (Phase 2 entrypoint) |
| `src/adapters/fs-record-source.ts` | Filesystem record loader (the only place graph loading touches fs) |
| `src/adapters/node-content-address.ts` | sha256 content addressing (node:crypto stays in adapters) |
| `src/adapters/ajv-validate.ts` + `validate-records-cli.ts` | ajv 2020-12 × zod parity harness + record gate CLI |

## Invariants

- Binary content is NEVER inline: `contentAddress` refs only (`sha256:<64 hex>` of bytes stored elsewhere); the store validates FORMAT, it does not store bytes.
- `producedBy` is required and structured: `capabilityId` mandatory (P3); providerId/modelId/executionAdapter/executionId/agentInstanceId optional but validated when present.
- The derivation graph is a DAG: parents must exist, cycles are rejected with per-source errors (P5 — surfaced, never swallowed).
- Timeline bundles (`application/vnd.gen.timeline-bundle+json`) aggregate timeline-articulate children via `timelineRef` (otioPath + timelineArtifactId); dangling anchors are queryable, not hidden.
- Round-trip: `import(export(x))` is stable for the fields the graph owns (ids/refs may differ; structure round-trips — byte-stably in the canonical serialization).
- Launch-record contentAddresses are sha256 of the record identity basis `gen-artifact/<artifactId>` (real ingest addresses sha256 of the artifact bytes).

## Known spec inconsistency (CCR #1)

`spec/schemas/artifact.schema.json`'s `artifactId` pattern `^art\.[a-z0-9-]+$` rejects the committed example `spec/examples/artifact.segment-replaced.json` (`art.seg1.replaced.v1` — dotted ids) and the `timelineArtifactId` it cites (`art.timeline.run-0009`). ajv and the zod mirror AGREE on the rejection (parity holds; see `test/schema-parity.test.ts`). The finding is reported informationally by the record gate; the launch graph uses schema-conformant ids (`art.seg1-replaced-v1`, `art.timeline-run-0009`).

## Gates

```bash
pnpm --filter @gen/timeline typecheck && pnpm --filter @gen/timeline build
pnpm --filter @gen/timeline validate   # ajv × zod parity + DAG integrity over records/examples
pnpm --filter @gen/timeline test       # typecheck:tests + node:test via tsx (30 tests)
```
