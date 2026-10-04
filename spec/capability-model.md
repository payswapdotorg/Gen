# Capability model — Gen Creative Intelligence OS

Status: **CONTRACT v1.0** (Phase 0, locked by ARCHITECTURE_LOCK.md v1.0.0)
Owner: TL (contract) · Worker 1 (implementation: registry + harness)
Schema: [`schemas/capability.schema.json`](schemas/capability.schema.json) ·
Examples: [`examples/capability.*.json`](examples/)

> **P3 (lock §2): all functionality is a capability.** Nothing executes
> outside the registry. A capability is the system's unit of *what can be
> done*; providers and editor adapters answer *who/what does it*.

## 1. Identity & naming

Capability ID = dotted, lowercase-kebab segments:

```
<domain>.<subdomain…>.<capability-name>
```

- Domains (fixed enum): `video`, `image`, `audio`, `editor`, `orchestration`.
- Media AI capabilities: `video.character-replacement`,
  `video.motion-transfer`, `video.object-replacement`, `video.restyle`,
  `video.reference-handling`, `image.*`, `audio.*`.
- Software (editor) capabilities: `editor.cut-video`, `editor.track-object`,
  `editor.composite-layer`, `editor.create-animation`, `editor.render-project`.
- Reserved future domain `orchestration.*` for multi-step composite intents.

IDs are immutable once `active`. A semantic change = new ID + deprecation path.

## 2. Descriptor

A `CapabilityDescriptor` (see schema) declares:

- `id`, `version` (semver of the *descriptor*, not the implementations),
  `status`: `draft` → `active` → `deprecated` (transition to `active` is a
  TL-reviewed event: conformance scenario + ≥1 provider mapping required).
- `summary` — one paragraph, user-comprehensible.
- `inputs` / `outputs` — typed **artifact ports** (`artifact.schema.json`
  refs; media type constraints, cardinality, optionality).
- `parameters` — typed execution parameters (enum/range/default/unit),
  machine-checkable.
- `qualityDimensions` — named, scale-declared axes (e.g. identity-preservation,
  temporal-coherence 0–100) used by the comparison harness and org evaluation.
- `costModel` — pricing unit class + notes (per-second-of-output, per-image,
  per-invocation, compute-minutes).
- `latencyClass` — `subsecond | seconds | minutes | hours | interactive`.
- `providerMappings` — the provider plane binding: `{providerId, modelId?,
  executionAdapter, maturity, conformanceStatus, notes}`. Multiple mappings per
  capability are the NORM (that is provider neutrality):
  `higgsfield/genjutsu`, `wan-2.2/animate`, `vace`, future customs.
- `conformance` — scenario refs + certification level.

## 3. Registry

- **Canonical store**: git-tracked descriptor files (JSON, schema-validated)
  inside the owning package — `packages/media-capabilities/src/domain/registry/`
  for media + orchestration capabilities, `packages/editor-adapters/src/domain/registry/`
  for `editor.*`. Git = review surface; the runtime registry is an in-memory
  index built from these files (single owner: `@gen/media-capabilities`).
- **One registry, two namespaces** — `media.*` domains and the `editor.*`
  domain register into the SAME index through the same schema. Editor
  adapters own their descriptor FILES; media-capabilities owns the INDEX.
- Descriptor files are data, not code: no logic, no imports.
- Registry revision increments on every load change (mirror the
  `ProviderRegistryView` revision pattern from `@zcode/provider`).

## 4. Router (capability orchestrator)

Routing a capability invocation = choosing a provider mapping by policy:

```
input:  CapabilityId + parameters + artifacts + routing policy
output: ProviderMapping + ExecutionPlan (adapter, model, cost/latency estimate)
```

Routing dimensions (P1 — provider neutrality, the point of the system):

| Dimension | Source |
|---|---|
| quality | conformance scores per mapping (qualityDimensions) |
| reliability | conformance + observed failure rates |
| cost | costModel × pricing facts per provider |
| latency | latencyClass × provider facts |
| availability | provider health state |
| preference | user policy: premium-first, cheapest-reliable (T3), local-first… |

The router is a **pure decision function** in `@gen/media-capabilities`
domain layer (no IO); adapters execute. Acceptance T1 and T3 exercise it.

## 5. Conformance & comparison

- Every `active` capability carries ≥1 conformance scenario: input artifact
  fixtures + expected output invariants (schema-level + quality thresholds).
- The comparison harness (Worker 1 deliverable) runs a scenario across all
  mappings of a capability and emits a normalized score table (per
  qualityDimension, cost, latency, reliability) — persisted as committed
  evaluation records under the harness's evaluations directory.
- Mapping `maturity`: `reference` (Higgsfield = the compatibility baseline),
  `stable`, `experimental`, `planned`.

## 6. Gap detection semantics (feeds Arena)

A routing failure mode — "no mapping satisfies the policy / no mapping exists"
— is not an error to hide: it emits a `CapabilityGapReport`
(`capability-gap.schema.json`) with the router's decision trace as evidence.
See `human-escalation-contract.md`.

## 7. TS surface (parity requirement)

`packages/media-capabilities/src/contract.ts` mirrors this schema
(compile-time types). Worker 1 adds zod bindings + validation harness; the
JSON Schemas in `spec/schemas/` remain the source of truth — a divergence is
a lock violation.
