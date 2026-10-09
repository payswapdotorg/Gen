# Organization lab (MOS) — Gen Creative Intelligence OS

Status: **CONTRACT v1.0** (Phase 0, locked by ARCHITECTURE_LOCK.md v1.0.0)
Owner: TL (contract) · Worker 3 (implementation)
Schema: [`schemas/organization-graph.schema.json`](schemas/organization-graph.json)
→ actual filename: `organization-graph.schema.json`

> The lab is where Gen **learns optimal agent organizations for user goals**
> (mission item 5). It searches over organization graphs, simulates them,
> evaluates fitness, and certifies winners. It is NOT a hard-coded
> "spawn 5 agents" helper — the org itself is a searched artifact.

## 1. Organization graph

An `OrganizationGraph` (schema) for a goal:

- `goal` + `goalClass` (e.g. "documentary-cinematic-remaster",
  "character-replacement-edit", generic classes for routing).
- `nodes`: `agent-instance` (bound body+model per the agent-body model),
  `human` (roles/approval gates), `capability-invocation` (capability +
  parameter bindings consumed by the plan).
- `edges`: `delegation` (who commands whom), `review` (critic loops),
  `artifact-flow` (producer → consumer), `approval` (human gates).
- `allocations`: per-node model allocation (body↔model bindings), tool /
  capability allocation, budget allocation, and `executionOrder` (stages with
  dependencies — the orchestration plan).

## 2. Search space (binding — the five dimensions)

The lab's search MUST cover, per goal class:

```
role structure          // which bodies, how many, review topology
tool allocation         // capability grants per body (possession config)
model allocation        // which model inhabits each body (per requirement class)
execution ordering      // stage graph, parallelism, checkpoints
budget allocation       // spend envelope per node and per stage
```

Search output = candidate `OrganizationGraph`s ranked by evaluation. The
search engine itself is pluggable (rule-based first, learned later); the
OUTPUT contract is fixed by the schema.

### 2.1 Search-method registry (binding)

The pluggable search engine is a method registry (W13): `request.method`
selects the method (default `"rule"`); registered methods are `rule`,
`beam`, `evolutionary`, `bandit`; new methods register via
`registerSearchMethod` with zero caller changes. Every method is bound by
the evaluation budget and writes search telemetry into the pipeline run
record.

## 3. Simulation environment

- Deterministic and replayable: seeded scenario, frozen capability mocks /
  recorded adapter traces, virtual clock. No network in simulation.
- Scenario fixtures: goal + input artifacts + environment stubs; committed
  under the lab's scenarios directory (git-tracked).
- Simulated runs produce run records: event traces, artifacts, cost/latency
  accounting, per-node telemetry (bounded), and TaskPlan streams (P4 — the
  plan is observable in simulation too).

## 4. Evaluation loop

Fitness per candidate org (configurable weights per goal class):

```
fitness = w_goal·goal_achievement      // scenario's success criteria
        + w_quality·Σ quality_scores   // via capability conformance scales
        + w_cost·cost_efficiency       // actual simulated spend vs budget
        + w_latency·time_to_result     // virtual clock
        + w_human·human_load           // approvals demanded of the user
        - w_failure·gap_penalty        // capability-gap reports emitted
```

- Evaluation records are committed artifacts (numbers reproducible from seed).
- **Certification bar**: a candidate org may be marked `certified` for a
  goal class only with (a) replayed evaluation at a pinned scenario set,
  (b) fitness ≥ threshold, (c) zero unresolved gap reports. Certification
  evidence is committed (schema `evaluation.certificationEvidence`).
- Top-k certified orgs per goal class persist in the lab's directory — the
  "learning" the system accumulates.

## 5. Runtime vs lab

- The lab designs and certifies organizations; the runtime executes a
  certified (or explicitly uncertified-trial) org against real providers via
  the capability router. Execution telemetry (opt-in, privacy-scrubbed) can
  seed new simulation scenarios — the flywheel.
- A runtime failure that no certified org avoids becomes a gap report
  (capability or organizational) → Arena.

## 6. Acceptance mapping

- **T2** ("Make this documentary cinematic") → the lab must be able to
  assemble/certify the Director/Editor/Color/Audio/Critic organization for
  the documentary goal class, with per-node bodies from the body registry.
- Organization fitness must respond to budget/policy changes (cheapest vs
  premium) — connects to **T3**.
