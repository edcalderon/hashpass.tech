#!/usr/bin/env node
/**
 * Builds the authenticated status page served at https://work.hashpass.tech/status from the same semantic source
 * as the Plane Mission Control page. Browser behavior lives in apps/status-page/src/status-page.mjs so CSP can
 * stay strict; the build copies it beside index.html instead of injecting inline JavaScript.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMissionControlHtml, collectLiveData, webKit } from "./mission-control-page.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PALETTE = {
  "light-blue": ["#e8f5f9", "#075985", "#12313b", "#67e8f9"],
  green: ["#e9f8ef", "#166534", "#163426", "#86efac"],
  orange: ["#fff2df", "#9a3412", "#402919", "#fdba74"],
  peach: ["#fff0e9", "#9a3412", "#41271f", "#fdba9c"],
  purple: ["#f2efff", "#5b21b6", "#2c2948", "#c4b5fd"],
  pink: ["#fcecf2", "#9d174d", "#472333", "#f9a8d4"],
  gray: ["#f1f4f6", "#475569", "#272a30", "#cbd5e1"],
  "dark-blue": ["#e3ebf8", "#1e3a8a", "#18263e", "#a5b4fc"],
};
const vars = (mode) => Object.entries(PALETTE)
  .map(([key, [lightBackground, lightText, darkBackground, darkText]]) =>
    `--editor-colors-${key}-background:${mode === "light" ? lightBackground : darkBackground};--editor-colors-${key}-text:${mode === "light" ? lightText : darkText};`)
  .join("");

export function statusDocument(body, stamp, { version = "0.1.0" } = {}) {
  return `<!doctype html>
<html lang="en" data-theme="system" data-density="comfortable" data-focus="false" data-sync="snapshot">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<title>HASHPASS Mission Control</title>
<style>
:root{color-scheme:light;--bg:#f4f7f8;--surface:#fff;--raised:#fff;--line:#d8e0e4;--fg:#101820;--muted:#52616b;--accent:#0e7490;--accent-fill:#155e75;--on-accent:#fff;--success:#18794e;--danger:#b42318;--warning:#b54708;--shadow:0 10px 28px rgba(8,31,44,.08);${vars("light")}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#0f1316;--surface:#171c20;--raised:#1d2429;--line:#303a41;--fg:#f5f7f8;--muted:#a9b5bc;--accent:#67e8f9;--accent-fill:#67e8f9;--on-accent:#082f3b;--success:#86efac;--danger:#fda4af;--warning:#fdba74;--shadow:0 14px 36px rgba(0,0,0,.22);${vars("dark")}}
@media (prefers-color-scheme:dark){:root[data-theme="system"]{color-scheme:dark;--bg:#0f1316;--surface:#171c20;--raised:#1d2429;--line:#303a41;--fg:#f5f7f8;--muted:#a9b5bc;--accent:#67e8f9;--accent-fill:#67e8f9;--on-accent:#082f3b;--success:#86efac;--danger:#fda4af;--warning:#fdba74;--shadow:0 14px 36px rgba(0,0,0,.22);${vars("dark")}}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scrollbar-color:var(--muted) var(--bg)}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-variant-numeric:tabular-nums}
::selection{background:var(--accent-fill);color:var(--on-accent)}
a{color:var(--accent);text-underline-offset:3px;text-decoration-thickness:1px}
a:hover{text-decoration-thickness:2px}
a:focus-visible,button:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid var(--accent);outline-offset:3px;border-radius:8px}
button,input,summary{font:inherit}
header.bar{position:sticky;top:0;z-index:10;background:var(--bg);border-bottom:1px solid var(--line)}
.bar__in{max-width:1240px;margin:0 auto;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.brand{font-size:16px;font-weight:750;letter-spacing:-.01em;display:flex;align-items:center;gap:10px;min-width:0}
.brand__mark{width:12px;height:12px;border-radius:50%;background:var(--success);box-shadow:0 0 0 5px color-mix(in srgb,var(--success) 18%,transparent)}
.brand small{display:block;font-weight:500;color:var(--muted);font-size:12px;white-space:nowrap}
.bar__actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.action{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:var(--raised);color:var(--fg);text-decoration:none;font-size:14px;font-weight:650;cursor:pointer}
.action:hover{background:var(--surface);border-color:var(--muted)}
details.settings{position:relative}
details.settings>summary{list-style:none}
details.settings>summary::-webkit-details-marker{display:none}
.settings__panel{position:absolute;right:0;top:calc(100% + 10px);width:min(320px,calc(100vw - 28px));padding:16px;background:var(--raised);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow)}
.settings__panel fieldset{border:0;padding:0;margin:0 0 16px}
.settings__panel fieldset:last-child{margin:0}
.settings__panel legend{font-size:13px;font-weight:700;margin-bottom:8px;color:var(--muted)}
.option-row{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.option-row label,.toggle-row{min-height:44px;display:flex;align-items:center;justify-content:center;gap:7px;padding:8px 10px;border:1px solid var(--line);border-radius:12px;background:var(--surface);cursor:pointer;font-size:13px;font-weight:650}
.option-row label:has(input:checked),.toggle-row:has(input:checked){border-color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--surface))}
main{max-width:1240px;margin:0 auto;padding:24px 20px 72px}
h2{font-size:1.35rem;line-height:1.25;letter-spacing:-.02em;margin:3rem 0 .85rem}
h3{font-size:1.05rem;line-height:1.35;margin:1.5rem 0 .5rem}
p{margin:.3rem 0}
ul{padding-left:1.15rem;margin:.3rem 0}
hr{border:0;border-top:1px solid var(--line);margin:2.5rem 0}
code{font:.88em ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--surface);border:1px solid var(--line);padding:.08em .4em;border-radius:6px;overflow-wrap:anywhere}
mark{border-radius:999px;padding:.12em .55em;color:inherit;font-size:.82em;font-weight:700;white-space:nowrap}
.pulse{border-radius:24px;padding:24px;display:flex;align-items:flex-end;justify-content:space-between;gap:24px;background:var(--surface);box-shadow:var(--shadow);margin:0 0 16px}
.pulse--healthy{border:1px solid color-mix(in srgb,var(--success) 35%,var(--line))}
.pulse--degraded{border:1px solid color-mix(in srgb,var(--danger) 45%,var(--line))}
.pulse__title{font-size:1.45rem;margin:0 0 4px;letter-spacing:-.025em}
.pulse__meta{color:var(--muted);font-size:13px;white-space:nowrap}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));border:1px solid var(--line);border-radius:24px;overflow:hidden;background:var(--surface);box-shadow:var(--shadow)}
.metric-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.jump-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.knowledge-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
.tile{min-width:0;padding:18px 20px;color:var(--fg);border-right:1px solid color-mix(in srgb,var(--line) 72%,transparent);border-bottom:1px solid color-mix(in srgb,var(--line) 72%,transparent)}
.metric-grid .tile:nth-child(4n),.jump-grid .tile:last-child,.knowledge-grid .tile:last-child{border-right:0}
.tile p:first-child{font-size:13px;color:var(--muted);font-weight:700}
.metric-value{display:block;font-size:1.8rem;line-height:1.15;letter-spacing:-.03em;margin:.28rem 0}
.metric-note{display:block;color:var(--muted);font-size:12px;line-height:1.35}
.trend{height:22px;display:flex;align-items:flex-end;gap:3px;margin-top:8px}.trend>span{flex:1;min-width:3px;height:var(--trend);max-height:100%;border-radius:3px 3px 1px 1px;background:var(--accent-fill);opacity:.72}
.callout{display:flex;gap:12px;border-radius:16px;padding:16px 18px;color:var(--fg);border:1px solid var(--line)}
.callout .emoji{font-size:1.2rem;line-height:1.4}
.callout>div{min-width:0}
table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--raised);margin:.7rem 0}
th,td{padding:11px 14px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line);overflow-wrap:anywhere}
tr:last-child>td{border-bottom:0}
th{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
td p,th p{margin:0}
.tasks{list-style:none;padding:0;margin:.5rem 0;display:grid;gap:6px}
.tasks li{display:flex;gap:10px;align-items:baseline;padding:10px 14px;border:1px solid var(--line);border-radius:12px;background:var(--raised)}
.tasks li p{margin:0;min-width:0;overflow-wrap:anywhere}
.tasks li.done p{color:var(--muted);text-decoration:line-through}
.box{flex:none;color:var(--accent)}
[data-sync="stale"] .brand__mark{background:var(--warning)}
[data-focus="true"] [data-focus-detail]{display:none}
[data-density="compact"] main{padding-top:16px}
[data-density="compact"] .tile{padding:12px 14px}
[data-density="compact"] th,[data-density="compact"] td{padding:8px 11px}
[data-density="compact"] h2{margin-top:2rem}
.visually-hidden{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
footer{margin-top:3rem;padding-top:1rem;border-top:1px solid var(--line);color:var(--muted);font-size:.85rem}
@media (max-width:900px){.metric-grid,.knowledge-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.metric-grid .tile:nth-child(4n),.knowledge-grid .tile:last-child{border-right:1px solid var(--line)}.metric-grid .tile:nth-child(2n),.knowledge-grid .tile:nth-child(2n){border-right:0}}
@media (max-width:700px){
  .bar__in{padding:10px 14px;align-items:flex-start}.brand small{white-space:normal}.bar__actions{gap:6px}.action{padding-inline:13px}
  .bar__actions>a[href="/status/logout"]{display:none}
  main{padding:18px 14px 56px}.pulse{padding:18px;display:block}.pulse__meta{margin-top:12px}.tiles,.knowledge-grid{grid-template-columns:1fr}.metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.tile,.tile:nth-child(2n),.tile:nth-child(4n){border-right:0}.metric-grid .tile:nth-child(odd){border-right:1px solid var(--line)}
  .metric-value{font-size:1.65rem}
  table,tbody{display:block;border:0;background:none}tr{display:block;margin:0 0 12px;border:1px solid var(--line);border-radius:16px;background:var(--raised);overflow:hidden}tr:has(th){display:none}
  td{display:block;border-bottom:1px solid var(--line);padding:10px 14px}td:last-child{border-bottom:0}td[data-label]:not([data-label=""])::before{content:attr(data-label);display:block;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
  .status-table tr{display:grid;grid-template-columns:1fr auto}.status-table tr:has(th){display:none}.status-table td:nth-child(3){grid-column:1/-1}.status-table td:nth-child(2){border-left:1px solid var(--line)}
}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto;transition:none!important;animation:none!important}}
@media print{header.bar{position:static}.bar__actions{display:none}[data-focus-detail]{display:block!important}}
</style>
<script type="module" src="/status/status-page.js"></script>
</head>
<body>
<header class="bar"><div class="bar__in">
  <div class="brand"><span class="brand__mark" aria-hidden="true"></span><span>HASHPASS Mission Control<small>Team only · Status v${version} · <span data-sync-status>Snapshot · ${stamp}</span></small></span></div>
  <div class="bar__actions">
    <a class="action" href="https://work.hashpass.tech/plane/">Plane snapshot</a>
    <details class="settings" id="status-settings"><summary class="action">Settings</summary><form class="settings__panel">
      <fieldset><legend>Theme</legend><div class="option-row"><label><input type="radio" name="theme" value="system">System</label><label><input type="radio" name="theme" value="light">Light</label><label><input type="radio" name="theme" value="dark">Dark</label></div></fieldset>
      <fieldset><legend>Density</legend><div class="option-row"><label><input type="radio" name="density" value="comfortable">Comfort</label><label><input type="radio" name="density" value="compact">Compact</label></div></fieldset>
      <fieldset><legend>Reading</legend><label class="toggle-row"><input type="checkbox" name="focus">Focus on live health and releases</label></fieldset>
    </form></details>
    <a class="action" href="/status/logout">Sign out</a>
  </div>
</div></header>
<div class="visually-hidden" aria-live="polite" data-live-announcer></div>
<main>${body}<footer>Aggregate team metrics only. Generated from the same semantic source as the editable Plane page; live values refresh every 60 seconds.</footer></main>
</body>
</html>`;
}

function statusVersion() {
  const path = resolve(root, "apps/status-page/package.json");
  if (!existsSync(path)) return "0.1.0";
  return JSON.parse(readFileSync(path, "utf8")).version;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = resolve(root, process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "dist/status/index.html");
  const data = await collectLiveData({ planeKey: "", now: new Date() });
  const version = statusVersion();
  const body = buildMissionControlHtml(data, webKit, { publicView: true });
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, statusDocument(body, data.now.toISOString().replace("T", " ").slice(0, 16) + " UTC", { version }));
  copyFileSync(resolve(root, "apps/status-page/src/status-page.mjs"), resolve(dirname(out), "status-page.js"));
  writeFileSync(resolve(dirname(out), "status-version.json"), `${JSON.stringify({ version, generatedAt: data.now.toISOString(), commit: data.sha }, null, 2)}\n`);
  console.log(`status page: ${out}`);
}
