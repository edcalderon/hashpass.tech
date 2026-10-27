# HASHPASS knowledge center — as built (GitHub, Plane, Notion)

**Date:** 2026-10-27 (revised) | **Status:** Current state, verified against the repo, live Plane and GitHub where stated. Supersedes the "Current constraints" section of [knowledge-governance-github-plane-notion.md](knowledge-governance-github-plane-notion.md).

## Decision (revised 2026-10-27)

GitHub tracks code work. Plane holds everything that is not a code issue: project setup, business tracking, and the knowledge center. Notion is the transitional CEO layer.

| System | Holds | Does not hold |
| --- | --- | --- |
| GitHub | Code issues and sub-issues, PRs, the single org project #4, ADR drafts, deploy evidence | Business, legal, finance, partnership or validation tracking; secrets |
| Plane | Non-code work items grouped in modules, plus curated knowledge pages | Code issues, which stay on GitHub only |
| Notion | CEO briefing, dates, decisions that need the CEO | Long technical docs, duplicated tasks |

This reverses the earlier same-day decision to move all Plane work items to GitHub. The six per-module GitHub projects (#5–#10) were deleted once the items were back in Plane and verified.

## Work tracking on GitHub (org `hashpass-tech`)

One project: [#4 HASHPASS](https://github.com/orgs/hashpass-tech/projects/4). Epic #455 with sub-issues #457–#462, #464, #465, #469, #425 and views for the Companion, Board, Roadmap and Backlog.

**Passport (moved from Plane, 2026-10-27).** Passport is a code product, so its Plane items became GitHub issues. [#425](https://github.com/hashpass-tech/hashpass.tech/issues/425) (Passport MVP, now a sub-issue of #455) has five P1 children: [#474](https://github.com/hashpass-tech/hashpass.tech/issues/474) persistence and schema, [#475](https://github.com/hashpass-tech/hashpass.tech/issues/475) private inbox and inbound email, [#476](https://github.com/hashpass-tech/hashpass.tech/issues/476) URL/ICS/image adapters, [#477](https://github.com/hashpass-tech/hashpass.tech/issues/477) Capsule UI, correction and export/delete, [#478](https://github.com/hashpass-tech/hashpass.tech/issues/478) pilot evidence and Go/Narrow/Stop decision. Done so far: the normalization contract and the DoorReady domain types (PR #456). Nothing else is built. #461 (DoorReady) is the P0 hackathon slice and shares the upload path with #474. Further engineering scope is added as sub-issues of this project, not as new projects. (`JACKKERNEL`, #3, is an unrelated project.)

## Plane (live, checked 2026-10-27)

- Instance `https://work.hashpass.tech`, workspace slug `plane`, one project `HASHPASS`.
- Work items: **9**, all non-code. 17 were restored from the local backup, then the 8 Passport items were removed because Passport is a code product (see below). Plane assigned new numbers on restore, so the old #1–#17 no longer resolve.
- Labels: bsl, radar, funding, legal, partnership, payments (assigned from title keywords).
- Modules: 6: Corporate & Legal 1, BSL Bogotá 2027 Planning 1, Strategy & Validation 1, Finance & Cloud 1, Product & Operations 1, Commercial & Partnerships 4.
- Pages: see the publication log at the end of this document. Do not assume a page exists unless it is listed there.
- Cycles and intake: none.
- Local backups outside the repo: `~/.hashpass-backups/plane-hashpass-inventory-2026-10-27.json` and the migration map.

## Components in the repo

| Component | Path | Purpose | Verified |
| --- | --- | --- | --- |
| Self-hosted Plane and Frappe Helpdesk | `ops/self-hosted/` | Compose templates, Caddy, backup and restore scripts; deployed by `.github/workflows/self-hosted-vps-deploy.yml` through SSM | Template read; deployment not re-run |
| Plane MCP gateway | `packages/plane-mcp-gateway/` | OAuth 2.1 front for Plane's MCP server; read and write actions classified by `policy.mjs`; scopes `plane:read` / `plane:write` | Code and tests present; live discovery checked by the ChatGPT plugin script |
| ChatGPT plugin package | `plugins/hashpass-plane/` | Connection metadata for the gateway (v1.1.0, first stable) | Validated, tested and live-checked 2026-10-27 |
| Plane object storage | `packages/infra/terraform/stacks/hashpass-plane-storage/` | Private versioned encrypted S3 bucket for Plane uploads | Terraform present; applied state not checked |
| Notion archive | `packages/infra/terraform/stacks/hashpass-notion-archive/`, `packages/notion-plane-sync/` | Read-only Notion archive into private S3 with a DynamoDB hash registry. Schedule defaults off until a manual archive and restore drill pass | Code and tests present; whether it is applied or scheduled is not checked |
| Campaign import | `campaigns/bsl-2026/import-plane.mjs` | One-off script that created the BSL26 work plan in Plane | Historical. It creates work items, so it must not be run again under this model |

Authorization policy for the MCP gateway: [plane-mcp-authorization](../../apps/docs/docs/auth/plane-mcp-authorization.md). What "stable" covers, how it was verified and how to re-check it: [plane-mcp-stable](../../apps/docs/docs/auth/plane-mcp-stable.md).

## Open items

- `campaigns/bsl-2026/import-plane.mjs` created the BSL26 work plan in Plane and is historical. Do not run it again: it would duplicate items. Its `work-plan.json` now names the correct workspace slug `plane`.
- The `notion-plane-sync` package name implies Plane work-item sync. Its README says work-item materialization is deliberately off. Treat it as a Notion archive only.
- Restored items still end with "Plane is the shared execution layer; Notion remains the private knowledge source". That is the original wording; edit it if the model should be restated in the items themselves.

## Future work: GitHub to Plane mirror (not built)

Not started. If wanted, a one-way sync would publish accepted knowledge, not tasks:

1. GitHub remains the writer. Plane pages are read-only mirrors with a link back to the source commit or issue.
2. Source: ADRs and architecture docs in `docs/architecture/` marked Accepted.
3. A workflow on merge to `main` upserts one Plane page per document, keyed by a stable ID in the front matter.
4. It never creates or edits Plane work items or GitHub issues, and never reads from Plane.
5. Needs a decision first: a least-privilege Plane token stored as a GitHub secret, and whether business work items are ever mirrored to pages. They hold commercial detail, so the default is no.

## Page taxonomy to publish in Plane

00 Architecture Index and Terminology; 01 Architecture Decision Records; 02 Platform and Capability Registry; 03 Muse Models, Speech, Cost and Benchmarks; 04 Event Knowledge and Agenda Intelligence; 05 Networking, Consent and Meeting Protocol; 06 Security, Privacy, Compliance and Data Retention; 07 Experiments and Evaluation Evidence; 08 Historical Hackathons, Releases and Postmortems.

Per the governance rule, only accepted ADRs are published as accepted. ADR-HMC-001/002/003 are still "Proposed", so they appear as drafts with a link to the source.

## Publication log

The first Plane page was published on 2026-10-27 (see below).

On 2026-10-27, `POST /api/v1/workspaces/plane/projects/<id>/pages/` returned 404 on this instance, so the REST API with a personal token cannot create pages. Pages can be created through the Plane web UI or through the `page` tool family of the Plane MCP gateway (`packages/plane-mcp-gateway`) from an MCP client. Publishing remains pending until one of those is used.

On 2026-10-27 the "HASHPASS Mission Command Center" page was authored in the repo as [mission-command-center.md](mission-command-center.md) and added to `build-plane-pages.mjs` as page `MC`. It is built but **not yet published** to Plane; record the Plane URL and read-back here once it is.

On 2026-10-27 the gateway's `page` tool was found to 404 on this Plane (1.4.2): its public API has no page routes in any release through v1.4.3-rc2. The gateway now serves `page` calls itself through a dedicated Plane account (see `ops/self-hosted/mcp/README.md`, "Plane pages"). That path is unit-tested against a fake Plane only; it has not yet been exercised against the live instance, so the Mission Command Center page is still unpublished.

### Published 2026-10-27: HASHPASS Mission Command Center

Created with `node packages/tools/scripts/publish-plane-pages.mjs --only MC` through the dedicated page account (`mcp-pages@hashpass.tech`, project Member). The script reads the page back after writing and fails on a title or body mismatch; an independent read-back confirmed title, six sections, five tables, 48 links, not archived, not locked, and no secret-like strings.

- Page: `https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/pages/1016c8e8-adaa-41b3-aaff-094c54e0740d/` (access 0 = public within the project)
- Source: `docs/architecture/mission-command-center.md`, built into `dist/plane-pages/` by `build-plane-pages.mjs`. Re-running the publisher updates the page in place by exact title.
- Not yet published: pages 00-08.
- Verified path: the page client was exercised against live Plane (list, create, retrieve, archive, delete on a throwaway page) before this publish. The gateway's MCP `page` tool using the same client remains untested live until PR #482 is merged and the gateway is redeployed with `PLANE_PAGES_EMAIL`/`PLANE_PAGES_PASSWORD`.

### MCP page tool verified live 2026-10-27

PR #482 deployed the gateway page client to the VPS, and `PLANE_PAGES_EMAIL`/`PLANE_PAGES_PASSWORD` were added to `/opt/hashpass/mcp/secrets/plane.env` over SSM Run Command (a timestamped `.bak-` copy of the file sits beside it). Only the `plane-mcp-gateway` container was recreated. Through the public path (OAuth, then `https://mcp.hashpass.tech/mcp`) the `page` tool then listed pages and created, archived and deleted a throwaway page; the project was left with only the Mission Command Center page. This supersedes the earlier note that the path was tested against a fake Plane only.

Operational notes: the compose working directory on the host is `/opt/hashpass/self-hosted/mcp` (not `/opt/hashpass/mcp`), and the gateway reads its env file only at start, so changing `plane.env` needs a gateway recreate: `docker compose --env-file .env -f mcp/compose.yaml up -d --no-deps --force-recreate plane-mcp-gateway`.
