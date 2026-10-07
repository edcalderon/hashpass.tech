-- ============================================================================
-- V114: Activate public speaker profiles and queue meeting requests
-- ============================================================================
-- BSL wants every current imported speaker to be discoverable and eligible
-- for networking before the speaker has claimed an account. A request made
-- before claiming is stored against the profile id and relinked to auth.users
-- when the profile is claimed. Rows retired by programme reconciliation or
-- explicitly deactivated by an administrator are intentionally untouched.
-- ============================================================================

BEGIN;

UPDATE public.bsl_speakers
   SET directory_visible = true,
       is_active = true,
       is_accepting_meetings = true,
       updated_at = now()
 WHERE (event_id = 'colombia2026' AND metadata ->> 'source' = 'blockchainsummit-colombia2026')
    OR (event_id = 'bsl2025' AND metadata ->> 'source' = 'packages/config/src/events.ts');

ALTER TABLE public.bsl_speakers
  ALTER COLUMN directory_visible SET DEFAULT true;

-- A request can point at either an auth user (claimed speaker) or an imported
-- speaker profile (unclaimed speaker). Historical rows already use both
-- identity domains, so the old auth-only constraint cannot remain in place.
ALTER TABLE public.meeting_requests
  DROP CONSTRAINT IF EXISTS meeting_requests_speaker_id_fkey;

CREATE OR REPLACE FUNCTION public.can_make_meeting_request(
  p_user_id text,
  p_speaker_id text,
  p_boost_amount numeric DEFAULT 0,
  p_event_id text DEFAULT NULL
)
RETURNS TABLE (
  can_request boolean,
  reason text,
  pass_type text,
  remaining_requests integer,
  remaining_boost numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id text := COALESCE(NULLIF(p_event_id, ''), COALESCE(NULLIF(current_setting('app.event_id', true), ''), 'bsl2025'));
  v_speaker RECORD;
  v_pass RECORD;
  v_existing_request RECORD;
  v_blocked boolean := false;
  v_remaining_requests integer := 0;
  v_remaining_boost numeric := 0;
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.id IS NULL THEN
    RETURN QUERY SELECT false, 'speaker_not_found', NULL::text, 0, 0::numeric;
    RETURN;
  END IF;

  SELECT
    p.id,
    p.pass_type::text AS pass_type,
    p.max_meeting_requests,
    p.used_meeting_requests,
    p.max_boost_amount,
    p.used_boost_amount
  INTO v_pass
  FROM public.passes p
  WHERE p.user_id::text = p_user_id
    AND p.event_id = v_event_id
    AND p.status = 'active'
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_pass.id IS NULL THEN
    RETURN QUERY SELECT false, 'no_valid_pass', NULL::text, 0, 0::numeric;
    RETURN;
  END IF;

  IF NOT COALESCE(v_speaker.is_active, false) THEN
    RETURN QUERY SELECT false, 'speaker_inactive', v_pass.pass_type, 0, 0::numeric;
    RETURN;
  END IF;

  IF NOT COALESCE(v_speaker.is_accepting_meetings, true) THEN
    RETURN QUERY SELECT false, 'not_accepting_meetings', v_pass.pass_type, 0, 0::numeric;
    RETURN;
  END IF;

  v_remaining_requests := GREATEST(
    0,
    COALESCE(v_pass.max_meeting_requests, 0) - COALESCE(v_pass.used_meeting_requests, 0)
  );
  v_remaining_boost := GREATEST(
    0,
    COALESCE(v_pass.max_boost_amount, 0) - COALESCE(v_pass.used_boost_amount, 0)
  );

  SELECT * INTO v_existing_request
  FROM public.meeting_requests mr
  WHERE mr.requester_id::text = p_user_id
    AND mr.event_id = v_event_id
    AND mr.status IN ('pending', 'requested', 'approved', 'accepted')
    AND (
      mr.speaker_id::text = v_speaker.id::text
      OR (v_speaker.user_id IS NOT NULL AND mr.speaker_id::text = v_speaker.user_id::text)
    )
  LIMIT 1;

  IF v_existing_request.id IS NOT NULL THEN
    RETURN QUERY SELECT false, 'existing_request', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_blocks ub
    WHERE (
      ub.blocked_user_id = p_user_id::uuid
      AND (ub.speaker_id::text = v_speaker.id::text OR ub.blocker_user_id = v_speaker.user_id)
    ) OR (
      ub.blocker_user_id = p_user_id::uuid
      AND v_speaker.user_id IS NOT NULL
      AND ub.blocked_user_id = v_speaker.user_id
    )
  ) INTO v_blocked;

  IF v_blocked THEN
    RETURN QUERY SELECT false, 'blocked', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  IF v_remaining_requests <= 0 THEN
    RETURN QUERY SELECT false, 'no_requests_remaining', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  IF COALESCE(p_boost_amount, 0) > v_remaining_boost THEN
    RETURN QUERY SELECT false, 'insufficient_boost', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'allowed', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_meeting_request(
  p_requester_id text,
  p_speaker_id text,
  p_speaker_name text,
  p_requester_name text,
  p_requester_company text,
  p_requester_title text,
  p_requester_ticket_type text,
  p_meeting_type text,
  p_message text,
  p_note text DEFAULT NULL,
  p_boost_amount numeric DEFAULT 0,
  p_duration_minutes integer DEFAULT 15,
  p_expires_at timestamptz DEFAULT NULL,
  p_event_id text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  requester_id uuid,
  speaker_id uuid,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_speaker RECORD;
  v_request_id uuid := gen_random_uuid();
  v_consumed_pass_id text;
  v_event_id text := NULLIF(trim(COALESCE(p_event_id, '')), '');
  v_target_speaker_id uuid;
BEGIN
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'A valid event id is required';
  END IF;

  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.id IS NULL THEN
    RAISE EXCEPTION 'Speaker not found';
  END IF;

  IF NOT COALESCE((
    SELECT can_request
    FROM public.can_make_meeting_request(
      p_requester_id, p_speaker_id, COALESCE(p_boost_amount, 0), v_event_id
    )
    LIMIT 1
  ), false) THEN
    RAISE EXCEPTION 'Meeting request not allowed';
  END IF;

  v_target_speaker_id := COALESCE(v_speaker.user_id, v_speaker.id::uuid);

  INSERT INTO public.meeting_requests (
    id, requester_id, speaker_id, event_id, speaker_name, requester_name,
    requester_company, requester_title, requester_ticket_type, meeting_type,
    message, note, boost_amount, duration_minutes, expires_at, status,
    created_at, updated_at
  ) VALUES (
    v_request_id, p_requester_id::uuid, v_target_speaker_id, v_event_id,
    p_speaker_name, p_requester_name, p_requester_company, p_requester_title,
    p_requester_ticket_type, COALESCE(NULLIF(p_meeting_type, ''), 'networking'),
    COALESCE(p_message, ''), p_note, COALESCE(p_boost_amount, 0),
    COALESCE(p_duration_minutes, 15), COALESCE(p_expires_at, now() + interval '3 days'),
    'pending', now(), now()
  );

  WITH active_pass AS (
    SELECT p.id
    FROM public.passes p
    WHERE p.user_id::text = p_requester_id
      AND p.event_id = v_event_id
      AND p.status = 'active'
    ORDER BY p.created_at DESC
    LIMIT 1
  )
  UPDATE public.passes p
  SET
    used_meeting_requests = COALESCE(p.used_meeting_requests, 0) + 1,
    used_boost_amount = COALESCE(p.used_boost_amount, 0) + GREATEST(COALESCE(p_boost_amount, 0), 0),
    updated_at = now()
  FROM active_pass
  WHERE p.id = active_pass.id
    AND COALESCE(p.used_meeting_requests, 0) < COALESCE(p.max_meeting_requests, 0)
    AND COALESCE(p.used_boost_amount, 0) + GREATEST(COALESCE(p_boost_amount, 0), 0)
      <= COALESCE(p.max_boost_amount, 0)
  RETURNING p.id::text INTO v_consumed_pass_id;

  IF v_consumed_pass_id IS NULL THEN
    RAISE EXCEPTION 'Meeting request entitlement is no longer available';
  END IF;

  PERFORM public.create_notification(
    p_requester_id::uuid, 'meeting_request', 'Request Sent',
    'Your meeting request to ' || p_speaker_name || ' has been sent.',
    v_request_id, v_speaker.id::text, false, NULL
  );

  -- An unclaimed profile has no auth recipient yet. The claim trigger below
  -- relinks this request to the eventual account before notifications begin.
  IF v_speaker.user_id IS NOT NULL THEN
    PERFORM public.send_prioritized_notification(
      v_speaker.user_id::text, p_requester_name, p_requester_company,
      p_requester_ticket_type, COALESCE(p_boost_amount, 0), v_request_id
    );
  END IF;

  RETURN QUERY
  SELECT v_request_id, p_requester_id::uuid, v_target_speaker_id, 'pending', now();
END;
$$;

CREATE OR REPLACE FUNCTION public.link_pending_speaker_requests_on_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.user_id IS NULL AND NEW.user_id IS NOT NULL THEN
    UPDATE public.meeting_requests
       SET speaker_id = NEW.user_id,
           updated_at = now()
     WHERE speaker_id = NEW.id
       AND status IN ('pending', 'requested');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_pending_speaker_requests_on_claim ON public.bsl_speakers;
CREATE TRIGGER trg_link_pending_speaker_requests_on_claim
  AFTER UPDATE OF user_id ON public.bsl_speakers
  FOR EACH ROW
  EXECUTE FUNCTION public.link_pending_speaker_requests_on_claim();

REVOKE ALL ON FUNCTION public.can_make_meeting_request(text, text, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.insert_meeting_request(
  text, text, text, text, text, text, text, text, text, text, numeric, integer, timestamptz, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_make_meeting_request(text, text, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insert_meeting_request(
  text, text, text, text, text, text, text, text, text, text, numeric, integer, timestamptz, text
) TO authenticated, service_role;

COMMIT;
