#!/usr/bin/env node
/**
 * Builds the public status page served at https://work.hashpass.tech/status from the same generator as the
 * Plane "HASHPASS Mission Command Center" page, so the two never drift apart.
 *
 *   node packages/tools/scripts/build-status-page.mjs [--out dist/status/index.html]
 *
 * The page is public, so Plane's per-division work counts are left out (they describe private company work);
 * everything else comes from public GitHub data and public health probes. No credentials are read here.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMissionControlHtml, collectLiveData, webKit } from "./mission-control-page.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

// Plane's editor colour tokens, so the shared markup renders the same palette on this page.
const PALETTE = {
  "light-blue": ["#dbeafe", "#1d4ed8", "#1e3a5f", "#93c5fd"],
  green: ["#dcfce7", "#15803d", "#14532d", "#86efac"],
  orange: ["#ffedd5", "#c2410c", "#5a2a0d", "#fdba74"],
  peach: ["#fde7dc", "#b45309", "#5b3320", "#fdba9c"],
  purple: ["#ede9fe", "#6d28d9", "#3b2a6b", "#c4b5fd"],
  pink: ["#fce7f3", "#be185d", "#5b1f3d", "#f9a8d4"],
  gray: ["#f1f5f9", "#475569", "#2a3340", "#cbd5e1"],
  "dark-blue": ["#dbe4f5", "#1e3a8a", "#1c2a4d", "#a5b4fc"],
};
const vars = (mode) =>
  Object.entries(PALETTE).map(([k, [lb, lt, db, dt]]) => `--editor-colors-${k}-background:${mode === "light" ? lb : db};--editor-colors-${k}-text:${mode === "light" ? lt : dt};`).join("");

export function statusDocument(body, stamp) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>HASHPASS status</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--fg:#0f172a;--muted:#64748b;--line:#e2e8f0;${vars("light")}}
@media (prefers-color-scheme:dark){:root{--bg:#0b1220;--fg:#e5e7eb;--muted:#94a3b8;--line:#243044;${vars("dark")}}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1040px;margin:0 auto;padding:24px 16px 64px}
h1{font-size:1.6rem;margin:0 0 4px}
h2{font-size:1.2rem;margin:2rem 0 .6rem}
h3{font-size:1rem;margin:1.2rem 0 .4rem}
a{color:inherit;text-decoration-color:var(--muted)}
p{margin:.35rem 0}
code{font:.9em ui-monospace,monospace;background:var(--line);padding:.05em .3em;border-radius:4px}
table{width:100%;border-collapse:collapse;display:block;overflow-x:auto;margin:.5rem 0}
th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top;min-width:120px}
td ul{margin:.2rem 0;padding-left:1.1rem}
mark{border-radius:4px;padding:0 .35em}
.callout{display:flex;gap:10px;border-radius:10px;padding:12px 14px;margin:.8rem 0}
.callout .emoji{font-size:1.3rem;line-height:1.3}
.tasks{list-style:none;padding:0;margin:.4rem 0}
.tasks li{display:flex;gap:8px;align-items:baseline}
.tasks li.done p{color:var(--muted);text-decoration:line-through}
.box{flex:none}
footer{margin-top:2rem;color:var(--muted);font-size:.85rem}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style>
</head>
<body>
<main>
<h1>HASHPASS status</h1>
<p style="color:var(--muted)">Public view of the company command center. Updated ${stamp}.</p>
${body}
<footer>Generated from the same source as the internal Plane page. Plane work counts are private and not shown here.</footer>
</main>
</body>
</html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = resolve(root, process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "dist/status/index.html");
  // No Plane key: the public page must not contain private work counts.
  const data = await collectLiveData({ planeKey: "", now: new Date() });
  const body = buildMissionControlHtml(data, webKit, { publicView: true });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, statusDocument(body, data.now.toISOString().replace("T", " ").slice(0, 16) + " UTC"));
  console.log(`status page: ${out}`);
}
