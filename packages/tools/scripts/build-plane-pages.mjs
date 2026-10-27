#!/usr/bin/env node
/**
 * Assemble the Plane knowledge pages from the repo documents.
 *
 * The Plane REST API has no page endpoints, so this only produces import-ready Markdown;
 * publishing happens in the Plane UI or through the MCP `page` tools, and is recorded in
 * docs/architecture/knowledge-center-as-built.md. Reads only files in this repo.
 *
 *   node packages/tools/scripts/build-plane-pages.mjs [outDir]   (default dist/plane-pages)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rewriteRelativeLinks } from "./plane-link-rewrite.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = resolve(process.argv[2] ?? join(root, "dist/plane-pages"));
const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).toString().trim();
const repo = "https://github.com/hashpass-tech/hashpass.tech/blob/develop/";

const PAGES = [
  ["00", "Architecture Index and Terminology", ["docs/architecture/workspace-operating-model.md", "docs/architecture/knowledge-center-as-built.md"]],
  ["01", "Architecture Decision Records", ["docs/architecture/meta-companion-vision-and-system.md", "docs/architecture/meta-companion-agenda-networking.md", "docs/architecture/knowledge-governance-github-plane-notion.md"]],
  ["02", "Platform and Capability Registry", ["docs/feature-plans/muse-companion-contracts.md"]],
  ["03", "Muse Models, Speech, Cost and Benchmarks", []],
  ["04", "Event Knowledge and Agenda Intelligence", ["docs/feature-plans/passport-mvp.md", "docs/feature-plans/doorready-progress.md"]],
  ["05", "Networking, Consent and Meeting Protocol", ["docs/architecture/meta-companion-agenda-networking.md"]],
  ["06", "Security, Privacy, Compliance and Data Retention", ["apps/docs/docs/auth/plane-mcp-authorization.md"]],
  ["07", "Experiments and Evaluation Evidence", []],
  ["08", "Historical Hackathons, Releases and Postmortems", []],
];

mkdirSync(out, { recursive: true });
const index = [];
for (const [num, title, sources] of PAGES) {
  const present = sources.filter((s) => existsSync(join(root, s)));
  const file = `${num}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}.md`;
  const body = present.length
    ? present
        .map((s) => `<!-- source: ${repo}${s} -->\n\n${rewriteRelativeLinks(readFileSync(join(root, s), "utf8").trim(), s, repo)}`)
        .join("\n\n---\n\n")
    : "_No source document exists yet. This page is intentionally empty; do not publish it as content._";
  const head = `# ${num} ${title}\n\n_Generated from commit ${sha}. Source of truth: the linked repo files. Edit them in GitHub, not here._\n\n${present.map((s) => `- [${s}](${repo}${s})`).join("\n")}\n\n`;
  writeFileSync(join(out, file), head + body + "\n");
  index.push({ page: `${num} ${title}`, file, sources: present.length });
}
console.table(index);
console.log(`${index.filter((i) => i.sources).length} of ${PAGES.length} pages have content -> ${out}`);
