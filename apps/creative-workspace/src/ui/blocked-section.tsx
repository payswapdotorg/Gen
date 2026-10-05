/**
 * Blocked section (spec/task-plan.md §3 obligation 5): reason + kind for every
 * blocked item; kind=capability items link the real gap report — summary,
 * router trace, arena state and the committed source path.
 */
import { useState } from "react";
import type { CSSProperties } from "react";
import type { BlockedItemView, GapReportView } from "../contract.js";
import { chip, detailBox, linkButton, mono, muted, page, palette, stack, subheading, text } from "./styles.js";

const itemStyle: CSSProperties = {
  ...page,
  border: `1px solid #eed7b5`,
  background: palette.warnBg,
  borderRadius: 8,
  padding: "10px 12px",
};

const kindTone: Readonly<Record<BlockedItemView["kind"], "warn" | "danger" | "neutral">> = {
  capability: "danger",
  provider: "warn",
  input: "warn",
  "human-approval": "neutral",
};

function GapDetail({ gap, reports }: { gap: BlockedItemView["gap"]; reports: readonly GapReportView[] }): React.JSX.Element | null {
  const [open, setOpen] = useState(false);
  if (gap === undefined) return null;
  const full = reports.find((report) => report.gapId === gap.gapId);
  return (
    <div style={{ ...stack, gap: 6, marginTop: 6 }}>
      <button
        type="button"
        style={linkButton}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span style={chip("danger")}>gap report</span> {gap.gapId} · arena: {gap.arenaState} · {gap.severity}
      </button>
      <div
        style={{ ...detailBox, display: open ? "block" : "none" }}
        role="note"
        data-gap-detail={gap.gapId}
      >
        <p style={{ ...subheading, marginTop: 0 }}>capability gap report (committed)</p>
        <p style={text}>{gap.summary}</p>
        {full?.routerDecisionTrace !== undefined ? (
          <p style={{ ...mono, color: palette.muted, margin: "6px 0 0" }}>{full.routerDecisionTrace}</p>
        ) : null}
        <dl style={{ ...stack, gap: 2, margin: "8px 0 0" }}>
          <div style={mono}>
            <dt style={{ display: "inline", color: palette.muted }}>kind: </dt>
            <dd style={{ display: "inline" }}>{gap.gapKind}</dd>
          </div>
          <div style={mono}>
            <dt style={{ display: "inline", color: palette.muted }}>requested capability: </dt>
            <dd style={{ display: "inline" }}>{gap.requestedCapabilityId ?? "—"}</dd>
          </div>
          <div style={mono}>
            <dt style={{ display: "inline", color: palette.muted }}>proposed capability: </dt>
            <dd style={{ display: "inline" }}>{gap.proposedCapabilityId ?? "—"}</dd>
          </div>
          <div style={mono}>
            <dt style={{ display: "inline", color: palette.muted }}>goal class: </dt>
            <dd style={{ display: "inline" }}>{gap.goalClass}</dd>
          </div>
          <div style={mono}>
            <dt style={{ display: "inline", color: palette.muted }}>source: </dt>
            <dd style={{ display: "inline" }}>{gap.sourcePath}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export interface BlockedSectionProps {
  readonly blocked: readonly BlockedItemView[];
  readonly gapReports: readonly GapReportView[];
}

export function BlockedSection({ blocked, gapReports }: BlockedSectionProps): React.JSX.Element {
  return (
    <section aria-labelledby="blocked-heading" style={stack}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <h3 id="blocked-heading" style={{ ...text, fontWeight: 700, margin: 0 }}>
          Blocked
        </h3>
        <span style={chip(blocked.length > 0 ? "danger" : "neutral")}>{blocked.length}</span>
      </div>
      {blocked.length === 0 ? (
        <p style={muted}>Nothing blocked — no capability gaps on this path.</p>
      ) : (
        <ul style={{ ...stack, margin: 0, padding: 0, listStyle: "none" }}>
          {blocked.map((item) => (
            <li key={`${item.kind}-${item.reason}`} style={itemStyle}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={chip(kindTone[item.kind])}>{item.kind}</span>
                <span style={text}>{item.reason}</span>
              </div>
              {item.missingInput !== undefined ? (
                <p style={{ ...muted, margin: "6px 0 0" }}>missing input: {item.missingInput}</p>
              ) : null}
              {item.kind === "capability" && item.gap === undefined && item.capabilityGapRef !== undefined ? (
                <p style={{ ...muted, ...mono, margin: "6px 0 0" }}>
                  gap ref {item.capabilityGapRef} — report not loaded (P5: a capability block must link a gap report)
                </p>
              ) : null}
              <GapDetail gap={item.gap} reports={gapReports} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
