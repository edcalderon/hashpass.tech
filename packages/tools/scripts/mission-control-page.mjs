/**
 * The Mission Command Center as a visual Plane page: a one-screen directory of the company's divisions, live
 * engineering progress from GitHub, Plane work-item counts, surface health and the knowledge map.
 *
 * One data set, two renderers (the "kit"): `planeKit` emits markup Plane's editor stores, `webKit` emits the same
 * structure for the team-only status page at work.hashpass.tech/status, so both always show the same content.
 *
 * The Plane kit uses only markup Plane's editor round-trips (callouts, task lists, tinted table cells, highlights, toggles,
 * emoji), so the page stays editable in the Plane UI. Everything dynamic is read at publish time and the page
 * says when; any source that cannot be reached degrades to a dash instead of blocking the publish.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

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
const packageVersion = (path) => {
  try { return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")).version; } catch { return null; }
};

/** Plane's editor stores a cell tint as a `background` attribute and a callout as a block component. */
export const planeKit = {
  bg: (c) => ` background="${color(c)}"`,
  // One row of equal cells: a single-row table in Plane's editor.
  tile: (inner, bg) => `<td${` background="${color(bg)}"`}>${inner}</td>`,
  tiles: (cells) => `<table><tbody><tr>${cells.join("")}</tr></tbody></table>`,
  callout: (emoji, bg, inner) =>
    `<div data-block-type="callout-component" data-background="${bg}" data-logo-in-use="emoji" data-emoji-unicode="${parseInt(emoji, 16)}" data-emoji-url="https://cdn.jsdelivr.net/npm/emoji-datasource-apple/img/apple/64/${emoji}.png">${inner}</div>`,
  tasks: (items) => `<ul data-type="taskList">${items.map(([done, inner]) => `<li data-type="taskItem" data-checked="${done}">${p(inner)}</li>`).join("")}</ul>`,
};

/** The status page defines the same `--editor-colors-*` variables, so tags and ink render identically. */
export const webKit = {
  // The web table repeats each column title inside its cells (data-label), so a phone can stack a row as a card.
  labelled: true,
  bg: (c) => ` style="background:${color(c)}"`,
  // A responsive grid, so summary rows wrap on a phone instead of scrolling sideways.
  tile: (inner, bg) => `<div class="tile" style="background:${color(bg)}">${inner}</div>`,
  tiles: (cells, className = "") => `<div class="tiles${className ? ` ${className}` : ""}">${cells.join("")}</div>`,
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

  let metrics = null;
  if (process.env.MISSION_CONTROL_METRICS_URL && process.env.MISSION_CONTROL_METRICS_TOKEN) {
    try {
      const response = await fetch(process.env.MISSION_CONTROL_METRICS_URL, {
        headers: { Authorization: `Bearer ${process.env.MISSION_CONTROL_METRICS_TOKEN}`, Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        const payload = await response.json();
        metrics = payload.data ?? payload;
      }
    } catch {}
  }

  let sha = "unknown";
  try {
    sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
  } catch {}
  const versions = {
    global: packageVersion("../../../package.json"),
    club: packageVersion("../../../apps/web-app/package.json"),
    companion: packageVersion("../../../apps/companion/package.json"),
    status: packageVersion("../../../apps/status-page/package.json"),
  };
  return { now, sha, epic, passport, passportKids, modules, surfaces, metrics, versions };
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
  const labelled = (heads, row) => row.map((c, i) => (kit.labelled ? c.replace(/^<td/, `<td data-label="${esc(heads[i] ?? "")}"`) : c));
  const table = (heads, rows, className = "") => `<table${kit.labelled && className ? ` class="${esc(className)}"` : ""}><tbody><tr>${heads.map((h) => head(h, "gray")).join("")}</tr>${rows.map((r) => `<tr>${labelled(heads, r).join("")}</tr>`).join("")}</tbody></table>`;
  const callout = kit.callout;
  const tasks = kit.tasks;
  const stamp = d.now.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const done = (list) => list.filter((i) => i.state === "closed").length;
  const epicDone = done(d.epic);
  const epicTotal = d.epic.length;
  const up = d.surfaces.filter((s) => s.up).length;
  const planeOpen = d.modules.reduce((n, m) => n + (m.open ?? 0), 0);
  const metrics = d.metrics ?? {};
  const metric = (path, fallback = "—") => path.split(".").reduce((value, key) => value?.[key], metrics) ?? fallback;
  const liveValue = (key, value) => `<strong class="metric-value"${kit.labelled ? ` data-metric="${esc(key)}"` : ""}>${esc(value)}</strong>`;
  const kpi = (label, key, value, sub, bg) =>
    kit.tile(`${p(esc(label))}${p(liveValue(key, value))}${p(`<span class="metric-note">${sub}</span>`)}`, bg);
  const detail = (html) => kit.labelled ? `<section data-focus-detail>${html}</section>` : html;
  const detailHeading = (level, html) => kit.labelled ? `<h${level} data-focus-detail>${html}</h${level}>` : `<h${level}>${html}</h${level}>`;

  const out = [];
  if (!publicView) {
    out.push(callout("1f4e1", "light-blue", p(`<strong>Live Mission Control:</strong> ${a("https://work.hashpass.tech/status", "Open the authenticated real-time dashboard →")}`) + p(`This editable Plane page is the publish-time snapshot. The live equivalent refreshes aggregate business and platform metrics every minute.`)));
  }
  out.push(callout("1f6f0", "light-blue", p(`<strong>The front door to HASHPASS.</strong> ${tag("light-blue", "🐙 GitHub")} code, config and infrastructure · ${tag("green", "✈️ Plane")} everything else · ${tag("gray", "📝 Notion")} CEO drafts only, nothing depends on it.`) + p(`<em>Refreshed ${esc(stamp)} (commit <code>${esc(d.sha)}</code>). Aggregate metrics only; no personal records.</em>`)));

  out.push("<h2>🚀 Jump to</h2>");
  out.push(kit.tiles([
    ["📋", "Engineering board", "GitHub project #4", "https://github.com/orgs/hashpass-tech/projects/4", "light-blue"],
    ["🗂️", "Company work", "Plane issues", `${PROJECT_URL}/issues/`, "green", true],
    ["📦", "Modules", "Plane divisions", `${PROJECT_URL}/modules/`, "orange", true],
    ["📚", "Docs and ADRs", "Architecture folder", `${DOCS}docs/architecture/`, "purple"],
  // The sixth field marks entries that need a Plane login, so the status page drops them by flag, not by URL match.
  ].filter(([, , , , , needsLogin]) => !(publicView && needsLogin)).map(([e, t, s, h, bg]) => kit.tile(`${p(`${e} <strong>${esc(t)}</strong>`)}${p(a(h, s))}`, bg)), "jump-grid"));

  out.push("<h2>📊 At a glance</h2>");
  if (publicView) {
    const healthy = up === d.surfaces.length;
    out.push(`<section class="pulse ${healthy ? "pulse--healthy" : "pulse--degraded"}" aria-labelledby="pulse-title"><div><p class="pulse__title" id="pulse-title"><strong data-operational-headline>${healthy ? "All monitored systems operational" : `${d.surfaces.length - up} surface${d.surfaces.length - up === 1 ? "" : "s"} need attention`}</strong></p><p data-operational-detail>${healthy ? "No active incidents detected across the monitored platform." : "Failed health probes are treated as active operational incidents."}</p></div><p class="pulse__meta"><span data-sync-status>Snapshot · ${esc(stamp)}</span></p></section>`);
  }
  out.push(kit.tiles([
    kpi("Total users", "users-total", String(metric("users.total")), "active, non-deleted accounts", "light-blue"),
    kpi("Active users · 30d", "users-active30d", String(metric("users.active30d")), `verified actions + observed app use ${kit.labelled ? '<span class="trend" data-trend="active-users7d" aria-label="Seven day active-user trend"></span>' : ''}`, "green"),
    kpi("New users · 7d", "users-new7d", String(metric("users.new7d")), `account growth ${kit.labelled ? '<span class="trend" data-trend="new-users7d" aria-label="Seven day new-user trend"></span>' : ''}`, "purple"),
    kpi("Events", "events-total", String(metric("events.total")), `${liveValue("events-published", String(metric("events.published")))} published`, "orange"),
    kpi("Active passes", "passes-active", String(metric("passes.active")), `${liveValue("passes-total", String(metric("passes.total")))} issued total`, "peach"),
    kpi("Scheduled meetings", "meetings-scheduled", String(metric("meetings.scheduled")), `${liveValue("meetings-total", String(metric("meetings.total")))} meetings total`, "light-blue"),
    kpi("Live surfaces", "surfaces-up", `${up} / ${d.surfaces.length}`, "current direct health probes", up === d.surfaces.length ? "green" : "peach"),
    kpi("Active incidents", "incidents-active", String(d.surfaces.length - up), "failed monitored surfaces", up === d.surfaces.length ? "green" : "pink"),
  ], "metric-grid"));

  out.push("<h2>Business and engagement</h2>");
  out.push(table(["Indicator", "Current", "Scope"], [
    [cell("Verified product actions"), cell(liveValue("activity-verified30d", String(metric("activity.verified30d")))), cell("Trailing 30 days")],
    [cell("Epic #455 delivery"), cell(`${epicDone} of ${epicTotal || "—"}`), cell(bar(epicDone, epicTotal))],
    ...(!publicView ? [[cell("Open company work"), cell(d.modules.length ? String(planeOpen) : "—"), cell("Plane items across 6 divisions")]] : []),
  ]));

  out.push(detailHeading(2, "🏢 Company directory"));
  out.push(detail(publicView
    ? table(["Division", "What it covers"], DIVISIONS.map((dv) => [cell(`${dv.emoji} <strong>${esc(dv.name)}</strong>`, dv.color), cell(esc(dv.focus))]))
    : table(
        ["Division", "What it covers", "Work items", "Health", "Open"],
        DIVISIONS.map((dv) => {
          const m = d.modules.find((x) => x.name.includes(dv.match));
          const load = m?.open == null ? "—" : `${m.open} open of ${m.total}`;
          const health = m ? (m.status === "completed" ? tag("green", "done") : m.status === "planned" ? tag("light-blue", "planned") : m.status === "paused" ? tag("peach", "paused") : tag("green", "in progress")) : tag("gray", "unknown");
          return [cell(`${dv.emoji} <strong>${esc(dv.name)}</strong>`, dv.color), cell(esc(dv.focus)), cell(esc(load)), cell(health), cell(m ? a(`${PROJECT_URL}/modules/${m.id}/`, "Open module →") : a(`${PROJECT_URL}/modules/`, "All modules →"))];
        }),
      )));

  out.push(detailHeading(2, "⚙️ Engineering progress"));
  out.push(detailHeading(3, `Epic ${a(`${GH}/issues/455`, "#455")} — HASHPASS Companion (Meta hackathon)`));
  out.push(detail(p(bar(epicDone, epicTotal, 20))));
  out.push(detail(tasks(d.epic.map((i) => [i.state === "closed", `${a(i.html_url, `#${i.number}`)} ${esc(i.title.replace(/^\[[^\]]*\]\s*/g, "").replace(/^\[[^\]]*\]\s*/g, ""))} ${/P0/.test(i.title) ? tag("pink", "P0") : tag("light-blue", "P1")}`]))));
  if (d.passport) {
    const kidsDone = done(d.passportKids);
    out.push(detailHeading(3, `Passport MVP ${a(`${GH}/issues/425`, "#425")} — Universal Event Inbox`));
    out.push(detail(p(bar(kidsDone, d.passportKids.length, 20))));
    out.push(detail(tasks(d.passportKids.map((i) => [i.state === "closed", `${a(i.html_url, `#${i.number}`)} ${esc(i.title.replace(/^(\[[^\]]*\]\s*)+/, ""))}`]))));
  }

  out.push("<h2>🛰️ Live operations</h2>");
  out.push(table(["Surface", "Status", "Address"], d.surfaces.map((s) => [cell(`<strong>${esc(s.name)}</strong>`), kit.labelled ? `<td data-surface-status="${esc(s.name)}"${kit.bg(s.up ? "green" : "pink")}>${p(status(s.up))}</td>` : cell(status(s.up), s.up ? "green" : "pink"), cell(a(s.url.replace(/\/api\/config\/versions$|\/\.well-known.*$|\/auth\/get-csrf-token\/$/, ""), new URL(s.url).host))]), "status-table"));
  out.push(`<h2>🚢 Release streams</h2>`);
  out.push(table(["Stream", "Version", "Command", "Tag", "Ships"], [
    [cell("🌐 <strong>Global / mobile</strong>", "light-blue"), cell(`<code>${esc(d.versions?.global ?? "—")}</code>`), cell("<code>npm run release:promote</code>"), cell(`<code>v${esc(d.versions?.global ?? "X.Y.Z")}</code>`), cell("Protected develop → main PR, then Android tag flow")],
    [cell("🏛️ <strong>Club web</strong>", "green"), cell(`<code>${esc(d.versions?.club ?? "—")}</code>`), cell("<code>pnpm run release:club:web:patch</code>"), cell(`<code>club-v${esc(d.versions?.club ?? "X.Y.Z")}</code>`), cell("hashpass.club (needs its own tag)")],
    [cell("🐣 <strong>Companion</strong>", "orange"), cell(`<code>${esc(d.versions?.companion ?? "—")}</code>`), cell("<code>npm run release:companion:patch</code>"), cell(`<code>companion-v${esc(d.versions?.companion ?? "X.Y.Z")}</code>`), cell("Independent companion deployment")],
    [cell("📡 <strong>Status page</strong>", "purple"), cell(`<code>${esc(d.versions?.status ?? "—")}</code>`), cell("<code>npm run release:status:patch</code>"), cell(`<code>status-v${esc(d.versions?.status ?? "X.Y.Z")}</code>`), cell("Authenticated Mission Control publisher")],
  ], "release-table"));
  out.push(callout("1f4b8", "peach", p(`<strong>Cost guard:</strong> the monthly AWS budget is USD 50 in the <code>hashpass</code> account. Do not provision EC2 runners or other paid capacity without explicit owner approval. See ${a(`${DOCS}.agents/active/task-aws-cost-audit-and-controls.md`, "the AWS cost audit")}.`)));

  out.push(detail("<h2>📚 Knowledge map</h2>"));
  const links = (items) => `<ul>${items.map(([label, path]) => `<li>${p(a(path.startsWith("http") ? path : DOCS + path, label))}</li>`).join("")}</ul>`;
  out.push(detail(kit.tiles([
    ["🏗️ Architecture & decisions", "light-blue", [["Workspace operating model", "docs/architecture/workspace-operating-model.md"], ["Companion vision and system", "docs/architecture/meta-companion-vision-and-system.md"], ["Passport MVP", "docs/feature-plans/passport-mvp.md"]]],
    ["🔧 Platform reference", "green", [["Deployment map", "apps/docs/docs/infra/DEPLOYMENT_MAP.md"], ["Play Console release flow", "apps/docs/docs/reference/release/PLAY_CONSOLE_RELEASE_FLOW.md"], ["OTA updates", "apps/docs/docs/reference/mobile-app/eas-update-ota.md"], ["Auth flow", "apps/docs/docs/auth/AUTH_FLOW.md"], ["User registry", "apps/docs/docs/auth/USER_REGISTRY.md"]]],
    ["🎨 Product & agents", "purple", [["PRODUCT.md", "PRODUCT.md"], ["DESIGN.md", "DESIGN.md"], ["Design system and Storybook", "docs/design-system-storybook.md"], ["AGENTS.md", "AGENTS.md"], ["Active tasks", "https://github.com/hashpass-tech/hashpass.tech/tree/develop/.agents/active"]]],
  ].map(([t, bg, items]) => kit.tile(`${p(`<strong>${t}</strong>`)}${links(items)}`, bg)), "knowledge-grid")));
  out.push(p(`🧠 <strong>Code questions:</strong> use <code>codebase-memory-mcp</code> (<code>search_graph</code>, <code>trace_path</code>, <code>get_code_snippet</code>) before grep.`));
  out.push("<hr>");
  if (!publicView) out.push(p(`<em>Team-only web version (HASHPASS sign-in): ${a("https://work.hashpass.tech/status", "work.hashpass.tech/status")}. This page and that one are generated by <code>packages/tools/scripts/mission-control-page.mjs</code> — edit that, not this page.</em>`));
  return out.join("\n");
}
