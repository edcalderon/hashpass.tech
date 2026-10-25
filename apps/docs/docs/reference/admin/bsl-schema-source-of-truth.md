# BSL database schema source of truth

Status: **live schema verified**
Last reviewed: **2026-10-25**

This page is the source of truth for the intended BSL database shape and the
verified migration state. It records what the repository owns, which migration
defines the current schema version, and which objects are explicitly outside
the application's ownership boundary.

## Version baseline

| Item | Current value | Source |
| --- | --- | --- |
| Application release | `1.9.147` | root `package.json` |
| Latest repository migration | `V142__pass_upgrade_requests.sql` | `db/migrations/` |
| Migration runner | `packages/tools/scripts/migrate-tenant-db.mjs` | profile + migration group config |
| Applied migration ledger | `public.hashpass_schema_migrations` | created/updated by the migration runner |
| BSL profile | `bsl-development` (`bsl-production` retired 2026-10-20) | `packages/tools/scripts/config/database-profiles.json` |

`V141__event_chat_reactions.sql` and `V142__pass_upgrade_requests.sql` are
registered in the `event-chat` and `admin-pass-management` groups. They are
applied and recorded in `public.hashpass_schema_migrations` in both the shared
development profile and consolidated core production. Reaction tables remain
service-role-only; pass-upgrade requests are written and reviewed through the
server API. The pass-upgrade ledger deliberately stores `pass_id` as text so
the same migration works with development's UUID-shaped pass ids and
production's legacy text ids; the API validates pass ownership before insert.

## Ownership boundaries

### HashPass application schema

These are application-owned and must be retained unless a reviewed migration
replaces them:

- identity: `public.users`, `public.user_profiles`, `auth.users` mappings;
- events and authorization: `public.events`, `public.event_roles`;
- passes: `public.passes`, `public.event_pass_tiers`,
  `public.pass_claim_codes`, and pass audit records;
- event content: agenda/session rows and `public.bsl_speakers`;
- speaker directory state: `public.speaker_directory_status` and the generated
  `public.bsl_speakers.directory_status` (`private`, `passive`, `inactive`,
  `active`, `dnd`);
- attendee workflows: meeting requests/slots, networking, notifications,
  chat, email delivery/audit, and schedule-share records;
- security contracts: foreign keys, indexes, RLS policies, and security-
  definer RPCs referenced by the API.

### Provider-owned schemas

- `auth.*` is Supabase Auth and is not migrated by application cleanup work.
- `storage.*`, replication metadata, and other Supabase-managed objects are
  provider-owned.
- `directus_*` tables are Directus metadata. They must not be edited or dropped
  as part of the HashPass migration set until the Directus usage audit confirms
  whether they are still needed by CMS/admin workflows.

## Identity relation

`auth.users.id` is the Supabase provider identity. `public.users.id` is the
canonical HashPass registry identity; `public.users.auth_user_id` and
`provider_ids` map provider identities to registry rows. Legacy
`user_profiles.user_id` values may use either identity form. Pass and admin
queries must use the fallback relation implemented in `V059`, not assume that
`passes.user_id = auth.users.id`.

## Migration and verification rules

1. Add schema changes as numbered SQL files under `db/migrations/`.
2. Register grouped migrations in `database-profiles.json` when they are not
   part of the default tenant set.
3. Apply the same migration set to development before production.
4. Confirm the applied ledger, constraints, RLS policies, and critical row
   counts in both databases.
5. Never delete an object because it is empty, disabled in a dashboard, or has
   a case-insensitive name match. Dependency and application-reference proof
   is required.

The companion [BSL schema and relation audit](./bsl-schema-relational-audit.md)
defines the read-only inventory queries and approval gates. The cleanup design
task is tracked in `.agents/pending/task-bsl-database-cleanup.md`.
