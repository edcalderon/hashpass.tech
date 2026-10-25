---
title: Speaker directory statuses
---

# Speaker directory statuses

The speaker directory exposes a small, stable status vocabulary. The app uses
the same values as the database `public.speaker_directory_status` enum and the
check-constrained `public.bsl_speakers.directory_status` column added by
`V139__speaker_directory_status.sql`.

| Status | Meaning | Meeting requests |
| --- | --- | --- |
| `private` | The profile is not published in the directory. | Not available. |
| `passive` | The profile is published, but no speaker account has claimed it yet. | Accepted and queued against the profile; they can be relinked when the speaker claims it. |
| `inactive` | A claimed profile is not currently active. | Not available. |
| `active` | A claimed, active profile that accepts meeting requests. | Delivered normally. |
| `dnd` | A claimed, active profile with do-not-disturb enabled. | Accepted but archived for the speaker. |

`past` is a presentation-only badge for historical speakers. It is not stored
in `public.bsl_speakers` and is intentionally absent from the database enum.

## How the status is derived

`public.bsl_speakers.directory_status` is a stored generated text column. Its inputs
remain the editable fields used by admin and ingestion workflows:

- `directory_visible = false` → `private`;
- `directory_visible = true` and `user_id IS NULL` → `passive`;
- a claimed, active speaker with `do_not_disturb = true` → `dnd`;
- a claimed, active speaker otherwise → `active`;
- every other published claimed profile → `inactive`.

The mobile fallback derives the same result for legacy API payloads that do not
yet include `directory_status`. The internal status key is `passive`; “Passive”
and “Pasivo” are localized labels, not separate database values.

## Schema and rollout

Apply the migration through the normal tenant migration runner. It is included
in the `speaker-directory-status` default group and is safe to run against the
shared development database before production:

```bash
npm run db:migrate -- --profile=core-development --groups=speaker-directory-status
npm run db:migrate -- --profile=core-production --groups=speaker-directory-status
```

The migration also backfills the missing `do_not_disturb` column with `false`
where older database shapes do not have it, and adds an index for event/status
directory queries.
