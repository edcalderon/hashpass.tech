# HASHPASS workspace operating model (GitHub, Plane, Notion)

**Date:** 2026-10-27 | **Status:** Current, state verified the same day against GitHub and live Plane. Supersedes the role split in [knowledge-governance-github-plane-notion.md](knowledge-governance-github-plane-notion.md) (ADR-HMC-003) where they differ: Notion is now CEO-only draft notes, and Plane also tracks non-code work. Detail on the Plane build: [knowledge-center-as-built.md](knowledge-center-as-built.md).

## The rule

| System | Role | Holds | Does not hold |
| --- | --- | --- | --- |
| GitHub | Shared code execution planner | Code issues and sub-issues, PRs, the single org project #4 HASHPASS, in-repo design drafts and ADRs, deploy evidence | Business, legal, finance, partnership or validation tracking; secrets |
| Plane | Shared collaboration knowledge center, non-code focus | Non-code work items in modules; curated knowledge pages | Code issues; mirrors of GitHub issues |
| Notion | CEO-only draft notes | Private scratch notes, briefings in progress | Anything others depend on: tasks, technical docs, decisions of record |

**Classify before creating.** If it changes code, config or infrastructure in this repo, it is a GitHub issue under #4. Anything else is a Plane work item. If a CEO note becomes work, create the item in the right system and link it; do not leave it in Notion.

## Current state (2026-10-27)

**GitHub.** One project, [#4 HASHPASS](https://github.com/orgs/hashpass-tech/projects/4) (`#3 JACKKERNEL` is unrelated). Epic #455 (Meta hackathon Companion) has sub-issues #457–#462, #464, #465, #469 and #425 (Passport MVP). #425 has children #474–#478. The earlier per-module projects #5–#10 were deleted after their items were restored to Plane.

**Plane.** `https://work.hashpass.tech`, workspace slug `plane` (not `hashpass`), project HASHPASS. 9 work items, all non-code, in 6 modules: Commercial & Partnerships 4, and one each in BSL Bogotá 2027 Planning, Strategy & Validation, Finance & Cloud, Product & Operations, Corporate & Legal. 6 labels (bsl, radar, funding, legal, partnership, payments). No cycles. Item numbers are not stable across a delete and restore.

**Plane pages.** None published yet. The REST API cannot create pages, so a page-ready import set is generated from the repo (see "Document dump" below) and still has to be pasted in through the Plane UI or MCP.

**Notion.** Not read or written in this work. Treat existing long entries as a historical, superseded log.

## History in one paragraph

On 2026-10-27 the 17 Plane work items were first moved to six private GitHub projects and deleted from Plane, then, the same day, restored to Plane from a verified local backup and the projects deleted, because most were not code. Eight of them were Passport items; Passport is code, so those became GitHub issues (#474–#478 under #425) and were deleted from Plane. Backups of the original inventory are outside the repo at `~/.hashpass-backups/`.

## Document dump to Plane

Plane's REST API has no page endpoints, so pages cannot be created by script with the personal token. The repo is the source: `docs/architecture/` and `docs/feature-plans/` hold the documents, and `node packages/tools/scripts/build-plane-pages.mjs` assembles them into one Markdown file per page under `dist/plane-pages/` (taxonomy 00–08; a page with no source document is listed as not written, never invented). Publishing a page means pasting or importing the Markdown through the Plane UI or the MCP `page` tools, then reading the page back. Record each published page, with its URL and the source commit, in the as-built document's publication log. Nothing is published unless it is listed there.

## Agent guardrails (also in `CLAUDE.md` and `AGENTS.md`)

1. Classify before creating (see above). One GitHub project only.
2. Never claim a Plane write or page publication that was not read back.
3. Never print, log or commit `PLANE_API_TOKEN`, `MODEL_API_KEY` or any other secret. Extract a single variable from `.env` with `grep`, never source or echo the file.
4. Do not run `campaigns/bsl-2026/import-plane.mjs`; it creates work items and would duplicate them.
5. The workspace slug is `plane`. A wrong `PLANE_WORKSPACE_SLUG` on the MCP gateway makes every Plane call return 403.
6. Agent memory and `.agents/` to-dos point at this document and do not restate it.

## Open items

Tracked in `.agents/active/task-workspace-operating-model.md`: rotate the two credentials that were printed in a terminal; confirm the server-side `PLANE_WORKSPACE_SLUG`; decide whether the six modules stay as the page areas; the GitHub to Plane knowledge mirror (future, not built).
