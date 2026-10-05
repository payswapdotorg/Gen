# Worker 7 — T1–T4 end-to-end acceptance battery (Phase 2 full-stack exercise)

## 1. Mission

Extend the acceptance harness (`scripts/creative/acceptance/`) so T1–T4 are
exercised END-TO-END through the built-out Phase 2 surface: the composed
registry and routing planes, the agent-lab organization records, the
creative-workspace projection (TaskPlan UI obligations), and the timeline
artifact-graph lineage evidence. The current 15 tests assert the DOMAIN
layer; your work makes the acceptance battery prove the CHAIN a user
actually experiences: route → organize → execute → show plan → link
evidence → lineage-audit.

## 2. Scope note — W6 surface is OUT

The human-in-the-loop decision-trail surface (W6, in flight) is NOT part of
this battery: do not reference decision bundles/trails. A later battery
extension will cover it. Everything you assert must exist at your base SHA.

## 3. Tasks (in order)

### A. Study + baseline
1. Read `ARCHITECTURE_LOCK.md`, the four `t*.test.ts` files + `lib/` +
   `data/` in `scripts/creative/acceptance/`, `apps/creative-workspace`
   (projection, scenarios, view-model tests), `packages/timeline`
   (lineageOf/childrenOf/subtreeOf, TaskPlan evidence descriptor), and the
   committed records they use.
2. Run `pnpm acceptance` — all existing tests must be green at your base
   before you change anything.

### B. End-to-end extensions (one per T, additive)
3. **T1 end-to-end**: routing decision → workspace alternatives view —
   assert the workspace view-model's alternatives for the character-
   replacement plan carry REAL deltas from the provider evaluation facts
   (premium vs open-model), and that switching surface data is present
   (before-switching deltas per spec/task-plan.md §3).
4. **T2 end-to-end**: the documentary-cinematic organization run →
   workspace scenario A projection — assert the plan header fields, every
   completed item's evidence links resolve to run events/gate results, and
   the certified organization is visible with its fitness/bodies.
5. **T3 end-to-end**: cost-aware routing (cheapest-reliable) → the
   workspace's alternative deltas show the open-model/local-tools path
   with its cost/latency facts — assert the delta table's provenance
   traces to committed evaluation records.
6. **T4 end-to-end**: forced failure → gap report → workspace blocked
   view — assert the blocked item links the real gap report (arena state,
   severity, router trace) AND that a completed item's artifact ref yields
   a timeline lineage evidence descriptor (the P4 tie-in: what made this,
   with which capability/provider).
7. **Timeline lineage assertions**: for the documentary run's artifact
   refs — `lineageOf` returns the full ancestor chain with producedBy
   metadata; `subtreeOf(bundle)` returns the renderable set; the evidence
   descriptor shape matches what the workspace links.

### C. Harness hygiene
8. Keep the existing 15 tests UNCHANGED (they lock the domain layer).
9. New tests live in the same directory pattern
   (`t<n>-end-to-end.test.ts` or a shared `e2e-lib.ts` under `lib/`);
   reuse `lib/compose-registry.js` / `lib/plane.js` — no duplication.
10. Update `scripts/creative/acceptance/README.md` (or add one) mapping
    each T to its domain-layer test AND its end-to-end extension.

## 4. Boundaries (lock §5/§8 — binding)

- You own ONLY `scripts/creative/acceptance/**`. No edits to `spec/**`,
  `packages/**`, `apps/**`, or root/shared files; requests go in the
  report. (pnpm-lock exception only if you must add a dep — prefer none.)
- Data comes from committed records only — no fixtures, no network.
- No secrets. Layer rules apply to harness code the same as package code.

## 5. Verification gates (must pass at your pushed SHA)

```bash
# PRE-GATE REF SYNC (mandatory):
git fetch origin main:main
pnpm acceptance                                   # ALL green (15 existing + your extensions)
pnpm --filter @gen/creative-workspace test        # 35/35 (regression)
pnpm --filter @gen/timeline test                  # 30/30 (regression)
pnpm --filter @gen/creative-workspace typecheck && pnpm --filter @gen/timeline typecheck
pnpm lint                                         # zero NEW violations in your files
node scripts/architecture/architecture-check.mjs check   # 0 new violations
pnpm spec:validate
```

## 6. Report format (COMPLETION REPORT — last message, exact)

```
COMPLETION REPORT — Worker 7 (Acceptance Battery)
Base SHA: <base>   Branch: w7-acceptance-battery   Head SHA: <sha>
Gate table:
  acceptance: <total pass/fail — existing 15 + new counts>
  workspace tests: 35/35   timeline tests: 30/30
  typecheck: <both packages>
  lint: <violations before/after in YOUR files>
  architecture: <new violations count>
  spec:validate: OK/FAIL
End-to-end coverage: <per T: what the chain asserts, which records/views>
Timeline lineage: <lineageOf/subtreeOf assertions + evidence descriptor parity>
Contract change requests: <none | list with rationale>
```
