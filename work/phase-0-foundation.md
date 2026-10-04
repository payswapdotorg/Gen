# Phase 0 — Foundation (TL only) — RECORD

Status: **DELIVERED** (this file is the phase record — P6: decisions live in the repo)
Lock: ARCHITECTURE_LOCK.md v1.0.0 · Pre-phase base: `main @ 29628c9` · Phase 0 content commit: `2568308af34c9513b14cb62f0eff16668400a814`
Operator directive: 2026-10-04, IM trace `1a10530222635c29`

## Delivered artifacts

| Artifact | Path |
|---|---|
| Architecture lock (canonical, binding) | `ARCHITECTURE_LOCK.md` |
| Lock spec pointer | `spec/architecture-lock.md` |
| Capability model contract | `spec/capability-model.md` |
| Agent body model contract | `spec/agent-body-model.md` |
| Organization lab contract | `spec/organization-lab.md` |
| Media provider contract | `spec/media-provider-contract.md` |
| Editor adapter contract | `spec/editor-adapter-contract.md` |
| Human escalation (Arena) contract | `spec/human-escalation-contract.md` |
| Task plan (Zcode) contract | `spec/task-plan.md` |
| Canonical JSON schemas (8) | `spec/schemas/*.schema.json` |
| Validated examples (8) | `spec/examples/*.json` |
| Package skeletons (6) + app skeleton | `packages/{media-capabilities,media-providers,editor-adapters,agent-lab,arena-bridge,timeline}`, `apps/creative-workspace` |
| Module registrations | `architecture-policy.yaml` (7 managed modules) |
| Workspace + root script wiring | `pnpm-workspace.yaml`, root `package.json` (typecheck list, `spec:validate`) |
| Spec validation gate | `scripts/creative/validate-spec-examples.mjs` |
| Worker packets | `work/worker-{1,2,3}-*.md` |
| Env contract (names only) | `.env.example` |

## Gates verified at the Phase 0 SHA

```
pnpm install --ignore-scripts                                # OK
node scripts/architecture/architecture-check.mjs check       # architecture: OK, 0 violations
tsc -b <7 new packages>                                      # 0 errors
oxlint <new packages + scripts/creative>                     # 0 warnings, 0 errors
node scripts/creative/validate-spec-examples.mjs             # OK (8 schemas, 8 examples)
```

## Decisions recorded

- `@gen/*` scope for the creative plane; `@zcode/*` legacy plane untouched.
- One capability registry, two namespaces (media + editor); the registry
  SERVICE lives in `@gen/media-capabilities`, editor descriptor FILES live
  in `@gen/editor-adapters`.
- JSON Schemas (spec/schemas) are the source of truth; package `contract.ts`
  files are compile-time mirrors; Worker 1 adds zod bindings.
- New modules are `managed: true` from day one; layer model
  domain → app → adapters (+ `ui` for the workspace app).
- English for all new creative-plane docs (operator directive);
  legacy Chinese docs unchanged.
- Dispatch = chat.z.ai worker sessions per the replay console doctrine
  (agents tab, GLM-5.3, Full-Stack); ≤3 concurrent (platform limit).

## Phase 1 entry condition — SATISFIED

"No worker begins implementation before ARCHITECTURE_LOCK.md exists" — it
does, at the Phase 0 content commit `2568308af34c9513b14cb62f0eff16668400a814` (this record's follow-up commit
pins the worker base below). Workers clone at this SHA (recorded
in their packets) and push delivery branches; the TL re-runs every gate at
the pushed SHA before merge (lock §10 — never trust reported numbers).
