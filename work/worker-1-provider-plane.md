# WORK ORDER — Worker 1: Genjutsu Compatibility + Provider Plane

Status: **READY TO DISPATCH** (Phase 1) · Branch: `w1-provider-plane`
Owner: Worker 1 (identity granted per ARCHITECTURE_LOCK.md §5)
Scope: `packages/media-capabilities/**`, `packages/media-providers/**`
Read-first: `ARCHITECTURE_LOCK.md` (binding), `spec/capability-model.md`,
`spec/media-provider-contract.md`, `spec/schemas/capability.schema.json`,
`spec/schemas/creative-provider.schema.json`, `AGENTS.md`,
`.agents/skills/architecture-governance/SKILL.md`.

## 1. Mission

Make the capability layer real: implement the canonical capability registry
+ router in `@gen/media-capabilities`, and the provider plane execution
adapters in `@gen/media-providers` — with the **Higgsfield adapter as the
reference** (Genjutsu compatibility baseline) and open-model adapters as the
provider-neutral alternates. Everything you build must make acceptance tests
**T1** and **T3** pass at Phase 2 integration.

## 2. Tasks (in order)

### A. Capability registry core (`@gen/media-capabilities`)
1. Zod bindings for `spec/schemas/capability.schema.json` (parity is
   mandatory — the JSON Schema stays the source of truth; lock §6).
2. Registry: load git-tracked descriptor files from
   `src/domain/registry/` (media + orchestration capabilities), build the
   in-memory index, single-owner write path, revision counter (mirror the
   `ProviderRegistryView` pattern of `@zcode/provider`).
3. Seed the launch capability descriptors (status `draft`):
   `video.motion-transfer`, `video.object-replacement`,
   `video.character-replacement`, `video.restyle`,
   `video.reference-handling` — modeled on
   `spec/examples/capability.video-character-replacement.json`.
4. Router: pure decision function (domain layer, no IO) implementing
   `RoutingRequest → RoutingResult` over the policy set
   (premium-first / cheapest-reliable / local-first / quality-first /
   latency-first) using mapping conformance + facts. A routing failure
   returns `RoutingFailure` with the decision trace (feeds gap reports —
   never throw-and-swallow).
5. Validation harness: full ajv validation of every descriptor against the
   schema, wired into the package's test/gate surface (extend
   `scripts/creative/validate-spec-examples.mjs` semantics or replace with
   an ajv-based gate — keep the root `pnpm spec:validate` entrypoint
   working).

### B. Higgsfield reference adapter (`@gen/media-providers`)
6. Conformance scenarios FIRST (behavior capture):
   `src/domain/conformance/<capabilityId>/` fixture sets with expected
   output invariants (schema-level + quality thresholds).
7. Implement `MediaExecutionAdapter` (contract.ts) over Higgsfield's HTTP
   transport: submit/poll/stream/cancel/retrieve, idempotency keys, the
   error taxonomy, env-only credentials (`HIGGSFIELD_API_KEY`; the login
   email/password pair is operator material — NEVER consumed by the
   adapter, never logged, never committed).
8. Map every observable Genjutsu capability (the §A.3 set); capabilities
   observed but not mappable → descriptor at `planned` maturity + a gap
   report stub in `packages/arena-bridge/src/domain/gaps/` (follow
   `spec/schemas/capability-gap.schema.json`; the arena-bridge store itself
   is Worker 3's — write only the data file per the schema).

### C. Open-model adapters (`@gen/media-providers`)
9. Adapter interface parity for `wan-2.2/animate`, `vace`, `ltx`,
   `hunyuan` (kind `open-model`): real transports where feasible
   (CLI/remote-service), declared `experimental`; where an open model
   cannot meet a scenario invariant, record the lower conformance score —
   data, not failure.

### D. Comparison harness (deliverable)
10. Run one capability's conformance scenario across ALL its mappings;
    emit the normalized score table (qualityDimensions × cost × latency ×
    reliability) as committed evaluation records under
    `src/domain/evaluations/` — the T1/T3 evidence machine.

## 3. Boundaries (lock §5/§8 — binding)

- You own ONLY `packages/media-capabilities/**` and
  `packages/media-providers/**`. No edits to `spec/**`,
  `architecture-policy.yaml`, other packages, or root files. If a contract
  change is needed: implement against the current contract, and REQUEST the
  change in your completion report (TL arbitrates).
- No second provider abstraction (P1): adapters plug into the capability
  mappings; provider identity stays provider-plane-shaped.
- No secrets in the repo (P8) — env names only; fixtures assemble
  credential shapes at runtime from fragments.
- Follow the layer rules: domain = pure (no IO/awaits), app = ports,
  adapters = execution. Use `.agents/skills/architecture-governance/SKILL.md`.

## 4. Verification gates (must pass at your pushed SHA)

```bash
git clone https://github.com/payswapdotorg/Gen.git && cd Gen
git checkout <phase-0-sha>       # base per your dispatch packet
corepack enable || npm i -g pnpm@10.33.2
pnpm install --ignore-scripts
pnpm --filter @gen/media-capabilities typecheck
pnpm --filter @gen/media-capabilities build
pnpm --filter @gen/media-providers typecheck
pnpm --filter @gen/media-providers build
pnpm lint                        # zero NEW violations in your files
node scripts/architecture/architecture-check.mjs check   # 0 new violations
pnpm spec:validate               # schemas + examples still valid
# + your own test entrypoints (declared in package.json scripts.test)
```

## 5. Report format (COMPLETION REPORT — last message, exact)

```
COMPLETION REPORT — Worker 1 (Provider Plane)
Base SHA: <phase-0-sha>   Branch: w1-provider-plane   Head SHA: <sha>
Gate table:
  typecheck: <real numbers, per package>
  lint: <violations before/after in YOUR files>
  architecture: <new violations count>
  spec:validate: OK/FAIL
  tests: <counts, per package>
Registry: <capabilities registered, statuses, mapping counts>
Adapters: <higgsfield coverage list; open-model adapters, transports>
Conformance: <scenarios written, pass/fail per mapping>
Gap reports: <ids written, kinds>
Contract change requests: <none | list with rationale>
Divergences from this work order: <none | list>
```

The TL re-runs every gate at your pushed SHA — reported numbers are claims
until reproduced (lock §8.10). Do not modify the report format.
