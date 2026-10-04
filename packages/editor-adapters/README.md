# @gen/editor-adapters

Editing software ecosystem: MLT, Blender, FFmpeg, Natron, Kdenlive, LosslessCut adapters behind editor.* capabilities; OTIO artifact exchange.

Contract: [`src/contract.ts`](src/contract.ts) mirrors the TL-owned schemas in [spec/schemas/](../../spec/schemas/) (parity is mandatory).
Ownership + rules: [ARCHITECTURE_LOCK.md](../../ARCHITECTURE_LOCK.md) §5. Work order: [work/](../../work/).
Layers: `src/domain` (pure) → `src/app` (ports) → `src/adapters` (execution) per .agents/skills/architecture-governance/SKILL.md.

Phase 0 skeleton — see the work order for the Phase 1 deliverables.
