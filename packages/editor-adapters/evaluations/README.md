# Mode evaluation — editor adapters (work order task D, committed evidence)

Per-editor comparison of the adapter modes (`embedded | cli | mcp |
remote-service`, spec/editor-adapter-contract.md §2) across the five
evaluation axes: startup cost, determinism, sandboxability, error surfacing,
artifact fidelity. One record per editor: `mode-evaluation.<editor>.json`.

## Method (honest numbers only — lock P5)

- **Structural measurements** (open / apply / exportOtio) run against the
  real adapter classes over Node ports — no binaries needed; these are
  adapter-pipeline costs, not editor-engine costs.
- **Live measurements** exist where binaries exist. Current live-verified
  station state (W11/W12 bring-up, re-verified in W15):

  | editor | binary | version | verified live |
  |---|---|---|---|
  | ffmpeg | ffmpeg, ffprobe | 7.1.5 | **yes** — live cut/render scenarios |
  | mlt | melt | 7.30.0 | **yes** — live avformat render scenario |
  | blender | blender | 4.3.2 | **yes** — live VSE mp4 + PNG-sequence scenarios |
  | natron | NatronRenderer | 2.4.4 | **yes** — live composite + WriteFFmpeg codec/format scenarios |
  | kdenlive | melt (kdenlive_render absent by design) | 7.30.0 | **yes** — live XML-flavor render via melt |
  | losslesscut | (no headless surface) | n/a | n/a — ADAPTER_ONLY by design (gap report) |

  The Phase 1 snapshot (all-but-ffmpeg absent) was superseded by the
  W11/W12 bring-up; the per-editor JSON records carry the live-verified
  truth (measured startup costs, liveConformance, evidence refs).

- Where a headless surface does not exist (losslesscut), the record says
  **declared, not measured** and stays ADAPTER_ONLY — GUI automation is
  prohibited (lock P5) and is not implemented in any form. The live
  scenarios (src/tests/editor-live.test.ts) self-gate on binary presence,
  so they keep executing wherever the binaries exist.

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

ffmpeg live (Phase 1):

```
ffmpeg -version cold start ............ 56.8–74.8 ms (3 runs)
ffprobe duration probe ................ 57.9–59.7 ms
fixture gen (2s testsrc2, x264 ultra) . 73.6–81.4 ms
live cut+render (0.5–1.5s reencode,
  320x240, end-to-end incl. spawn) .... 107 ms, status=succeeded
```

Live station cold starts (W15 re-measure, 3 runs each):

```
melt -version .......................... 4 ms (4/4/4)
blender --version ....................... 108/95/101 ms (mean 101)
blender --background --python (scene) .. ~334 ms
NatronRenderer --version ............... 11/10/10 ms (mean 10; exits 1
                                           after printing — binary quirk,
                                           not a failure)
```

## Bring-up notes (live station, no-root)

1. **Natron 2.4.4 no-installer tarball SHIPS `lib/libQtCore.so.4`** — the
   current Linux-x86_64-no-installer.tar.xz asset is self-contained on the
   Qt4 front. The Qt4 installer-recovery procedure (fetching Qt4 libs from
   older asset archives) is only needed for older assets, not for 2.4.4.
   The remaining no-root gap is GL: `libglu1-mesa` + `libopengl0` debs
   extracted into a GL prefix and exposed via LD_LIBRARY_PATH in the
   NatronRenderer shim.
2. **ProcessPort contract: child env `PWD` must match child cwd.** Blender
   4.3.2 resolves a relative `--python` path against the inherited `$PWD`
   environment variable, not getcwd() — a spawned child whose cwd is set
   but whose env still carries the parent's `PWD` fails to find the render
   script. NodeProcessPort.spawnEnv() therefore overrides `PWD` to the
   child cwd at both spawn sites (run + start). This is a standing
   contract for any future ProcessPort implementation.
3. melt 7.30.0 runs from extracted Debian trixie debs (melt + libmlt7 +
   libmlt-data) via a shim that sets `LD_LIBRARY_PATH` (prefix libs),
   `MLT_DATA` (prefix share/mlt-7) and `MLT_REPOSITORY` (prefix
   lib/x86_64-linux-gnu/mlt-7).

## Headline findings

1. **CLI is the right launch mode for all six editors** — it is the only
   mode every editor family actually exposes headless (melt, blender
   --background, ffmpeg, NatronRenderer, kdenlive project-XML+melt), and it
   gives uniform sandboxability + error surfacing through one ProcessPort.
   Five of six are now LIVE-VERIFIED on that surface (losslesscut has no
   headless surface — by design).
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
