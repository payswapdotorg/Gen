# Media provider contract — Gen Creative Intelligence OS

Status: **CONTRACT v1.0** (Phase 0, locked by ARCHITECTURE_LOCK.md v1.0.0)
Owner: TL (contract) · Worker 1 (implementation)
Schemas: [`schemas/creative-provider.schema.json`](schemas/creative-provider.schema.json),
[`schemas/capability.schema.json`](schemas/capability.schema.json)

> **P1 (lock §2): Gen remains the provider control plane.** This contract
> EXTENDS `@zcode/provider` (Provider → Model → Capability → Execution
> Adapter → Artifact). It does not create a second abstraction: creative
> providers are provider-plane entries; their executors are execution
> adapters registered behind capability mappings.

## 1. Concept chain (binding)

```
Provider        e.g. higgsfield · wan-2.2 · vace · ltx · hunyuan (open execution)
   ↓
Model           e.g. genjutsu · animate · vace-1.x  (ModelId in the provider plane)
   ↓
Capability      video.character-replacement …  (capability registry, P3)
   ↓
Execution Adapter   concrete executor for (provider, model, capability)
   ↓
Artifact        content-addressed, lineage-tracked (artifact.schema.json)
```

## 2. Creative provider descriptor

`CreativeProviderDescriptor` (schema) declares:

- `providerId` — MUST be a provider-plane id (P1: registered/resolvable via
  the `@zcode/provider` concepts; no shadow registry).
- `kind`: `api` (Higgsfield) | `open-model` (Wan/VACE/LTX/Hunyuan via local/
  remote open execution) | `software-tool` (editor plane — see the editor
  contract) | `custom`.
- `access` — env var NAMES only (P8: no values; e.g. `HIGGSFIELD_*`), access
  type, key-management URL if any.
- `executionAdapter`: `{id, transport: http | cli | embedded | mcp |
  remote-service, runtime requirements}`.
- `capabilities`: mappings into capability IDs with `maturity`
  (`reference | stable | experimental | planned`) and conformance status.
- `facts`: rate limits, pricing units, regional/latency facts, health-check
  endpoint — router inputs.
- `generationLifecycle`: which lifecycle ops the adapter supports
  (submit / poll / stream / cancel / retrieve-artifacts).

## 3. Generation lifecycle (adapter interface)

Every media execution adapter implements, over its transport:

```
submit(capabilityId, modelId, params, inputArtifacts) → JobHandle
poll(JobHandle)        → JobStatus(queued|running|succeeded|failed|cancelled)
stream(JobHandle)      → events (progress, preview frames, log lines)   [optional]
cancel(JobHandle)      → cancelled | terminal                            [optional]
retrieve(JobHandle)    → Artifact[] (content-addressed + lineage)
```

- **Idempotency**: `submit` carries a client-generated idempotency key;
  adapters MUST make retries safe.
- **Error taxonomy** (adapter→router): `retryable` (transient), `capacity`
  (provider busy), `auth`, `validation` (bad params/inputs), `unsupported`
  (mapping can't do it), `provider-internal`. `unsupported` and repeated
  `capacity` feed gap detection (§6).
- **Timeouts/explicit time**: every async op declares its event order,
  stale-result rule and timeout class — no hiding sync problems behind
  retries (repo core principle).

## 4. Higgsfield reference adapter (Worker 1, priority)

The Higgsfield adapter is the **compatibility baseline** (`maturity:
"reference"`). Map every observable Genjutsu capability:

```
motion transfer        → video.motion-transfer
object replacement     → video.object-replacement
character replacement  → video.character-replacement
restyle                → video.restyle            (image/video variants)
reference handling     → video.reference-handling
generation lifecycle   → the §3 interface over Higgsfield's API
```

- Build the conformance scenarios FIRST (behavior capture), then the adapter.
- Auth: CLI/API credentials arrive via env (operator-provided); the adapter
  NEVER stores or logs secrets. `HIGGSFIELD_EMAIL/PASSWORD` are operator
  login material — the adapter consumes only the resulting API credential
  env(s), never the login pair.
- Capabilities observed on the platform but not yet mapped → descriptor in
  `planned` maturity + a gap report (never silently skipped).

## 5. Open-model adapters

`wan-2.2 / vace / ltx / hunyuan` (kind `open-model`): same interface, executed
via the declared transport (CLI/local GPU, remote service). Open adapters
demonstrate provider neutrality (T1/T3): the SAME capability descriptor and
conformance scenarios run against them. Where an open model can't meet a
scenario invariant, its mapping records lower conformance scores — that is
data, not failure.

## 6. Routing participation & gap feeding

- Provider facts feed the router (capability-model §4). Adapters never make
  routing decisions.
- "No mapping satisfies policy" / mapping conformance below threshold for a
  requested quality → `CapabilityGapReport` with the router trace
  (P5, human-escalation contract).

## 7. Comparison harness (Worker 1 deliverable)

Runs one capability's conformance scenario across all its mappings; emits the
normalized score table (qualityDimensions × cost × latency × reliability) as
committed evaluation records. This is the T1/T3 evidence machine.

## 8. TS surface

`packages/media-providers/src/contract.ts` mirrors the schemas (types +
lifecycle/error taxonomy). Worker 1 adds zod bindings; JSON Schemas remain
source of truth.
