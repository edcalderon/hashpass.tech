-- V139: Canonical speaker directory status
--
-- The mobile directory exposes one derived status for every speaker profile.
-- Keep the persisted database contract in sync with that state machine while
-- retaining the existing booleans as the source inputs for admin workflows.
-- `past` remains a presentation-only badge for historical speakers and is not
-- a live database state.

BEGIN;

DO $$
BEGIN
  CREATE TYPE public.speaker_directory_status AS ENUM (
    'private',
    'passive',
    'inactive',
    'active',
    'dnd'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

ALTER TABLE public.bsl_speakers
  ADD COLUMN IF NOT EXISTS do_not_disturb boolean NOT NULL DEFAULT false;

ALTER TABLE public.bsl_speakers
  ADD COLUMN IF NOT EXISTS directory_visible boolean NOT NULL DEFAULT true;

ALTER TABLE public.bsl_speakers
  ADD COLUMN IF NOT EXISTS directory_status text
  GENERATED ALWAYS AS (
    CASE
      WHEN COALESCE(directory_visible, false) = false THEN 'private'
      WHEN user_id IS NULL THEN 'passive'
      WHEN COALESCE(is_active, false) AND COALESCE(do_not_disturb, false) THEN 'dnd'
      WHEN COALESCE(is_active, false) THEN 'active'
      ELSE 'inactive'
    END
  ) STORED;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = 'public.bsl_speakers'::regclass
       AND conname = 'bsl_speakers_directory_status_check'
  ) THEN
    ALTER TABLE public.bsl_speakers
      ADD CONSTRAINT bsl_speakers_directory_status_check
      CHECK (directory_status IN ('private', 'passive', 'inactive', 'active', 'dnd'));
  END IF;
END;
$$;

COMMENT ON COLUMN public.bsl_speakers.directory_status IS
  'Derived directory state: private, passive (published but unclaimed), inactive, active, or dnd.';

CREATE INDEX IF NOT EXISTS idx_bsl_speakers_event_directory_status
  ON public.bsl_speakers (event_id, directory_status, name);

COMMIT;
