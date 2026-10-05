/**
 * Workspace view: one mounted scenario — the always-visible plan header plus
 * the P4 sections (completed/next/blocked/alternatives) and the run record +
 * agent organization panels behind them.
 */
import type { CSSProperties } from "react";
import type { WorkspaceMount } from "../contract.js";
import { PlanHeader } from "./plan-header.js";
import { CompletedSection } from "./evidence-links.js";
import { NextSection } from "./next-section.js";
import { BlockedSection } from "./blocked-section.js";
import { AlternativesSection } from "./alternatives-section.js";
import { RunPanel } from "./run-panel.js";
import { OrganizationPanel } from "./organization-panel.js";
import { muted, page, palette, stack, subheading, text } from "./styles.js";

const mountStyle: CSSProperties = {
  ...page,
  background: palette.surface,
  border: `1px solid ${palette.line}`,
  borderRadius: 10,
  // No overflow clipping: an overflow-hidden ancestor breaks the sticky
  // plan header (the header owns its top rounded corners instead).
};

const bodyStyle: CSSProperties = { ...stack, padding: 16 };

export interface WorkspaceViewProps {
  readonly mount: WorkspaceMount;
  readonly onSwitchAlternative?: (path: string) => void;
}

export function WorkspaceView({ mount, onSwitchAlternative }: WorkspaceViewProps): React.JSX.Element {
  const { planView, run, organization, gapReports } = mount;
  return (
    <article style={mountStyle} data-workspace={mount.scenarioId} aria-label={mount.title}>
      <PlanHeader plan={planView.plan} />
      <div style={bodyStyle}>
        <p style={muted}>{mount.summary}</p>
        <CompletedSection completed={planView.completed} />
        <NextSection next={planView.next} />
        <BlockedSection blocked={planView.blocked} gapReports={gapReports} />
        <AlternativesSection
          alternatives={planView.alternative}
          onSwitchAlternative={onSwitchAlternative}
        />
        <hr style={{ border: 0, borderTop: `1px solid ${palette.line}`, margin: "4px 0" }} />
        {run !== undefined ? <RunPanel run={run} /> : null}
        {organization !== undefined ? <OrganizationPanel organization={organization} /> : null}
        <div>
          <p style={subheading}>provenance — committed records behind this mount</p>
          <p
            style={{
              ...text,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: 12,
              color: palette.muted,
              whiteSpace: "pre-line",
            }}
          >
            {mount.provenance.join("\n")}
          </p>
        </div>
      </div>
    </article>
  );
}
