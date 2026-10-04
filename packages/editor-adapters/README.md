# @gen/editor-adapters

Editing software ecosystem: MLT, Blender, FFmpeg, Natron, Kdenlive, LosslessCut
adapters behind `editor.*` capabilities; OTIO artifact exchange; committed
mode evaluation with evidence.

Contract: [`src/contract.ts`](src/contract.ts) mirrors the TL-owned schemas in
[spec/schemas/](../../spec/schemas/) (parity is mandatory; JSON Schemas are
the source of truth). Ownership + rules:
[ARCHITECTURE_LOCK.md](../../ARCHITECTURE_LOCK.md) §5. Work order:
[work/worker-2-editing-ecosystem.md](../../work/worker-2-editing-ecosystem.md).
Domain contract: [spec/editor-adapter-contract.md](../../spec/editor-adapter-contract.md).

## Layout (layers: domain → app → adapters)

```
src/
  contract.ts            public mirror (the module's public entrypoint)
  index.ts               package surface: contract + factory wiring
  domain/                PURE — no IO, no clock, no randomness
    schema/              zod bindings mirroring spec/schemas/capability.schema.json
    registry/            the five editor.* descriptor FILES (data; the INDEX
                         is @gen/media-capabilities' — no second registry)
    conformance/         scenario fixtures referenced by the descriptors
    edit/                neutral edit model, OTIO conversion, command schemas,
                         shared applies, codec contract
    otio/                OTIO JSON subset: model, deterministic serializer, parser
    adapters/            per-editor pure codecs (native format build/parse,
                         render-plan compilation, fidelity declarations)
    xml.ts               minimal MLT-family XML build/parse
    errors.ts            shared error taxonomy (+ gap surface, lock P5)
    handle.ts            immutable handles + idempotency ledger types
    job-state.ts         render job lifecycle state machine
  app/                   side effects DECIDED through ports
    ports.ts             ProcessPort / FsPort / ArtifactStorePort / BinaryProbe
    adapter-base.ts      the EditorAdapter implementation (all six editors)
    job-manager.ts       job records (single state owner for job lifecycle)
  adapters/              side effects EXECUTED
    node-ports.ts        Node implementations (child_process, fs, crypto) +
                         LocalArtifactStore (content-addressed working store)
    index.ts             the six adapter classes + factory
  tests/                 structural + OTIO conformance (always run) and
                         binary-gated live scenarios (self-skip when absent)
evaluations/             committed mode-evaluation records (task D evidence)
```

## Modes & binaries

All launch adapters are `cli` mode. Binary resolution order: env override →
PATH scan (X_OK). Env var NAMES (values never in the repo — lock P8):

```
GEN_EDITOR_MELT_BIN           GEN_EDITOR_BLENDER_BIN
GEN_EDITOR_FFMPEG_BIN         GEN_EDITOR_NATRONRENDERER_BIN / GEN_EDITOR_NATRON_BIN
GEN_EDITOR_KDENLIVE_RENDER_BIN / GEN_EDITOR_MELT_BIN (kdenlive renders via melt)
```

LosslessCut has no headless execution surface: its adapter authors the
project JSON and `render()` fails `unsupported`/`render-surface-absent`
referencing gap `gap.losslesscut-headless-cut`
(packages/arena-bridge/src/domain/gaps/). GUI automation is prohibited by
lock P5 and is not implemented in any form.

## Commands

```
pnpm --filter @gen/editor-adapters typecheck
pnpm --filter @gen/editor-adapters build
pnpm --filter @gen/editor-adapters test      # structural + live (self-gated)
```

Tests report binary presence at run time; skipped live scenarios are the
honest outcome when a binary is absent (work order §3 environment note).
