# Task plan (Zcode-style planning) — Gen Creative Intelligence OS

Status: **CONTRACT v1.0** (Phase 0, locked by ARCHITECTURE_LOCK.md v1.0.0)
Owner: TL (contract) · creative-workspace (surface) · agent-lab (production)
Schema: [`schemas/task-plan.schema.json`](schemas/task-plan.schema.json)

> **P4 (lock §2): the user should never see a black-box generation
> process.** Every user-facing workflow exposes a live TaskPlan. This is the
> collaboration surface between humans and the agent organization.

## 1. Structure (binding)

```
TaskPlan
    goal          what the user wants (their words, normalized)
    currentStep   what the AI organization is doing RIGHT NOW
    completed     [ { item, evidence } ]   evidence = artifact refs,
                                            run-record refs, gate results
    next          [ upcoming actions ]     ordered, with owner (node) refs
    blocked       [ { reason, kind: capability|provider|input|human-approval,
                      capabilityGapRef?, missingInput? } ]
    alternative   [ { path, tradeoffs } ]  available routing paths the user
                                           may switch to
```

- `completed` REQUIRES evidence refs — claims without evidence are lock
  violations (P4 exists to make verification ambient).
- `blocked` entries with `kind: "capability"` MUST reference a gap report
  (P5 tie-in).
- `alternative` entries surface router choices (premium vs open models,
  fast vs quality) — this is how the user steers routing (T3's "cheapest
  reliable" path is one of these).

## 2. Lifecycle

- A TaskPlan is created at intent intake, updated at every stage transition
  and approval gate, and frozen at completion with final evidence.
- Plans are streamed to the workspace UI (progress visibility) and persisted
  in run records (P6).
- Simulation produces TaskPlans too (organization-lab §3) — the same schema
  in sim and runtime.

## 3. UI obligations (apps/creative-workspace)

- The plan is always visible during execution; every completed item links
  its evidence; every blocked item links its gap report; alternatives are
  switchable with cost/latency/quality deltas shown before switching.
- No workflow may present an indefinite spinner without a live TaskPlan
  behind it.
