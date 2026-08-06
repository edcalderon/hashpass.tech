-- Baseline: passes.pass_number was created as `serial` (integer) by V001,
-- but was converted to text out of band at some point before this file was
-- written -- this file's own comment above already assumes the text/empty-
-- string shape. Flagged by code review 2026-08-06, same class of gap as
-- V009/V017/V022/V024/V038. Sourced from a live BSL prod schema dump
-- (pg_dump --schema-only, 2026-08-06).
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'passes' AND column_name = 'pass_number') <> 'text' THEN
    ALTER TABLE public.passes ALTER COLUMN pass_number DROP DEFAULT;
    ALTER TABLE public.passes ALTER COLUMN pass_number TYPE text USING COALESCE(pass_number::text, '');
    ALTER TABLE public.passes ALTER COLUMN pass_number SET DEFAULT '';
    ALTER TABLE public.passes ALTER COLUMN pass_number SET NOT NULL;
  END IF;
END $$;

-- Older bootstrap-created passes defaulted pass_number to an empty string.
-- Repair those records so the pass UI can always present the holder with a
-- meaningful, stable ticket identifier.

BEGIN;

UPDATE public.passes
SET pass_number = 'BSL-' || upper(COALESCE(pass_type::text, 'general')) || '-'
  || substring(replace(id::text, '-', ''), 1, 8),
    updated_at = now()
WHERE NULLIF(btrim(COALESCE(pass_number, '')), '') IS NULL;

COMMIT;
