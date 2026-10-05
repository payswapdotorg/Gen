/**
 * Workspace UI style tokens (plain inline styles — no CSS framework, per the
 * work order boundaries). One shared vocabulary keeps every panel visually
 * coherent; the demo page adds a small page-level <style> block for chrome.
 */
import type { CSSProperties } from "react";

export const palette = {
  bg: "#f5f6f3",
  surface: "#ffffff",
  ink: "#1c1f1d",
  muted: "#5b635d",
  line: "#e2e5df",
  accent: "#0f766e",
  accentBg: "#e7f2ef",
  accentInk: "#0b5a54",
  warn: "#a05a00",
  warnBg: "#fdf2e2",
  danger: "#a92c21",
  dangerBg: "#fbeae7",
  code: "#37402a",
} as const;

export const page: CSSProperties = {
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  color: palette.ink,
  background: palette.bg,
  margin: 0,
};

export const card: CSSProperties = {
  background: palette.surface,
  border: `1px solid ${palette.line}`,
  borderRadius: 10,
  padding: "16px 18px",
};

export const stack: CSSProperties = { display: "flex", flexDirection: "column", gap: 14 };

export const row: CSSProperties = {
  display: "flex",
  flexDirection: "row",
  alignItems: "baseline",
  gap: 8,
  flexWrap: "wrap",
};

export const heading: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 650,
  letterSpacing: 0.1,
};

export const subheading: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 650,
  color: palette.muted,
  textTransform: "uppercase",
  letterSpacing: 0.8,
};

export const text: CSSProperties = { margin: 0, fontSize: 13.5, lineHeight: 1.55 };

export const muted: CSSProperties = { ...text, color: palette.muted };

export const mono: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontSize: 12,
};

export function chip(tone: "neutral" | "accent" | "warn" | "danger"): CSSProperties {
  const tones: Record<string, CSSProperties> = {
    neutral: { color: palette.muted, background: "#f0f1ec", borderColor: palette.line },
    accent: { color: palette.accentInk, background: palette.accentBg, borderColor: "#bcd9d3" },
    warn: { color: palette.warn, background: palette.warnBg, borderColor: "#eed7b5" },
    danger: { color: palette.danger, background: palette.dangerBg, borderColor: "#eec6c0" },
  };
  return {
    ...tones[tone],
    ...mono,
    display: "inline-block",
    padding: "1px 8px",
    borderRadius: 999,
    border: "1px solid",
    whiteSpace: "nowrap",
  };
}

export const linkButton: CSSProperties = {
  ...mono,
  appearance: "none",
  border: `1px solid ${palette.line}`,
  background: "#f7f8f4",
  color: palette.ink,
  borderRadius: 6,
  padding: "2px 8px",
  cursor: "pointer",
  textAlign: "left",
};

export const primaryButton: CSSProperties = {
  ...mono,
  appearance: "none",
  border: `1px solid ${palette.accent}`,
  background: palette.accent,
  color: "#ffffff",
  borderRadius: 6,
  padding: "5px 12px",
  cursor: "pointer",
};

export const detailBox: CSSProperties = {
  background: "#fafbf8",
  border: `1px solid ${palette.line}`,
  borderRadius: 8,
  padding: "8px 10px",
  marginTop: 6,
};

export const table: CSSProperties = {
  borderCollapse: "collapse",
  width: "100%",
};

export const th: CSSProperties = {
  ...mono,
  textAlign: "left",
  fontWeight: 600,
  color: palette.muted,
  borderBottom: `1px solid ${palette.line}`,
  padding: "3px 10px 3px 0",
  whiteSpace: "nowrap",
};

export const td: CSSProperties = {
  ...text,
  padding: "4px 10px 4px 0",
  borderBottom: `1px solid ${palette.line}`,
  verticalAlign: "top",
};

export const sectionRule: CSSProperties = {
  border: 0,
  borderTop: `1px solid ${palette.line}`,
  margin: "14px 0 0",
};
