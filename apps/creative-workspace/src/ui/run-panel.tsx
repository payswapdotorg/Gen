/**
 * Run panel: the simulation run record behind the plan — stage snapshots,
 * event trace (bounded, scrollable), artifacts, criteria results and
 * telemetry. Every number is reproducible from the pinned seed (replay hash
 * shown with its committed provenance).
 */
import type { CSSProperties } from "react";
import type { RunRecordView } from "../contract.js";
import { chip, detailBox, mono, muted, page, palette, stack, subheading, table, td, text, th } from "./styles.js";

const eventListStyle: CSSProperties = {
  ...mono,
  maxHeight: 260,
  overflowY: "auto",
  margin: 0,
  padding: "6px 10px",
  listStyle: "none",
  border: `1px solid ${palette.line}`,
  borderRadius: 8,
  background: "#fafbf8",
};

const EVENT_TONES: Readonly<Record<string, "neutral" | "accent" | "warn" | "danger">> = {
  "stage-started": "neutral",
  "stage-completed": "accent",
  "artifact-produced": "accent",
  "approval-recorded": "warn",
  "gap-signaled": "danger",
};

export interface RunPanelProps {
  readonly run: RunRecordView;
}

export function RunPanel({ run }: RunPanelProps): React.JSX.Element {
  const criteriaMet = run.criteriaResults.filter((criterion) => criterion.met).length;
  return (
    <section
      aria-labelledby="run-heading"
      style={{
        ...page,
        ...stack,
        background: palette.surface,
        border: `1px solid ${palette.line}`,
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <h3 id="run-heading" style={{ ...text, fontWeight: 700, margin: 0 }}>
          Run record
        </h3>
        <span style={chip(run.finished ? "accent" : "warn")}>{run.finished ? "finished" : "aborted"}</span>
        <span style={{ ...mono, color: palette.muted }}>{run.runRecordRef}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span style={chip("neutral")}>seed {run.seed}</span>
        <span style={chip("neutral")}>replay {run.replayHash}</span>
        <span style={chip("neutral")}>spend ${run.totalSpendUsd.toFixed(2)}</span>
        <span style={chip("neutral")}>approvals {run.approvalCount}</span>
        <span style={chip("neutral")}>artifacts {run.artifacts.length}</span>
        <span style={chip("neutral")}>
          criteria {criteriaMet}/{run.criteriaResults.length}
        </span>
      </div>
      {run.failureReason !== undefined ? <p style={text}>{run.failureReason}</p> : null}
      <div>
        <p style={subheading}>stage transitions (TaskPlan snapshots)</p>
        <ol style={{ ...stack, margin: "6px 0 0", padding: 0, listStyle: "none" }}>
          {run.planSnapshots.map((snapshot) => (
            <li key={`${snapshot.stageId}-${snapshot.completedCount}`} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={chip("accent")}>
                {snapshot.completedCount}/{snapshot.totalStages}
              </span>
              <span style={text}>{snapshot.currentStep}</span>
            </li>
          ))}
        </ol>
      </div>
      <div>
        <p style={subheading}>event trace (evidence for completed stages)</p>
        <ul style={eventListStyle}>
          {run.events.map((event) => (
            <li key={event.seq} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
              <span style={{ color: palette.muted, minWidth: 52 }}>{event.atMs}ms</span>
              <span style={chip(EVENT_TONES[event.type] ?? "neutral")}>{event.type}</span>
              <span style={{ color: palette.ink }}>{event.detail}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p style={subheading}>success criteria</p>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>criterion</th>
              <th style={th}>result</th>
            </tr>
          </thead>
          <tbody>
            {run.criteriaResults.map((criterion) => (
              <tr key={criterion.id}>
                <td style={td}>{criterion.description}</td>
                <td style={td}>
                  <span style={chip(criterion.met ? "accent" : "danger")}>{criterion.met ? "met" : "missed"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {run.artifacts.length > 0 ? (
        <div style={detailBox}>
          <p style={{ ...subheading, marginTop: 0 }}>artifacts produced</p>
          <p style={{ ...mono, color: palette.ink, margin: 0 }}>{run.artifacts.join("\n")}</p>
        </div>
      ) : null}
      <p style={muted}>
        Run replayed deterministically from committed records (organization graph + scenario seed); replay hash pins the
        identity of the run.
      </p>
    </section>
  );
}
