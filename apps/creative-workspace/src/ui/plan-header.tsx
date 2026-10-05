/**
 * Plan header (spec/task-plan.md §3 obligation 1): goal + current step,
 * ALWAYS visible during execution — sticky at the top of the mount.
 */
import type { CSSProperties } from "react";
import type { TaskPlan } from "../contract.js";
import { chip, mono, palette, page } from "./styles.js";

const headerStyle: CSSProperties = {
  ...page,
  position: "sticky",
  top: 0,
  zIndex: 5,
  background: `${palette.surface}f2`,
  backdropFilter: "blur(4px)",
  borderBottom: `1px solid ${palette.line}`,
  borderRadius: "10px 10px 0 0",
  padding: "14px 18px",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const goalStyle: CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 700,
  lineHeight: 1.35,
};

const stepStyle: CSSProperties = {
  margin: 0,
  fontSize: 13.5,
  color: palette.accentInk,
  fontWeight: 600,
};

export interface PlanHeaderProps {
  readonly plan: TaskPlan;
}

export function PlanHeader({ plan }: PlanHeaderProps): React.JSX.Element {
  return (
    <header style={headerStyle}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
        <span style={chip("accent")}>{plan.planId}</span>
        <span style={{ ...mono, color: palette.muted }}>
          updated {plan.updatedAt}
          {plan.runRecordRef !== undefined ? ` · ${plan.runRecordRef}` : ""}
        </span>
      </div>
      <h2 style={goalStyle}>{plan.goal}</h2>
      <p style={stepStyle} aria-live="polite">
        ▸ {plan.currentStep}
      </p>
    </header>
  );
}
