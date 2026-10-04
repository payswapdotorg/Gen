# Editor adapter contract — Gen Creative Intelligence OS

Status: **CONTRACT v1.0** (Phase 0, locked by ARCHITECTURE_LOCK.md v1.0.0)
Owner: TL (contract) · Worker 2 (implementation)
Schema: [`schemas/capability.schema.json`](schemas/capability.schema.json)
(`editor.*` domain), [`schemas/artifact.schema.json`](schemas/artifact.schema.json)

> Editing software is orchestrated through the SAME capability abstraction
> (P3): `EditorCapability`s are `editor.*` capabilities; each editing system
> is an execution adapter behind them. Multiple editors can cooperate on one
> project because they exchange artifacts through one timeline contract.

## 1. Editor capabilities (launch set)

```
editor.cut-video          cut/trim/split on the timeline
editor.track-object       object tracking through shots
editor.composite-layer    layer compositing / masks / transforms
editor.create-animation   keyframed animation curves
editor.render-project     render/encode/export from a project
```

Each is a `CapabilityDescriptor` (same schema as media capabilities) whose
`providerMappings` point at editor adapters. The registry index is shared
with media (capability-model §3) — `editor.*` descriptors live under
`packages/editor-adapters/src/domain/registry/`.

## 2. Adapter modes (evaluated, not assumed)

Every editor adapter declares its mode; Worker 2's evaluation deliverable
compares modes per editor with evidence:

| Mode | Shape | Use when |
|---|---|---|
| `embedded` | in-process library/API | tight loop, no process boundary |
| `cli` | headless CLI (melt, ffmpeg, blender --background, Natron --cli) | reproducible, sandboxable, no GUI |
| `mcp` | Model Context Protocol server | agent-native tool surface |
| `remote-service` | HTTP service wrapper | shared render farm / isolation |

**Priority order (operator plan, binding):**
1. **MLT** (melt CLI) — 2. **Blender** (headless python) — 3. **FFmpeg** —
4. **Natron** (cli) — 5. **Kdenlive** (project XML + render) —
6. **LosslessCut**.

## 3. Project state & artifact exchange

- Each editor's native project format is wrapped by its adapter as an
  **Artifact** (content-addressed) with a declared `editorProject` media type;
  the interchange between editors is **OpenTimelineIO** (via
  `@gen/timeline`) + an asset manifest referencing content-addressed media.
- An `EditorProjectHandle` (adapter-local) binds: native project artifact +
  OTIO projection + working dir. Adapters MUST implement
  `exportOtio(handle) → timeline artifact` and
  `importOtio(timeline artifact) → handle` (lossy round-trips are declared in
  the adapter's capability notes, never silent).
- Render outputs are artifacts with lineage: `producedBy` =
  (capability `editor.render-project`, adapter, execution id), `derivedFrom`
  = source media + project artifacts.

## 4. Adapter interface

```
open(projectArtifact)              → EditorProjectHandle
apply(handle, capabilityId, params)→ Handle'  (mutating ops return a NEW handle; idempotency key)
export(handle, format)             → Artifact
render(handle, renderProfile)      → JobHandle (lifecycle per media-provider-contract §3)
capabilities()                     → EditorCapability mappings + mode facts
```

- Same error taxonomy as media adapters (media-provider-contract §3).
- Track-object/composite/animation outputs land as artifacts
  (tracks/keyframes/curves serialized in the exchange format).
- GUI-only interactions are NOT capabilities — if an editor can't do it
  headless, it's a gap report (P5), not a workaround.

## 5. Conformance & evaluation

- Each `editor.*` capability ships conformance scenarios (fixture project +
  expected OTIO/output invariants). `active` status requires: schema + ≥1
  adapter mapping + passing scenario (lock §7).
- The mode evaluation (embedded vs CLI vs MCP vs remote) is a committed
  comparison record: startup cost, determinism, sandboxability, error
  surfacing, artifact fidelity.

## 6. TS surface

`packages/editor-adapters/src/contract.ts` mirrors the schemas (EditorCapability
descriptor types, adapter interface, handle/job types). Worker 2 adds zod
bindings; JSON Schemas remain source of truth.
