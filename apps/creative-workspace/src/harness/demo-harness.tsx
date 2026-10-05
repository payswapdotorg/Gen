/**
 * Demo harness page (work order task 1): a thin composition root that mounts
 * the workspace with COMMITTED records — scenario A (T2 documentary run),
 * scenario B (T4 forced failure with the real gap report) and scenario C
 * (premium vs open-model alternatives with measured deltas). Sits outside the
 * domain/app/ui/adapters layer dirs (layerless composition, the same pattern
 * as @gen/media-providers src/runtime.ts) so layer direction stays clean.
 *
 * The consuming shell imports the library surface from src/index.ts; this
 * harness is the acceptance-facing demo mount (demo/render.ts renders it to a
 * static page; tests assert the same content).
 */
import type { CSSProperties } from "react";
import type { WorkspaceMount, WorkspaceScenarioId } from "../contract.js";
import { createWorkspaceService } from "../app/workspace-service.js";
import { createFsRecordSource } from "../adapters/fs-record-source.js";
import { WorkspaceView } from "../ui/workspace-view.js";
import { PlanSkeleton } from "../ui/plan-skeleton.js";
import { mono, muted, page, palette, stack, subheading, text } from "../ui/styles.js";

const shellStyle: CSSProperties = {
  ...page,
  maxWidth: 980,
  margin: "0 auto",
  padding: "28px 16px 40px",
  display: "flex",
  flexDirection: "column",
  gap: 22,
  minHeight: "100vh",
  boxSizing: "border-box",
};

const heroStyle: CSSProperties = {
  ...stack,
  background: palette.surface,
  border: `1px solid ${palette.line}`,
  borderRadius: 10,
  padding: "18px 20px",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 750,
  letterSpacing: 0.2,
};

const navStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  margin: 0,
  padding: 0,
  listStyle: "none",
};

const footerStyle: CSSProperties = {
  ...stack,
  marginTop: "auto",
  borderTop: `1px solid ${palette.line}`,
  paddingTop: 14,
};

export interface DemoHarnessProps {
  readonly mounts: readonly WorkspaceMount[];
}

export function DemoHarness({ mounts }: DemoHarnessProps): React.JSX.Element {
  return (
    <div style={shellStyle}>
      <header style={heroStyle}>
        <h1 style={titleStyle}>Gen Creative Workspace — TaskPlan surface</h1>
        <p style={muted}>
          Lock P4: the user never sees a black-box generation process. Every mount below renders committed program
          records (agent-lab evidence, gap reports, routing alternatives) — no network, no fabricated demo data.
        </p>
        <nav aria-label="harness scenarios">
          <ul style={navStyle}>
            {mounts.map((mount) => (
              <li key={mount.scenarioId}>
                <a
                  href={`#scenario-${mount.scenarioId}`}
                  style={{ ...mono, color: palette.accentInk, textDecoration: "none" }}
                >
                  ▸ {mount.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main style={stack}>
        {mounts.map((mount) => (
          <section
            key={mount.scenarioId}
            id={`scenario-${mount.scenarioId}`}
            style={stack}
            aria-label={mount.title}
          >
            <h2 style={{ ...text, fontSize: 16, fontWeight: 700, margin: 0 }}>{mount.title}</h2>
            <WorkspaceView mount={mount} />
          </section>
        ))}
        <section style={stack} aria-label="loading state preview">
          <h2 style={{ ...text, fontSize: 16, fontWeight: 700, margin: 0 }}>Loading state — plan skeleton</h2>
          <p style={muted}>
            Records load through the record-source port; while they load the workspace shows the plan skeleton —
            never a bare spinner (spec/task-plan.md §3).
          </p>
          <PlanSkeleton
            state={{
              phase: "loading",
              scenarioId: mounts[0]?.scenarioId ?? "documentary-cinematic",
              note: "loading committed records… (static preview of the live loading state)",
            }}
          />
        </section>
      </main>
      <footer style={footerStyle}>
        <p style={{ ...subheading, marginTop: 0 }}>provenance</p>
        <p style={{ ...mono, color: palette.muted, whiteSpace: "pre-line", margin: 0 }}>
          {[
            "packages/agent-lab/src/domain/scenarios/ (committed scenarios, pinned seeds)",
            "packages/agent-lab/src/domain/organizations/ + evaluations/ (committed evidence)",
            "packages/arena-bridge/src/domain/gaps/ (committed gap reports + signals)",
            "packages/media-providers/src/domain/evaluations/ (committed provider measurements)",
            "spec/examples/task-plan.replace-actor.json (committed plan example)",
          ].join("\n")}
        </p>
        <p style={muted}>
          Static demo render — alternative switching is progressive enhancement; the React components implement the
          full switchable surface (deltas before switching).
        </p>
      </footer>
    </div>
  );
}

/** Load every harness scenario mount from the committed records. */
export async function loadDemoMounts(): Promise<readonly WorkspaceMount[]> {
  const service = createWorkspaceService({ recordSource: createFsRecordSource() });
  const order: readonly WorkspaceScenarioId[] = service.scenarioIds;
  const mounts: WorkspaceMount[] = [];
  for (const scenarioId of order) {
    mounts.push(await service.mount(scenarioId));
  }
  return mounts;
}
