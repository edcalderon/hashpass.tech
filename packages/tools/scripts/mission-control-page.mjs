/**
 * The Mission Command Center as a visual Plane page: a one-screen directory of the company's divisions, live
 * engineering progress from GitHub, Plane work-item counts, surface health and the knowledge map.
 *
 * One data set, two renderers (the "kit"): `planeKit` emits markup Plane's editor stores, `webKit` emits the same
 * structure for the public status page at work.hashpass.tech/status, so both always show the same content.
 *
 * The Plane kit uses only markup Plane's editor round-trips (callouts, task lists, tinted table cells, highlights, toggles,
 * emoji), so the page stays editable in the Plane UI. Everything dynamic is read at publish time and the page
 * says when; any source that cannot be reached degrades to a dash instead of blocking the publish.
 */
import { execFileSync } from "node:child_process";

const REPO = "hashpass-tech/hashpass.tech";
const GH = `https://github.com/${REPO}`;
const PLANE = "https://work.hashpass.tech";
const PROJECT = "8c6755ef-6d32-4076-9173-a6b06db7fc40";
const DOCS = `${GH}/blob/develop/`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const a = (href, label) => `<a href="${esc(href)}">${esc(label)}</a>`;
const p = (inner) => `<p>${inner}</p>`;
const ink = (token, inner) => `<span data-text-color="var(--editor-colors-${token}-text)" style="color: var(--editor-colors-${token}-text)">${inner}</span>`;
const tag = (token, label) => `<mark data-background-color="var(--editor-colors-${token}-background)" style="background-color: var(--editor-colors-${token}-background)">${esc(label)}</mark>`;
const toggle = (summary, inner) => `<details><summary>${esc(summary)}</summary>${inner}</details>`;
const color = (c) => `var(--editor-colors-${c}-background)`;

/** Plane's editor stores a cell tint as a `background` attribute and a callout as a block component. */
export const planeKit = {
  bg: (c) => ` background="${color(c)}"`,
  callout: (emoji, bg, inner) =>
    `<div data-block-type="callout-component" data-background="${bg}" data-logo-in-use="emoji" data-emoji-unicode="${parseInt(emoji, 16)}" data-emoji-url="https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${emoji}.png">${inner}</div>`,
  tasks: (items) => `<ul data-type="taskList">${items.map(([done, inner]) => `<li data-type="taskItem" data-checked="${done}">${p(inner)}</li>`).join("")}</ul>`,
};

/** The public page defines the same `--editor-colors-*` variables, so tags and ink render identically. */
export const webKit = {
  bg: (c) => ` style="background:${color(c)}"`,
  callout: (emoji, bg, inner) => `<aside class="callout" style="background:${color(bg)}"><span class="emoji">${String.fromCodePoint(parseInt(emoji, 16))}</span><div>${inner}</div></aside>`,
  tasks: (items) => `<ul class="tasks">${items.map(([done, inner]) => `<li class="${done ? "done" : ""}"><span class="box">${done ? "☑" : "☐"}</span>${p(inner)}</li>`).join("")}</ul>`,
};

/** ▰▰▰▱▱▱ plus a percentage, coloured by how far along it is. */
export function bar(done, total, width = 10) {
  if (!total) return ink("gray", "▱".repeat(width) + " —");
  const filled = Math.round((done / total) * width);
  const pct = Math.round((done / total) * 100);
  const color = pct >= 80 ? "green" : pct >= 30 ? "orange" : "pink";
  return `${ink(color, "▰".repeat(filled))}${ink("gray", "▱".repeat(width - filled))} <strong>${pct}%</strong> <span>${done}/${total}</span>`;
}

const status = (up) => (up === null ? `⚪ ${tag("gray", "unchecked")}` : up ? `🟢 ${tag("green", "up")}` : `🔴 ${tag("pink", "down")}`);

const gh = (path) => {
  try {
    return JSON.parse(execFileSync("gh", ["api", path], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 20_000 }));
  } catch {
    return null;
  }
};

async function probe(url) {
  try {
    const r = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(8000) });
    return r.status < 500;
  } catch {
    return false;
  }
}

/** Reads every dynamic input. Any failure leaves that field null; nothing here throws. */
export async function collectLiveData({ planeKey = process.env.PLANE_PERSONAL_API_KEY, now = new Date() } = {}) {
  const epic = gh(`repos/${REPO}/issues/455/sub_issues`) ?? [];
  const passportKids = gh(`repos/${REPO}/issues/425/sub_issues`) ?? [];
  const passport = gh(`repos/${REPO}/issues/425`);

  const modules = [];
  if (planeKey) {
    const headers = { "X-API-Key": planeKey };
    const base = `${PLANE}/api/v1/workspaces/plane/projects/${PROJECT}`;
    try {
      const list = await (await fetch(`${base}/modules/`, { headers, signal: AbortSignal.timeout(10000) })).json();
      for (const m of list.results ?? list) {
        let open = null;
        let total = null;
        try {
          const items = await (await fetch(`${base}/modules/${m.id}/module-issues/?per_page=100`, { headers, signal: AbortSignal.timeout(10000) })).json();
          const rows = items.results ?? items;
          total = rows.length;
          open = rows.filter((i) => !["completed", "cancelled"].includes(i.state__group ?? i.state_group ?? "")).length;
        } catch {}
        modules.push({ id: m.id, name: m.name, status: m.status, total, open });
      }
    } catch {}
  }

  const surfaces = await Promise.all(
    [
      ["Core site", "https://hashpass.tech"],
      ["Core site (dev)", "https://dev.hashpass.tech"],
      ["API", "https://api.hashpass.tech/api/config/versions"],
      ["API (dev)", "https://api-dev.hashpass.tech/api/config/versions"],
      ["Club web", "https://hashpass.club"],
      ["Companion preview", "https://companion-dev.hashpass.tech"],
      ["BSL", "https://bsl.hashpass.tech"],
      ["Lukas landing", "https://lukas.hashpass.tech"],
      ["Plane", `${PLANE}/auth/get-csrf-token/`],
      ["MCP gateway", "https://mcp.hashpass.tech/.well-known/oauth-protected-resource/mcp"],
    ].map(async ([name, url]) => ({ name, url, up: await probe(url) })),
  );

  let sha = "unknown";
  try {
    sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {}
  return { now, sha, epic, passport, passportKids, modules, surfaces };
}

const DIVISIONS = [
  { name: "Strategy & Validation", emoji: "🧭", color: "light-blue", focus: "Market validation, competitor and event radar, theses", match: "Strategy" },
  { name: "Product & Operations", emoji: "⚙️", color: "green", focus: "Product operations, payments orchestration, running the day", match: "Product" },
  { name: "Commercial & Partnerships", emoji: "🤝", color: "orange", focus: "Paid event partnerships and the sales pipeline", match: "Commercial" },
  { name: "Finance & Cloud", emoji: "💰", color: "peach", focus: "Cloud credits and runway, AWS budget, cost control", match: "Finance" },
  { name: "Corporate & Legal", emoji: "⚖️", color: "purple", focus: "Entity set-up, legal and compliance", match: "Corporate" },
  { name: "BSL Bogotá 2027", emoji: "🌎", color: "pink", focus: "Scope, delivery charter and milestones for the 2027 event", match: "BSL" },
];

const PROJECT_URL = `${PLANE}/plane/projects/${PROJECT}`;

export function buildMissionControlHtml(d, kit = planeKit, { publicView = false } = {}) {
  const cell = (inner, bg) => `<td${bg ? kit.bg(bg) : ""}>${p(inner)}</td>`;
  const head = (inner, bg) => `<th${bg ? kit.bg(bg) : ""}>${p(inner)}</th>`;
  const table = (heads, rows) => `<table><tbody><tr>${heads.map((h) => head(h, "gray")).join("")}</tr>${rows.map((r) => `<tr>${r.join("")}</tr>`).join("")}</tbody></table>`;
  const callout = kit.callout;
  const tasks = kit.tasks;
  const tint = (bg) => kit.bg(bg);
  const stamp = d.now.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const done = (list) => list.filter((i) => i.state === "closed").length;
  const epicDone = done(d.epic);
  const epicTotal = d.epic.length;
  const up = d.surfaces.filter((s) => s.up).length;
  const planeOpen = d.modules.reduce((n, m) => n + (m.open ?? 0), 0);

  const kpi = (emoji, label, value, sub, bg) =>
    `<td${tint(bg)}>${p(`${emoji} ${esc(label)}`)}${p(`<strong>${value}</strong>`)}${p(sub)}</td>`;

  const out = [];
  out.push(callout("1f6f0", "light-blue", p(`<strong>The front door to HASHPASS.</strong> ${tag("light-blue", "🐙 GitHub")} code, config and infrastructure · ${tag("green", "✈️ Plane")} everything else · ${tag("gray", "📝 Notion")} CEO drafts only, nothing depends on it.`) + p(`<em>Refreshed ${esc(stamp)} (commit <code>${esc(d.sha)}</code>). No secrets on this page.</em>`)));

  out.push("<h2>🚀 Jump to</h2>");
  out.push(`<table><tbody><tr>${[
    ["📋", "Engineering board", "GitHub project #4", "https://github.com/orgs/hashpass-tech/projects/4", "light-blue"],
    ["🗂️", "Company work", "Plane issues", `${PROJECT_URL}/issues/`, "green", true],
    ["📦", "Modules", "Plane divisions", `${PROJECT_URL}/modules/`, "orange", true],
    ["📚", "Docs and ADRs", "Architecture folder", `${DOCS}docs/architecture/`, "purple"],
  // The sixth field marks entries that need a Plane login, so the public page drops them by flag, not by URL match.
  ].filter(([, , , , , needsLogin]) => !(publicView && needsLogin)).map(([e, t, s, h, bg]) => `<td${tint(bg)}>${p(`${e} <strong>${esc(t)}</strong>`)}${p(a(h, s))}</td>`).join("")}</tr></tbody></table>`);

  out.push("<h2>📊 At a glance</h2>");
  out.push(`<table><tbody><tr>${[
    kpi("🎯", "Epic #455 progress", `${epicDone} of ${epicTotal || "—"} done`, bar(epicDone, epicTotal), "green"),
    kpi("🔥", "Open P0 engineering", String(d.epic.filter((i) => i.state === "open" && /P0/.test(i.title)).length), "sub-issues under the Companion epic", "pink"),
    ...(publicView ? [] : [kpi("🗂️", "Open company work", d.modules.length ? String(planeOpen) : "—", "Plane items across 6 divisions", "orange")]),
    kpi("🛰️", "Live surfaces", `${up} of ${d.surfaces.length} up`, bar(up, d.surfaces.length), up === d.surfaces.length ? "green" : "peach"),
  ].join("")}</tr></tbody></table>`);

  out.push("<h2>🏢 Company directory</h2>");
  out.push(publicView
    ? table(["Division", "What it covers"], DIVISIONS.map((dv) => [cell(`${dv.emoji} <strong>${esc(dv.name)}</strong>`, dv.color), cell(esc(dv.focus))]))
    : table(
        ["Division", "What it covers", "Work items", "Health", "Open"],
        DIVISIONS.map((dv) => {
          const m = d.modules.find((x) => x.name.includes(dv.match));
          const load = m?.open == null ? "—" : `${m.open} open of ${m.total}`;
          const health = m ? (m.status === "completed" ? tag("green", "done") : m.status === "planned" ? tag("light-blue", "planned") : m.status === "paused" ? tag("peach", "paused") : tag("green", "in progress")) : tag("gray", "unknown");
          return [cell(`${dv.emoji} <strong>${esc(dv.name)}</strong>`, dv.color), cell(esc(dv.focus)), cell(esc(load)), cell(health), cell(m ? a(`${PROJECT_URL}/modules/${m.id}/`, "Open module →") : a(`${PROJECT_URL}/modules/`, "All modules →"))];
        }),
      ));

  out.push("<h2>⚙️ Engineering progress</h2>");
  out.push(`<h3>Epic ${a(`${GH}/issues/455`, "#455")} — HASHPASS Companion (Meta hackathon)</h3>`);
  out.push(p(bar(epicDone, epicTotal, 20)));
  out.push(tasks(d.epic.map((i) => [i.state === "closed", `${a(i.html_url, `#${i.number}`)} ${esc(i.title.replace(/^\[[^\]]*\]\s*/g, "").replace(/^\[[^\]]*\]\s*/g, ""))} ${/P0/.test(i.title) ? tag("pink", "P0") : tag("light-blue", "P1")}`])));
  if (d.passport) {
    const kidsDone = done(d.passportKids);
    out.push(`<h3>Passport MVP ${a(`${GH}/issues/425`, "#425")} — Universal Event Inbox</h3>`);
    out.push(p(bar(kidsDone, d.passportKids.length, 20)));
    out.push(tasks(d.passportKids.map((i) => [i.state === "closed", `${a(i.html_url, `#${i.number}`)} ${esc(i.title.replace(/^(\[[^\]]*\]\s*)+/, ""))}`])));
  }

  out.push("<h2>🛰️ Live operations</h2>");
  out.push(table(["Surface", "Status", "Address"], d.surfaces.map((s) => [cell(`<strong>${esc(s.name)}</strong>`), cell(status(s.up), s.up ? "green" : "pink"), cell(a(s.url.replace(/\/api\/config\/versions$|\/\.well-known.*$|\/auth\/get-csrf-token\/$/, ""), new URL(s.url).host))])));
  out.push(`<h2>🚢 Release streams</h2>`);
  out.push(table(["Stream", "Command", "Tag", "Ships"], [
    [cell("🌐 <strong>Global / mobile</strong>", "light-blue"), cell("<code>npm run release:promote</code>"), cell("<code>vX.Y.Z</code>"), cell("Protected develop → main PR, then Android tag flow")],
    [cell("🏛️ <strong>Club web</strong>", "green"), cell("<code>pnpm run release:club:web:patch</code>"), cell("<code>club-vX.Y.Z</code>"), cell("hashpass.club (needs its own tag)")],
    [cell("🐣 <strong>Companion</strong>", "orange"), cell("<code>node packages/tools/scripts/release-companion.js patch</code>"), cell("<code>companion-vX.Y.Z</code>"), cell("Manual S3 sync to companion-dev")],
  ]));
  out.push(callout("1f4b8", "peach", p(`<strong>Cost guard:</strong> the monthly AWS budget is USD 50 in the <code>hashpass</code> account. Do not provision EC2 runners or other paid capacity without explicit owner approval. See ${a(`${DOCS}.agents/active/task-aws-cost-audit-and-controls.md`, "the AWS cost audit")}.`)));

  out.push("<h2>📚 Knowledge map</h2>");
  const links = (items) => `<ul>${items.map(([label, path]) => `<li>${p(a(path.startsWith("http") ? path : DOCS + path, label))}</li>`).join("")}</ul>`;
  out.push(`<table><tbody><tr>${[
    ["🏗️ Architecture & decisions", "light-blue", [["Workspace operating model", "docs/architecture/workspace-operating-model.md"], ["Companion vision and system", "docs/architecture/meta-companion-vision-and-system.md"], ["Passport MVP", "docs/feature-plans/passport-mvp.md"]]],
    ["🔧 Platform reference", "green", [["Deployment map", "apps/docs/docs/infra/DEPLOYMENT_MAP.md"], ["Play Console release flow", "apps/docs/docs/reference/release/PLAY_CONSOLE_RELEASE_FLOW.md"], ["OTA updates", "apps/docs/docs/reference/mobile-app/eas-update-ota.md"], ["Auth flow", "apps/docs/docs/auth/AUTH_FLOW.md"], ["User registry", "apps/docs/docs/auth/USER_REGISTRY.md"]]],
    ["🎨 Product & agents", "purple", [["PRODUCT.md", "PRODUCT.md"], ["DESIGN.md", "DESIGN.md"], ["Design system and Storybook", "docs/design-system-storybook.md"], ["AGENTS.md", "AGENTS.md"], ["Active tasks", "https://github.com/hashpass-tech/hashpass.tech/tree/develop/.agents/active"]]],
  ].map(([t, bg, items]) => `<td${tint(bg)}>${p(`<strong>${t}</strong>`)}${links(items)}</td>`).join("")}</tr></tbody></table>`);
  out.push(p(`🧠 <strong>Code questions:</strong> use <code>codebase-memory-mcp</code> (<code>search_graph</code>, <code>trace_path</code>, <code>get_code_snippet</code>) before grep.`));
  out.push("<hr>");
  if (!publicView) out.push(p(`<em>Public version: ${a("https://work.hashpass.tech/status", "work.hashpass.tech/status")}. Both are generated by <code>packages/tools/scripts/mission-control-page.mjs</code> — edit that, not this page.</em>`));
  return out.join("\n");
}
