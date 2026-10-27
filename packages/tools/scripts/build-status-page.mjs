#!/usr/bin/env node
/**
 * Builds the public status page served at https://work.hashpass.tech/status from the same generator as the
 * Plane "HASHPASS Mission Command Center" page, so the two never drift apart.
 *
 *   node packages/tools/scripts/build-status-page.mjs [--out dist/status/index.html]
 *
 * The page is private: Caddy only serves it to a signed-in HASHPASS account on an approved email domain (see
 * packages/plane-mcp-gateway/src/status-gate.mjs). It is still built without credentials, so Plane's per-division
 * work counts are left out; everything else comes from public GitHub data and health probes.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMissionControlHtml, collectLiveData, webKit } from "./mission-control-page.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

// Plane's editor colour tokens, so the shared markup renders the same palette on this page.
const PALETTE = {
  "light-blue": ["#dbeafe", "#1d4ed8", "#16304f", "#93c5fd"],
  green: ["#dcfce7", "#15803d", "#143a26", "#86efac"],
  orange: ["#ffedd5", "#c2410c", "#4a2a12", "#fdba74"],
  peach: ["#fde7dc", "#b45309", "#4b2f20", "#fdba9c"],
  purple: ["#ede9fe", "#6d28d9", "#2f2a55", "#c4b5fd"],
  pink: ["#fce7f3", "#be185d", "#4d2038", "#f9a8d4"],
  gray: ["#eef1f4", "#475569", "#2a2a34", "#cbd5e1"],
  "dark-blue": ["#dbe4f5", "#1e3a8a", "#1c2a4d", "#a5b4fc"],
};
const vars = (mode) =>
  Object.entries(PALETTE).map(([k, [lb, lt, db, dt]]) => `--editor-colors-${k}-background:${mode === "light" ? lb : db};--editor-colors-${k}-text:${mode === "light" ? lt : dt};`).join("");

// Colours, radii and control sizes follow @hashpass/ui tokens (DESIGN.md): 24px surfaces, 12px fields, pills, 48px targets.
export function statusDocument(body, stamp) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<title>HASHPASS status</title>
<style>
:root{color-scheme:light dark;--bg:#fff;--surface:#f7f9fa;--raised:#fff;--line:#dfe3e8;--fg:#17181c;--muted:#565963;--accent:#0e7490;--on-accent:#fff;--shadow:0 8px 24px rgba(0,12,32,.08);${vars("light")}}
@media (prefers-color-scheme:dark){:root{--bg:#111114;--surface:#19191f;--raised:#22222a;--line:#34343e;--fg:#fafafa;--muted:#b0b0bc;--accent:#22d3ee;--on-accent:#06222a;--shadow:none;${vars("dark")}}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent);text-underline-offset:2px}
a:focus-visible,.signout:focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:6px}
header.bar{position:sticky;top:0;z-index:2;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.bar__in{max-width:1080px;margin:0 auto;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{font-weight:700;letter-spacing:.01em}
.brand small{display:block;font-weight:400;color:var(--muted);font-size:12px}
.signout{display:inline-flex;align-items:center;min-height:44px;padding:0 18px;border-radius:999px;border:1px solid var(--line);background:var(--raised);color:var(--fg);text-decoration:none;font-size:14px;font-weight:600}
main{max-width:1080px;margin:0 auto;padding:8px 16px 64px}
h2{font-size:1.25rem;line-height:1.3;margin:2.25rem 0 .75rem}
h3{font-size:1.05rem;line-height:1.35;margin:1.5rem 0 .5rem}
p{margin:.3rem 0}
ul{padding-left:1.15rem;margin:.3rem 0}
hr{border:0;border-top:1px solid var(--line);margin:2rem 0}
code{font:.88em ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--surface);border:1px solid var(--line);padding:.05em .35em;border-radius:6px;overflow-wrap:anywhere}
mark{border-radius:6px;padding:.05em .5em;color:inherit;font-size:.9em;font-weight:600;white-space:nowrap}
.tiles{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.tile,.callout{border-radius:24px;border:1px solid var(--line);padding:16px 20px;box-shadow:var(--shadow);color:var(--fg)}
.tile p+p{margin-top:.15rem}
.tile ul{list-style:none;padding:0}
.tile li+li{margin-top:.3rem}
.callout{display:flex;gap:12px;margin:1rem 0}
.callout .emoji{font-size:1.4rem;line-height:1.3}
.callout>div{min-width:0}
table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--raised);margin:.6rem 0}
th,td{padding:10px 14px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line);overflow-wrap:anywhere}
tr:last-child>td{border-bottom:0}
th{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
td p,th p{margin:0}
.tasks{list-style:none;padding:0;margin:.5rem 0;display:grid;gap:6px}
.tasks li{display:flex;gap:10px;align-items:baseline;padding:10px 14px;border:1px solid var(--line);border-radius:12px;background:var(--raised)}
.tasks li p{margin:0;min-width:0;overflow-wrap:anywhere}
.tasks li.done p{color:var(--muted);text-decoration:line-through}
.box{flex:none;color:var(--accent)}
footer{margin-top:2rem;padding-top:1rem;color:var(--muted);font-size:.85rem}
@media (max-width:700px){
  main{padding-inline:14px}
  table,tbody{display:block;border:0;background:none}
  tr{display:block;margin:0 0 12px;border:1px solid var(--line);border-radius:16px;background:var(--raised);overflow:hidden}
  tr:has(th){display:none}
  td{display:block;border-bottom:1px solid var(--line);padding:10px 14px}
  td:last-child{border-bottom:0}
  td[data-label]:not([data-label=""])::before{content:attr(data-label);display:block;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
  .tile,.callout{padding:14px 16px}
}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto;transition:none!important;animation:none!important}}
@media print{header.bar{position:static}.signout{display:none}}
</style>
</head>
<body>
<header class="bar"><div class="bar__in"><div class="brand">HASHPASS status<small>Team only · updated ${stamp}</small></div><a class="signout" href="/status/logout">Sign out</a></div></header>
<main>
${body}
<footer>Generated from the same source as the internal Plane page. Plane work counts live in Plane itself and are not shown here.</footer>
</main>
</body>
</html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = resolve(root, process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "dist/status/index.html");
  // No Plane key: the build never holds Plane credentials, so it cannot embed private work counts.
  const data = await collectLiveData({ planeKey: "", now: new Date() });
  const body = buildMissionControlHtml(data, webKit, { publicView: true });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, statusDocument(body, data.now.toISOString().replace("T", " ").slice(0, 16) + " UTC"));
  console.log(`status page: ${out}`);
}
