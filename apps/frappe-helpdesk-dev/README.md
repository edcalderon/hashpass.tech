# hashpass-frappe-helpdesk-dev

Local-only Frappe Helpdesk stack for simulating the mobile app's "Contact
Support" / live ticket chat flow end-to-end in dev — **never** the production
instance. There is currently no deployed `support.hashpass.tech` at all (see
`docs/operations/self-hosted-operations.md`); this package exists so that
flow can still be developed and tested locally against a real Frappe
Helpdesk, using the exact same pinned stack
(`ops/self-hosted/frappe/compose.yaml`, `ghcr.io/frappe/helpdesk:v1.30.1`)
the real self-hosted runbook deploys — just with a local-only port-publishing
override (`docker-compose.local.yml`) instead of Caddy/TLS/DNS.

This mirrors `apps/directus`'s compose-wrapper package shape deliberately: a
developer who already knows one knows both.

## One-time setup

Generate `ops/self-hosted/.env` if it doesn't exist yet (gitignored, never
commit it):

```bash
DB_PW=$(openssl rand -hex 24); ADMIN_PW=$(openssl rand -hex 16)
cat > ops/self-hosted/.env <<EOF
FRAPPE_IMAGE=ghcr.io/frappe/helpdesk:v1.30.1
FRAPPE_SITE_NAME=frappe.localhost
FRAPPE_DB_ROOT_PASSWORD=${DB_PW}
MARIADB_ROOT_PASSWORD=${DB_PW}
FRAPPE_ADMIN_PASSWORD=${ADMIN_PW}
EOF
```

`MARIADB_ROOT_PASSWORD` and `FRAPPE_DB_ROOT_PASSWORD` must be the same value:
the official `mariadb` image's entrypoint reads the former to initialize the
root password, while `frappe-create-site` reads the latter for its `bench
new-site --db-root-password` flag.

## Usage

```bash
pnpm --filter hashpass-frappe-helpdesk-dev run up       # start, detached (does not block on readiness)
pnpm --filter hashpass-frappe-helpdesk-dev run seed     # create service users + write apps/mobile-app/.env.local
pnpm --filter hashpass-frappe-helpdesk-dev run logs     # tail all container logs
pnpm --filter hashpass-frappe-helpdesk-dev run down     # stop
pnpm --filter hashpass-frappe-helpdesk-dev run reset    # wipe the DB volume and start fresh
pnpm --filter hashpass-frappe-helpdesk-dev run doctor   # sanity-check compose/docker setup
```

`up` mirrors `apps/directus`'s own `up` shape: it starts the containers
detached and returns immediately without blocking on readiness. Wait for
`http://127.0.0.1:8083/api/method/ping` yourself (or just run `seed`, which
needs the site to actually be up and will fail clearly if it isn't yet).

`npm run dev:all` runs `up` and `seed` for you automatically (skipping `seed`
if `apps/mobile-app/.env.local` already has working Frappe credentials), so
the mobile app's Contact Support screen and Frappe live-chat simulation work
out of the box in a full local dev session. See
`packages/tools/scripts/dev-all.sh`.

Once seeded, the local Helpdesk desk UI is reachable at
`http://127.0.0.1:8083` (override the port with `FRAPPE_LOCAL_HTTP_PORT`) —
log in as `Administrator` with the password from `ops/self-hosted/.env` to
inspect tickets created by the app.

## What `seed` does

`scripts/seed-support-users.js` logs in as `Administrator`, then creates (if
missing):

- An `HD Team` named after `FRAPPE_SUPPORT_TEAM` (defaults to `HASHPASS`,
  matching `apps/mobile-app/lib/server/frappe-helpdesk.ts`'s own default) —
  tickets created by the app route to this team via `agent_group`.
- Two dedicated service users, `support-read@local.hashpass.dev` and
  `support-write@local.hashpass.dev`, each with the standard Frappe Helpdesk
  `Agent` role, and generates an API key/secret pair for each via Frappe's
  `generate_keys` method.

It then writes `FRAPPE_BASE_URL`, `FRAPPE_SUPPORT_READ_API_KEY`,
`FRAPPE_SUPPORT_READ_API_SECRET`, `FRAPPE_SUPPORT_WRITE_API_KEY`,
`FRAPPE_SUPPORT_WRITE_API_SECRET`, and `FRAPPE_SUPPORT_TEAM` into
`apps/mobile-app/.env.local` (creating it, or updating just those keys if it
already exists). Restart the mobile app dev server afterward to pick up the
new values.

**This is intentionally simpler than the production permission model.**
`apps/mobile-app/.env.example` documents scoping the write user to HD Ticket
create/update + HD Ticket Comment create only, and the read user to
read-only on those same doctypes — real least-privilege for a real
deployment. Doing that split from scratch via the REST API on every fresh
local site is a lot of Role Permission Manager plumbing for a disposable dev
database that only ever holds fake tickets, so both local service users get
the same `Agent` role instead. The mobile app's own client code
(`lib/server/frappe-helpdesk.ts`) still keeps the read and write keys
separate and never uses one for the other's operations, so the app-level
contract being tested is the same either way — only the Frappe-side
permission enforcement is looser locally. Never reuse this pattern for a
real deployment.

## Why this isn't a second copy of the stack

`docker-compose.local.yml` only adds a host port mapping for
`frappe-frontend`'s internal nginx (port 8080) — it changes no service
definitions. The base stack file, `ops/self-hosted/frappe/compose.yaml`, is
the same file `ops/self-hosted/deploy.sh` runs in production. If that base
file changes, this package picks the change up automatically.

## Never confuse this with

- **`packages/frappe-helpdesk-mcp`** — a separate, agent-facing MCP server
  with its own dedicated credentials (`FRAPPE_MCP_*` env vars). Do not reuse
  those credentials here, or these here for that.
- **A production Frappe Helpdesk instance** — none is currently deployed.
  See `docs/operations/self-hosted-operations.md` and
  `docs/operations/self-hosted-runbook.md` for the real deployment path,
  which needs a real host, DNS, and mailbox credentials this local package
  never touches.
