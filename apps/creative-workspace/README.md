# @gen/creative-workspace

User-facing workspace: task planning UI (P4 — no black-box generation), progress visibility, human-in-the-loop approval gates.

Contract: [`src/contract.ts`](src/contract.ts) mirrors spec/schemas/task-plan.schema.json plus additive view-model types (evidence links, gap links, alternative deltas — the schema stays the source of truth).
Ownership: worker 4 per `work/worker-4-creative-workspace.md` (lock §5 — TL integration surface).
Rules: [ARCHITECTURE_LOCK.md](../../ARCHITECTURE_LOCK.md) §5.

## Layout

- `src/domain/` — zod bindings for the task-plan schema (parity-tested), record-bundle types + record-source port, pure view-model projection, alternative-delta derivation.
- `src/app/` — workspace service (compose + schema-validate + project through the record-source port).
- `src/ui/` — pure React 19 components (plain inline styles — no CSS framework). Plan header always visible; completed items link evidence; capability blocks link gap reports; alternatives switchable with deltas shown before switching; loading states render the plan skeleton, never a bare spinner.
- `src/adapters/` — filesystem record source over the committed evidence stores of `@gen/agent-lab`, `@gen/arena-bridge` and `@gen/media-providers` (public APIs only).
- `src/harness/` — layerless demo-harness composition root: mounts scenarios A (T2 documentary run), B (T4 forced failure with the real gap report) and C (premium vs open-model alternatives).
- `demo/` — static page renderer (`pnpm demo:render` → `demo/dist/index.html`, derived from committed records).
- `test/` — schema parity, view-model invariants, scenario A/B/C acceptance mounts (SSR-rendered).

## Commands

```bash
pnpm --filter @gen/creative-workspace typecheck   # tsc (src + test)
pnpm --filter @gen/creative-workspace build       # tsc emit
pnpm --filter @gen/creative-workspace test        # node --test via tsx
pnpm --filter @gen/creative-workspace demo:render # static demo page from committed records
```

Data comes from committed records only — no network, no fabricated demo data (lock P5/P6).
