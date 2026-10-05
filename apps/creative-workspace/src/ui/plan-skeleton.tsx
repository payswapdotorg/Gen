/**
 * Plan skeleton (spec/task-plan.md §3 obligation 7): loading and empty states
 * render the plan STRUCTURE — goal line, current-step line, section outlines —
 * never a bare spinner. An indefinite spinner without a live plan behind it is
 * the P4 anti-pattern this component exists to make impossible.
 */
import type { CSSProperties } from "react";
import type { WorkspaceLoadState } from "../contract.js";
import { chip, mono, muted, page, palette, stack, subheading, text } from "./styles.js";

const skeletonBox: CSSProperties = {
  border: `1px dashed ${palette.line}`,
  borderRadius: 8,
  padding: "10px 12px",
  background: "#fafbf8",
};

const shimmerLine = (width: string): CSSProperties => ({
  height: 10,
  width,
  borderRadius: 4,
  background: `linear-gradient(90deg, ${palette.line} 25%, #f2f4ef 50%, ${palette.line} 75%)`,
  backgroundSize: "200% 100%",
  marginBottom: 6,
});

export interface PlanSkeletonProps {
  readonly state: Extract<WorkspaceLoadState, { phase: "loading" }>;
}

export function PlanSkeleton({ state }: PlanSkeletonProps): React.JSX.Element {
  return (
    <section
      style={{ ...page, ...stack, padding: 16, borderRadius: 10, background: palette.surface, border: `1px solid ${palette.line}` }}
      role="status"
      aria-busy="true"
      aria-label="TaskPlan loading — plan skeleton visible"
      data-testid={`plan-skeleton-${state.scenarioId}`}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
        <span style={chip("neutral")}>plan loading…</span>
        <span style={{ ...mono, color: palette.muted }}>{state.scenarioId}</span>
      </div>
      <div style={skeletonBox} aria-hidden="true">
        <div style={shimmerLine("62%")} />
        <div style={shimmerLine("88%")} />
        <div style={shimmerLine("47%")} />
      </div>
      <p style={text}>
        TaskPlan skeleton — goal and current step stay visible while records load:
      </p>
      <ul style={{ ...stack, margin: 0, paddingLeft: 18, listStyle: "none" }}>
        {["Completed — with evidence", "Next — with owner nodes", "Blocked — with gap links", "Alternatives — with deltas"].map(
          (section) => (
            <li key={section} style={muted}>
              {section}
            </li>
          ),
        )}
      </ul>
      {state.note !== undefined && state.note.length > 0 ? <p style={muted}>{state.note}</p> : null}
      <p style={{ ...subheading, marginTop: 0 }}>no bare spinner — the plan is the loading state</p>
    </section>
  );
}
