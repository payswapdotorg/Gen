# Worker 8 — Workspace view completeness (W7 CCR: certification evidence fallback)

## 1. Mission

Close the single open contract-change request from W7's completion report:
`apps/creative-workspace/src/domain/projection.ts` `buildOrganizationView`
drops `certificationEvidence.certifiedAt` and `.gapReportsResolved` when a
mount has no `organizationEvaluation` summary (scenario A). The committed
organization record (e.g.
`packages/agent-lab/src/domain/organizations/org.documentary-cinematic-remaster-cand-04.json`)
carries both fields inside `evaluation.certificationEvidence` — the view's
fallback must surface them.

## 2. Tasks

1. Read `ARCHITECTURE_LOCK.md`, `work/worker-8-view-completeness.md`, the
   projection's `buildOrganizationView` certificationEvidence block, the
   committed org records that carry `evaluation.certificationEvidence`, the
   workspace scenario tests, and W7's e2e test
   `scripts/creative/acceptance/t2-end-to-end.test.ts` (its comment
   references this request).
2. Extend the fallback so `certifiedAt` and `gapReportsResolved` resolve
   `summary?.certificationEvidence?.X ?? graph.evaluation?.certificationEvidence?.X`
   (mirroring the existing scenarioSetRef/replayRef pattern). Update the
   contract view types additively ONLY if a field becomes guaranteed.
3. Extend the scenario-A tests to assert `certifiedAt` and
   `gapReportsResolved` surface from the committed org record (the exact
   committed values). Keep every existing assertion intact.
4. Run the full gate battery at your pushed SHA.

## 3. Boundaries

- You own ONLY `apps/creative-workspace/**`. No edits anywhere else
  (the e2e test comment stays as-is; do not touch scripts/**).
- Determinism: no changes that alter any replayHash or existing assertion.
- No network, no fixtures, no secrets. Contract changes additive only.

## 4. Gates (must pass at your pushed SHA)

```bash
git fetch origin main:main
pnpm --filter @gen/creative-workspace typecheck && pnpm --filter @gen/creative-workspace build
pnpm --filter @gen/creative-workspace test     # 35/35 + your new assertions
pnpm acceptance                                  # 27/27 regression
pnpm lint                                        # zero NEW violations in your files
node scripts/architecture/architecture-check.mjs check
pnpm spec:validate
```

## 5. Report format (COMPLETION REPORT — last message, exact)

```
COMPLETION REPORT — Worker 8 (View Completeness)
Base SHA: <base>   Branch: w8-view-completeness   Head SHA: <sha>
Gate table:
  typecheck/build: <real numbers>
  tests: workspace <counts> / acceptance 27/27
  lint: <violations before/after in YOUR files>
  architecture: <new violations count>
  spec:validate: OK/FAIL
View completeness: <certifiedAt + gapReportsResolved surfaced, values asserted>
Contract change requests: <none | list>
```
