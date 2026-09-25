# Operator runbook: Plane and Frappe Helpdesk

## Prerequisites and first deployment

Use one dedicated Linux host initially (4+ vCPU, 16 GB RAM, 100 GB encrypted SSD recommended after a load test), Docker Engine with Compose v2, `restic`, DNS control, and an S3-compatible off-server repository. If growth or failure domains require it, move either stack independently later.

1. Point `work.hashpass.tech` and `support.hashpass.tech` A/AAAA records at the host. Do not enable proxy caching.
2. Copy `ops/self-hosted/.env.example` to `.env` on the host (never in Git), generate each secret independently (`openssl rand -hex 32`), URL-encode secrets embedded in URLs, and set a backup-only storage key.
3. Lock it down: `chmod 600 .env`; allow inbound 80/443 and management-network SSH only.
4. Run `./deploy.sh`. Inspect `docker compose ... ps`, Caddy JSON logs, and application migrations. Do not publish before all services stabilize.
5. Create the first admin interactively, disable open registration if not intended, create named operators, then retire bootstrap credentials.
6. Import the HASHFEST structure and Helpdesk taxonomy JSON manually/API-assisted. This deliberate bootstrap avoids brittle writes before workspace/site IDs exist.
7. Create Frappe reader/writer MCP users with the permissions in the MCP README and a Plane MCP user. Inject credentials from the host secret manager.
8. Configure the support mailbox and verify inbound ticket, outbound reply, customer portal login, create/reply/status/reopen, article search, assignment, SLA, and customer visibility with non-admin test accounts.

## Validation checklist

```bash
docker compose --env-file .env -f compose.yaml config --quiet
docker compose --env-file .env -f plane/compose.yaml config --quiet
docker compose --env-file .env -f frappe/compose.yaml config --quiet
curl -fsS https://work.hashpass.tech/
curl -fsS https://support.hashpass.tech/api/method/ping
ss -lnt                         # only SSH, 80, and 443 expected publicly
docker compose -f plane/compose.yaml ps
docker compose -f frappe/compose.yaml ps
```

Test with a customer account, not Administrator. Confirm that customer A cannot read customer B's ticket. Exercise both MCP read-only denials and an approved write in a disposable ticket. Record evidence without credentials or customer data.

## Backups and restore

Install a root cron/systemd timer for `backups/backup.sh` daily. It creates consistent database dumps, Plane uploads, Frappe public/private site files, and recovery configuration; encrypts them with restic; sends them off-server; and retains 14 daily, 8 weekly, and 12 monthly snapshots. Alert if the newest snapshot is older than 26 hours. Keep the restic password separately from both host and repository.

Monthly, restore the newest snapshot to an isolated host/network with fresh DNS names. Run `restore.sh`, then verify database counts, a Plane attachment, a private Helpdesk attachment, portal login, ticket creation, and article search. Record date, snapshot ID, operator, results, and teardown. `restore.sh` is intentionally interactive and destructive; never point a drill at production.

## Routine operations

Daily: container health, disk, certificate, queue depth, 5xx, scheduler, mailbox ingestion, and backup freshness. Weekly: failed login/audit review, inactive users, unresolved SLA breaches, restore-repository integrity (`restic check`). Monthly: OS/image CVEs, capacity trend, permission review, and an isolated restore drill.

## Upgrade and rollback

1. Read both projects' release notes/security notices and confirm CE capability/backup compatibility.
2. Open a PR changing only pinned versions and any required schema/config. Never use floating `latest`.
3. Back up and test restore; clone production data into an isolated, access-controlled staging host with outbound email disabled and personal data minimized.
4. Pull images, run migrations, and execute the complete validation checklist. Upgrade Plane and Frappe independently.
5. Schedule production, take a fresh backup, update one stack, smoke-test, then update the other only if required.
6. Roll back application images only when upstream says schema is backward compatible. Otherwise restore the pre-upgrade database/files with `restore.sh`.

## Remaining production inputs

Production host/IP and SSH authorization; Route 53 record authorization under the `hashpass` AWS profile after a private account-ID comparison; ACME email; all generated app/database/object-store secrets; support mailbox OAuth/IMAP/SMTP settings; off-server restic repository and backup-only key; Plane and Frappe named admin/service users; AI-client allowlist. These are intentionally absent from Git.
