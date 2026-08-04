# BSL database schema and relation audit

Status: review baseline (2026-08-04)

This document is the canonical review boundary for the BSL development and
production databases. It describes the tables that the application owns, the
identity relation used by every feature, and the evidence required before any
legacy object is retired. It is intentionally non-destructive: a table is not
safe to drop because it is empty or because its name appears duplicated in the
dashboard.

## Database ownership

| Area | Owner | Role |
| --- | --- | --- |
| `auth.*` | Supabase Auth | Provider identities, sessions, claims |
| `public.users` | HashPass registry | Canonical provider-agnostic account |
| `public.user_profiles` | HashPass | Profile and display metadata |
| `public.events`, `public.event_roles` | HashPass | Event catalog and event-scoped administration |
| `public.passes`, `public.event_pass_tiers`, `public.pass_claim_codes` | HashPass | Event entitlements and pass catalog |
| `public.bsl_speakers`, agenda/networking tables | HashPass | Event content and attendee interactions |
| `public.chat_*`, notifications, audit tables | HashPass | Product activity and compliance history |
| `directus_*` | Directus | CMS metadata only; never hand-edit or drop from this migration set |

## Canonical identity relation

`auth.users.id` is the Supabase provider ID. `public.users.id` is the canonical
HashPass registry ID and `public.users.auth_user_id`/`provider_ids` map provider
identities to that registry row. `public.user_profiles.user_id` may contain the
provider ID for legacy rows. Passes are therefore joined by identity fallback,
not by assuming every `passes.user_id` is an `auth.users.id`.

The admin pass listing uses this relation in `V059__admin_pass_registry_identity_fallback.sql`.

## Core relation map

```text
auth.users ─────┐
                ├── public.users (canonical registry)
                └── public.user_profiles

public.events ──< public.event_roles
              ├─< public.event_pass_tiers
              ├─< public.passes ──< public.pass_claim_codes (campaign grants)
              ├─< public.bsl_speakers
              ├─< agenda/session rows and attendee agenda status
              ├─< meeting_requests / meeting_slots
              └─< event-scoped audit, email, and chat records
```

## Objects that must be preserved

The following are active application contracts and must not be removed during
cleanup: `users`, `user_profiles`, `events`, `event_roles`, `passes`,
`event_pass_tiers`, `pass_claim_codes`, `bsl_speakers`, agenda/session tables,
meeting lifecycle tables, notifications, chat tables, and their indexes,
constraints, RLS policies, and security-definer RPCs. Directus system tables
are also preserved and managed only by Directus migrations.

## Duplicate-looking objects

The screenshot shows lowercase tables alongside uppercase names such as
`BSL_Audit`, `BSL_Bookings`, and `BSL_Tickets`. These may be quoted legacy
tables, views, or tables from an older tenant bootstrap. Case-insensitive name
matching is not proof of duplication in PostgreSQL. Before retirement, record
for each object:

1. `pg_class.relkind` (table, view, materialized view, sequence, or foreign table).
2. Exact columns, constraints, indexes, triggers, RLS policies, and grants.
3. Inbound and outbound foreign-key dependencies.
4. View/function/policy references from `pg_depend` and `pg_proc`.
5. Row counts and last-write evidence from both BSL databases.
6. Application and Directus references found in source, API routes, and CMS config.

Only an object proven to be an unreferenced legacy table/view, with a verified
backup and a rollback plan, may be retired. Never drop a schema or table solely
because it has zero rows.

## Required dev/prod audit sequence

Run the same read-only inventory against `bsl-development` and
`bsl-production`, save results outside the repository, and compare:

```sql
select n.nspname as schema_name, c.relname, c.relkind,
       pg_total_relation_size(c.oid) as bytes
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'auth')
order by n.nspname, c.relname;

select conrelid::regclass as table_name, conname, confrelid::regclass as references_table
from pg_constraint
where contype = 'f'
order by 1, 2;

select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname in ('public', 'auth')
order by schemaname, tablename, policyname;

select event_id, count(*) as pass_count
from public.passes
group by event_id
order by event_id;
```

Compare the canonical row counts, migration history, function signatures, RLS
policies, and event IDs between environments before approving cleanup. Export a
backup/snapshot and run `flyway info`/`flyway validate` before any migration.

## Cleanup policy and next gate

This audit intentionally does not include `DROP TABLE`, `DROP VIEW`, or
`DROP SCHEMA`. The next migration should be a quarantine/rename only after the
two inventories identify exact candidates. Production execution requires:

- a verified snapshot and restore test;
- a reviewed dependency report for every candidate;
- a dev dry run and application smoke test;
- explicit approval of the candidate list;
- a production change window and post-migration row-count/API checks.

Until those gates are complete, applying destructive cleanup to either BSL
database would risk deleting active passes, audit history, or CMS metadata.
