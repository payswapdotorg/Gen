# @gen/media-providers

Media execution adapters — the Higgsfield reference (Genjutsu compatibility baseline) and the open-model alternates — plus the conformance runner and comparison harness. Lock P1: extends the `@zcode/provider` plane; adapters register behind capability mappings, never a second abstraction.

Contract: [`src/contract.ts`](src/contract.ts) (pure re-export root: `domain/types.ts` hand-mirrored types, `domain/schema.ts` zod bindings, `domain/errors.ts` typed error class).
Ownership + rules: [ARCHITECTURE_LOCK.md](../../ARCHITECTURE_LOCK.md) §5. Provider contract: [spec/media-provider-contract.md](../../spec/media-provider-contract.md).
Layers: `src/domain` (pure) → `src/app` (ports) → `src/adapters` (execution) per .agents/skills/architecture-governance/SKILL.md.

## Layout

| Path | Content |
|---|---|
| `src/domain/providers/` | Provider descriptor files (higgsfield, wan-2.2, vace, ltx, hunyuan) — data, env NAMES only (P8) |
| `src/domain/conformance/` | Recorded fixture sets replayed by the mock adapter (provenance: simulated) |
| `src/domain/evaluations/` | Committed comparison-harness records — the T1/T3 evidence machine |
| `src/domain/routing-facts.ts` | Pure reduction: provider descriptors + evaluations → router facts |
| `src/domain/scoring.ts` | Pure scoring: scenario run → normalized comparison row |
| `src/app/ports.ts` | HttpPort / EnvPort / ClockPort / ProviderPlaneSource / record sink |
| `src/app/comparison-service.ts` | Scenario-across-all-mappings orchestration (IO via ports) |
| `src/adapters/higgsfield/` | Reference adapter + endpoint map (doc-confirmed vs provisional paths marked) |
| `src/adapters/open-models/` | wan-2.2 / vace / ltx / hunyuan over the declared open-execution protocol |
| `src/adapters/mock/` | Fixture-replaying adapter for credential-free conformance runs |
| `src/runtime.ts` | Layerless composition root (exported via index for Phase 2) |

## Gates

```bash
pnpm --filter @gen/media-providers typecheck
pnpm --filter @gen/media-providers build
pnpm --filter @gen/media-providers validate   # ajv × zod + registry cross-check + gap stubs
pnpm --filter @gen/media-providers test       # node:test via tsx
pnpm --filter @gen/media-providers harness video.character-replacement identity-basic
```

Credentials are env-only (`HIGGSFIELD_API_KEY` etc. — names in the provider descriptors and `.env.example`); the adapter never logs or persists values. Until live credentials exist, conformance runs in mock mode and every evaluation row carries `provenance: "simulated"`.
