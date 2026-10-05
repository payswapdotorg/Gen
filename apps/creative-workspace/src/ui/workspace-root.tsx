/**
 * Workspace root: the mount lifecycle — loading shows the PLAN SKELETON
 * (obligation 7: never a bare spinner), ready renders the full workspace,
 * errors surface as actionable text with the scenario id. The record loading
 * arrives as an injected function (pure component layer — no IO here).
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { WorkspaceLoadState, WorkspaceMount, WorkspaceScenarioId } from "../contract.js";
import { PlanSkeleton } from "./plan-skeleton.js";
import { WorkspaceView } from "./workspace-view.js";
import { chip, mono, page, palette, stack, text } from "./styles.js";

const errorStyle: CSSProperties = {
  ...page,
  border: `1px solid #eec6c0`,
  background: palette.dangerBg,
  borderRadius: 10,
  padding: "14px 16px",
};

export interface WorkspaceErrorPanelProps {
  readonly scenarioId: WorkspaceScenarioId;
  readonly message: string;
}

/** Error surface: actionable text with the scenario id — never a silent failure. */
export function WorkspaceErrorPanel({ scenarioId, message }: WorkspaceErrorPanelProps): React.JSX.Element {
  return (
    <section style={{ ...errorStyle, ...stack }} role="alert" data-testid={`workspace-error-${scenarioId}`}>
      <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
        <span style={chip("danger")}>load failed</span>
        <span style={{ ...mono, color: palette.muted }}>{scenarioId}</span>
      </div>
      <p style={text}>{message}</p>
      <p style={{ ...text, color: palette.muted }}>
        Records are committed files — check the record source paths for this scenario.
      </p>
    </section>
  );
}

export interface WorkspaceRootProps {
  readonly scenarioId: WorkspaceScenarioId;
  readonly loadMount: () => Promise<WorkspaceMount>;
  readonly onSwitchAlternative?: (path: string) => void;
}

export function WorkspaceRoot({ scenarioId, loadMount, onSwitchAlternative }: WorkspaceRootProps): React.JSX.Element {
  const [state, setState] = useState<WorkspaceLoadState>({
    phase: "loading",
    scenarioId,
    note: "loading committed records…",
  });

  useEffect(() => {
    let active = true;
    setState({ phase: "loading", scenarioId, note: "loading committed records…" });
    loadMount()
      .then((mount) => {
        if (active) setState({ phase: "ready", mount });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({
            phase: "error",
            scenarioId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [scenarioId, loadMount]);

  if (state.phase === "loading") {
    return <PlanSkeleton state={state} />;
  }
  if (state.phase === "error") {
    return <WorkspaceErrorPanel scenarioId={state.scenarioId} message={state.message} />;
  }
  return <WorkspaceView mount={state.mount} onSwitchAlternative={onSwitchAlternative} />;
}
