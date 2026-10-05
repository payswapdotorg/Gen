/**
 * Organization panel (P2): the agent organization behind the plan — bodies
 * (stable) with their cognitive models (provider/model per node), stages and
 * certification evidence. The workspace renders the COMMITTED certification
 * state — certified or honestly refused.
 */
import type { OrganizationView } from "../contract.js";
import { chip, mono, muted, page, palette, stack, subheading, table, td, text, th } from "./styles.js";

export interface OrganizationPanelProps {
  readonly organization: OrganizationView;
}

export function OrganizationPanel({ organization }: OrganizationPanelProps): React.JSX.Element {
  return (
    <section
      aria-labelledby="org-heading"
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
        <h3 id="org-heading" style={{ ...text, fontWeight: 700, margin: 0 }}>
          Agent organization
        </h3>
        <span style={chip(organization.certified ? "accent" : "danger")}>
          {organization.certified ? "certified" : "certification refused"}
        </span>
        {organization.fitness !== undefined ? (
          <span style={chip("neutral")}>fitness {organization.fitness.toFixed(4)}</span>
        ) : null}
        <span style={{ ...mono, color: palette.muted }}>{organization.id}</span>
      </div>
      <p style={muted}>{organization.goal}</p>
      {organization.certificationNote !== undefined ? <p style={text}>{organization.certificationNote}</p> : null}
      {organization.certificationEvidence !== undefined ? (
        <div style={{ ...mono, color: palette.muted }}>
          <span>scenario set: {organization.certificationEvidence.scenarioSetRef}</span>
          <br />
          <span>replay: {organization.certificationEvidence.replayRef}</span>
          {organization.certificationEvidence.certifiedAt !== undefined ? (
            <>
              <br />
              <span>certified at: {organization.certificationEvidence.certifiedAt}</span>
            </>
          ) : null}
          {organization.certificationEvidence.gapReportsResolved !== undefined ? (
            <>
              <br />
              <span>gap reports resolved: {String(organization.certificationEvidence.gapReportsResolved)}</span>
            </>
          ) : null}
        </div>
      ) : null}
      <div>
        <p style={subheading}>nodes — bodies with their inhabiting models (P2)</p>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>node</th>
              <th style={th}>kind</th>
              <th style={th}>body / role</th>
              <th style={th}>model</th>
            </tr>
          </thead>
          <tbody>
            {organization.nodes.map((node) => (
              <tr key={node.nodeId}>
                <td style={{ ...td, ...mono }}>{node.nodeId}</td>
                <td style={{ ...td, ...mono }}>{node.kind}</td>
                <td style={td}>{node.bodyId ?? node.role ?? node.label}</td>
                <td style={{ ...td, ...mono }}>{node.model ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <p style={subheading}>execution order</p>
        <ol style={{ ...stack, margin: 0, padding: 0, listStyle: "none" }}>
          {organization.stages.map((stage) => (
            <li key={stage.stageId} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={chip("neutral")}>{stage.stageId}</span>
              <span style={{ ...mono, color: palette.muted }}>{stage.nodeIds.join(", ")}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
