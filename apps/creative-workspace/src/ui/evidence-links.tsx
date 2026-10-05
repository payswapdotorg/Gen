/**
 * Evidence links (spec/task-plan.md §3 obligation 4): every completed item
 * links its evidence — artifact refs, run-record refs, gate results — with
 * provenance to the committed records backing them. Expandable detail rows.
 */
import { useState } from "react";
import type { CSSProperties } from "react";
import type { CompletedItemView, EvidenceLink } from "../contract.js";
import { chip, detailBox, linkButton, mono, muted, page, palette, stack, text } from "./styles.js";

const itemStyle: CSSProperties = {
  ...page,
  background: palette.surface,
  border: `1px solid ${palette.line}`,
  borderRadius: 8,
  padding: "10px 12px",
};

const itemLineStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "baseline",
  flexWrap: "wrap",
};

const kindTone: Readonly<Record<EvidenceLink["kind"], "neutral" | "accent" | "warn">> = {
  "run-event": "neutral",
  "run-artifact": "accent",
  "gate-result": "warn",
  "declared-ref": "neutral",
};

function EvidenceLinkButton({ link }: { link: EvidenceLink }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 0 }}>
      <button
        type="button"
        style={linkButton}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        title={link.detail ?? link.ref}
      >
        <span style={chip(kindTone[link.kind])}>{link.kind}</span> {link.label}
      </button>
      <span
        style={{ ...detailBox, display: open ? "block" : "none" }}
        role="note"
        data-evidence-detail={link.ref}
      >
        <span style={{ ...mono, display: "block", color: palette.muted }}>{link.ref}</span>
        {link.detail !== undefined ? (
          <span style={{ ...text, display: "block", marginTop: 4 }}>{link.detail}</span>
        ) : null}
        <span style={{ ...muted, display: "block", marginTop: 4, ...mono }}>
          {link.sourcePaths.join("\n")}
        </span>
      </span>
    </span>
  );
}

export interface CompletedSectionProps {
  readonly completed: readonly CompletedItemView[];
}

export function CompletedSection({ completed }: CompletedSectionProps): React.JSX.Element {
  return (
    <section aria-labelledby="completed-heading" style={stack}>
      <div style={itemLineStyle}>
        <h3 id="completed-heading" style={{ ...text, fontWeight: 700, margin: 0 }}>
          Completed
        </h3>
        <span style={chip("accent")}>{completed.length}</span>
      </div>
      {completed.length === 0 ? (
        <p style={muted}>Nothing completed yet — the plan is live behind this surface.</p>
      ) : (
        <ol style={{ ...stack, margin: 0, padding: 0, listStyle: "none" }}>
          {completed.map((item) => (
            <li key={item.item} style={itemStyle}>
              <div style={itemLineStyle}>
                {item.verified ? <span style={chip("accent")}>✓ done</span> : <span style={chip("danger")}>unverified claim</span>}
                <span style={text}>{item.item}</span>
              </div>
              <div style={{ ...stack, marginTop: 6, gap: 4 }}>
                {item.evidence.map((link) => (
                  <EvidenceLinkButton key={link.ref} link={link} />
                ))}
                {item.evidence.length === 0 ? (
                  <span style={{ ...muted, ...mono }}>no evidence refs — no completion mark (lock P4)</span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
