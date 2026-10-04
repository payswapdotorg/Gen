# Worker 4 — Creative Workspace (user-facing P4 UI)

## 1. Mission

Build out `@gen/creative-workspace` (`apps/creative-workspace/`): the
INTENT UNDERSTANDING LAYER's user surface — the TaskPlan UI that makes
"no black-box generation" (lock P4) real for the human operator. The
workspace renders REAL program records (agent-lab simulation evidence,
TaskPlans, gap reports, routing alternatives) from the committed files —
never fabricated demo data. Your work must make spec/task-plan.md §3
(UI obligations) pass at Phase 2 integration.

## 2. Tasks (in order)

### A. UI foundation
1. React 19 component layer under `src/ui/` (workspace `react` version
   from the monorepo; no new heavyweight deps without report
   justification). Keep the package's library-style export: the app is
   consumed by a shell later; include a thin demo harness page that
   mounts the workspace with committed records.
2. `src/app/` wiring: record loading ports (filesystem-backed first —
   read the committed evidence JSONs from `@gen/agent-lab` and
   `@gen/arena-bridge` via declared dependencies, never raw fs in
   components).

### B. TaskPlan view (spec/task-plan.md §3 — binding)
3. Plan header: goal + current step, always visible during execution.
4. `completed` items each link their evidence (artifact refs, run-record
   refs, gate results) — no evidence, no completion mark.
5. `blocked` items: reason + kind; `kind: capability` items link the gap
   report (pull real gap JSONs from the arena gap store).
6. `alternative` paths: switchable UI with cost/latency/quality deltas
   shown BEFORE switching (from provider routing facts /
   `@gen/media-providers` evaluations when available; else declared
   tradeoff metadata).
7. No indefinite spinner without a live TaskPlan behind it (empty and
   loading states show the plan skeleton, not a bare spinner).

### C. Data contracts
8. Extend `src/contract.ts` additively (types already mirror
   task-plan.schema.json): add view-model types for evidence links, gap
   links, alternative deltas. Schema parity is mandatory —
   task-plan.schema.json stays source of truth; no field drift.
9. Zod bindings for the task-plan schema in `src/domain/` (parity test
   against the canonical schema, mirroring the pattern in
   `@gen/media-capabilities/src/domain/schema.ts`).

### D. Demo wiring (acceptance-facing)
10. Harness scenario A (T2): mount the workspace with the committed
    documentary-cinematic run record — plan, stages, evidence, certified
    organization visible.
11. Harness scenario B (T4/blocked): mount with the forced-failure run —
    blocked item links the real gap report
    (`gap.forced-failure-video-character-replacement.json`).
12. Harness scenario C (alternatives): mount with a plan carrying at
    least two alternative paths with real deltas (premium vs open-model
    from the provider catalog data).

## 3. Boundaries (lock §5/§8 — binding)

- You own ONLY `apps/creative-workspace/**`. No edits to `spec/**`,
  `packages/**`, or root/shared files; requests go in the report.
- Data comes from committed records via package dependencies
  (`@gen/agent-lab`, `@gen/arena-bridge`, `@gen/media-providers` as
  needed — add them as workspace deps). No network, no fake fixtures.
- Component layer stays pure (no IO); adapters load records.
- No secrets (P8). Layer rules apply (governance skill).
- React 19 only; no CSS framework imports without report justification
  (plain CSS modules / inline styles are fine).

## 4. Verification gates (must pass at your pushed SHA)

```bash
git clone https://github.com/payswapdotorg/Gen.git && cd Gen
git checkout <wave2-sha>          # base per your dispatch packet
corepack enable || npm i -g pnpm@10.33.2
pnpm install --ignore-scripts
pnpm --filter @gen/creative-workspace typecheck
pnpm --filter @gen/creative-workspace build
pnpm lint                        # zero NEW violations in your files
node scripts/architecture/architecture-check.mjs check   # 0 new violations
pnpm spec:validate
# + your own test entrypoints (declared in package.json scripts.test)
```

## 5. Report format (COMPLETION REPORT — last message, exact)

```
COMPLETION REPORT — Worker 4 (Creative Workspace)
Base SHA: <wave2-sha>   Branch: w4-creative-workspace   Head SHA: <sha>
Gate table:
  typecheck/build: <real numbers>
  lint: <violations before/after in YOUR files>
  architecture: <new violations count>
  spec:validate: OK/FAIL
  tests: <counts>
UI obligations: <per spec/task-plan.md §3 item, how satisfied + where>
Scenarios: <A/B/C harness, records used, verified rendering>
Contract change requests: <none | list with rationale>
```
