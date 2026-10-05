/**
 * Alternatives section (spec/task-plan.md §3 obligation 6): switchable routing
 * paths with cost/latency/quality deltas shown BEFORE switching. Deltas render
 * above the switch control and stay visible during the decision; switching
 * raises the routing request (the orchestrator owns the actual re-route).
 */
import { useState } from "react";
import type { CSSProperties } from "react";
import type { AlternativeView } from "../contract.js";
import { chip, mono, muted, page, palette, primaryButton, stack, subheading, table, td, text, th } from "./styles.js";

const cardStyle: CSSProperties = {
  ...page,
  background: palette.surface,
  border: `1px solid ${palette.line}`,
  borderRadius: 8,
  padding: "12px 14px",
};

const activeCardStyle: CSSProperties = {
  ...cardStyle,
  border: `1px solid ${palette.accent}`,
  background: palette.accentBg,
};

const dimensionLabel: Readonly<Record<AlternativeView["deltas"][number]["dimension"], string>> = {
  cost: "cost",
  latency: "latency",
  quality: "quality",
  reliability: "reliability",
};

export interface AlternativesSectionProps {
  readonly alternatives: readonly AlternativeView[];
  readonly onSwitchAlternative?: (path: string) => void;
}

export function AlternativesSection({
  alternatives,
  onSwitchAlternative,
}: AlternativesSectionProps): React.JSX.Element {
  const [switchedTo, setSwitchedTo] = useState<string | undefined>(undefined);
  return (
    <section aria-labelledby="alternatives-heading" style={stack}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <h3 id="alternatives-heading" style={{ ...text, fontWeight: 700, margin: 0 }}>
          Alternatives
        </h3>
        <span style={chip("neutral")}>{alternatives.length}</span>
        <span style={muted}>switchable — deltas shown before switching</span>
      </div>
      {alternatives.length === 0 ? (
        <p style={muted}>No alternative routing paths for this goal.</p>
      ) : (
        <ul style={{ ...stack, margin: 0, padding: 0, listStyle: "none" }}>
          {alternatives.map((alternative) => (
            <li
              key={alternative.path}
              style={alternative.active ? activeCardStyle : cardStyle}
              data-alt-path={alternative.path}
              data-switched={switchedTo === alternative.path ? "true" : "false"}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                {alternative.active ? <span style={chip("accent")}>current path</span> : null}
                <span style={{ ...text, fontWeight: 650 }}>{alternative.path}</span>
              </div>
              <p style={muted}>{alternative.tradeoffs}</p>
              {alternative.deltas.length > 0 ? (
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>dimension</th>
                      <th style={th}>current</th>
                      <th style={th}>candidate</th>
                      <th style={th}>delta (before switching)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alternative.deltas.map((delta) => (
                      <tr key={delta.dimension}>
                        <td style={{ ...td, ...mono }}>{dimensionLabel[delta.dimension]}</td>
                        <td style={td}>{delta.current}</td>
                        <td style={td}>{delta.candidate}</td>
                        <td style={td}>{delta.delta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ ...muted, ...mono }}>
                  deltas: declared tradeoff metadata only (no measured rows for this path)
                </p>
              )}
              {alternative.deltas[0]?.source !== undefined ? (
                <p style={{ ...subheading, marginTop: 8 }}>measured: {alternative.deltas[0]?.source}</p>
              ) : null}
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  style={{ ...primaryButton, ...(alternative.active ? { opacity: 0.5, cursor: "default" } : {}) }}
                  disabled={alternative.active}
                  onClick={() => {
                    setSwitchedTo(alternative.path);
                    onSwitchAlternative?.(alternative.path);
                  }}
                  data-switch-button={alternative.path}
                >
                  {alternative.active ? "current path" : "switch to this path"}
                </button>
                <span
                  style={{
                    ...chip("accent"),
                    display: switchedTo === alternative.path ? "inline-block" : "none",
                  }}
                  role="status"
                  data-switch-status={alternative.path}
                >
                  routing switch requested — next plan update reflects it
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
