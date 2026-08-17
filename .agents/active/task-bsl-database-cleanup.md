# Task: Audit and safely clean BSL database schemas

**Status:** ACTIVE — Phase 1 partially covered by a related audit, moved
from pending 2026-08-16  
**Priority:** High (data integrity)  
**Created:** 2026-08-04  
**Updated:** 2026-08-16 (moved pending -> active; found related prior work
while triaging the pending queue)

## Progress found 2026-08-16 (not previously reflected in this file)

A separate, related effort — the "exhaustive DB schema audit" memory
entry, dated 2026-08-11 — already did real read-only inventory work
covering some of this task's Phase 1 scope: found 8 confirmed-dead tables
(pending drop approval, not yet dropped), confirmed core-prod's
`directus_users` has 6 orphaned real accounts that must never be dropped,
and confirmed the `BSL_*` views are *not* duplicates (contradicting one of
this task's own candidate assumptions in the Scope section above). A
second related fix — `project_directus_rls_exposure_fixed`, also
2026-08-11 — found and fixed 27 `directus_*` tables on dev with RLS
disabled (via migration V063), which overlaps this task's `directus_*`
candidate scope directly.

**This does not fully satisfy Phase 1 as written.** That audit was scoped
more broadly (general schema health, not specifically the quoted/
case-duplicate-table and legacy-object cleanup this task describes) and
doesn't appear to have followed this task's exact evidence format
(relkind, row estimates, `pg_depend`, RLS policies, grants, per the
"Required phases" section below) or produced the sanitized comparison
report this task's acceptance criteria calls for. Phases 2-4 (candidate
review, quarantine, retirement) have not started.

**Next step, if resuming this task**: reconcile the 2026-08-11 audit's
findings against this task's specific candidate list (quoted/case
duplicates like `bsl_audit`/`BSL_Audit`) rather than re-running a full
inventory from scratch — much of the read-only groundwork may already
exist, just not in this task's format.

## Goal

Reduce unused Directus metadata, quoted/case-duplicate tables, and other legacy
objects in the BSL development and production databases without breaking
passes, event administration, agenda/networking flows, auth, or audit history.
The work must produce evidence first and use reversible quarantine migrations
before any permanent drop.

## Scope

Audit both `bsl-development` and `bsl-production` through their Supabase pooler
connections. Candidate areas include:

- `directus_*` tables and views;
- quoted/case variants such as `bsl_audit` / `BSL_Audit`,
  `bsl_bookings` / `BSL_Bookings`, and `bsl_tickets` / `BSL_Tickets`;
- empty or stale application tables left by retired migrations;
- duplicate indexes, functions, policies, and migration-ledger entries.

No object is a duplicate based on its name alone.

## Required phases

### 1. Read-only inventory

Run the inventory in `bsl-schema-relational-audit.md` against both pooler
databases and save sanitized results outside the repository. Include exact
columns, relkind, row estimates/counts, indexes, triggers, constraints,
foreign-key dependencies, RLS policies, grants, `pg_depend` references,
function bodies that mention candidates, and recent-write evidence.

Record the live rows in `public.hashpass_schema_migrations`; do not infer them
from the application version or migration filenames.

### 2. Candidate review

For every candidate, classify it as:

- **Preserve** — active application/provider contract;
- **Compatibility** — retained temporarily because code or external tooling
  still references it;
- **Quarantine candidate** — proven unreferenced and safe to rename;
- **Not a duplicate** — similar name, different contract.

Attach the exact evidence and an owner to every classification. The review must
be identical for development and production, with differences called out.

### 3. Reversible quarantine

After written approval of the candidate list, create a migration that renames
only approved objects to a dated quarantine schema/name, preserves ownership
and grants where possible, and records every move in an audit table. Deploy to
development first, run application/API smoke tests, and observe one complete
release window before production.

The quarantine migration must include a rollback migration that restores the
original names and grants. It must not drop data or provider-owned Directus
objects.

### 4. Permanent retirement (separate approval)

Only after the quarantine observation period, backup verification, restore test,
and a second explicit approval may a follow-up migration permanently drop an
object. Drops must be isolated from unrelated feature migrations.

## Acceptance criteria

- [ ] Pooler credentials work for both BSL environments in the networked/CI
      runner; no secrets are committed or printed.
- [ ] Read-only inventory and sanitized comparison report are attached to the
      task.
- [ ] Every suspected duplicate has dependency and application-reference proof.
- [ ] Directus ownership and external CMS usage are confirmed before touching
      `directus_*` objects.
- [ ] Candidate list is explicitly approved before quarantine.
- [ ] Development quarantine, rollback, and smoke tests pass.
- [ ] Production quarantine has a backup/restore check and a scheduled window.
- [ ] Permanent drops, if any, are a later separately approved migration.

## Non-goals

- Do not redesign the core identity, event, pass, or agenda schema in this task.
- Do not merge `public.users` with `auth.users` or rewrite provider identity IDs.
- Do not delete empty tables or Directus metadata solely to reduce dashboard
  clutter.

