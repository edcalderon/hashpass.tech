# Self-hosted operations and customer support

## Decision and status

HASHPASS uses **Plane Community Edition** as the internal execution system of record and **Frappe Helpdesk** as the customer-support and public knowledge-base system of record. They share only the edge network and links/IDs; each has its own database, cache, file volume, service identities, upgrade cadence, and backup artifacts. Notion remains the founder's private archive.

This repository pins Plane CE `v1.4.2`, Frappe Helpdesk `v1.30.1`, Plane MCP `v0.3.2`, and the Frappe Docker deployment pattern `v3.2.2`, the stable releases checked on 2026-09-20. Pinning—not `latest`/`stable`—makes upgrades reviewable. The repository work is deployment-ready, but no production host, DNS authorization, SMTP/mailbox credentials, off-server backup bucket, or service-user keys were available in this environment. Consequently `work.hashpass.tech` and `support.hashpass.tech` are **not claimed as deployed or tested** by this change.

Upstream references: [Plane CE release](https://github.com/makeplane/plane/releases/tag/v1.4.2), [Frappe Helpdesk release](https://github.com/frappe/helpdesk/releases/tag/v1.30.1), [Plane MCP release](https://github.com/makeplane/plane-mcp-server/releases/tag/v0.3.2), and [Frappe Docker release](https://github.com/frappe/frappe_docker/releases/tag/v3.2.2).

## Architecture

```text
Internet -> Caddy (80/443 only)
  work.hashpass.tech    -> Plane proxy -> Plane CE app/API/workers
                                      -> private PostgreSQL/Valkey/RabbitMQ/MinIO
  support.hashpass.tech -> Frappe nginx -> Helpdesk/websocket/workers/scheduler
                                        -> private MariaDB/Redis/site volumes

Approved AI client -> official Plane MCP -> Plane API (dedicated Plane service user)
Approved AI client -> HASHPASS Helpdesk MCP -> Frappe REST API
                                           -> read or write service user
Customer -> Helpdesk portal/email -> ticket -> support triage
  engineering escalation -> linked Plane work item -> fix -> ticket update -> customer
```

Only Caddy publishes host ports. Both database families, queues, object storage, workers, admin internals, and MCP stdio processes remain private. Caddy terminates TLS and renews ACME certificates automatically. Native authentication is the phase-one choice; future SSO should use one OIDC provider for employee Plane and Helpdesk identities without merging customer identities into the employee directory.

## Community Edition validation

The pinned Plane CE source and official self-host compose contain Projects, Work Items, Cycles, Modules, Pages, Views, Intake, and the API used here. HASHFEST planning uses only those primitives. Roadmap presentation is treated as a view assembled from cycles/modules; this deployment does **not** rely on paid customer management, email intake, public forms, or Plane Wiki. Frappe Helpdesk's open-source app supplies the portal, tickets, contacts, assignment, priorities/statuses, SLA doctypes, email accounts, knowledge-base articles, and agent UI. Reporting is limited to what the open-source app exposes. There is no paid or per-agent critical dependency.

Before each upgrade, repeat this validation against the candidate tags; never silently replace a CE primitive with an enterprise feature.

## Source of truth and support lifecycle

Customer accounts, conversations, SLA state, articles, and ticket history live in Frappe only. The SDK/widget work in this PR is an application-facing intake surface; production wiring must target the Frappe-backed gateway rather than create a second durable ticket store. Until that cutover is verified, keep the existing HASHPASS support routes disabled in production. Plane stores only an escalation work item containing the Frappe ticket ID and URL; do not copy the full customer conversation or unnecessary personal data.

1. Customer signs in at `support.hashpass.tech`, creates/replies to a ticket, or emails the configured support mailbox.
2. Helpdesk applies category, priority, SLA, assignment, and customer history. Support resolves ordinary issues there.
3. For product/engineering work, an agent creates a Plane issue manually or through the narrow integration and adds reciprocal `FRAPPE:<ticket-id>` / Plane URLs.
4. Engineering resolves the Plane issue. Support records the outcome in Frappe and notifies the customer.

Email-to-ticket uses a dedicated support mailbox configured as a Frappe Email Account using provider credentials from the host secret store. SPF, DKIM, DMARC, inbound IMAP/OAuth, and outbound SMTP must be verified before enabling replies. Plane never receives customer email.

## Initial information architecture

Import `ops/self-hosted/config/hashfest.json` after the Plane workspace exists. Create one `HASHFEST` project and its listed modules. Store historical narrative and research as Pages; decisions as dated decision records; milestones in cycles/modules; risks as labelled work items; actions only as work items with an owner and expected outcome. Create the Helpdesk categories from `helpdesk-taxonomy.json` and resist adding overlapping categories until ticket data demonstrates a need.

## AI/MCP boundary

Plane uses the official pinned MCP server and a non-admin Plane service identity. The HASHPASS Frappe MCP exposes exactly the fourteen approved tools. Its read process cannot mutate; its write process requires a distinct credential plus two explicit write switches. The AI client never receives Administrator credentials. Close/reopen and arbitrary updates belong only in the separately approved write client. Frappe permissions remain the final authorization boundary and audit source.

## Notion migration

Do not bulk-import the founder workspace and do not build bidirectional sync.

1. Inventory only HASHFEST, BSL, product operations, partner/sponsor execution, runbooks, SOPs, and shared product documents.
2. Classify every item as reference, decision, milestone, risk, or actionable work. Remove duplicates and secrets before export.
3. Recreate HASHFEST flagship planning, 2023 archive, break-even strategy, committee/governance, anchor-partner strategy, sponsor matrices, and contact research in the corresponding Plane Pages/modules. Restrict sensitive contact research to the smallest team role.
4. Owners compare counts, links, attachments, permissions, and a sample of rendered pages. Actions receive an owner; prose does not automatically become tickets.
5. Freeze the operational Notion area, add a dated pointer to the Plane project, retain it read-only for 30 days, then archive it. Plane is the sole operational source from the cutover date.

## Security review

Required before public exposure: patched host and Docker; default-deny firewall allowing only SSH from the management network plus 80/443; no default/placeholders; unique generated credentials; SSH keys and no password login; encrypted host disk; service-user least privilege; Frappe/Plane audit logs retained; container logs rotated; SMTP OAuth/app password isolated; MCP accessible only to approved local clients or a mutually authenticated private gateway; Caddy/upstream request limits at the host firewall/WAF; database ports verified absent from `ss -lnt`; daily encrypted off-server backups; and alerts for disk, certificate expiry, container health, backup age, and 5xx rate.

Track upstream advisories for [Plane](https://github.com/makeplane/plane/security), [Frappe Helpdesk](https://github.com/frappe/helpdesk/security), [Frappe Framework](https://github.com/frappe/frappe/security), Caddy, MariaDB, PostgreSQL, Redis/Valkey, RabbitMQ, and MinIO. Run `docker scout cves` or Trivy on every pinned image before promotion. Do not expose MinIO console, RabbitMQ management, databases, Redis, or MCP over the public network.
