# HASHPASS knowledge center — as built (GitHub, Plane, Notion)

**Date:** 2026-10-27 | **Status:** Current state, verified against the repo and live Plane where stated. Supersedes the "Current constraints" section of [knowledge-governance-github-plane-notion.md](knowledge-governance-github-plane-notion.md).

## Decision

GitHub is the single source of truth for work. Plane is the knowledge center (architecture, decisions, reference) and holds no work items. Notion is the transitional CEO layer.

| System | Holds | Does not hold |
| --- | --- | --- |
| GitHub | Issues, PRs, org Projects, in-repo ADR drafts, deploy evidence | Secrets |
| Plane | Curated pages and modules (knowledge) | Work items. A GitHub task is never mirrored here |
| Notion | CEO briefing, dates, decisions that need the CEO | Long technical docs, duplicated tasks |

## Work tracking on GitHub (org `hashpass-tech`, all private)

| Project | Scope |
| --- | --- |
| [#4 HASHPASS](https://github.com/orgs/hashpass-tech/projects/4) | Engineering work for the Meta hackathon Muse Companion; views for the Companion, Board, Roadmap, Backlog |
| #5 Corporate & Legal | Migrated from Plane module of the same name (1 item) |
| #6 BSL Bogotá 2027 Planning | 1 item |
| #7 Strategy & Validation | 4 items (Passport validation, competitor radar) |
| #8 Finance & Cloud | 1 item (AWS credits and runway) |
| #9 Product & Operations | 6 items (payments pilot, Passport build items) |
| #10 Commercial & Partnerships | 4 items (event leads, events radar, BSL Bogotá 2026 charter) |

Projects #5–#10 hold draft items, not repository issues, because they are business items and do not belong in the public code repository. Each draft carries the original text, Plane priority, state and module in its body.

## Plane (live, checked 2026-10-27)

- Instance `https://work.hashpass.tech`, workspace slug `plane`, one project `HASHPASS` (identifier `HASHPASS`).
- Work items: **0**. The 17 items that existed were copied to GitHub projects #5–#10, verified item by item (title, status, body text, links), backed up locally, then deleted.
- Modules: 6 (BSL Bogotá 2027 — Planning, Strategy & Validation, Finance & Cloud, Product & Operations, Commercial & Partnerships, Corporate & Legal). They are now empty. They map one to one to GitHub projects #6–#10 and #5, and are kept as the knowledge areas until the page taxonomy replaces them.
- Pages: see the publication log at the end of this document. Do not assume a page exists unless it is listed there.
- Cycles, labels and intake: none.

## Components in the repo

| Component | Path | Purpose | Verified |
| --- | --- | --- | --- |
| Self-hosted Plane and Frappe Helpdesk | `ops/self-hosted/` | Compose templates, Caddy, backup and restore scripts; deployed by `.github/workflows/self-hosted-vps-deploy.yml` through SSM | Template read; deployment not re-run |
| Plane MCP gateway | `packages/plane-mcp-gateway/` | OAuth 2.1 front for Plane's MCP server; read and write actions classified by `policy.mjs`; scopes `plane:read` / `plane:write` | Code and tests present; live discovery checked by the ChatGPT plugin script |
| ChatGPT plugin package | `plugins/hashpass-plane/` | Connection metadata for the gateway (v1.0.2) | Validated and tested earlier |
| Plane object storage | `packages/infra/terraform/stacks/hashpass-plane-storage/` | Private versioned encrypted S3 bucket for Plane uploads | Terraform present; applied state not checked |
| Notion archive | `packages/infra/terraform/stacks/hashpass-notion-archive/`, `packages/notion-plane-sync/` | Read-only Notion archive into private S3 with a DynamoDB hash registry. Schedule defaults off until a manual archive and restore drill pass | Code and tests present; whether it is applied or scheduled is not checked |
| Campaign import | `campaigns/bsl-2026/import-plane.mjs` | One-off script that created the BSL26 work plan in Plane | Historical. It creates work items, so it must not be run again under this model |

Authorization policy for the MCP gateway: [plane-mcp-authorization](../../apps/docs/docs/auth/plane-mcp-authorization.md).

## Conflicts with the current model to resolve

- `campaigns/bsl-2026/import-plane.mjs` and `OPERATIONS.md` describe creating Plane work items. The BSL26 project no longer exists in the Plane workspace, and its work plan should live on GitHub if still needed.
- The `notion-plane-sync` package name implies Plane work-item sync. Its README says work-item materialization is deliberately off. Treat it as a Notion archive only.
- The deleted Plane items ended with "Plane is the shared execution layer; Notion remains the private knowledge source". That wording is now wrong. If the same text exists in Notion or in the import tooling, correct it there; I did not check Notion.

## Future work: GitHub to Plane mirror (not built)

Not started. If wanted, a one-way sync would publish accepted knowledge, not tasks:

1. GitHub remains the writer. Plane pages are read-only mirrors with a link back to the source commit or issue.
2. Source: ADRs and architecture docs in `docs/architecture/` marked Accepted.
3. A workflow on merge to `main` upserts one Plane page per document, keyed by a stable ID in the front matter.
4. It never creates or edits Plane work items, and never reads from Plane.
5. Needs a decision first: a least-privilege Plane token stored as a GitHub secret, and whether business drafts (projects #5–#10) are ever mirrored. They hold commercial detail, so the default is no.

## Page taxonomy to publish in Plane

00 Architecture Index and Terminology; 01 Architecture Decision Records; 02 Platform and Capability Registry; 03 Muse Models, Speech, Cost and Benchmarks; 04 Event Knowledge and Agenda Intelligence; 05 Networking, Consent and Meeting Protocol; 06 Security, Privacy, Compliance and Data Retention; 07 Experiments and Evaluation Evidence; 08 Historical Hackathons, Releases and Postmortems.

Per the governance rule, only accepted ADRs are published as accepted. ADR-HMC-001/002/003 are still "Proposed", so they appear as drafts with a link to the source.

## Publication log

No Plane page has been written yet.

On 2026-10-27, `POST /api/v1/workspaces/plane/projects/<id>/pages/` returned 404 on this instance, so the REST API with a personal token cannot create pages. Pages can be created through the Plane web UI or through the `page` tool family of the Plane MCP gateway (`packages/plane-mcp-gateway`) from an MCP client. Publishing remains pending until one of those is used.
