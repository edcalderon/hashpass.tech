-- ============================================================================
-- V007: Fix create_default_pass overload ambiguity + create user_tutorial_progress
-- ============================================================================
-- Neither of these objects was ever captured in the versioned migration
-- series (V001-V006) — both were applied ad hoc directly against the live
-- database at some point, which is how they drifted out of sync with app
-- code:
--
-- 1. create_default_pass ended up with THREE overloaded signatures live
--    (p_user_id text/p_pass_type text, p_user_id uuid/p_pass_type
--    public.pass_type, p_user_id uuid/p_pass_type text). The app calls it
--    via supabase.rpc('create_default_pass', { p_user_id, p_pass_type })
--    with untyped JSON args (apps/mobile-app/lib/pass-system.ts), so
--    Postgres can't pick a candidate and every call fails with "Could not
--    choose the best candidate function". Fix: drop the two extra
--    overloads, keep exactly one canonical signature.
--
-- 2. user_tutorial_progress is queried/written by
--    apps/mobile-app/hooks/useTutorialPreferences.ts (columns: id, user_id,
--    tutorial_type, status, current_step, total_steps_completed,
--    started_at, completed_at, skipped_at, last_step_at; unique on
--    (user_id, tutorial_type) — used as the upsert onConflict target) but
--    the table itself was never created in this migration series, so every
--    read/write 500s with "relation does not exist".
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. create_default_pass: collapse to a single canonical overload
-- ============================================================================

-- pass_type enum may already exist from earlier ad hoc setup — only create
-- it if it's genuinely missing, and don't touch it if it's already there
-- (unknown extra values in prod are safer to leave alone than to guess at).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pass_type') THEN
    CREATE TYPE public.pass_type AS ENUM ('general', 'business', 'vip');
  END IF;
END;
$$;

-- Drop only the two ambiguous overloads. IF EXISTS makes this safe to
-- re-run and safe on environments where they were never created.
DROP FUNCTION IF EXISTS public.create_default_pass(p_user_id text, p_pass_type text);
DROP FUNCTION IF EXISTS public.create_default_pass(p_user_id uuid, p_pass_type text);

-- Canonical signature, restored verbatim from
-- db/backup/sql/20251025_161451/fix-functions.sql (the most recent
-- known-good definition on file) — NOT reinvented, since public.passes'
-- real column set (pass_type, pass_number, max_meeting_requests, ...) has
-- drifted well past what V001__init_core_schema.sql originally described.
CREATE OR REPLACE FUNCTION public.create_default_pass(
    p_user_id uuid,
    p_pass_type pass_type DEFAULT 'general'
) RETURNS text AS $$
DECLARE
    new_pass_id text;
    limits RECORD;
    pass_num text;
BEGIN
    -- Get limits for pass type
    SELECT * INTO limits FROM get_pass_type_limits(p_pass_type);

    -- Generate a unique pass ID
    new_pass_id := 'BSL2025-' || p_user_id::text || '-' || EXTRACT(EPOCH FROM NOW())::bigint;

    -- Generate a simple pass number
    pass_num := 'BSL2025-' || p_pass_type::text || '-' || EXTRACT(EPOCH FROM NOW())::bigint;

    -- Create pass
    INSERT INTO public.passes (
        id,
        user_id,
        event_id,
        pass_type,
        status,
        pass_number,
        max_meeting_requests,
        used_meeting_requests,
        max_boost_amount,
        used_boost_amount,
        access_features,
        special_perks
    ) VALUES (
        new_pass_id,
        p_user_id::text,
        'bsl2025',
        p_pass_type,
        'active',
        pass_num,
        limits.max_requests,
        0,
        limits.max_boost,
        0,
        CASE p_pass_type
            WHEN 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
            WHEN 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
            ELSE ARRAY['general_sessions']
        END,
        CASE p_pass_type
            WHEN 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
            WHEN 'business' THEN ARRAY['business_lounge', 'networking_tools']
            ELSE ARRAY['basic_swag']
        END
    ) RETURNING id INTO new_pass_id;

    -- Initialize pass_request_limits for the new pass
    INSERT INTO public.pass_request_limits (pass_id, user_id)
    VALUES (new_pass_id, p_user_id);

    RETURN new_pass_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. user_tutorial_progress
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_tutorial_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tutorial_type text NOT NULL CHECK (tutorial_type IN ('main', 'networking')),
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed', 'skipped')),
  current_step integer NOT NULL DEFAULT 0,
  total_steps_completed integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  last_step_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tutorial_type)
);

CREATE INDEX IF NOT EXISTS idx_user_tutorial_progress_user_id
  ON public.user_tutorial_progress(user_id);

DROP TRIGGER IF EXISTS trg_user_tutorial_progress_updated_at ON public.user_tutorial_progress;
CREATE TRIGGER trg_user_tutorial_progress_updated_at
  BEFORE UPDATE ON public.user_tutorial_progress
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE public.user_tutorial_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_tutorial_progress_own_rows ON public.user_tutorial_progress;
CREATE POLICY user_tutorial_progress_own_rows ON public.user_tutorial_progress
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;

-- ============================================================================
-- Verify
-- ============================================================================
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'create_default_pass') = 1,
    'create_default_pass should have exactly one overload after V007';
  ASSERT (SELECT count(*) FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'user_tutorial_progress') = 1,
    'public.user_tutorial_progress table missing';
  RAISE NOTICE 'V007 verification passed';
END;
$$;
