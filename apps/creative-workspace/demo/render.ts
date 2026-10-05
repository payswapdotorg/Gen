/**
 * Demo page renderer: mounts the demo harness with the committed records and
 * renders a static HTML page (react-dom/server). The page carries a small
 * vanilla enhancement so alternative switching works without a bundler —
 * the React components implement the full switchable surface.
 *
 * Run: pnpm --filter @gen/creative-workspace demo:render
 * Output: demo/dist/index.html (gitignored — derived deterministically from
 * committed records; the renderer regenerates it at any time).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DemoHarness, loadDemoMounts } from "../src/harness/demo-harness.js";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "dist");
const outPath = join(outDir, "index.html");

const PAGE_CSS = `
  html { background: #f5f6f3; }
  * { box-sizing: border-box; }
  a { color: #0b5a54; }
  [data-switch-button]:not([disabled]):hover { filter: brightness(1.08); }
  [data-alt-path] { transition: border-color 120ms ease; }
  [data-alt-path][data-switched="true"] { border-color: #0f766e !important; }
`;

const PAGE_SCRIPT = `
  function toggleDetail(button, detailSelector) {
    var detail = button.parentElement.querySelector(detailSelector);
    if (!detail) return false;
    var open = detail.style.display !== "none";
    detail.style.display = open ? "none" : "block";
    button.setAttribute("aria-expanded", String(!open));
    return true;
  }
  document.querySelectorAll("[data-switch-button]").forEach(function (button) {
    if (button.disabled) return;
    button.addEventListener("click", function () {
      var card = button.closest("[data-alt-path]");
      if (!card) return;
      card.setAttribute("data-switched", "true");
      var status = card.querySelector("[data-switch-status]");
      if (status) status.style.display = "inline-block";
      button.setAttribute("aria-pressed", "true");
    });
  });
  // Evidence + gap detail boxes are pre-rendered (hidden) — vanilla toggle.
  document.querySelectorAll("button[aria-expanded]").forEach(function (button) {
    if (button.hasAttribute("data-switch-button")) return;
    button.addEventListener("click", function () {
      if (toggleDetail(button, "[data-evidence-detail]")) return;
      toggleDetail(button, "[data-gap-detail]");
    });
  });
`;

async function main(): Promise<void> {
  const mounts = await loadDemoMounts();
  const markup = renderToStaticMarkup(createElement(DemoHarness, { mounts }));
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gen Creative Workspace — TaskPlan demo harness</title>
<style>${PAGE_CSS}</style>
</head>
<body>
${markup}
<script>${PAGE_SCRIPT}</script>
</body>
</html>
`;
  await mkdir(outDir, { recursive: true });
  await writeFile(outPath, html, "utf8");
  const scenarioLines = mounts
    .map((mount) => `  - ${mount.scenarioId}: ${mount.planView.plan.planId} (${mount.title})`)
    .join("\n");
  console.log(`demo harness rendered → ${outPath}`);
  console.log(`scenarios mounted from committed records:\n${scenarioLines}`);
}

await main();
