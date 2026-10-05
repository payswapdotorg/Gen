/**
 * Next section: upcoming actions with owner node refs (schema passthrough).
 */
import type { CSSProperties } from "react";
import type { TaskPlanNextAction } from "../contract.js";
import { chip, mono, muted, page, palette, stack, text } from "./styles.js";

const itemStyle: CSSProperties = {
  ...page,
  borderLeft: `3px solid ${palette.line}`,
  background: palette.surface,
  borderRadius: "0 8px 8px 0",
  padding: "8px 12px",
};

export interface NextSectionProps {
  readonly next: readonly TaskPlanNextAction[];
}

export function NextSection({ next }: NextSectionProps): React.JSX.Element {
  return (
    <section aria-labelledby="next-heading" style={stack}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <h3 id="next-heading" style={{ ...text, fontWeight: 700, margin: 0 }}>
          Next
        </h3>
        <span style={chip("neutral")}>{next.length}</span>
      </div>
      {next.length === 0 ? (
        <p style={muted}>No upcoming actions — the plan is at its final state.</p>
      ) : (
        <ol style={{ ...stack, margin: 0, padding: 0, listStyle: "none" }}>
          {next.map((action) => (
            <li key={action.action} style={itemStyle}>
              <span style={text}>{action.action}</span>
              <span style={{ ...mono, color: palette.muted, display: "block", marginTop: 2 }}>
                owner {action.ownerNode ?? "—"}
                {action.eta !== undefined ? ` · eta ${action.eta}` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
