# Pluggable search plane (W13)

The lab's candidate search (spec/organization-lab.md §2) is a **pluggable
engine** behind a registry. The OUTPUT contract is frozen by
`spec/schemas/organization-graph.schema.json` — ranked, schema-valid candidate
`OrganizationGraph`s per goal class — only the ENGINE is replaceable
("rule-based first, learned later").

## Port

```ts
interface SearchMethod {
  name: string;
  search(request: OrganizationSearchRequest): MethodSearchResult; // + telemetry
}
```

- **Selection** is via the request (`request.method`), default `"rule"`.
- **Registration**: `registerSearchMethod(method)` returns an unregister
  handle; future RL methods slot in without touching callers.
- **Dispatch**: `runOrganizationSearch(request)` (full result + telemetry) and
  the legacy `searchOrganizations(request)` (same four fields as before W13,
  rule behavior-identical).
- **Telemetry** (candidates considered, evaluations run, wall time, seed) is
  emitted on every run and rides the lab pipeline's run record
  (`EvaluationPipelineResult.searchTelemetry`); committed evaluation records
  stay reproducible artifacts — wall time is operational metadata only.

## Methods

| method | idea | budget knob |
| --- | --- | --- |
| `rule` | deterministic enumeration over the five dimensions (pre-W13 engine, byte-identical) | `maxCandidates` |
| `beam` | level-by-level expansion (role structure → topology → tool → exec → budget), top-K by the preScore surrogate (schema validation + partial scoring), full evaluation on survivors | `beamWidth`, `evaluationBudget` |
| `evolutionary` | population of dimension profiles; mutation across all five dimensions incl. per-body model overrides (P2); elitist (μ+λ) selection by simulated fitness | `populationSize`, `generations`, `evaluationBudget` |
| `bandit` | each dimension profile is an arm; UCB1 over deterministic simulated-fitness rewards | `rolloutBudget`, `evaluationBudget` |

## Shared machinery

- `candidate-space.ts` — the DimensionProfile space + the single candidate
  factory every method emits through (schema-valid graphs, frozen id/seed
  conventions; `rule` keeps the legacy `org.<class>-cand-XX` strings).
- `fitness-oracle.ts` — build + simulate + evaluate with per-run caching;
  deterministic (seeded simulation, no network). Without scenarios it degrades
  to the preScore surrogate and methods surface that as an issue.

## Determinism law

Every method is deterministic given the request (incl. seed): rule/beam/bandit
(UCB1) use no randomness; evolutionary uses `seedFromString` (mulberry32).
Never `Math.random`. Same seed → same ranked output (tested per method).
