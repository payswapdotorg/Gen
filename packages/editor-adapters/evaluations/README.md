# Mode evaluation — editor adapters (work order task D, committed evidence)

Per-editor comparison of the adapter modes (`embedded | cli | mcp |
remote-service`, spec/editor-adapter-contract.md §2) across the five
evaluation axes: startup cost, determinism, sandboxability, error surfacing,
artifact fidelity. One record per editor: `mode-evaluation.<editor>.json`.

## Method (honest numbers only — lock P5)

- **Structural measurements** (open / apply / exportOtio) run against the
  real adapter classes over Node ports in the Phase 1 sandbox — no binaries
  needed; these are adapter-pipeline costs, not editor-engine costs.
- **Live measurements** exist only where binaries exist. Phase 1 sandbox
  binary presence (snapshot from the executed test run):

  | editor | binary | present in sandbox |
  |---|---|---|
  | ffmpeg | ffmpeg, ffprobe | **yes** |
  | mlt | melt | no |
  | blender | blender | no |
  | natron | NatronRenderer, natron | no |
  | kdenlive | kdenlive_render, melt | no |
  | losslesscut | (no headless surface) | n/a — gap report |

- Where a binary is absent, the record says **declared, not measured** and
  the live conformance scenario is **skipped** (never claimed). The same
  scenarios execute at the integration station where binaries exist
  (src/tests/editor-live.test.ts self-gates on binary presence).

## Measurement transcript (Phase 1 sandbox, 2026-10-04, Node 24)

Structural pipeline (mean of observed runs; sub-10ms class throughout):

```
mlt         open 3.0ms   apply(cut) 5.0ms   exportOtio 2.0ms
blender     open 1.4ms   —                   exportOtio 1.5ms
ffmpeg      open 4.1ms   apply(cut) 1.7ms   exportOtio 1.2ms
natron      open 1.3ms   —                   exportOtio 1.3ms
kdenlive    open 16.3ms  apply(cut) 1.7ms   exportOtio 1.8ms
losslesscut open 1.2ms   apply(cut) 1.2ms   exportOtio 1.2ms
```

ffmpeg live (only live-capable editor in this sandbox):

```
ffmpeg -version cold start ............ 56.8–74.8 ms (3 runs)
ffprobe duration probe ................ 57.9–59.7 ms
fixture gen (2s testsrc2, x264 ultra) . 73.6–81.4 ms
live cut+render (0.5–1.5s reencode,
  320x240, end-to-end incl. spawn) .... 107 ms, status=succeeded
```

## Headline findings

1. **CLI is the right launch mode for all six editors** — it is the only
   mode every editor family actually exposes headless (melt, blender
   --background, ffmpeg, NatronRenderer, kdenlive project-XML+melt), and it
   gives uniform sandboxability + error surfacing through one ProcessPort.
2. **embedded** is only credible for MLT (libmlt++) and ffmpeg (bindings) —
   both deferred: process isolation beats in-process codec-crash risk at
   Phase 1 scale.
3. **mcp** wrappers are a Phase 2+ routing concern — the adapter surface is
   transport-agnostic by design (ports), so no re-implementation is needed.
4. **remote-service** is the render-farm shape; the port seam
   (ProcessPort/FsPort/ArtifactStorePort) is exactly what a remote
   implementation substitutes.
5. **LosslessCut has no viable execution mode headless** — authoring-only
   adapter + gap report (gap.losslesscut-headless-cut); GUI automation is
   prohibited (lock P5) and not implemented in any form.

## Cross-editor cooperation (the point of the ecosystem)

Verified by executed tests: a cut made in the **ffmpeg** adapter exports to
OTIO and imports into **mlt, kdenlive, blender, natron, losslesscut** with
the clip range preserved (±1 frame quantization where the native format is
frame-grid); an **mlt** composite imports into **kdenlive** with the track
structure preserved; a **blender** animation curve survives OTIO round-trip.
See src/tests/otio-roundtrip.test.ts.
