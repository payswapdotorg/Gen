# WORK ORDER — Worker 3: MOS Lab + Arena Evolution

Status: **READY TO DISPATCH** (Phase 1) · Branch: `w3-mos-lab-arena`
Owner: Worker 3 (per ARCHITECTURE_LOCK.md §5)
Scope: `packages/agent-lab/**`, `packages/arena-bridge/**`
Read-first: `ARCHITECTURE_LOCK.md` (binding), `spec/agent-body-model.md`,
`spec/organization-lab.md`, `spec/human-escalation-contract.md`,
`spec/schemas/agent-body.schema.json`,
`spec/schemas/agent-instance.schema.json`,
`spec/schemas/organization-graph.schema.json`,
`spec/schemas/capability-gap.schema.json`, `AGENTS.md`,
`.agents/skills/architecture-governance/SKILL.md`.

## 1. Mission

Implement the Agent Organization Lab (bodies, model assignment,
organization search over the five binding dimensions, simulation,
evaluation, certification) and the Arena bridge (gap store, requests,
expert ingest, certification validation). Your work must make acceptance
**T2** (documentary-cinematic organization) and **T4** (failure → gap
report, never hallucination) real at Phase 2.

## 2. Tasks (in order)

### A. Agent bodies (`@gen/agent-lab`)
1. Zod bindings for the agent-body and agent-instance schemas (parity
   mandatory; JSON Schemas are source of truth).
2. Body registry: git-tracked descriptors under `src/domain/bodies/`,
   in-memory index, possession-class validation at binding, model
   requirement classes ONLY (naming a concrete model id in a body
   descriptor is a lock violation §8.2).
3. Author the launch bodies (status per lifecycle):
   `body.director`, `body.video-editor`, `body.color-specialist`,
   `body.audio-specialist`, `body.critic`, plus
   `body.video-continuity-supervisor` (model on
   `spec/examples/agent-body.video-continuity-supervisor.json`).

### B. Organization lab (`@gen/agent-lab`)
4. OrganizationGraph zod binding + graph validation (node/edge/stage
   invariants: edges reference existing nodes, stages reference existing
   nodes, no cycles in dependsOn).
5. Search over the five binding dimensions (role structure, tool
   allocation, model allocation, execution ordering, budget allocation) —
   rule-based search engine first (pluggable: the OUTPUT contract is the
   schema, the engine is replaceable).
6. Simulation environment: deterministic + replayable (seeded scenarios,
   frozen capability mocks, virtual clock, no network), scenario fixtures
   committed under `src/domain/scenarios/` — including
   `documentary-cinematic` (T2) and a seeded-failure scenario (T4).
7. Evaluation loop: the fitness function per `spec/organization-lab.md`
   §4 with configurable weights; evaluation records committed and
   reproducible from seed; certification bar (scenario set + fitness
   threshold + zero unresolved gaps) with evidence records.
8. TaskPlan production in simulation (P4): stages emit plan updates —
   same schema as the runtime.

### C. Arena bridge (`@gen/arena-bridge`)
9. Gap store: git-tracked reports under `src/domain/gaps/`, schema-valid,
   append-oriented.
10. Arena state machine per `spec/human-escalation-contract.md` §1:
    detected → reported → arena-requested → expert-session → proposed →
    certifying → certified → available (+ rejected/wont-fix) — as pure
    state transitions over the store, with expert-session record ingest
    and certification-evidence validation (standard capability gate; no
    Arena exemption).
11. Lab-availability publisher: certified capabilities/mappings become
    visible to the registry index + org search (via the contract
    surfaces — the index itself lives in `@gen/media-capabilities`, do
    not build a second one).

### D. Acceptance wiring
12. T2 scenario: the lab assembles + certifies the Director / Editor /
    Color / Audio / Critic organization for the documentary goal class.
13. T4 scenario: a forced capability failure produces a schema-valid gap
    report with evidence, and optionally an arena request — assert BOTH
    paths; never a fabricated result.

## 3. Boundaries (lock §5/§8 — binding)

- You own ONLY `packages/agent-lab/**` and `packages/arena-bridge/**`.
  No edits to `spec/**`, other packages, or root/shared files; requests go
  in the report.
- Bodies never name concrete model ids (P2). Cognitive models bind via the
  provider plane only.
- Simulation is hermetic: no network, no real provider calls (mocks are
  declared in scenario fixtures).
- No secrets (P8). Layer rules apply (governance skill).

## 4. Verification gates (must pass at your pushed SHA)

```bash
git clone https://github.com/payswapdotorg/Gen.git && cd Gen
git checkout <phase-0-sha>       # base per your dispatch packet
corepack enable || npm i -g pnpm@10.33.2
pnpm install --ignore-scripts
pnpm --filter @gen/agent-lab typecheck && pnpm --filter @gen/agent-lab build
pnpm --filter @gen/arena-bridge typecheck && pnpm --filter @gen/arena-bridge build
pnpm lint                        # zero NEW violations in your files
node scripts/architecture/architecture-check.mjs check   # 0 new violations
pnpm spec:validate
# + your own test entrypoints (declared in package.json scripts.test)
```

## 5. Report format (COMPLETION REPORT — last message, exact)

```
COMPLETION REPORT — Worker 3 (MOS Lab + Arena)
Base SHA: <phase-0-sha>   Branch: w3-mos-lab-arena   Head SHA: <sha>
Gate table:
  typecheck/build: <real numbers, per package>
  lint: <violations before/after in YOUR files>
  architecture: <new violations count>
  spec:validate: OK/FAIL
  tests: <counts, per package>
Bodies: <registry list with versions/lifecycle states>
Organizations: <graphs produced, certified?, fitness numbers>
Scenarios: <ids, deterministic replay evidence>
Arena: <state machine coverage, gap store entries, certification records>
Acceptance: <T2 status, T4 status>
Contract change requests: <none | list with rationale>
Divergences from this work order: <none | list>
```

The TL re-runs every gate at your pushed SHA (lock §8.10).
