# editor-adapters domain registry

The `editor.*` capability descriptor FILES (lock §5 + capability-model.md §3):
JSON data only — no logic, no imports. The runtime registry INDEX is
`@gen/media-capabilities`' (single owner; no second index, lock §8.1). At
Phase 2 the TL registers these files into the canonical index.

Launch set (editor-adapter-contract.md §1):

| file | capability |
|---|---|
| `editor.cut-video.json` | cut/trim/split |
| `editor.track-object.json` | object tracking |
| `editor.composite-layer.json` | layer compositing |
| `editor.create-animation.json` | keyframed curves |
| `editor.render-project.json` | render/encode/export |

Descriptors are `draft` (lock §7); `active` requires schema + ≥1 provider
mapping + a passing conformance scenario + TL review. The zod bindings that
validate these files live in `../schema/capability-schema.ts` and mirror
`spec/schemas/capability.schema.json` (source of truth).
