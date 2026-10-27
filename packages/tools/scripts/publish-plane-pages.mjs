#!/usr/bin/env node
/**
 * Publish the generated Plane pages (dist/plane-pages/*.md) into the HASHPASS Plane project.
 *
 * Uses the same page client as the MCP gateway (packages/plane-mcp-gateway/src/plane-pages.mjs), because self-hosted
 * Plane has no page routes on its public API. Credentials come from the environment, never from arguments:
 *
 *   PLANE_PAGES_EMAIL, PLANE_PAGES_PASSWORD   dedicated page account (member of the project)
 *   PLANE_BASE_URL (default https://work.hashpass.tech), PLANE_WORKSPACE_SLUG (default plane),
 *   PLANE_PROJECT_ID (default: the HASHPASS project)
 *
 *   node packages/tools/scripts/build-plane-pages.mjs
 *   node packages/tools/scripts/publish-plane-pages.mjs [--only MC] [--dry-run]
 *
 * A page is matched by its exact title: an existing page is updated in place, otherwise one is created. Each page
 * is read back after the write and the script fails if the title or body did not persist.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPlanePages } from "../../plane-mcp-gateway/src/plane-pages.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const dir = join(root, "dist/plane-pages");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(text) {
  const codes = [];
  let out = text.replace(/`([^`]+)`/g, (_m, c) => `\u0000${codes.push(`<code>${esc(c)}</code>`) - 1}\u0000`);
  out = esc(out)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, label, url) => `<a href="${url}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,;:]|$)/g, "$1<em>$2</em>");
  return out.replace(/\u0000(\d+)\u0000/g, (_m, i) => codes[Number(i)]);
}

/** Markdown subset used by our repo docs: headings, paragraphs, lists, tables, fenced code, rules. */
export function markdownToHtml(markdown) {
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, "").split("\n");
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    const fence = line.match(/^\s*(```|~~~)/);
    if (fence) {
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i += 1;
      html.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) { html.push(`<h${heading[1].length}>${inline(heading[2].trim())}</h${heading[1].length}>`); i += 1; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { html.push("<hr>"); i += 1; continue; }
    if (line.trim().startsWith("|") && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1] ?? "")) {
      const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      html.push(`<table><tbody><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    const list = line.match(/^\s*([-*]|\d+\.)\s+/);
    if (list) {
      const tag = /\d/.test(list[1]) ? "ol" : "ul";
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      html.push(`<${tag}>${items.map((t) => `<li><p>${inline(t)}</p></li>`).join("")}</${tag}>`);
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*(```|~~~)|\s*([-*]|\d+\.)\s|\s*\|)/.test(lines[i])) para.push(lines[i++].trim());
    html.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return html.join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".md") && (!only || f.toLowerCase().startsWith(only.toLowerCase())));
  const publishable = files
    .map((f) => ({ f, text: readFileSync(join(dir, f), "utf8") }))
    .filter((p) => !p.text.includes("No source document exists yet"));
  if (!publishable.length) throw new Error("No publishable pages found; run build-plane-pages.mjs first");

  const baseUrl = process.env.PLANE_BASE_URL || "https://work.hashpass.tech";
  const slug = process.env.PLANE_WORKSPACE_SLUG || "plane";
  const projectId = process.env.PLANE_PROJECT_ID || "8c6755ef-6d32-4076-9173-a6b06db7fc40";
  const plan = publishable.map(({ f, text }) => {
    // "MC" only orders the generated file; the Plane title is the plain name. Drop a repeated source heading too.
    const title = text.match(/^#\s+(.*)$/m)[1].trim().replace(/^MC\s+/, "");
    const body = text.replace(/^#\s+.*\n/, "").replace(new RegExp(`^#\\s+${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m"), "");
    return { f, title, html: markdownToHtml(body) };
  });
  if (dryRun) {
    for (const p of plan) console.log(`[dry-run] ${p.title} (${p.f}): ${p.html.length} bytes of HTML`);
    process.exit(0);
  }

  const email = process.env.PLANE_PAGES_EMAIL;
  const password = process.env.PLANE_PAGES_PASSWORD;
  if (!email || !password) throw new Error("Set PLANE_PAGES_EMAIL and PLANE_PAGES_PASSWORD");
  const pages = createPlanePages({ baseUrl, workspaceSlug: slug, email, password });
  const listed = await pages.run({ action: "list", project_id: projectId });
  const existing = Array.isArray(listed) ? listed : listed.results ?? [];

  for (const p of plan) {
    const match = existing.find((x) => x.name === p.title);
    const saved = match
      ? await pages.run({ action: "update", project_id: projectId, page_id: match.id, name: p.title, description_html: p.html })
      : await pages.run({ action: "create", project_id: projectId, name: p.title, description_html: p.html, access: 0 });
    const back = await pages.run({ action: "retrieve", project_id: projectId, page_id: saved.id });
    const bodyOk = typeof back.description_html === "string" && back.description_html.length > 0;
    if (back.name !== p.title || !bodyOk) throw new Error(`Read-back mismatch for "${p.title}" (page ${saved.id})`);
    console.log(`${match ? "updated" : "created"}: ${p.title}\n  ${baseUrl}/${slug}/projects/${projectId}/pages/${saved.id}/  (body ${back.description_html.length} bytes, ${back.access === 0 ? "public" : "private"})`);
  }
}
