# ui layer

Pure React 19 component surface (P4 — the user never sees a black-box generation process):

- `plan-header.tsx`: goal + current step, sticky — always visible during execution.
- `plan-skeleton.tsx`: loading/empty states render the plan skeleton, never a bare spinner.
- `evidence-links.tsx`: completed items link their evidence (run-record refs, gate results, artifact refs).
- `next-section.tsx`: upcoming actions with owner nodes.
- `blocked-section.tsx`: reason + kind; capability blocks link the real gap report.
- `alternatives-section.tsx`: switchable paths with cost/latency/quality deltas shown before switching.
- `run-panel.tsx` / `organization-panel.tsx`: run-record + agent-organization evidence behind the plan.
- `workspace-view.tsx` / `workspace-root.tsx`: mount assembly + load lifecycle.
- `styles.ts`: plain inline-style tokens — no CSS framework (work-order boundary).

Layer rules (ARCHITECTURE_LOCK.md §4): depends only on contract surfaces; no IO, no record loading (that is the adapters layer's job).
