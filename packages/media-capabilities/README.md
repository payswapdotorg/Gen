# @gen/media-capabilities

Canonical capability registry + router (lock P3). One registry, media + editor namespaces; descriptors are git-tracked data.

Contract: [`src/contract.ts`](src/contract.ts) mirrors the TL-owned schemas in [spec/schemas/](../../spec/schemas/) (parity is mandatory) and re-exports the zod bindings from `src/domain/schema.ts`.
Ownership + rules: [ARCHITECTURE_LOCK.md](../../ARCHITECTURE_LOCK.md) §5. Work order: [work/](../../work/).
Layers: `src/domain` (pure) → `src/app` (ports) → `src/adapters` (execution) per .agents/skills/architecture-governance/SKILL.md.

## Layout

| Path | Content |
|---|---|
| `src/domain/schema.ts` | Zod bindings for `capability.schema.json` + the conformance scenario fixture schema |
| `src/domain/registry.ts` | `CapabilityRegistry` — single-owner in-memory index, revision counter (mirrors `ProviderRegistryView`) |
| `src/domain/router.ts` | `routeCapability` — pure routing decision function over mappings × facts, full decision trace |
| `src/domain/registry/` | Git-tracked capability descriptor files (data, not code) |
| `src/domain/conformance/` | Canonical conformance scenario fixtures (referenced by descriptor `conformance.scenarios[].path`) |
| `src/app/ports.ts` | `DescriptorSource` port (file loading is an adapter concern) |
| `src/adapters/fs-descriptor-source.ts` | Filesystem descriptor loader |
| `src/adapters/ajv-validate.ts` + `validate-registry-cli.ts` | ajv 2020-12 × zod validation harness (parity gate) |

## Gates

```bash
pnpm --filter @gen/media-capabilities typecheck
pnpm --filter @gen/media-capabilities build
pnpm --filter @gen/media-capabilities validate   # ajv + zod + scenario-ref integrity
pnpm --filter @gen/media-capabilities test       # node:test via tsx
```

Editor-plane descriptors (`editor.*`) register into the same index through the same
schema; their FILES are owned by `@gen/editor-adapters` (W2), loaded through the
`DescriptorSource` port on that side.
