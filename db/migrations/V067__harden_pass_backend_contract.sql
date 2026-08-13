-- V067: make the pass schema and event-aware creation RPC deployable on every tenant
--
-- Older local/tenant databases can still have the original passes table without
-- pass_type. The backend pass endpoint relies on this column and on an explicit
-- event argument; keeping this migration idempotent prevents the wallet from
-- silently falling back to direct client Supabase calls.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typnamespace = 'public'::regnamespace AND typname = 'pass_type'
  ) THEN
    CREATE TYPE public.pass_type AS ENUM ('general', 'business', 'vip');
  END IF;
END;
$$;

ALTER TABLE public.passes ADD COLUMN IF NOT EXISTS pass_type public.pass_type NOT NULL DEFAULT 'general';
ALTER TABLE public.passes ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.passes ADD COLUMN IF NOT EXISTS pass_number text;
ALTER TABLE public.passes ADD COLUMN IF NOT EXISTS max_meeting_requests integer NOT NULL DEFAULT 10;
ALTER TABLE public.passes ADD COLUMN IF NOT EXISTS used_meeting_requests integer NOT NULL DEFAULT 0;
ALTER TABLE public.passes ADD COLUMN IF NOT EXISTS max_boost_amount numeric NOT NULL DEFAULT 100;
ALTER TABLE public.passes ADD COLUMN IF NOT EXISTS used_boost_amount numeric NOT NULL DEFAULT 0;
ALTER TABLE public.passes ADD COLUMN IF NOT EXISTS access_features text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.passes ADD COLUMN IF NOT EXISTS special_perks text[] NOT NULL DEFAULT '{}';

UPDATE public.passes
SET pass_type = 'general'::public.pass_type
WHERE pass_type IS NULL;

DROP FUNCTION IF EXISTS public.create_default_pass(text, text, text);
CREATE OR REPLACE FUNCTION public.create_default_pass(
  p_user_id text,
  p_pass_type text DEFAULT 'general',
  p_event_id text DEFAULT 'colombia2026'
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id text := NULLIF(trim(p_event_id), '');
  v_pass_type text := lower(NULLIF(trim(p_pass_type), ''));
  v_existing_id text;
  v_pass_id uuid;
  v_return_id text;
  v_pass_number text := 'BSL-' || upper(v_pass_type) || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_pass_number_type text;
  v_max_requests integer := 10;
  v_max_boost numeric := 100;
BEGIN
  IF NULLIF(trim(p_user_id), '') IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_event_id IS NULL OR v_event_id NOT IN ('bsl2025', 'peru2026', 'chile2026', 'colombia2026') THEN
    RAISE EXCEPTION 'Unsupported BSL event: %', p_event_id USING ERRCODE = '22023';
  END IF;
  IF v_pass_type IS NULL OR v_pass_type NOT IN ('general', 'business', 'vip') THEN
    RAISE EXCEPTION 'Unsupported pass type: %', p_pass_type USING ERRCODE = '22023';
  END IF;

  IF v_pass_type = 'business' THEN
    v_max_requests := 20;
    v_max_boost := 300;
  ELSIF v_pass_type = 'vip' THEN
    v_max_requests := 50;
    v_max_boost := 500;
  END IF;

  SELECT id INTO v_existing_id
  FROM public.passes
  WHERE user_id::text = p_user_id
    AND event_id = v_event_id
    AND pass_type::text = v_pass_type
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;

  v_pass_id := gen_random_uuid();
  SELECT data_type
  INTO v_pass_number_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'passes'
    AND column_name = 'pass_number';

  INSERT INTO public.passes (
    id, user_id, event_id, pass_type, status,
    max_meeting_requests, used_meeting_requests, max_boost_amount,
    used_boost_amount, access_features, special_perks
  ) VALUES (
    v_pass_id, p_user_id, v_event_id, v_pass_type::public.pass_type, 'active',
    v_max_requests, 0, v_max_boost, 0,
    CASE v_pass_type
      WHEN 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
      WHEN 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
      ELSE ARRAY['general_sessions']
    END,
    CASE v_pass_type
      WHEN 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
      WHEN 'business' THEN ARRAY['business_lounge', 'networking_tools']
      ELSE ARRAY['basic_swag']
    END
  )
  RETURNING id::text INTO v_return_id;

  IF v_pass_number_type IN ('text', 'character varying') THEN
    EXECUTE 'UPDATE public.passes SET pass_number = $1 WHERE id::text = $2'
      USING v_pass_number, v_return_id;
  END IF;

  RETURN v_return_id;
END;
$$;

-- Pass creation is intentionally backend-only. The API route resolves the
-- caller's linked Supabase identity before invoking this service-role RPC.
REVOKE ALL ON FUNCTION public.create_default_pass(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_default_pass(text, text, text) TO service_role;

COMMIT;
