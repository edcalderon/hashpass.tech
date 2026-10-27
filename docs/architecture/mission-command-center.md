# HASHPASS Mission Command Center

**Status:** Current as of 2026-10-27 | **Audience:** internal team, local first | **Owner:** edcalderon

The single starting page for running HASHPASS: who owns what, where each kind of work lives, where the knowledge is, and how to check that the live system is healthy. It holds links and check commands only. **No secrets, tokens, account IDs or customer data belong on this page.** Counts change; follow the links for the live number.

## 1. Where work and knowledge live

| System | Job | Open it |
| --- | --- | --- |
| GitHub | Code execution planner: every issue that changes code, config or infrastructure | [Project #4 HASHPASS](https://github.com/orgs/hashpass-tech/projects/4) |
| Plane | Collaboration knowledge center: non-code work items and curated pages | [work.hashpass.tech](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/issues/) |
| Notion | CEO-only private drafts. Non-authoritative; nothing depends on it | Not linked on purpose |

Classify before creating: changes code, config or infrastructure in this repo → GitHub issue under #4. Anything else → Plane work item. Full rule: [workspace-operating-model.md](workspace-operating-model.md).

## 2. Enterprise divisions → Plane modules

Each division is one Plane module. Open a module to see its work items.

| Division | Covers | Plane module |
| --- | --- | --- |
| Strategy & Validation | Market validation, competitor and event radar, theses | [open](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/modules/137660fb-5cae-401a-8205-c49719e5592b/) |
| Product & Operations | Product operations, payments orchestration, day-to-day running | [open](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/modules/e477e361-9b64-49c7-83eb-a3f4ab46e2dc/) |
| Commercial & Partnerships | Paid event partnerships, sales pipeline | [open](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/modules/197f6bf5-5c18-4d33-a025-e8c16b683e9f/) |
| Finance & Cloud | Cloud credits and runway, AWS budget and cost control | [open](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/modules/76aca808-8a57-47bf-bbab-1e24d5feccb1/) |
| Corporate & Legal | Entity set-up, legal and compliance | [open](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/modules/30ebe53f-6d6f-48dc-ac7e-67822eb3cc7f/) |
| BSL Bogotá 2027 — Planning | Scope, delivery charter and milestones for the 2027 event | [open](https://work.hashpass.tech/plane/projects/8c6755ef-6d32-4076-9173-a6b06db7fc40/modules/025edab0-4a5f-4ef3-b5bf-adf52ddd8531/) |

## 3. Engineering execution (GitHub)

Everything below is tracked in [Project #4](https://github.com/orgs/hashpass-tech/projects/4). Never create another project, board or master issue.

| Epic / stream | Issue | What it is |
| --- | --- | --- |
| Meta Hackathon: HASHPASS Companion | [#455](https://github.com/hashpass-tech/hashpass.tech/issues/455) | Epic: standalone pixel pet, guest → HASHPASS ID, Muse agent, DoorReady |
| C1 Contracts and permissions | [#457](https://github.com/hashpass-tech/hashpass.tech/issues/457) | Muse contracts, permissions, real API smoke |
| C2 Voice | [#458](https://github.com/hashpass-tech/hashpass.tech/issues/458) | Voice input, turn handling, spoken replies |
| C3 Capability registry | [#459](https://github.com/hashpass-tech/hashpass.tech/issues/459) | Safe app-wide capability registry and tool execution |
| C4 Companion shell | [#460](https://github.com/hashpass-tech/hashpass.tech/issues/460) | Circular Muse app shell, multimodal UX |
| C5 DoorReady | [#461](https://github.com/hashpass-tech/hashpass.tech/issues/461) | Event source reconciliation, offline pass |
| C6 Gates | [#462](https://github.com/hashpass-tech/hashpass.tech/issues/462) | E2E voice gates, safety, costs, submission |
| C7 Standalone app | [#469](https://github.com/hashpass-tech/hashpass.tech/issues/469) | Standalone companion, guest quota, HASHPASS ID step-up |
| Agenda intelligence | [#464](https://github.com/hashpass-tech/hashpass.tech/issues/464) | Speaker and session recommendations |
| Networking | [#465](https://github.com/hashpass-tech/hashpass.tech/issues/465) | Consent-based matching and meeting requests |
| Passport MVP | [#425](https://github.com/hashpass-tech/hashpass.tech/issues/425) | Universal Event Inbox (children #474–#478) |

Active engineering task notes live in `.agents/active/`: [workspace operating model](../../.agents/active/task-workspace-operating-model.md), [AWS cost audit](../../.agents/active/task-aws-cost-audit-and-controls.md), [build cost and CI/CD migration](../../.agents/active/task-build-cost-containment-and-cicd-migration.md).

## 4. Knowledge map

**Architecture and decisions**
- [Workspace operating model](workspace-operating-model.md) and [Plane as-built record](knowledge-center-as-built.md)
- [Companion vision and system](meta-companion-vision-and-system.md), [agenda and networking](meta-companion-agenda-networking.md), [knowledge governance](knowledge-governance-github-plane-notion.md)
- [Muse companion contracts](../feature-plans/muse-companion-contracts.md), [Passport MVP](../feature-plans/passport-mvp.md), [DoorReady progress](../feature-plans/doorready-progress.md)

**Platform reference**
- [Deployment map](../../apps/docs/docs/infra/DEPLOYMENT_MAP.md), [Android CI memory](../../apps/docs/docs/infra/ANDROID_CI_MEMORY.md)
- [Play Console release flow](../../apps/docs/docs/reference/release/PLAY_CONSOLE_RELEASE_FLOW.md), [OTA updates](../../apps/docs/docs/reference/mobile-app/eas-update-ota.md)
- [Auth flow](../../apps/docs/docs/auth/AUTH_FLOW.md), [user registry](../../apps/docs/docs/auth/USER_REGISTRY.md), [Plane MCP authorization](../../apps/docs/docs/auth/plane-mcp-authorization.md)

**Product, design and agent guidance**
- [PRODUCT.md](../../PRODUCT.md), [DESIGN.md](../../DESIGN.md), [design system and Storybook](../design-system-storybook.md)
- [AGENTS.md](../../AGENTS.md), [agent history](../agent-history.md)

**Code knowledge graph.** The repo is indexed by `codebase-memory-mcp`. From the repo root:

```bash
codebase-memory-mcp cli list_projects
codebase-memory-mcp cli index_status
codebase-memory-mcp cli get_architecture '{"project":"hashpass.tech"}'
```

Then use `search_graph` for symbols, `trace_path` for callers and callees, and `get_code_snippet` for exact source. Re-index with `index_repository` if the graph looks stale.

## 5. Live operations

### Surfaces

| Surface | Address | Deployed by |
| --- | --- | --- |
| Core site (production) | `https://hashpass.tech` | `github-hosted-tenant-site-deploy.yml`, push to `main` |
| Core site (development) | `https://dev.hashpass.tech` | `github-hosted-static-site-deploy.yml`, push to `develop` |
| API (production) | `https://api.hashpass.tech/api/config/versions` | Core web deployment, with version guard |
| API (development) | `https://api-dev.hashpass.tech/api/config/versions` | Core web deployment, with version guard |
| Club web | `https://hashpass.club` | `club-v*` tag → `deploy-club-docs.yml` |
| Companion (staging preview) | `https://companion-dev.hashpass.tech` | Manual S3 sync + CloudFront invalidation |
| BSL | `https://bsl.hashpass.tech`, `https://bsl-dev.hashpass.tech` | Tenant site workflow |
| Lukas landing | `https://lukas.hashpass.tech` | `lukas-landing-deploy.yml` on promotion |
| Android | Google Play (internal → alpha → beta → production) | Tag flow, native-change gated |

Domain routing detail: [Deployment map](../../apps/docs/docs/infra/DEPLOYMENT_MAP.md).

### Release streams

Three independent version streams; a change in one is **not** released by another.

| Stream | Command | Tag |
| --- | --- | --- |
| Global / mobile | `npm run release:promote` (protected `develop → main` PR) | `vX.Y.Z` |
| Club web | `pnpm run release:club:web:patch` | `club-vX.Y.Z` |
| Companion | `node packages/tools/scripts/release-companion.js patch` | `companion-vX.Y.Z` |

### Status checks

Run from the repo root. These read public endpoints or GitHub run history and print no credentials.

```bash
# API version guard (a stale version means the last deploy did not land)
curl -s https://api.hashpass.tech/api/config/versions | head -c 300
curl -s https://api-dev.hashpass.tech/api/config/versions | head -c 300

# Site deploys and the legacy infra workflow
gh run list --repo hashpass-tech/hashpass.tech --workflow github-hosted-static-site-deploy.yml --limit 5
gh run list --repo hashpass-tech/hashpass.tech --workflow github-hosted-tenant-site-deploy.yml --limit 5
gh run list --repo hashpass-tech/hashpass.tech --workflow infra-deploy.yml --limit 5

# Android release chain
gh run list --repo hashpass-tech/hashpass.tech --workflow mobile-android-release.yml --limit 3

# AWS cost and trigger guard (can be red when the month is already over budget)
gh run list --repo hashpass-tech/hashpass.tech --workflow aws-cost-report.yml --limit 3
```

Cost control: the monthly AWS budget is USD 50 in the `hashpass` account. Do not provision EC2 runners or other paid capacity without explicit owner approval. Context: [AWS cost audit](../../.agents/active/task-aws-cost-audit-and-controls.md).

## 6. How this page is maintained

- Source of truth: this file in the repo. Edit it in GitHub; the Plane copy is generated with `node packages/tools/scripts/build-plane-pages.mjs` and carries the commit it was built from.
- Plane module IDs and counts are checked against live Plane when the page is regenerated. Work-item numbers in Plane are not stable, so this page links modules, not items.
- Publishing the Plane copy and its read-back are recorded in the Publication log of [knowledge-center-as-built.md](knowledge-center-as-built.md).
