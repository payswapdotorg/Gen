# WORK ORDER — Worker 2: Editing Software Ecosystem

Status: **READY TO DISPATCH** (Phase 1) · Branch: `w2-editing-ecosystem`
Owner: Worker 2 (per ARCHITECTURE_LOCK.md §5)
Scope: `packages/editor-adapters/**`
Read-first: `ARCHITECTURE_LOCK.md` (binding), `spec/capability-model.md`,
`spec/editor-adapter-contract.md`, `spec/schemas/capability.schema.json`,
`spec/schemas/artifact.schema.json`, `AGENTS.md`,
`.agents/skills/architecture-governance/SKILL.md`.

## 1. Mission

Implement the editing software ecosystem: adapters for the six editors
(priority order BINDING) behind `editor.*` capabilities, the software
capability registry contribution, the mode evaluation, and the OTIO-based
artifact exchange. Your work must make "multiple editing systems can
cooperate" real at Phase 2 (feeds acceptance T2/T3).

## 2. Tasks (in order)

### A. Capability descriptors (editor.*)
1. Zod bindings for the editor-domain capability descriptors (same schema
   as media — `spec/schemas/capability.schema.json`).
2. Author the launch `EditorCapability` descriptors (status `draft`) in
   `src/domain/registry/`:
   `editor.cut-video`, `editor.track-object`, `editor.composite-layer`,
   `editor.create-animation`, `editor.render-project` — each mapping to
   the adapters that will implement it.
3. These descriptors register into the canonical registry index at
   integration (Phase 2, TL); the FILES are yours, the INDEX is
   `@gen/media-capabilities`' — do not build a second index.

### B. Adapters (priority order — build in this order)
4. **MLT** (`melt` CLI) — cut, composite, render.
5. **Blender** (headless `--background --python`) — create-animation,
   composite-layer, render-project.
6. **FFmpeg** (CLI) — cut-video, render/encode profiles.
7. **Natron** (CLI) — composite-layer.
8. **Kdenlive** (project XML + render) — cut-video, render-project.
9. **LosslessCut** — cut-video (whatever headless surface it exposes;
   if none: a documented gap report, NOT a workaround — P5).

Each adapter implements `EditorAdapter` (contract.ts): open/apply/export/
render/pollJob/capabilities, immutable handles (apply returns a NEW
handle), idempotency keys, the shared error taxonomy, declared mode
(`embedded | cli | mcp | remote-service`).

### C. Artifact exchange (OTIO)
10. Implement `exportOtio` / `importOtio` per adapter using the
    `@gen/timeline` contract surface (artifact descriptors + OTIO anchor +
    asset manifest). Lossy round-trips are declared in capability notes —
    never silent. Do NOT edit `packages/timeline/**` (TL-owned); if you
    need a contract change there, request it in your report.

### D. Mode evaluation (deliverable)
11. Committed comparison record per editor: startup cost, determinism,
    sandboxability, error surfacing, artifact fidelity — across the modes
    that editor can actually support (embedded vs CLI vs MCP vs
    remote-service), with evidence.

### E. Conformance
12. Per `editor.*` capability: fixture project + expected OTIO/output
    invariants; `active` status requests (schema + ≥1 mapping + passing
    scenario) go in your completion report for TL review.

## 3. Boundaries (lock §5/§8 — binding)

- You own ONLY `packages/editor-adapters/**`. No edits to `spec/**`,
  `packages/timeline/**`, other packages, or root/shared files; requests go
  in the report.
- No GUI-only interaction becomes a capability — headless-impossible =
  gap report stub in `packages/arena-bridge/src/domain/gaps/` (schema
  `capability-gap.schema.json`, kind `editor-coverage-gap`; data file only,
  the store is Worker 3's).
- No secrets in the repo (P8). Layer rules apply (governance skill).
- Environment note: your sandbox may not have every editor binary —
  implement adapters against the declared CLI contracts, gate live tests on
  binary presence (`command -v melt` etc.), and record which scenarios ran
  vs were skipped-for-missing-binary in the report (honest numbers only).

## 4. Verification gates (must pass at your pushed SHA)

```bash
git clone https://github.com/payswapdotorg/Gen.git && cd Gen
git checkout <phase-0-sha>       # base per your dispatch packet
corepack enable || npm i -g pnpm@10.33.2
pnpm install --ignore-scripts
pnpm --filter @gen/editor-adapters typecheck
pnpm --filter @gen/editor-adapters build
pnpm lint                        # zero NEW violations in your files
node scripts/architecture/architecture-check.mjs check   # 0 new violations
pnpm spec:validate
# + your own test entrypoints (declared in package.json scripts.test)
```

## 5. Report format (COMPLETION REPORT — last message, exact)

```
COMPLETION REPORT — Worker 2 (Editing Ecosystem)
Base SHA: <phase-0-sha>   Branch: w2-editing-ecosystem   Head SHA: <sha>
Gate table:
  typecheck/build: <real numbers>
  lint: <violations before/after in YOUR files>
  architecture: <new violations count>
  spec:validate: OK/FAIL
  tests: <counts; binary-present vs skipped per editor>
Adapters: <editor → mode → capabilities → live/scipped evidence>
OTIO exchange: <round-trip fidelity per editor>
Mode evaluation: <committed record paths>
Gap reports: <ids written, kinds>
Contract change requests: <none | list with rationale>
Divergences from this work order: <none | list>
```

The TL re-runs every gate at your pushed SHA (lock §8.10).
