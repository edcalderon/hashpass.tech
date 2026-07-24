-- ============================================================================
-- V012: Event-scoped administration foundation
-- ============================================================================

BEGIN;

DO $$ BEGIN
  CREATE TYPE public.event_role AS ENUM ('event_admin', 'moderator');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.events (
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text NOT NULL DEFAULT 'UTC',
  venue_name text,
  venue_address text,
  city text,
  country text,
  description text,
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_date_order CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

CREATE TABLE IF NOT EXISTS public.event_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.event_role NOT NULL,
  granted_by uuid NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT event_roles_unique_assignment UNIQUE (event_id, user_id, role),
  CONSTRAINT event_roles_future_expiry CHECK (expires_at IS NULL OR expires_at > granted_at)
);
CREATE INDEX IF NOT EXISTS idx_event_roles_user_event ON public.event_roles(user_id, event_id);

CREATE TABLE IF NOT EXISTS public.speakers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid,
  name text NOT NULL,
  title text,
  company text,
  bio text,
  image_url text,
  social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT speakers_event_user_unique UNIQUE NULLS NOT DISTINCT (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_speakers_event_sort ON public.speakers(event_id, sort_order, name);

CREATE TABLE IF NOT EXISTS public.event_agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  venue text,
  track text,
  item_type text NOT NULL DEFAULT 'session',
  speaker_ids uuid[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agenda_date_order CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_agenda_event_start ON public.event_agenda_items(event_id, starts_at, sort_order);

CREATE TABLE IF NOT EXISTS public.admin_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  event_id text REFERENCES public.events(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_action_event_created ON public.admin_action_log(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_action_actor_created ON public.admin_action_log(actor_user_id, created_at DESC);

INSERT INTO public.events (id, slug, name, status)
VALUES
  ('bsl', 'bsl', 'Blockchain Summit Latam On Tour', 'published'),
  ('bsl2025', 'bsl2025', 'Blockchain Summit Latam 2025', 'archived'),
  ('peru2026', 'peru2026', 'Blockchain Summit Latam Peru 2026', 'published'),
  ('chile2026', 'chile2026', 'Blockchain Summit Latam Chile 2026', 'published'),
  ('colombia2026', 'colombia2026', 'Blockchain Summit Latam Colombia 2026', 'published')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_event_admin_access(
  p_user_id uuid,
  p_event_id text,
  p_include_moderator boolean DEFAULT false
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_user_id AND ur.role IN ('admin'::public.user_role, 'super_admin'::public.user_role)
  ) OR EXISTS (
    SELECT 1 FROM public.event_roles er
    WHERE er.user_id = p_user_id
      AND er.event_id = p_event_id
      AND (er.expires_at IS NULL OR er.expires_at > now())
      AND (er.role = 'event_admin'::public.event_role OR (p_include_moderator AND er.role = 'moderator'::public.event_role))
  );
$$;
REVOKE ALL ON FUNCTION public.has_event_admin_access(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_event_admin_access(uuid, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_mutate_event_pass(
  p_actor_user_id uuid,
  p_event_id text,
  p_action text,
  p_user_id uuid DEFAULT NULL,
  p_pass_id text DEFAULT NULL,
  p_pass_type text DEFAULT NULL,
  p_status text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pass_id text;
  v_current_event text;
  v_max_requests integer;
  v_max_boost integer;
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Event administrator access required' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'create' THEN
    IF p_user_id IS NULL OR p_pass_type NOT IN ('general', 'business', 'vip') THEN
      RAISE EXCEPTION 'A user and valid pass type are required' USING ERRCODE = '22023';
    END IF;
    SELECT max_requests, max_boost INTO v_max_requests, v_max_boost
      FROM public.get_pass_type_limits(p_pass_type) LIMIT 1;
    INSERT INTO public.passes (
      id, user_id, event_id, pass_type, status, pass_number,
      max_meeting_requests, used_meeting_requests, max_boost_amount, used_boost_amount,
      access_features, special_perks
    ) VALUES (
      gen_random_uuid()::text, p_user_id::text, p_event_id, p_pass_type::public.pass_type,
      'active', 'ADMIN-' || upper(p_pass_type) || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
      COALESCE(v_max_requests, 10), 0, COALESCE(v_max_boost, 100), 0,
      CASE WHEN p_pass_type = 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
           WHEN p_pass_type = 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
           ELSE ARRAY['general_sessions'] END,
      CASE WHEN p_pass_type = 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
           WHEN p_pass_type = 'business' THEN ARRAY['business_lounge', 'networking_tools']
           ELSE ARRAY['basic_swag'] END
    ) RETURNING id::text INTO v_pass_id;
  ELSIF p_action = 'update' THEN
    IF p_pass_id IS NULL OR (p_pass_type IS NULL AND p_status IS NULL) THEN
      RAISE EXCEPTION 'A pass and at least one change are required' USING ERRCODE = '22023';
    END IF;
    IF p_pass_type IS NOT NULL AND p_pass_type NOT IN ('general', 'business', 'vip') THEN
      RAISE EXCEPTION 'Invalid pass type' USING ERRCODE = '22023';
    END IF;
    IF p_status IS NOT NULL AND p_status NOT IN ('active', 'used', 'expired', 'cancelled', 'suspended') THEN
      RAISE EXCEPTION 'Invalid pass status' USING ERRCODE = '22023';
    END IF;
    SELECT event_id INTO v_current_event FROM public.passes WHERE id::text = p_pass_id FOR UPDATE;
    IF v_current_event IS DISTINCT FROM p_event_id THEN
      RAISE EXCEPTION 'Pass does not belong to the requested event' USING ERRCODE = '42501';
    END IF;

    -- An upgrade/downgrade must recompute tier limits and perks, not just relabel
    -- pass_type — otherwise a general pass "upgraded" to vip keeps its old
    -- 5-request/100-boost caps and general_sessions/basic_swag perks.
    IF p_pass_type IS NOT NULL THEN
      SELECT max_requests, max_boost INTO v_max_requests, v_max_boost
        FROM public.get_pass_type_limits(p_pass_type) LIMIT 1;
    END IF;

    UPDATE public.passes SET
      pass_type = COALESCE(p_pass_type::public.pass_type, pass_type),
      status = COALESCE(p_status, status),
      max_meeting_requests = CASE WHEN p_pass_type IS NOT NULL THEN COALESCE(v_max_requests, 10) ELSE max_meeting_requests END,
      max_boost_amount = CASE WHEN p_pass_type IS NOT NULL THEN COALESCE(v_max_boost, 100) ELSE max_boost_amount END,
      access_features = CASE WHEN p_pass_type IS NULL THEN access_features
        WHEN p_pass_type = 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
        WHEN p_pass_type = 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
        ELSE ARRAY['general_sessions'] END,
      special_perks = CASE WHEN p_pass_type IS NULL THEN special_perks
        WHEN p_pass_type = 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
        WHEN p_pass_type = 'business' THEN ARRAY['business_lounge', 'networking_tools']
        ELSE ARRAY['basic_swag'] END,
      updated_at = now()
    WHERE id::text = p_pass_id
    RETURNING id::text INTO v_pass_id;
  ELSE
    RAISE EXCEPTION 'Unsupported pass action' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (p_actor_user_id, p_event_id, 'pass.' || p_action, 'pass', v_pass_id,
    jsonb_strip_nulls(jsonb_build_object('user_id', p_user_id, 'pass_type', p_pass_type, 'status', p_status)));
  RETURN jsonb_build_object('id', v_pass_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_mutate_event_pass(uuid, text, text, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mutate_event_pass(uuid, text, text, uuid, text, text, text)
  TO service_role;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_public_read ON public.events;
CREATE POLICY events_public_read ON public.events FOR SELECT USING (status IN ('published', 'archived'));
DROP POLICY IF EXISTS speakers_public_read ON public.speakers;
CREATE POLICY speakers_public_read ON public.speakers FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.status IN ('published', 'archived'))
);
DROP POLICY IF EXISTS agenda_public_read ON public.event_agenda_items;
CREATE POLICY agenda_public_read ON public.event_agenda_items FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.status IN ('published', 'archived'))
);
DROP POLICY IF EXISTS event_roles_self_read ON public.event_roles;
CREATE POLICY event_roles_self_read ON public.event_roles FOR SELECT USING (user_id = auth.uid());

-- Introduce referential integrity without blocking migration on unknown legacy IDs.
DO $$ BEGIN
  ALTER TABLE public.passes
    ADD CONSTRAINT passes_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
