# Creative acceptance battery — T1–T5

The program's definition of done (ARCHITECTURE_LOCK.md §9), exercised twice
per test: once at the **domain layer** (the pure decision functions over the
composed planes) and once **end-to-end** through the built-out Phase 2
surface — the chain a user actually experiences:

```
route → organize → execute → show plan → link evidence → lineage-audit
```

Run everything with:

```bash
pnpm acceptance
```

Committed records only — no fixtures, no network, no secrets (lock §8, P8).

## T1 — provider-neutral capability routing

> "Replace this actor with my character." → Higgsfield **or** Wan/VACE per
> routing policy; provider neutrality = policy over facts, never vendor
> hard-wiring.

| Layer | File | What it proves |
|---|---|---|
| Domain | `t1-provider-neutral-routing.test.ts` | The composed registry (media + editor planes) routes the SAME capability to different valid provider tiers by policy; decisions are reproducible and traced, not vendor-bound. |
| End-to-end | `t1-end-to-end.test.ts` | The routing decisions (premium-first → higgsfield, cheapest-reliable → wan-2.2) feed the workspace `replace-actor-alternatives` mount: the alternatives view-model carries REAL deltas whose current/candidate values equal the committed provider evaluation record rows, and the switching surface (cost/quality/latency/reliability, before-switching, per spec/task-plan.md §3) is present with provenance on every row. |

## T2 — agent organization lab

> "Make this documentary cinematic." → the Director / Editor / Color /
> Audio / Critic organization, searched → simulated → evaluated → certified
> over the REAL registry catalog.

| Layer | File | What it proves |
|---|---|---|
| Domain | `t2-documentary-organization.test.ts` | The lab's catalog derives from the composed registry index; the documentary-cinematic organization certifies; a weaker scenario set refuses certification (never fabricated). |
| End-to-end | `t2-end-to-end.test.ts` | The certified run projects into the workspace `documentary-cinematic` mount: plan header + run parity pinned to the committed evaluation record (replay hash, telemetry, criteria); every completed item's evidence links resolve to run events / gate results with verbatim detail; the certified organization is visible with fitness, bodies, per-node models and committed certification evidence; the run's artifact refs audit through the timeline lineage surface (`lineageOf` full ancestor chain with producedBy, `subtreeOf` bundle renderable set). |

## T3 — cost-aware routing

> "Use cheapest reliable method." → open models + LOCAL tools over premium
> providers.

| Layer | File | What it proves |
|---|---|---|
| Domain | `t3-cost-aware-routing.test.ts` | cheapest-reliable prefers the LOCAL tier for editing capabilities; premium-first still reaches premium for generative work; local-first is honored across the editor plane; cost policy never returns a below-reliability mapping. |
| End-to-end | `t3-end-to-end.test.ts` | The routing chain traces to committed evaluation records (routed cost/latency = the record's rows); the workspace's active alternative is the cheapest-reliable open-model/local-tools path with its cost/latency facts from the committed frozen catalog (premium escape = +$1.10/decision, 12.0x, derived not hand-written); the open-model delta table's provenance cites the committed media-providers evaluation record and its numbers ARE that record's rows; the certified run stayed within the budget envelope. |

## T4 — gap detection / escalation

> The system fails → `CapabilityGapReport` (+ Arena submission), never
> hallucination.

| Layer | File | What it proves |
|---|---|---|
| Domain | `t4-gap-report.test.ts` | A routing failure produces a traceable failure; the committed forced-failure gap report is schema-valid; the arena state machine advances through certification and publishing into the registry/catalog; unresolved gaps refuse availability. |
| End-to-end | `t4-end-to-end.test.ts` | The forced failure → gap report → workspace `forced-failure` blocked view: the blocked item links the REAL committed gap report (arena state, severity, router trace, source path), the mounted run is the run the gap cites (`organizationRunRef` parity, gap-signaled events), certification is honestly refused with the committed refusal record, and a completed item's artifact ref yields a timeline lineage evidence descriptor — the P4 tie-in: what made this, with which capability/provider (`art.seg1-replaced-v1` → `video.character-replacement` / higgsfield / genjutsu). |

## T5 — search-method pluggability (W13 registry, W17 battery)

> organization-lab §2.1: the search engine is a pluggable method registry —
> determinism, budget, and telemetry are binding laws, not hints.

| Layer | File | What it proves |
|---|---|---|
| Domain | `t5-search-method-pluggability.test.ts` | A registered custom method dispatches by `request.method` with zero caller changes (unregister restores); same-seed determinism is byte-equality on output AND telemetry (`wallTimeMs` excluded); evolutionary seed-sensitivity is real, beam is seed-independent; the budget law binds every method (3 ≤ cap < unbounded); telemetry carries the frozen public key set; unknown methods fail loudly; built-ins register in spec §2.1 order with `rule` as the default. |
| End-to-end | `t5-end-to-end.test.ts` | The evaluation pipeline carries `searchTelemetry` (frozen keys) for every method; the rule-parity anchor — evolutionary at budget 24 finds the committed optimum (fitness 0.8398, replayHash `3474f812`); `evaluationBudget` caps the pipeline end-to-end; same-seed runs certify the identical graph with deep-equal telemetry (`wallTimeMs` excluded). |

## Harness layout

```
scripts/creative/acceptance/
├── t1-provider-neutral-routing.test.ts   # T1 domain (lock §9)
├── t1-end-to-end.test.ts                # T1 e2e  (routing → alternatives view)
├── t2-documentary-organization.test.ts  # T2 domain
├── t2-end-to-end.test.ts                # T2 e2e  (org run → scenario A projection + lineage)
├── t3-cost-aware-routing.test.ts        # T3 domain
├── t3-end-to-end.test.ts                # T3 e2e  (cost-aware routing → open/local path + provenance)
├── t4-gap-report.test.ts                # T4 domain
├── t4-end-to-end.test.ts                # T4 e2e  (forced failure → gap report → blocked view + descriptor)
├── t5-search-method-pluggability.test.ts # T5 domain (registry laws: pluggability, determinism, budget, telemetry)
├── t5-end-to-end.test.ts                # T5 e2e  (pipeline telemetry, rule-parity anchor, budget cap, twin runs)
├── lib/
│   ├── compose-registry.ts              # the canonical registry index (media + editor + Arena extras)
│   ├── plane.ts                         # the provider plane (providers + local tools + evaluations) → routing facts
│   └── e2e-lib.ts                      # workspace mounts + committed timeline graph + shared formatters
└── data/
    └── local-tool-providers/            # local software-tool provider descriptors joining the plane
```

Domain-layer tests compose the planes through `lib/compose-registry.ts` and
`lib/plane.ts` (the W1 evidence machine feeding the router). End-to-end tests
REUSE those libs and add the Phase 2 surfaces through `lib/e2e-lib.ts`:
the creative-workspace mounts (committed record bundles projected into
TaskPlan view models) and the committed timeline artifact graph
(`packages/timeline` launch records — the run-0009 documentary interview
chain). No composition logic is duplicated between the layers.

## Views under test (apps/creative-workspace scenarios)

| Scenario | Mount | Chain |
|---|---|---|
| A — `documentary-cinematic` | committed certified org + evaluation + replayed run | T2 (also T3's active cheapest-reliable run) |
| B — `forced-failure` | the attempting org, the gap-citing run, the committed gap report | T4 |
| C — `replace-actor-alternatives` | the committed spec-example plan + provider evaluation deltas | T1 (and T3's evaluation-record provenance) |
