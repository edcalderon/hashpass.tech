--
-- PostgreSQL database dump
--

\restrict gOe8WDGuR9lmWbfSCJacAj0vlcOSXRbsMoIvjAhuia3EzRRtVfSDTW5YiukHfeh

-- Dumped from database version 17.4
-- Dumped by pg_dump version 17.10

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: booking_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.booking_status AS ENUM (
    'requested',
    'accepted',
    'rejected',
    'cancelled'
);


--
-- Name: event_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_role AS ENUM (
    'event_admin',
    'moderator'
);


--
-- Name: pass_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pass_status AS ENUM (
    'active',
    'used',
    'expired',
    'cancelled',
    'suspended'
);


--
-- Name: pass_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pass_type AS ENUM (
    'general',
    'business',
    'vip'
);


--
-- Name: qr_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.qr_status AS ENUM (
    'active',
    'used',
    'expired',
    'revoked',
    'suspended'
);


--
-- Name: qr_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.qr_type AS ENUM (
    'pass',
    'wallet_transfer',
    'access_code',
    'ticket'
);


--
-- Name: reward_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reward_source AS ENUM (
    'meeting_accepted',
    'event_attendance',
    'referral',
    'admin_grant',
    'other'
);


--
-- Name: reward_transaction_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.reward_transaction_type AS ENUM (
    'reward',
    'transfer',
    'swap',
    'redemption'
);


--
-- Name: subpass_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.subpass_type AS ENUM (
    'litter_smart',
    'networking',
    'workshop',
    'exclusive'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'user',
    'speaker',
    'organizer',
    'admin',
    'super_admin'
);


--
-- Name: wallet_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.wallet_type AS ENUM (
    'ethereum',
    'solana'
);


--
-- Name: accept_meeting_request(text, text, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.accept_meeting_request(p_request_id text, p_speaker_id text, p_slot_start_time timestamp with time zone, p_speaker_response text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_request RECORD;
  v_speaker RECORD;
  v_meeting_id uuid := gen_random_uuid();
  v_end_time timestamptz;
  v_duration integer;
  v_slot_id uuid;
  v_requester_conflict boolean := false;
  v_meeting_status text := 'confirmed';
  v_speaker_registry_id uuid;
  v_requester_registry_id uuid;
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'speaker_not_found');
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> v_speaker.user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'speaker_not_authorized');
  END IF;

  SELECT * INTO v_request
  FROM public.meeting_requests mr
  WHERE mr.id = p_request_id::uuid
    AND mr.speaker_id = v_speaker.user_id
    AND mr.status IN ('pending', 'requested')
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
  END IF;

  IF v_request.expires_at IS NOT NULL AND v_request.expires_at < now() THEN
    UPDATE public.meeting_requests
    SET status = 'expired', updated_at = now()
    WHERE id = p_request_id::uuid;
    RETURN jsonb_build_object('success', false, 'error', 'request_expired');
  END IF;

  v_duration := COALESCE(v_request.duration_minutes, 15);
  v_end_time := p_slot_start_time + (v_duration || ' minutes')::interval;

  IF p_slot_start_time IS NULL OR p_slot_start_time < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_slot_time');
  END IF;

  -- user_agenda_status.user_id is a FK into public.user (the registry row),
  -- an independently-generated id -- not the Supabase auth uuid every other
  -- column in this function uses. Resolve both parties' registry ids once,
  -- up front, for every read/write against that table below. A missing
  -- registry row (no bridged Supabase account yet) is not fatal: agenda
  -- rows are a supplementary sync for the schedule screen, not the actual
  -- booking record (meetings/meeting_slots, keyed by auth uuid, already
  -- carry the real conflict-prevention guarantee).
  SELECT id INTO v_speaker_registry_id
  FROM public."user" WHERE auth_user_id = v_speaker.user_id::text LIMIT 1;
  SELECT id INTO v_requester_registry_id
  FROM public."user" WHERE auth_user_id = v_request.requester_id::text LIMIT 1;

  -- Take locks in a stable order so two stale slot pickers cannot both book.
  IF v_speaker.user_id::text < v_request.requester_id::text THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_speaker.user_id::text));
    PERFORM pg_advisory_xact_lock(hashtext(v_request.requester_id::text));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext(v_request.requester_id::text));
    PERFORM pg_advisory_xact_lock(hashtext(v_speaker.user_id::text));
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.meeting_slots ms
    WHERE ms.user_id = v_speaker.user_id
      AND ms.status = 'booked'
      AND ms.start_time < v_end_time
      AND ms.end_time > p_slot_start_time
  ) OR EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE (m.speaker_id::text = v_speaker.id OR m.host_id = v_speaker.user_id)
      AND m.status IN ('scheduled', 'confirmed', 'tentative', 'in_progress')
      AND m.start_time < v_end_time
      AND m.end_time > p_slot_start_time
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'speaker_slot_conflict');
  END IF;

  -- Speaker-side agenda collision stays a hard fail: the speaker is live in
  -- this flow and should just pick a different slot.
  IF v_speaker_registry_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_agenda_status uas
    WHERE uas.event_id = v_request.event_id
      AND uas.user_id = v_speaker_registry_id
      AND uas.slot_time = p_slot_start_time
      AND NOT (
        uas.agenda_id IS NULL
        AND uas.meeting_id IS NULL
        AND COALESCE(uas.slot_status, '') IN ('available', 'interested')
      )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'agenda_slot_conflict');
  END IF;

  -- Was a hard fail for both checks below; now soft. The requester's real
  -- existing booking (meetings table or their own agenda) is left
  -- untouched, but acceptance still proceeds and produces a 'tentative'
  -- meeting the requester must explicitly resolve.
  v_requester_conflict := EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.requester_id = v_request.requester_id
      AND m.status IN ('scheduled', 'confirmed', 'tentative', 'in_progress')
      AND m.start_time < v_end_time
      AND m.end_time > p_slot_start_time
  ) OR (v_requester_registry_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_agenda_status uas
    WHERE uas.event_id = v_request.event_id
      AND uas.user_id = v_requester_registry_id
      AND uas.slot_time = p_slot_start_time
      AND NOT (
        uas.agenda_id IS NULL
        AND uas.meeting_id IS NULL
        AND COALESCE(uas.slot_status, '') IN ('available', 'interested')
      )
  ));
  IF v_requester_conflict THEN
    v_meeting_status := 'tentative';
  END IF;

  INSERT INTO public.meeting_slots (user_id, start_time, end_time, status, meeting_id)
  VALUES (v_speaker.user_id, p_slot_start_time, v_end_time, 'booked', v_meeting_id)
  ON CONFLICT (user_id, start_time) DO UPDATE SET
    end_time = EXCLUDED.end_time,
    status = 'booked',
    meeting_id = v_meeting_id,
    updated_at = now()
  WHERE public.meeting_slots.status = 'available'
    AND public.meeting_slots.meeting_id IS NULL
  RETURNING id INTO v_slot_id;

  IF v_slot_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'speaker_slot_unavailable');
  END IF;

  -- meetings.speaker_id is uuid on prod but text on dev (same schema
  -- divergence V048 already found on the read side) -- v_speaker.id is
  -- always a text value (get_speaker_by_id_or_slug casts s.id::text), which
  -- a static VALUES clause parses against ONE fixed column type at CREATE
  -- FUNCTION time and fails on whichever environment's column doesn't match.
  -- EXECUTE + %L lets each environment's real column type parse the literal
  -- itself at runtime, exactly like a hand-typed INSERT would.
  EXECUTE format(
    'INSERT INTO public.meetings (
      id, meeting_request_id, event_id, slot_id, speaker_id, requester_id,
      host_id, attendee_id, speaker_name, requester_name, meeting_type, status,
      scheduled_at, start_time, end_time, duration_minutes, location, meeting_link,
      notes, title, description, created_at, updated_at
    ) VALUES (%L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L, %L)',
    v_meeting_id, v_request.id, v_request.event_id, v_slot_id, v_speaker.id,
    v_request.requester_id, v_speaker.user_id, v_request.requester_id,
    COALESCE(v_request.speaker_name, v_speaker.name), v_request.requester_name,
    COALESCE(v_request.meeting_type, 'networking'), v_meeting_status,
    p_slot_start_time, p_slot_start_time, v_end_time, v_duration,
    v_request.meeting_location, v_request.meeting_link,
    COALESCE(p_speaker_response, 'Meeting scheduled'), v_request.speaker_name,
    v_request.message, now(), now()
  );

  UPDATE public.meeting_requests
  SET status = 'accepted', meeting_id = v_meeting_id,
      meeting_scheduled_at = p_slot_start_time, scheduled_at = p_slot_start_time,
      speaker_response = COALESCE(p_speaker_response, 'Meeting request accepted'),
      speaker_response_at = now(), updated_at = now()
  WHERE id = v_request.id;

  -- Agenda rows are written the same way regardless of v_meeting_status: a
  -- tentative meeting must still occupy the slot and block further double
  -- booking while unresolved (the overlap checks above already treat
  -- 'tentative' the same as 'confirmed' for that purpose). slot_status is
  -- intentionally left alone here -- its CHECK constraint doesn't include
  -- 'confirmed', and meeting_id being set is what the agenda-conflict
  -- check above actually relies on, not slot_status.
  IF v_speaker_registry_id IS NOT NULL THEN
    UPDATE public.user_agenda_status
    SET status = 'confirmed', confirmed_at = now(),
        meeting_id = v_meeting_id, updated_at = now()
    WHERE user_id = v_speaker_registry_id
      AND event_id = v_request.event_id
      AND slot_time = p_slot_start_time;
    IF NOT FOUND THEN
      INSERT INTO public.user_agenda_status (
        user_id, agenda_id, event_id, status, confirmed_at, slot_time,
        meeting_id, created_at, updated_at
      ) VALUES (
        v_speaker_registry_id, v_request.id::text, v_request.event_id, 'confirmed', now(),
        p_slot_start_time, v_meeting_id, now(), now()
      );
    END IF;
  END IF;

  IF v_requester_registry_id IS NOT NULL THEN
    UPDATE public.user_agenda_status
    SET status = 'confirmed', confirmed_at = now(),
        meeting_id = v_meeting_id, updated_at = now()
    WHERE user_id = v_requester_registry_id
      AND event_id = v_request.event_id
      AND slot_time = p_slot_start_time;
    IF NOT FOUND THEN
      INSERT INTO public.user_agenda_status (
        user_id, agenda_id, event_id, status, confirmed_at, slot_time,
        meeting_id, created_at, updated_at
      ) VALUES (
        v_requester_registry_id, v_request.id::text, v_request.event_id, 'confirmed', now(),
        p_slot_start_time, v_meeting_id, now(), now()
      );
    END IF;
  END IF;

  IF v_meeting_status = 'tentative' THEN
    PERFORM public.create_notification(
      v_request.requester_id, 'meeting_slot_conflict', 'Scheduling Conflict - Action Needed',
      COALESCE(v_request.speaker_name, v_speaker.name) || ' accepted your meeting request, but it overlaps with another meeting on your calendar. Open it to choose which one to keep.',
      v_request.id, v_speaker.id::text, true, v_meeting_id
    );
  ELSE
    PERFORM public.create_notification(
      v_request.requester_id, 'meeting_accepted', 'Meeting Request Accepted',
      COALESCE(v_request.speaker_name, v_speaker.name) || ' accepted your meeting request.',
      v_request.id, v_speaker.id::text, false, v_meeting_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'meeting_id', v_meeting_id, 'slot_id', v_slot_id,
    'start_time', p_slot_start_time, 'end_time', v_end_time, 'status', v_meeting_status,
    'requires_resolution', v_requester_conflict
  );
END;
$$;


--
-- Name: add_reward(uuid, numeric, text, public.reward_source, uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_reward(p_user_id uuid, p_amount numeric, p_token_symbol text DEFAULT 'LUKAS'::text, p_source public.reward_source DEFAULT 'other'::public.reward_source, p_reference_id uuid DEFAULT NULL::uuid, p_reference_type text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_balance_before NUMERIC(20, 8);
    v_balance_after NUMERIC(20, 8);
    v_transaction_id UUID;
BEGIN
    IF p_amount <= 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Amount must be greater than 0'
        );
    END IF;

    v_balance_before := get_or_create_user_balance(p_user_id, p_token_symbol);
    v_balance_after := v_balance_before + p_amount;

    INSERT INTO public.user_balances (user_id, token_symbol, balance, updated_at)
    VALUES (p_user_id, p_token_symbol, v_balance_after, NOW())
    ON CONFLICT (user_id, token_symbol)
    DO UPDATE SET
        balance = v_balance_after,
        updated_at = NOW();

    INSERT INTO public.reward_transactions (
        user_id, token_symbol, transaction_type, amount,
        balance_before, balance_after, source,
        reference_id, reference_type, description, metadata
    ) VALUES (
        p_user_id, p_token_symbol, 'reward', p_amount,
        v_balance_before, v_balance_after, p_source,
        p_reference_id, p_reference_type,
        COALESCE(p_description, 'Reward: ' || p_amount || ' ' || p_token_symbol),
        p_metadata
    ) RETURNING id INTO v_transaction_id;

    RETURN json_build_object(
        'success', true,
        'transaction_id', v_transaction_id,
        'balance_before', v_balance_before,
        'balance_after', v_balance_after,
        'amount', p_amount
    );
END;
$$;


--
-- Name: FUNCTION add_reward(p_user_id uuid, p_amount numeric, p_token_symbol text, p_source public.reward_source, p_reference_id uuid, p_reference_type text, p_description text, p_metadata jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.add_reward(p_user_id uuid, p_amount numeric, p_token_symbol text, p_source public.reward_source, p_reference_id uuid, p_reference_type text, p_description text, p_metadata jsonb) IS 'Adds reward to user balance and creates transaction record';


--
-- Name: admin_list_event_attendees(uuid, text, text, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_event_attendees(p_actor_user_id uuid, p_event_id text, p_query text DEFAULT ''::text, p_cursor uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 200) RETURNS TABLE(id uuid, email text, name text, username text, ticket_type text, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE v_query text := lower(trim(COALESCE(p_query, '')));
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT u.id, u.email::text,
    COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name')::text,
    (u.raw_user_meta_data->>'username')::text,
    ep.pass_type, u.created_at
  FROM (
    SELECT DISTINCT ON (p.user_id) p.user_id, p.pass_type::text AS pass_type
    FROM public.passes p
    WHERE p.event_id = p_event_id
    ORDER BY p.user_id, p.created_at DESC
  ) ep
  JOIN auth.users u ON u.id::text = ep.user_id::text
  WHERE u.deleted_at IS NULL
    AND (p_cursor IS NULL OR u.id > p_cursor)
    AND (v_query = '' OR u.id::text = v_query OR lower(COALESCE(u.email, '')) LIKE '%' || v_query || '%'
      OR lower(COALESCE(u.raw_user_meta_data->>'username', '')) LIKE '%' || v_query || '%'
      OR lower(COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', '')) LIKE '%' || v_query || '%')
  ORDER BY u.id LIMIT LEAST(GREATEST(p_limit, 1), 500) + 1;
END $$;


--
-- Name: admin_list_event_passes(uuid, text, integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_list_event_passes(p_actor_user_id uuid, p_event_id text, p_limit integer DEFAULT 50, p_cursor text DEFAULT NULL::text) RETURNS TABLE(id text, user_id text, event_id text, pass_type text, status text, pass_number text, max_meeting_requests integer, used_meeting_requests integer, max_boost_amount numeric, used_boost_amount numeric, created_at timestamp with time zone, updated_at timestamp with time zone, user_email text, user_name text, username text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_temp'
    AS $$
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.id, p.user_id, p.event_id, p.pass_type::text, p.status::text,
    p.pass_number, p.max_meeting_requests, p.used_meeting_requests,
    p.max_boost_amount::numeric, p.used_boost_amount::numeric,
    p.created_at, p.updated_at,
    COALESCE(auth_user.email::text, profile.email::text),
    COALESCE(
      auth_user.raw_user_meta_data->>'name',
      auth_user.raw_user_meta_data->>'full_name',
      NULLIF(concat_ws(' ', profile.full_name, profile.display_name), '')
    ),
    auth_user.raw_user_meta_data->>'username'
  FROM public.passes p
  LEFT JOIN auth.users auth_user ON auth_user.id::text = p.user_id::text
  LEFT JOIN LATERAL (
    SELECT up.email, up.full_name, up.display_name
    FROM public.user_profiles up
    WHERE up.user_id::text = p.user_id::text
       OR up.user_id::text = auth_user.id::text
    ORDER BY up.updated_at DESC NULLS LAST
    LIMIT 1
  ) profile ON true
  WHERE p.event_id = p_event_id
    AND (p_cursor IS NULL OR (p.created_at, p.id) < (
      SELECT pc.created_at, pc.id FROM public.passes pc WHERE pc.id = p_cursor
    ))
  ORDER BY p.created_at DESC, p.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100) + 1;
END;
$$;


--
-- Name: admin_manage_event_pass_claim_code(uuid, text, text, text, text, text, integer, timestamp with time zone, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_manage_event_pass_claim_code(p_actor_user_id uuid, p_event_id text, p_action text, p_code text DEFAULT NULL::text, p_label text DEFAULT NULL::text, p_pass_type text DEFAULT NULL::text, p_max_claims integer DEFAULT NULL::integer, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_code_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_code_id uuid;
  v_normalized_code text;
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Event administrator access required' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'create' THEN
    v_normalized_code := upper(btrim(COALESCE(p_code, '')));
    IF v_normalized_code !~ '^[A-Z0-9][A-Z0-9_-]{5,127}$' THEN
      RAISE EXCEPTION 'Pass code must be 6-128 characters: letters, numbers, hyphen, or underscore' USING ERRCODE = '22023';
    END IF;
    IF COALESCE(length(btrim(p_label)), 0) = 0 OR length(btrim(p_label)) > 160 THEN
      RAISE EXCEPTION 'A pass-code label of up to 160 characters is required' USING ERRCODE = '22023';
    END IF;
    IF p_pass_type NOT IN ('general', 'business', 'vip') THEN
      RAISE EXCEPTION 'A valid pass type is required' USING ERRCODE = '22023';
    END IF;
    IF p_max_claims IS NOT NULL AND p_max_claims < 1 THEN
      RAISE EXCEPTION 'The claim limit must be positive or unlimited' USING ERRCODE = '22023';
    END IF;
    IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
      RAISE EXCEPTION 'The expiry must be in the future' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.pass_claim_codes (
      event_id, code_hash, label, pass_type, max_claims, expires_at, is_active, created_by
    ) VALUES (
      p_event_id,
      encode(digest(v_normalized_code, 'sha256'), 'hex'),
      btrim(p_label),
      p_pass_type::public.pass_type,
      p_max_claims,
      p_expires_at,
      true,
      p_actor_user_id
    ) RETURNING id INTO v_code_id;

  ELSIF p_action IN ('deactivate', 'reactivate') THEN
    IF p_code_id IS NULL THEN
      RAISE EXCEPTION 'A pass-code id is required' USING ERRCODE = '22023';
    END IF;

    UPDATE public.pass_claim_codes
    SET is_active = p_action = 'reactivate'
    WHERE id = p_code_id AND event_id = p_event_id
    RETURNING id INTO v_code_id;

    IF v_code_id IS NULL THEN
      RAISE EXCEPTION 'Pass code does not belong to the requested event' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported pass-code action' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (
    p_actor_user_id,
    p_event_id,
    'pass_code.' || p_action,
    'pass_claim_code',
    v_code_id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'label', NULLIF(btrim(COALESCE(p_label, '')), ''),
      'pass_type', p_pass_type,
      'max_claims', p_max_claims,
      'expires_at', p_expires_at
    ))
  );

  RETURN jsonb_build_object('id', v_code_id, 'status', p_action);
END;
$_$;


--
-- Name: admin_manage_speaker_role(uuid, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_manage_speaker_role(p_actor_user_id uuid, p_event_id text, p_action text, p_speaker_id text, p_target_email text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_speaker_user_id uuid;
  v_target_user_id uuid;
  v_target_email text;
  v_speaker_name text;
  v_is_active boolean;
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Only an event administrator may manage speaker assignments'
      USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('grant', 'revoke', 'activate', 'deactivate') THEN
    RAISE EXCEPTION 'Unsupported speaker management action' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'Unknown event' USING ERRCODE = '22023';
  END IF;

  SELECT user_id, name, COALESCE(is_active, false)
    INTO v_speaker_user_id, v_speaker_name, v_is_active
    FROM public.bsl_speakers
   WHERE id::text = p_speaker_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown speaker profile' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'grant' THEN
    v_target_email := lower(btrim(COALESCE(p_target_email, '')));
    IF v_target_email = '' OR position('@' IN v_target_email) < 2 THEN
      RAISE EXCEPTION 'A valid existing account email is required' USING ERRCODE = '22023';
    END IF;

    -- Only email confirmation proves that this account controls the address.
    -- Do not accept confirmed_at: it can reflect phone confirmation alone.
    SELECT id, lower(email)
      INTO v_target_user_id, v_target_email
      FROM auth.users
     WHERE lower(email) = v_target_email
       AND email_confirmed_at IS NOT NULL
     LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No verified email account exists for this email' USING ERRCODE = '22023';
    END IF;

    IF v_speaker_user_id IS NOT NULL AND v_speaker_user_id <> v_target_user_id THEN
      RAISE EXCEPTION 'This speaker is already assigned to another account; revoke it first'
        USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM public.bsl_speakers
       WHERE user_id = v_target_user_id
         AND id::text <> p_speaker_id
    ) THEN
      RAISE EXCEPTION 'This account is already assigned to another speaker profile'
        USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM public.speaker_identity_claims
       WHERE claimed_user_id = v_target_user_id
         AND speaker_id <> p_speaker_id
    ) THEN
      RAISE EXCEPTION 'This account already has a claimed speaker identity'
        USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM public.speaker_identity_claims
       WHERE email_normalized = v_target_email
         AND speaker_id <> p_speaker_id
    ) THEN
      RAISE EXCEPTION 'This email is configured for another speaker identity'
        USING ERRCODE = '23505';
    END IF;

    UPDATE public.bsl_speakers
       SET user_id = v_target_user_id,
           is_active = true,
           updated_at = now()
     WHERE id::text = p_speaker_id;

    INSERT INTO public.speaker_identity_claims (
      speaker_id,
      email_normalized,
      status,
      configured_by,
      claimed_user_id,
      claimed_at,
      metadata
    ) VALUES (
      p_speaker_id,
      v_target_email,
      'claimed',
      p_actor_user_id,
      v_target_user_id,
      now(),
      jsonb_build_object('source', 'admin_speaker_role')
    )
    ON CONFLICT (speaker_id) DO UPDATE
      SET email_normalized = EXCLUDED.email_normalized,
          status = 'claimed',
          configured_by = EXCLUDED.configured_by,
          claimed_user_id = EXCLUDED.claimed_user_id,
          claimed_at = EXCLUDED.claimed_at,
          claim_error = NULL,
          metadata = EXCLUDED.metadata,
          updated_at = now();

  ELSIF p_action = 'revoke' THEN
    UPDATE public.bsl_speakers
       SET user_id = NULL,
           is_active = false,
           updated_at = now()
     WHERE id::text = p_speaker_id;
    DELETE FROM public.speaker_identity_claims WHERE speaker_id = p_speaker_id;

  ELSE
    IF p_action = 'activate' AND v_speaker_user_id IS NULL THEN
      RAISE EXCEPTION 'Assign an account before activating a speaker' USING ERRCODE = '22023';
    END IF;
    UPDATE public.bsl_speakers
       SET is_active = (p_action = 'activate'),
           updated_at = now()
     WHERE id::text = p_speaker_id;
  END IF;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (
    p_actor_user_id,
    p_event_id,
    'speaker_role.' || p_action,
    'speaker',
    p_speaker_id,
    jsonb_build_object('speaker_name', v_speaker_name, 'target_email', v_target_email)
  );

  SELECT COALESCE(is_active, false)
    INTO v_is_active
    FROM public.bsl_speakers
   WHERE id::text = p_speaker_id;

  RETURN jsonb_build_object(
    'speaker_id', p_speaker_id,
    'action', p_action,
    'is_active', v_is_active
  );
END;
$$;


--
-- Name: admin_mutate_event_pass(uuid, text, text, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_mutate_event_pass(p_actor_user_id uuid, p_event_id text, p_action text, p_user_id uuid DEFAULT NULL::uuid, p_pass_id text DEFAULT NULL::text, p_pass_type text DEFAULT NULL::text, p_status text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_pass_id text;
  v_current_event text;
  v_tier public.event_pass_tiers%ROWTYPE;
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Event administrator access required' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'create' THEN
    IF p_user_id IS NULL OR p_pass_type NOT IN ('general', 'business', 'vip') THEN
      RAISE EXCEPTION 'A user and valid pass type are required' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_tier FROM public.event_pass_tiers
    WHERE event_id = p_event_id AND pass_type = p_pass_type;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pass tier is not configured for this event' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.passes (
      id, user_id, event_id, pass_type, status, pass_number,
      max_meeting_requests, used_meeting_requests, max_boost_amount, used_boost_amount,
      access_features, special_perks
    ) VALUES (
      gen_random_uuid()::text, p_user_id::text, p_event_id, p_pass_type::public.pass_type,
      'active', 'ADMIN-' || upper(p_pass_type) || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
      v_tier.max_meeting_requests, 0, v_tier.max_boost_amount, 0,
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
    IF p_pass_type IS NOT NULL THEN
      SELECT * INTO v_tier FROM public.event_pass_tiers
      WHERE event_id = p_event_id AND pass_type = p_pass_type;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Pass tier is not configured for this event' USING ERRCODE = '22023';
      END IF;
    END IF;

    UPDATE public.passes SET
      pass_type = COALESCE(p_pass_type::public.pass_type, pass_type),
      status = COALESCE(p_status, status),
      max_meeting_requests = CASE WHEN p_pass_type IS NOT NULL THEN v_tier.max_meeting_requests ELSE max_meeting_requests END,
      max_boost_amount = CASE WHEN p_pass_type IS NOT NULL THEN v_tier.max_boost_amount ELSE max_boost_amount END,
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


--
-- Name: admin_mutate_event_role(uuid, text, text, uuid, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_mutate_event_role(p_actor_user_id uuid, p_event_id text, p_action text, p_target_user_id uuid, p_role text, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_is_super boolean;
BEGIN
  IF p_action NOT IN ('grant', 'revoke') THEN
    RAISE EXCEPTION 'Unsupported role action' USING ERRCODE = '22023';
  END IF;
  IF p_role NOT IN ('event_admin', 'moderator') THEN
    RAISE EXCEPTION 'Invalid role' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'Unknown event' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= now() THEN
    RAISE EXCEPTION 'expires_at must be in the future' USING ERRCODE = '22023';
  END IF;

  v_is_super := public.is_super_admin(p_actor_user_id);

  IF p_role = 'event_admin' THEN
    IF NOT v_is_super THEN
      RAISE EXCEPTION 'Only a super admin may grant or revoke event_admin' USING ERRCODE = '42501';
    END IF;
  ELSE -- moderator
    IF NOT (v_is_super OR public.has_event_admin_access(p_actor_user_id, p_event_id, false)) THEN
      RAISE EXCEPTION 'Event administrator access required' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_action = 'grant' THEN
    INSERT INTO public.event_roles (event_id, user_id, role, granted_by, expires_at)
    VALUES (p_event_id, p_target_user_id, p_role::public.event_role, p_actor_user_id, p_expires_at)
    ON CONFLICT (event_id, user_id, role) DO UPDATE
      SET granted_by = EXCLUDED.granted_by, granted_at = now(), expires_at = EXCLUDED.expires_at;
  ELSE
    DELETE FROM public.event_roles
    WHERE event_id = p_event_id AND user_id = p_target_user_id AND role = p_role::public.event_role;
  END IF;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (p_actor_user_id, p_event_id, 'role.' || p_action, 'event_role', p_target_user_id::text,
    jsonb_build_object('role', p_role, 'expires_at', p_expires_at));

  RETURN jsonb_build_object('event_id', p_event_id, 'user_id', p_target_user_id, 'role', p_role, 'action', p_action);
END;
$$;


--
-- Name: admin_search_active_users(uuid, text, text, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_search_active_users(p_actor_user_id uuid, p_event_id text, p_query text DEFAULT ''::text, p_limit integer DEFAULT 25, p_cursor uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, email text, name text, username text, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE v_query text := lower(trim(COALESCE(p_query, '')));
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT u.id, u.email::text,
    COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name')::text,
    (u.raw_user_meta_data->>'username')::text, u.created_at
  FROM auth.users u
  WHERE u.deleted_at IS NULL AND (u.email_confirmed_at IS NOT NULL OR u.confirmed_at IS NOT NULL)
    AND (p_cursor IS NULL OR u.id > p_cursor)
    AND (v_query = '' OR u.id::text = v_query OR lower(COALESCE(u.email, '')) LIKE '%' || v_query || '%'
      OR lower(COALESCE(u.raw_user_meta_data->>'username', '')) LIKE '%' || v_query || '%'
      OR lower(COALESCE(u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name', '')) LIKE '%' || v_query || '%')
  ORDER BY u.id LIMIT LEAST(GREATEST(p_limit, 1), 50) + 1;
END $$;


--
-- Name: admin_update_event_pass_tier(uuid, text, text, integer, integer, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_event_pass_tier(p_actor_user_id uuid, p_event_id text, p_pass_type text, p_max_meeting_requests integer, p_max_boost_amount integer, p_price_cents integer DEFAULT NULL::integer, p_currency text DEFAULT 'USD'::text, p_price_label text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_tier public.event_pass_tiers%ROWTYPE;
  v_currency text := upper(btrim(COALESCE(p_currency, 'USD')));
  v_price_label text := NULLIF(btrim(p_price_label), '');
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Event administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_pass_type NOT IN ('general', 'business', 'vip') THEN
    RAISE EXCEPTION 'A valid pass type is required' USING ERRCODE = '22023';
  END IF;
  IF p_max_meeting_requests IS NULL OR p_max_meeting_requests < 0
    OR p_max_boost_amount IS NULL OR p_max_boost_amount < 0 THEN
    RAISE EXCEPTION 'Pass limits must be non-negative whole numbers' USING ERRCODE = '22023';
  END IF;
  IF p_price_cents IS NOT NULL AND p_price_cents < 0 THEN
    RAISE EXCEPTION 'Price cannot be negative' USING ERRCODE = '22023';
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a three-letter ISO code' USING ERRCODE = '22023';
  END IF;
  IF p_price_cents IS NULL AND v_price_label IS NULL THEN
    RAISE EXCEPTION 'Provide a price or price label' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.event_pass_tiers (
    event_id, pass_type, max_meeting_requests, max_boost_amount, price_cents, currency, price_label
  ) VALUES (
    p_event_id, p_pass_type, p_max_meeting_requests, p_max_boost_amount,
    p_price_cents, v_currency, v_price_label
  )
  ON CONFLICT (event_id, pass_type) DO UPDATE SET
    max_meeting_requests = EXCLUDED.max_meeting_requests,
    max_boost_amount = EXCLUDED.max_boost_amount,
    price_cents = EXCLUDED.price_cents,
    currency = EXCLUDED.currency,
    price_label = EXCLUDED.price_label,
    updated_at = now()
  RETURNING * INTO v_tier;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (
    p_actor_user_id, p_event_id, 'pass_tier.update', 'event_pass_tier', p_pass_type,
    jsonb_build_object(
      'max_meeting_requests', v_tier.max_meeting_requests,
      'max_boost_amount', v_tier.max_boost_amount,
      'price_cents', v_tier.price_cents,
      'currency', v_tier.currency,
      'price_label', v_tier.price_label
    )
  );

  RETURN jsonb_build_object(
    'event_id', v_tier.event_id,
    'pass_type', v_tier.pass_type,
    'max_meeting_requests', v_tier.max_meeting_requests,
    'max_boost_amount', v_tier.max_boost_amount,
    'price_cents', v_tier.price_cents,
    'currency', v_tier.currency,
    'price_label', v_tier.price_label
  );
END;
$_$;


--
-- Name: admin_update_event_pass_usage(uuid, text, text, integer, integer, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.admin_update_event_pass_usage(p_actor_user_id uuid, p_event_id text, p_pass_id text, p_max_meeting_requests integer, p_used_meeting_requests integer, p_max_boost_amount numeric, p_used_boost_amount numeric) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_event_id text;
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Event administrator access required' USING ERRCODE = '42501';
  END IF;

  IF p_pass_id IS NULL OR p_max_meeting_requests IS NULL
     OR p_used_meeting_requests IS NULL OR p_max_boost_amount IS NULL
     OR p_used_boost_amount IS NULL THEN
    RAISE EXCEPTION 'All usage and limit values are required' USING ERRCODE = '22023';
  END IF;

  IF p_max_meeting_requests < 0 OR p_used_meeting_requests < 0
     OR p_max_boost_amount < 0 OR p_used_boost_amount < 0 THEN
    RAISE EXCEPTION 'Usage values cannot be negative' USING ERRCODE = '22023';
  END IF;

  IF p_used_meeting_requests > p_max_meeting_requests
     OR p_used_boost_amount > p_max_boost_amount THEN
    RAISE EXCEPTION 'Used values cannot exceed their limits' USING ERRCODE = '22023';
  END IF;

  SELECT event_id INTO v_event_id
  FROM public.passes
  WHERE id::text = p_pass_id
  FOR UPDATE;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Pass not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_event_id IS DISTINCT FROM p_event_id THEN
    RAISE EXCEPTION 'Pass does not belong to the requested event' USING ERRCODE = '42501';
  END IF;

  UPDATE public.passes
  SET max_meeting_requests = p_max_meeting_requests,
      used_meeting_requests = p_used_meeting_requests,
      max_boost_amount = p_max_boost_amount,
      used_boost_amount = p_used_boost_amount,
      updated_at = now()
  WHERE id::text = p_pass_id;

  INSERT INTO public.admin_action_log
    (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (
    p_actor_user_id, p_event_id, 'pass.usage.update', 'pass', p_pass_id,
    jsonb_build_object(
      'max_meeting_requests', p_max_meeting_requests,
      'used_meeting_requests', p_used_meeting_requests,
      'max_boost_amount', p_max_boost_amount,
      'used_boost_amount', p_used_boost_amount
    )
  );

  RETURN jsonb_build_object(
    'id', p_pass_id,
    'max_meeting_requests', p_max_meeting_requests,
    'used_meeting_requests', p_used_meeting_requests,
    'max_boost_amount', p_max_boost_amount,
    'used_boost_amount', p_used_boost_amount
  );
END;
$$;


--
-- Name: auto_generate_pass_qr(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_generate_pass_qr() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_qr_id UUID;
BEGIN
    -- Only generate QR for active passes
    IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status != 'active') THEN
        -- Generate QR code using the existing function
        BEGIN
            SELECT generate_pass_qr(NEW.id, 30, 1) INTO v_qr_id;
            
            -- Log if QR generation fails (non-blocking)
            IF v_qr_id IS NULL THEN
                RAISE WARNING 'Failed to auto-generate QR code for pass %', NEW.id;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Don't fail the pass creation if QR generation fails
            RAISE WARNING 'Error auto-generating QR code for pass %: %', NEW.id, SQLERRM;
        END;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION auto_generate_pass_qr(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.auto_generate_pass_qr() IS 'Automatically generates a QR code when a pass is created or activated';


--
-- Name: block_user_and_decline_request(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.block_user_and_decline_request(p_request_id text, p_speaker_id text, p_user_id text, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_request RECORD;
  v_speaker RECORD;
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;
  IF v_speaker.user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'speaker_not_found');
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_speaker.user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'speaker_not_authorized');
  END IF;

  SELECT * INTO v_request
  FROM public.meeting_requests mr
  WHERE mr.id = p_request_id::uuid
    AND mr.speaker_id = v_speaker.user_id
    AND mr.requester_id = p_user_id::uuid
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
  END IF;

  INSERT INTO public.user_blocks (
    speaker_id, blocker_user_id, blocked_user_id, reason, blocked_at, is_muted
  ) VALUES (
    v_speaker.id, v_speaker.user_id, p_user_id::uuid, p_reason, now(), false
  )
  ON CONFLICT (speaker_id, blocked_user_id) DO UPDATE SET
    blocker_user_id = EXCLUDED.blocker_user_id,
    reason = COALESCE(EXCLUDED.reason, public.user_blocks.reason),
    blocked_at = now(),
    is_muted = COALESCE(EXCLUDED.is_muted, public.user_blocks.is_muted);

  UPDATE public.meeting_requests
  SET status = 'declined', speaker_response = COALESCE(p_reason, 'User blocked'),
      speaker_response_at = now(), updated_at = now()
  WHERE id = v_request.id;

  PERFORM public.create_notification(
    v_request.requester_id, 'meeting_declined', 'Meeting Request Declined',
    COALESCE(v_request.speaker_name, v_speaker.name) || ' declined your meeting request.',
    v_request.id, v_speaker.id::text, false, NULL
  );
  RETURN jsonb_build_object(
    'success', true, 'status', 'declined', 'blocked_user_id', p_user_id
  );
END;
$$;


--
-- Name: book_meeting_slot(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.book_meeting_slot(p_slot_id text, p_meeting_id text, p_location text DEFAULT 'Networking Area'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_slot RECORD;
  v_meeting RECORD;
BEGIN
  SELECT * INTO v_slot
  FROM public.meeting_slots
  WHERE id = p_slot_id::uuid
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'slot_not_found');
  END IF;

  SELECT * INTO v_meeting
  FROM public.meetings
  WHERE id = p_meeting_id::uuid
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'meeting_not_found');
  END IF;

  UPDATE public.meeting_slots
  SET
    status = 'booked',
    meeting_id = v_meeting.id,
    updated_at = now()
  WHERE id = v_slot.id;

  UPDATE public.meetings
  SET
    slot_id = v_slot.id,
    location = COALESCE(NULLIF(p_location, ''), location),
    scheduled_at = COALESCE(scheduled_at, v_slot.start_time),
    start_time = COALESCE(start_time, v_slot.start_time),
    end_time = COALESCE(end_time, v_slot.end_time),
    status = CASE WHEN status IN ('cancelled', 'rejected') THEN status ELSE 'confirmed' END,
    updated_at = now()
  WHERE id = v_meeting.id;

  RETURN jsonb_build_object(
    'success', true,
    'meeting_id', v_meeting.id,
    'slot_id', v_slot.id,
    'start_time', v_slot.start_time,
    'end_time', v_slot.end_time,
    'location', COALESCE(NULLIF(p_location, ''), 'Networking Area')
  );
END;
$$;


--
-- Name: calculate_request_expiration(numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_request_expiration(p_boost_amount numeric DEFAULT 0) RETURNS timestamp with time zone
    LANGUAGE plpgsql
    AS $$
DECLARE
    base_hours INTEGER := 2; -- Base expiration: 2 hours
    boost_hours DECIMAL;
    total_hours DECIMAL;
    max_hours INTEGER := 6; -- Maximum expiration: 6 hours
BEGIN
    -- Calculate boost hours: 50 points = 1 hour
    -- Round down to nearest hour
    boost_hours := FLOOR(p_boost_amount / 50.0);
    
    -- Calculate total hours (base + boost)
    total_hours := base_hours + boost_hours;
    
    -- Cap at maximum hours
    IF total_hours > max_hours THEN
        total_hours := max_hours;
    END IF;
    
    -- Return expiration timestamp
    RETURN NOW() + (total_hours || ' hours')::INTERVAL;
END;
$$;


--
-- Name: can_make_meeting_request(uuid, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_make_meeting_request(p_user_id uuid, p_speaker_id text, p_boost_amount numeric DEFAULT 0) RETURNS TABLE(can_request boolean, reason text, pass_type public.pass_type, remaining_requests integer, remaining_boost numeric)
    LANGUAGE plpgsql
    AS $$
DECLARE
    user_pass RECORD;
    limits RECORD;
    is_blocked BOOLEAN;
BEGIN
    -- Check if user is blocked by speaker
    SELECT EXISTS(
        SELECT 1 FROM user_blocks 
        WHERE speaker_id = p_speaker_id 
        AND blocked_user_id = p_user_id
    ) INTO is_blocked;
    
    IF is_blocked THEN
        RETURN QUERY SELECT false, 'User is blocked by this speaker', null::pass_type, 0, 0.00;
        RETURN;
    END IF;
    
    -- Get user's pass
    SELECT * INTO user_pass 
    FROM passes 
    WHERE user_id = p_user_id 
    AND event_id = 'bsl2025' 
    AND status = 'active';
    
    IF user_pass IS NULL THEN
        RETURN QUERY SELECT false, 'No active pass found', null::pass_type, 0, 0.00;
        RETURN;
    END IF;
    
    -- Get limits for pass type
    SELECT * INTO limits FROM get_pass_type_limits(user_pass.pass_type);
    
    -- Check if user has remaining requests
    IF user_pass.used_meeting_requests >= user_pass.max_meeting_requests THEN
        RETURN QUERY SELECT false, 'No remaining meeting requests', user_pass.pass_type, 0, user_pass.max_boost_amount - user_pass.used_boost_amount;
        RETURN;
    END IF;
    
    -- Check if user has enough boost amount
    IF p_boost_amount > 0 AND (user_pass.used_boost_amount + p_boost_amount) > user_pass.max_boost_amount THEN
        RETURN QUERY SELECT false, 'Insufficient boost amount available', user_pass.pass_type, user_pass.max_meeting_requests - user_pass.used_meeting_requests, user_pass.max_boost_amount - user_pass.used_boost_amount;
        RETURN;
    END IF;
    
    -- All checks passed
    RETURN QUERY SELECT true, 'Can make request', user_pass.pass_type, user_pass.max_meeting_requests - user_pass.used_meeting_requests, user_pass.max_boost_amount - user_pass.used_boost_amount;
END;
$$;


--
-- Name: can_make_meeting_request(text, text, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_make_meeting_request(p_user_id text, p_speaker_id text, p_boost_amount numeric DEFAULT 0, p_event_id text DEFAULT NULL::text) RETURNS TABLE(can_request boolean, reason text, pass_type text, remaining_requests integer, remaining_boost numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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

  IF v_speaker.user_id IS NULL THEN
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
    AND mr.speaker_id::text = v_speaker.user_id::text
    AND mr.event_id = v_event_id
    AND mr.status IN ('pending', 'requested', 'approved', 'accepted')
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
      AND (ub.speaker_id::text = v_speaker.id OR ub.blocker_user_id = v_speaker.user_id)
    ) OR (
      ub.blocker_user_id = p_user_id::uuid
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


--
-- Name: can_send_meeting_request(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_send_meeting_request(p_user_id text, p_event_id text, p_ticket_type text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_counts RECORD;
BEGIN
  PERFORM 1
  FROM public.passes
  WHERE user_id::text = p_user_id
    AND event_id = COALESCE(NULLIF(p_event_id, ''), COALESCE(NULLIF(current_setting('app.event_id', true), ''), 'bsl2025'))
    AND status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  SELECT * INTO v_counts
  FROM public.get_user_meeting_request_counts(p_user_id, p_event_id)
  LIMIT 1;

  RETURN COALESCE(v_counts.remaining_requests, 0) > 0;
END;
$$;


--
-- Name: cancel_meeting_request(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_meeting_request(p_request_id text, p_user_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_request RECORD;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id::uuid THEN
    RETURN false;
  END IF;

  SELECT * INTO v_request
  FROM public.meeting_requests
  WHERE id = p_request_id::uuid
    AND requester_id = p_user_id::uuid
    AND status IN ('pending', 'requested', 'accepted')
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.meeting_requests
  SET status = 'cancelled', updated_at = now()
  WHERE id = v_request.id;

  IF v_request.meeting_id IS NOT NULL THEN
    UPDATE public.meetings
    SET status = 'cancelled', updated_at = now()
    WHERE id = v_request.meeting_id;
    UPDATE public.meeting_slots
    SET status = 'available', meeting_id = NULL, updated_at = now()
    WHERE meeting_id = v_request.meeting_id;
    DELETE FROM public.user_agenda_status
    WHERE meeting_id = v_request.meeting_id;
  END IF;

  PERFORM public.create_notification(
    v_request.speaker_id, 'meeting_cancelled', 'Meeting Request Cancelled',
    COALESCE(v_request.requester_name, 'A user') || ' cancelled their meeting request.',
    v_request.id, NULL, false, v_request.meeting_id
  );
  RETURN true;
END;
$$;


--
-- Name: check_wallet_auth_rate_limit(text, public.wallet_type, text, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_wallet_auth_rate_limit(p_wallet_address text, p_wallet_type public.wallet_type, p_ip_address text, p_max_attempts integer DEFAULT 20, p_window_minutes integer DEFAULT 10, p_block_duration_minutes integer DEFAULT 5) RETURNS TABLE(allowed boolean, remaining_attempts integer, blocked_until timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_record RECORD;
    v_window_start TIMESTAMPTZ;
BEGIN
    -- Clean up old entries
    PERFORM cleanup_expired_rate_limits();
    
    -- Get or create rate limit record
    SELECT * INTO v_record
    FROM public.wallet_auth_rate_limits
    WHERE wallet_address = p_wallet_address
    AND wallet_type = p_wallet_type
    AND (ip_address = p_ip_address OR ip_address IS NULL OR p_ip_address IS NULL)
    FOR UPDATE;
    
    v_window_start := NOW() - (p_window_minutes || ' minutes')::INTERVAL;
    
    IF v_record IS NULL THEN
        -- First attempt, create new record
        INSERT INTO public.wallet_auth_rate_limits (wallet_address, wallet_type, ip_address, attempt_count, window_start)
        VALUES (p_wallet_address, p_wallet_type, p_ip_address, 1, NOW())
        ON CONFLICT (wallet_address, wallet_type, ip_address) DO NOTHING;
        
        RETURN QUERY SELECT TRUE, p_max_attempts - 1, NULL::TIMESTAMPTZ;
    ELSIF v_record.blocked_until IS NOT NULL AND v_record.blocked_until > NOW() THEN
        -- Currently blocked
        RETURN QUERY SELECT FALSE, 0, v_record.blocked_until;
    ELSIF v_record.window_start < v_window_start THEN
        -- Window expired, reset
        UPDATE public.wallet_auth_rate_limits
        SET attempt_count = 1, window_start = NOW(), blocked_until = NULL
        WHERE id = v_record.id;
        
        RETURN QUERY SELECT TRUE, p_max_attempts - 1, NULL::TIMESTAMPTZ;
    ELSIF v_record.attempt_count >= p_max_attempts THEN
        -- Too many attempts, block
        UPDATE public.wallet_auth_rate_limits
        SET blocked_until = NOW() + (p_block_duration_minutes || ' minutes')::INTERVAL
        WHERE id = v_record.id;
        
        RETURN QUERY SELECT FALSE, 0, NOW() + (p_block_duration_minutes || ' minutes')::INTERVAL;
    ELSE
        -- Increment attempt count
        UPDATE public.wallet_auth_rate_limits
        SET attempt_count = attempt_count + 1
        WHERE id = v_record.id;
        
        RETURN QUERY SELECT TRUE, p_max_attempts - v_record.attempt_count - 1, NULL::TIMESTAMPTZ;
    END IF;
END;
$$;


--
-- Name: FUNCTION check_wallet_auth_rate_limit(p_wallet_address text, p_wallet_type public.wallet_type, p_ip_address text, p_max_attempts integer, p_window_minutes integer, p_block_duration_minutes integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.check_wallet_auth_rate_limit(p_wallet_address text, p_wallet_type public.wallet_type, p_ip_address text, p_max_attempts integer, p_window_minutes integer, p_block_duration_minutes integer) IS 'Updated rate limit function with increased limits: 20 attempts per 10 minutes, 5 minute block duration';


--
-- Name: claim_event_pass_code(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_event_pass_code(p_code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_code public.pass_claim_codes%ROWTYPE;
  v_code_hash text;
  v_pass_id text;
  v_existing_pass_id text;
  v_tier public.event_pass_tiers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to claim a pass' USING ERRCODE = '42501';
  END IF;
  IF p_code IS NULL OR length(btrim(p_code)) < 6 OR length(btrim(p_code)) > 128 THEN
    RAISE EXCEPTION 'Invalid pass claim code' USING ERRCODE = '22023';
  END IF;

  v_code_hash := encode(digest(upper(btrim(p_code)), 'sha256'), 'hex');
  SELECT * INTO v_code FROM public.pass_claim_codes
  WHERE code_hash = v_code_hash AND is_active = true FOR UPDATE;
  IF NOT FOUND OR (v_code.expires_at IS NOT NULL AND v_code.expires_at <= now()) THEN
    RAISE EXCEPTION 'Invalid or expired pass claim code' USING ERRCODE = '22023';
  END IF;

  SELECT pass_id INTO v_existing_pass_id FROM public.pass_code_claims
  WHERE code_id = v_code.id AND user_id = v_user_id;
  IF v_existing_pass_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_claimed', 'pass_id', v_existing_pass_id, 'event_id', v_code.event_id);
  END IF;
  IF v_code.max_claims IS NOT NULL AND v_code.claimed_count >= v_code.max_claims THEN
    RAISE EXCEPTION 'This pass claim code has reached its limit' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tier FROM public.event_pass_tiers
  WHERE event_id = v_code.event_id AND pass_type = v_code.pass_type::text;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pass tier is not configured for this event' USING ERRCODE = '22023';
  END IF;

  v_pass_id := gen_random_uuid()::text;
  INSERT INTO public.passes (
    id, user_id, event_id, pass_type, status, pass_number,
    max_meeting_requests, used_meeting_requests, max_boost_amount, used_boost_amount,
    access_features, special_perks
  ) VALUES (
    v_pass_id, v_user_id::text, v_code.event_id, v_code.pass_type, 'active',
    'CODE-' || upper(v_code.pass_type::text) || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    v_tier.max_meeting_requests, 0, v_tier.max_boost_amount, 0,
    CASE v_code.pass_type
      WHEN 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
      WHEN 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
      ELSE ARRAY['general_sessions']
    END,
    CASE v_code.pass_type
      WHEN 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
      WHEN 'business' THEN ARRAY['business_lounge', 'networking_tools']
      ELSE ARRAY['basic_swag']
    END
  );
  INSERT INTO public.pass_code_claims (code_id, user_id, pass_id) VALUES (v_code.id, v_user_id, v_pass_id);
  UPDATE public.pass_claim_codes SET claimed_count = claimed_count + 1 WHERE id = v_code.id;

  RETURN jsonb_build_object('status', 'claimed', 'pass_id', v_pass_id, 'event_id', v_code.event_id);
END;
$$;


--
-- Name: claim_speaker_profile_for_verified_auth_user(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_speaker_profile_for_verified_auth_user(p_user_id uuid, p_email text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_claim public.speaker_identity_claims%ROWTYPE;
  v_speaker_id text;
  v_email text := lower(btrim(COALESCE(p_email, '')));
BEGIN
  IF v_email = '' THEN
    RETURN false;
  END IF;

  SELECT *
    INTO v_claim
    FROM public.speaker_identity_claims
   WHERE email_normalized = v_email
     AND status = 'unclaimed'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE public.bsl_speakers
     SET user_id = p_user_id,
         updated_at = now()
   WHERE id::text = v_claim.speaker_id
     AND user_id IS NULL
   RETURNING id::text INTO v_speaker_id;

  IF v_speaker_id IS NULL THEN
    UPDATE public.speaker_identity_claims
       SET status = 'needs_review',
           claim_error = 'Speaker profile is already linked to another account',
           updated_at = now()
     WHERE id = v_claim.id;
    RETURN false;
  END IF;

  UPDATE public.speaker_identity_claims
     SET status = 'claimed',
         claimed_user_id = p_user_id,
         claimed_at = now(),
         claim_error = NULL,
         updated_at = now()
   WHERE id = v_claim.id;

  INSERT INTO public.event_roles (event_id, user_id, role, granted_by, metadata)
  SELECT role_grant.event_id,
         p_user_id,
         role_grant.role,
         v_claim.configured_by,
         jsonb_build_object('source', 'speaker_identity_claim', 'claim_id', v_claim.id)
    FROM public.speaker_identity_claim_event_roles AS role_grant
   WHERE role_grant.claim_id = v_claim.id
  ON CONFLICT (event_id, user_id, role) DO NOTHING;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  SELECT v_claim.configured_by,
         role_grant.event_id,
         'speaker_identity.claimed',
         'speaker',
         v_speaker_id::text,
         jsonb_build_object('claim_id', v_claim.id, 'claimed_user_id', p_user_id, 'role', role_grant.role)
    FROM public.speaker_identity_claim_event_roles AS role_grant
   WHERE role_grant.claim_id = v_claim.id;

  RETURN true;
END;
$$;


--
-- Name: claim_speaker_profile_on_verified_signup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_speaker_profile_on_verified_signup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- A phone-confirmed account can have confirmed_at populated while its email
  -- is still unverified. Claims are based on ownership of NEW.email, so only
  -- an email confirmation is sufficient.
  IF NEW.email IS NULL OR NEW.email_confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.claim_speaker_profile_for_verified_auth_user(NEW.id, NEW.email);
  RETURN NEW;
END;
$$;


--
-- Name: cleanup_expired_otp_codes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_otp_codes() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM public.otp_codes
    WHERE expires_at < NOW() OR used = TRUE;
END;
$$;


--
-- Name: cleanup_expired_rate_limits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_rate_limits() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM public.wallet_auth_rate_limits
    WHERE window_start < NOW() - INTERVAL '1 hour'
    AND blocked_until IS NULL
    OR (blocked_until IS NOT NULL AND blocked_until < NOW());
END;
$$;


--
-- Name: configure_speaker_identity_claim(uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.configure_speaker_identity_claim(p_actor_user_id uuid, p_speaker_id text, p_email text, p_event_role_grants jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_claim_id uuid;
  v_claim_status text;
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_existing_user record;
BEGIN
  IF NOT public.is_super_admin(p_actor_user_id) THEN
    RAISE EXCEPTION 'Only a super admin may preconfigure event_admin or speaker identity claims'
      USING ERRCODE = '42501';
  END IF;
  IF v_email = '' THEN
    RAISE EXCEPTION 'A speaker claim requires an email address' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_event_role_grants) <> 'array' THEN
    RAISE EXCEPTION 'Event role grants must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.bsl_speakers WHERE id::text = p_speaker_id) THEN
    RAISE EXCEPTION 'Unknown speaker profile' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bsl_speakers WHERE id::text = p_speaker_id AND user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Speaker profile is already linked to an account' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(p_event_role_grants) AS role_grant(event_id text, role text)
     WHERE role_grant.event_id IS NULL
        OR role_grant.role NOT IN ('event_admin', 'moderator')
        OR NOT EXISTS (SELECT 1 FROM public.events WHERE id = role_grant.event_id)
  ) THEN
    RAISE EXCEPTION 'Each event role grant must reference an existing event and a supported role'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.speaker_identity_claims (
    speaker_id,
    email_normalized,
    status,
    configured_by,
    metadata
  ) VALUES (
    p_speaker_id,
    v_email,
    'unclaimed',
    p_actor_user_id,
    jsonb_build_object('source', 'admin_configuration')
  )
  ON CONFLICT (speaker_id) DO UPDATE
    SET email_normalized = EXCLUDED.email_normalized,
        status = 'unclaimed',
        configured_by = EXCLUDED.configured_by,
        claimed_user_id = NULL,
        claimed_at = NULL,
        claim_error = NULL,
        updated_at = now()
    WHERE public.speaker_identity_claims.status <> 'claimed'
  RETURNING id INTO v_claim_id;

  IF v_claim_id IS NULL THEN
    RAISE EXCEPTION 'Claim is already completed and cannot be reconfigured' USING ERRCODE = '23505';
  END IF;

  DELETE FROM public.speaker_identity_claim_event_roles WHERE claim_id = v_claim_id;
  INSERT INTO public.speaker_identity_claim_event_roles (claim_id, event_id, role)
  SELECT v_claim_id, role_grant.event_id, role_grant.role::public.event_role
    FROM jsonb_to_recordset(p_event_role_grants) AS role_grant(event_id text, role text);

  INSERT INTO public.admin_action_log (actor_user_id, action, target_type, target_id, metadata)
  VALUES (
    p_actor_user_id,
    'speaker_identity.configured',
    'speaker',
    p_speaker_id::text,
    jsonb_build_object('claim_id', v_claim_id)
  );

  SELECT id, email
    INTO v_existing_user
    FROM auth.users
   WHERE lower(email) = v_email
     AND email_confirmed_at IS NOT NULL
   LIMIT 1;
  IF FOUND THEN
    PERFORM public.claim_speaker_profile_for_verified_auth_user(v_existing_user.id, v_existing_user.email);
  END IF;

  SELECT status
    INTO v_claim_status
    FROM public.speaker_identity_claims
   WHERE id = v_claim_id;

  RETURN jsonb_build_object(
    'claim_id', v_claim_id,
    'speaker_id', p_speaker_id,
    'status', v_claim_status
  );
END;
$$;


--
-- Name: create_default_pass(uuid, public.pass_type); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_default_pass(p_user_id uuid, p_pass_type public.pass_type DEFAULT 'general'::public.pass_type) RETURNS text
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: create_default_pass(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_default_pass(p_user_id text, p_pass_type text, p_event_id text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid()::text <> p_user_id THEN
    RAISE EXCEPTION 'A pass may only be created for the authenticated user' USING ERRCODE = '42501';
  END IF;

  IF p_pass_type <> 'general' THEN
    RAISE EXCEPTION 'Self-service pass creation only supports general passes' USING ERRCODE = '42501';
  END IF;

  RETURN public.create_upcoming_bsl_general_pass_for_user(auth.uid(), p_event_id);
END;
$$;


--
-- Name: create_notification(uuid, text, text, text, uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_notification(p_user_id uuid, p_type text, p_title text, p_message text, p_meeting_request_id uuid DEFAULT NULL::uuid, p_speaker_id text DEFAULT NULL::text, p_is_urgent boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
    notification_id UUID;
BEGIN
    INSERT INTO notifications (
        user_id, type, title, message, 
        meeting_request_id, speaker_id, is_urgent
    ) VALUES (
        p_user_id, p_type, p_title, p_message,
        p_meeting_request_id, p_speaker_id, p_is_urgent
    ) RETURNING id INTO notification_id;
    
    RETURN notification_id;
END;
$$;


--
-- Name: create_notification(uuid, text, text, text, uuid, uuid, boolean, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_notification(p_user_id uuid, p_type text, p_title text, p_message text, p_meeting_request_id uuid, p_speaker_id uuid, p_is_urgent boolean, p_meeting_id uuid) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.create_notification(
    p_user_id, p_type, p_title, p_message, p_meeting_request_id,
    p_speaker_id::text, p_is_urgent, p_meeting_id
  );
$$;


--
-- Name: create_notification(uuid, text, text, text, uuid, text, boolean, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_notification(p_user_id uuid, p_type text, p_title text, p_message text, p_meeting_request_id uuid DEFAULT NULL::uuid, p_speaker_id text DEFAULT NULL::text, p_is_urgent boolean DEFAULT false, p_meeting_id uuid DEFAULT NULL::uuid, p_level text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
  v_level text := COALESCE(p_level, CASE WHEN p_is_urgent THEN 'critical' ELSE 'info' END);
BEGIN
  IF v_level NOT IN ('info', 'important', 'critical') THEN
    RAISE EXCEPTION 'Invalid notification level: %', v_level
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    meeting_request_id,
    speaker_id,
    is_urgent,
    meeting_id,
    level
  ) VALUES (
    p_user_id,
    p_type,
    p_title,
    p_message,
    p_meeting_request_id,
    p_speaker_id,
    p_is_urgent OR v_level = 'critical',
    p_meeting_id,
    v_level
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


--
-- Name: create_support_session(text, text, timestamp with time zone, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_support_session(p_app_id text, p_token_hash text, p_expires_at timestamp with time zone, p_external_id text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_locale text DEFAULT NULL::text, p_traits jsonb DEFAULT NULL::jsonb) RETURNS TABLE(session_id uuid, visitor_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_app_id text := NULLIF(trim(COALESCE(p_app_id, '')), '');
  v_external_id text := NULLIF(trim(COALESCE(p_external_id, '')), '');
  v_email text := NULLIF(trim(COALESCE(p_email, '')), '');
  v_visitor_id uuid;
  v_session_id uuid := gen_random_uuid();
BEGIN
  IF v_app_id IS NULL THEN
    RAISE EXCEPTION 'A valid app id is required';
  END IF;

  IF v_external_id IS NOT NULL THEN
    SELECT id INTO v_visitor_id FROM public.support_visitors
      WHERE app_id = v_app_id AND external_id = v_external_id;
  ELSIF v_email IS NOT NULL THEN
    SELECT id INTO v_visitor_id FROM public.support_visitors
      WHERE app_id = v_app_id AND email = v_email;
  END IF;

  IF v_visitor_id IS NULL THEN
    INSERT INTO public.support_visitors (app_id, external_id, email, name, locale, traits)
    VALUES (v_app_id, v_external_id, v_email, NULLIF(p_name, ''), NULLIF(p_locale, ''), COALESCE(p_traits, '{}'::jsonb))
    RETURNING id INTO v_visitor_id;
  ELSE
    UPDATE public.support_visitors
    SET email = COALESCE(v_email, email),
        name = COALESCE(NULLIF(p_name, ''), name),
        locale = COALESCE(NULLIF(p_locale, ''), locale),
        traits = CASE WHEN p_traits IS NOT NULL THEN traits || p_traits ELSE traits END,
        updated_at = now()
    WHERE id = v_visitor_id;
  END IF;

  INSERT INTO public.support_sessions (id, visitor_id, app_id, token_hash, expires_at)
  VALUES (v_session_id, v_visitor_id, v_app_id, p_token_hash, p_expires_at);

  RETURN QUERY SELECT v_session_id, v_visitor_id;
END;
$$;


--
-- Name: create_support_ticket(text, uuid, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_support_ticket(p_app_id text, p_visitor_id uuid, p_subject text, p_message text, p_priority text DEFAULT 'normal'::text, p_context jsonb DEFAULT NULL::jsonb) RETURNS TABLE(id uuid, app_id text, visitor_id uuid, subject text, status text, priority text, needs_human boolean, context jsonb, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_ticket_id uuid := gen_random_uuid();
  v_subject text := NULLIF(trim(COALESCE(p_subject, '')), '');
  v_message text := NULLIF(trim(COALESCE(p_message, '')), '');
  v_priority text := COALESCE(NULLIF(p_priority, ''), 'normal');
BEGIN
  IF v_subject IS NULL THEN
    RAISE EXCEPTION 'A ticket subject is required';
  END IF;
  IF v_message IS NULL THEN
    RAISE EXCEPTION 'An initial message is required';
  END IF;
  IF v_priority NOT IN ('low', 'normal', 'high', 'urgent') THEN
    RAISE EXCEPTION 'Invalid priority';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.support_visitors sv WHERE sv.id = p_visitor_id) THEN
    RAISE EXCEPTION 'Unknown visitor';
  END IF;

  INSERT INTO public.support_tickets (id, app_id, visitor_id, subject, priority, context)
  VALUES (v_ticket_id, p_app_id, p_visitor_id, v_subject, v_priority, p_context);

  INSERT INTO public.support_messages (ticket_id, author, body)
  VALUES (v_ticket_id, 'customer', v_message);

  RETURN QUERY
  SELECT t.id, t.app_id, t.visitor_id, t.subject, t.status, t.priority,
         t.needs_human, t.context, t.created_at, t.updated_at
  FROM public.support_tickets t WHERE t.id = v_ticket_id;
END;
$$;


--
-- Name: create_upcoming_bsl_general_pass_for_user(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_upcoming_bsl_general_pass_for_user(p_user_id uuid, p_event_id text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_pass_id text;
  v_existing_id text;
  v_tier public.event_pass_tiers%ROWTYPE;
BEGIN
  IF p_event_id NOT IN ('chile2026', 'colombia2026') THEN
    RAISE EXCEPTION 'Unsupported upcoming BSL event: %', p_event_id USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('hashpass:pass:' || p_user_id::text || ':' || p_event_id, 0)
  );

  SELECT id::text
  INTO v_existing_id
  FROM public.passes
  WHERE user_id::text = p_user_id::text
    AND event_id = p_event_id
    AND pass_type = 'general'::pass_type
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  SELECT *
  INTO v_tier
  FROM public.event_pass_tiers
  WHERE event_id = p_event_id
    AND pass_type = 'general';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pass tier is not configured for this event' USING ERRCODE = '22023';
  END IF;

  v_pass_id := gen_random_uuid()::text;

  INSERT INTO public.passes (
    id, user_id, event_id, pass_type, status, pass_number,
    max_meeting_requests, used_meeting_requests,
    max_boost_amount, used_boost_amount, access_features, special_perks
  ) VALUES (
    v_pass_id, p_user_id::text, p_event_id, 'general'::pass_type, 'active',
    'BSL-GENERAL-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    v_tier.max_meeting_requests, 0, v_tier.max_boost_amount, 0,
    ARRAY['general_sessions'], ARRAY['basic_swag']
  )
  RETURNING id::text INTO v_pass_id;

  RETURN v_pass_id;
END;
$$;


--
-- Name: decline_meeting_request(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.decline_meeting_request(p_request_id text, p_speaker_id text, p_speaker_response text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_request RECORD;
  v_speaker RECORD;
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'speaker_not_found');
  END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_speaker.user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'speaker_not_authorized');
  END IF;

  SELECT * INTO v_request
  FROM public.meeting_requests mr
  WHERE mr.id = p_request_id::uuid
    AND mr.speaker_id = v_speaker.user_id
    AND mr.status IN ('pending', 'requested', 'accepted')
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'request_not_found');
  END IF;

  UPDATE public.meeting_requests
  SET status = 'declined',
      speaker_response = COALESCE(p_speaker_response, 'Meeting request declined'),
      speaker_response_at = now(), updated_at = now()
  WHERE id = v_request.id;

  PERFORM public.create_notification(
    v_request.requester_id, 'meeting_declined', 'Meeting Request Declined',
    COALESCE(v_request.speaker_name, v_speaker.name) || ' declined your meeting request.',
    v_request.id, v_speaker.id::text, false, NULL
  );
  RETURN jsonb_build_object('success', true, 'status', 'declined');
END;
$$;


--
-- Name: expire_old_meeting_requests(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_old_meeting_requests() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.meeting_requests
  SET status = 'expired', updated_at = now()
  WHERE status IN ('pending', 'requested')
    AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN COALESCE(v_count, 0);
END;
$$;


--
-- Name: generate_pass_qr(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_pass_qr(p_pass_id text, p_expires_in_minutes integer DEFAULT 30, p_max_uses integer DEFAULT 1) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_pass RECORD;
    v_qr_id UUID;
    v_token TEXT;
    v_qr_data JSONB;
    v_user_id TEXT;
BEGIN
    -- Get pass information
    SELECT * INTO v_pass
    FROM public.passes
    WHERE id = p_pass_id AND status = 'active';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pass not found or not active: %', p_pass_id;
    END IF;
    
    -- Get user_id from pass
    v_user_id := v_pass.user_id;
    
    -- Generate unique token
    v_token := 'QR-' || 
               EXTRACT(EPOCH FROM NOW())::bigint || '-' ||
               UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT || p_pass_id) FROM 1 FOR 12));
    
    -- Ensure token is unique
    WHILE EXISTS(SELECT 1 FROM public.qr_codes WHERE token = v_token) LOOP
        v_token := 'QR-' || 
                   EXTRACT(EPOCH FROM NOW())::bigint || '-' ||
                   UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT || p_pass_id || v_token) FROM 1 FOR 12));
    END LOOP;
    
    -- Build QR data payload
    v_qr_data := jsonb_build_object(
        'type', 'pass',
        'pass_id', v_pass.id,
        'pass_number', v_pass.pass_number,
        'pass_type', v_pass.pass_type,
        'user_id', v_user_id,
        'event_id', COALESCE(v_pass.event_id, 'bsl2025'),
        'timestamp', EXTRACT(EPOCH FROM NOW())::bigint
    );
    
    -- Create QR code record
    INSERT INTO public.qr_codes (
        token,
        qr_type,
        pass_id,
        user_id,
        qr_data,
        display_data,
        status,
        expires_at,
        max_uses
    ) VALUES (
        v_token,
        'pass',
        v_pass.id,
        v_user_id,
        v_qr_data,
        jsonb_build_object(
            'pass_number', v_pass.pass_number,
            'pass_type', v_pass.pass_type,
            'holder_name', 'User'
        ),
        'active',
        NOW() + (p_expires_in_minutes || ' minutes')::INTERVAL,
        p_max_uses
    ) RETURNING id INTO v_qr_id;
    
    RETURN v_qr_id;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error generating QR code: %', SQLERRM;
END;
$$;


--
-- Name: FUNCTION generate_pass_qr(p_pass_id text, p_expires_in_minutes integer, p_max_uses integer); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.generate_pass_qr(p_pass_id text, p_expires_in_minutes integer, p_max_uses integer) IS 'Generates a dynamic QR code for a pass';


--
-- Name: generate_qr_token(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_qr_token() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    token TEXT;
    exists_check BOOLEAN;
BEGIN
    LOOP
        -- Generate a unique token: type prefix + timestamp + random
        token := 'QR-' || 
                 EXTRACT(EPOCH FROM NOW())::bigint || '-' ||
                 UPPER(SUBSTRING(MD5(RANDOM()::TEXT || NOW()::TEXT) FROM 1 FOR 12));
        
        -- Check if token exists
        SELECT EXISTS(SELECT 1 FROM public.qr_codes WHERE qr_codes.token = generate_qr_token.token) INTO exists_check;
        
        -- Exit loop if token is unique
        EXIT WHEN NOT exists_check;
    END LOOP;
    
    RETURN token;
END;
$$;


--
-- Name: generate_weekly_slots(text, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_weekly_slots(p_user_id text, p_start_date date) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_day integer;
  v_slot timestamptz;
  v_count integer := 0;
BEGIN
  DELETE FROM public.meeting_slots
  WHERE user_id = p_user_id::uuid
    AND start_time >= p_start_date::timestamptz
    AND status <> 'booked';

  FOR v_day IN 0..6 LOOP
    v_slot := (p_start_date + v_day)::timestamptz + interval '9 hours';
    WHILE v_slot < (p_start_date + v_day)::timestamptz + interval '17 hours' LOOP
      INSERT INTO public.meeting_slots (user_id, start_time, end_time, status)
      VALUES (p_user_id::uuid, v_slot, v_slot + interval '15 minutes', 'available')
      ON CONFLICT (user_id, start_time) DO UPDATE SET
        end_time = EXCLUDED.end_time,
        status = CASE WHEN public.meeting_slots.status = 'booked' THEN public.meeting_slots.status ELSE 'available' END,
        updated_at = now();
      v_count := v_count + 1;
      v_slot := v_slot + interval '15 minutes';
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'slots_created', v_count
  );
END;
$$;


--
-- Name: generate_weekly_slots(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_weekly_slots(user_uuid uuid, start_date date) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    day_offset INT;
    v_current_time TIMESTAMPTZ;
    slots_created INT := 0;
BEGIN
    -- Clear existing future slots for this user
    DELETE FROM public.meeting_slots 
    WHERE user_id = user_uuid 
    AND start_time >= start_date::TIMESTAMPTZ
    AND status != 'booked';
    
    -- Simple slot generation (just one slot per day for now)
    FOR day_offset IN 0..6 LOOP
        v_current_time := (start_date::TIMESTAMPTZ + (day_offset * INTERVAL '1 day') + INTERVAL '9 hours');
        
        INSERT INTO public.meeting_slots 
        (user_id, start_time, end_time, status)
        VALUES 
        (user_uuid, v_current_time, v_current_time + INTERVAL '15 minutes', 'available')
        ON CONFLICT (user_id, start_time) DO NOTHING;
        
        slots_created := slots_created + 1;
    END LOOP;
    
    -- Return success response
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Successfully generated weekly slots',
        'slots_created', slots_created
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'message', 'Failed to generate slots: ' || SQLERRM
    );
END;
$$;


--
-- Name: get_boost_level(numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_boost_level(p_boost_amount numeric) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    boost_hours DECIMAL;
    max_boost_hours INTEGER := 4; -- Maximum boost: 4 hours (200 points)
BEGIN
    -- Calculate boost hours: 50 points = 1 hour
    boost_hours := FLOOR(p_boost_amount / 50.0);
    
    -- Cap at maximum boost hours
    IF boost_hours > max_boost_hours THEN
        boost_hours := max_boost_hours;
    END IF;
    
    RETURN boost_hours::INTEGER;
END;
$$;


--
-- Name: get_chat_last_seen(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_chat_last_seen(p_user_id uuid, p_meeting_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_seen timestamptz;
BEGIN
  SELECT last_seen_at INTO v_seen
  FROM public.chat_last_seen
  WHERE user_id = p_user_id AND meeting_id = p_meeting_id
  LIMIT 1;

  RETURN jsonb_build_object('success', true, 'has_seen', v_seen IS NOT NULL, 'last_seen_at', v_seen);
END;
$$;


--
-- Name: get_current_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_user_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')::uuid;
$$;


--
-- Name: get_event_pass_tiers(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_event_pass_tiers(p_event_id text) RETURNS TABLE(event_id text, pass_type text, max_meeting_requests integer, max_boost_amount integer, price_cents integer, currency text, price_label text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT
    tier.event_id,
    tier.pass_type,
    tier.max_meeting_requests,
    tier.max_boost_amount,
    tier.price_cents,
    tier.currency,
    tier.price_label
  FROM public.event_pass_tiers tier
  WHERE tier.event_id = p_event_id
  ORDER BY CASE tier.pass_type
    WHEN 'general' THEN 1
    WHEN 'business' THEN 2
    WHEN 'vip' THEN 3
    ELSE 4
  END;
$$;


--
-- Name: get_meeting_chat_messages(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_meeting_chat_messages(p_meeting_id uuid, p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_meeting RECORD;
  v_messages jsonb;
BEGIN
  SELECT * INTO v_meeting FROM public.meetings m WHERE m.id = p_meeting_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'meeting_not_found');
  END IF;

  IF p_user_id IS DISTINCT FROM v_meeting.requester_id
     AND p_user_id IS DISTINCT FROM v_meeting.host_id
     AND p_user_id IS DISTINCT FROM v_meeting.attendee_id
     AND NOT EXISTS (
       SELECT 1 FROM public.bsl_speakers s
       WHERE s.id::text = v_meeting.speaker_id::text AND s.user_id = p_user_id
     ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_participant');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'meeting_id', m.meeting_id,
      'sender_id', m.sender_id,
      'ciphertext', m.ciphertext,
      'nonce', m.nonce,
      'message_type', m.message_type,
      'is_read', m.is_read,
      'created_at', m.created_at
    )
    ORDER BY m.created_at ASC
  ) INTO v_messages
  FROM public.meeting_chat_messages m
  WHERE m.meeting_id = p_meeting_id;

  RETURN jsonb_build_object('success', true, 'messages', COALESCE(v_messages, '[]'::jsonb));
END;
$$;


--
-- Name: get_meeting_chat_participant(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_meeting_chat_participant(p_meeting_id uuid, p_other_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_meeting public.meetings%ROWTYPE;
  v_name text;
  v_avatar_url text;
BEGIN
  SELECT * INTO v_meeting FROM public.meetings WHERE id = p_meeting_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'meeting_not_found');
  END IF;

  IF auth.uid() IS NULL OR (
    auth.uid() IS DISTINCT FROM v_meeting.requester_id
    AND auth.uid() IS DISTINCT FROM v_meeting.host_id
    AND auth.uid() IS DISTINCT FROM v_meeting.attendee_id
    AND NOT EXISTS (
      SELECT 1 FROM public.bsl_speakers speaker
      WHERE speaker.id::text = v_meeting.speaker_id::text
        AND speaker.user_id = auth.uid()
    )
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  IF p_other_user_id IS DISTINCT FROM v_meeting.requester_id
    AND p_other_user_id IS DISTINCT FROM v_meeting.host_id
    AND p_other_user_id IS DISTINCT FROM v_meeting.attendee_id
    AND NOT EXISTS (
      SELECT 1 FROM public.bsl_speakers speaker
      WHERE speaker.id::text = v_meeting.speaker_id::text
        AND speaker.user_id = p_other_user_id
    ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_participant');
  END IF;

  SELECT NULLIF(speaker.name, ''), NULLIF(speaker.imageurl, '')
  INTO v_name, v_avatar_url
  FROM public.bsl_speakers speaker
  WHERE speaker.user_id = p_other_user_id
  LIMIT 1;

  IF v_name IS NULL OR v_avatar_url IS NULL THEN
    SELECT
      COALESCE(v_name, NULLIF(profile.display_name, ''), NULLIF(profile.full_name, '')),
      COALESCE(v_avatar_url, NULLIF(profile.avatar_url, ''))
    INTO v_name, v_avatar_url
    FROM public.user_profiles profile
    WHERE profile.user_id::text = p_other_user_id::text
    LIMIT 1;
  END IF;

  IF v_name IS NULL OR v_avatar_url IS NULL THEN
    SELECT
      COALESCE(v_name, NULLIF(profile.full_name, ''), NULLIF(registry.full_name, '')),
      COALESCE(v_avatar_url, NULLIF(profile.avatar_url, ''), NULLIF(registry.avatar_url, ''))
    INTO v_name, v_avatar_url
    FROM public."user" registry
    LEFT JOIN public.profiles profile ON profile.id = registry.id
    WHERE registry.auth_user_id = p_other_user_id::text
       OR registry.provider_ids->>'supabase' = p_other_user_id::text
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'name', v_name,
    'avatar_url', v_avatar_url
  );
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: meeting_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    requester_id uuid NOT NULL,
    speaker_id uuid NOT NULL,
    event_id text DEFAULT 'bsl2025'::text NOT NULL,
    speaker_name text NOT NULL,
    requester_name text,
    requester_company text,
    requester_title text,
    requester_ticket_type text,
    preferred_date text,
    preferred_time text,
    duration_minutes integer DEFAULT 15 NOT NULL,
    meeting_type text DEFAULT 'networking'::text NOT NULL,
    message text DEFAULT ''::text NOT NULL,
    note text,
    boost_amount numeric(10,2) DEFAULT 0 NOT NULL,
    boost_transaction_hash text,
    status text DEFAULT 'pending'::text NOT NULL,
    priority_score integer DEFAULT 50 NOT NULL,
    availability_window_start timestamp with time zone,
    availability_window_end timestamp with time zone,
    scheduled_at timestamp with time zone,
    meeting_scheduled_at timestamp with time zone,
    meeting_location text,
    location text,
    meeting_link text,
    meeting_id uuid,
    speaker_response text,
    speaker_response_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '3 days'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT meeting_requests_requester_ticket_type_check CHECK ((requester_ticket_type = ANY (ARRAY['general'::text, 'business'::text, 'vip'::text]))),
    CONSTRAINT meeting_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'requested'::text, 'approved'::text, 'accepted'::text, 'declined'::text, 'rejected'::text, 'expired'::text, 'cancelled'::text, 'completed'::text, 'confirmed'::text])))
);


--
-- Name: get_meeting_requests_for_speaker(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_meeting_requests_for_speaker(p_user_id text, p_speaker_id text) RETURNS SETOF public.meeting_requests
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_speaker RECORD;
  v_event_id text := COALESCE(NULLIF(current_setting('app.event_id', true), ''), 'bsl2025');
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT mr.*
  FROM public.meeting_requests mr
  WHERE mr.event_id = v_event_id
    AND (
      mr.requester_id::text = p_user_id
      OR mr.speaker_id = v_speaker.user_id
    )
  ORDER BY mr.created_at DESC;
END;
$$;


--
-- Name: get_notification_priority(text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_notification_priority(p_ticket_type text, p_boost_amount numeric) RETURNS integer
    LANGUAGE plpgsql
    AS $_$
DECLARE
    priority_score INTEGER := 50; -- Default priority
BEGIN
    -- Base priority by ticket type
    IF p_ticket_type = 'vip' THEN
        priority_score := 80;
    ELSIF p_ticket_type = 'business' THEN
        priority_score := 60;
    ELSE
        priority_score := 50;
    END IF;
    
    -- Add boost bonus (each $1 of boost adds 1 point, max 20 points)
    IF p_boost_amount > 0 THEN
        priority_score := priority_score + LEAST(p_boost_amount::INTEGER, 20);
    END IF;
    
    RETURN priority_score;
END;
$_$;


--
-- Name: get_or_create_user_balance(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_or_create_user_balance(p_user_id uuid, p_token_symbol text DEFAULT 'LUKAS'::text) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_balance NUMERIC(20, 8);
BEGIN
    SELECT balance INTO v_balance
    FROM public.user_balances
    WHERE user_id = p_user_id AND token_symbol = p_token_symbol;

    IF v_balance IS NULL THEN
        INSERT INTO public.user_balances (user_id, token_symbol, balance)
        VALUES (p_user_id, p_token_symbol, 0)
        ON CONFLICT (user_id, token_symbol) DO NOTHING
        RETURNING balance INTO v_balance;

        IF v_balance IS NULL THEN
            SELECT balance INTO v_balance
            FROM public.user_balances
            WHERE user_id = p_user_id AND token_symbol = p_token_symbol;
        END IF;
    END IF;

    RETURN COALESCE(v_balance, 0);
END;
$$;


--
-- Name: get_pass_type_limits(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pass_type_limits(p_pass_type text) RETURNS TABLE(max_requests integer, max_boost integer, daily_limit integer, weekly_limit integer, monthly_limit integer)
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE p_pass_type
      WHEN 'vip' THEN 100
      WHEN 'business' THEN 50
      ELSE 10
    END,
    CASE p_pass_type
      WHEN 'vip' THEN 1000
      WHEN 'business' THEN 500
      ELSE 100
    END,
    CASE p_pass_type
      WHEN 'vip' THEN 20
      WHEN 'business' THEN 10
      ELSE 3
    END,
    CASE p_pass_type
      WHEN 'vip' THEN 100
      WHEN 'business' THEN 50
      ELSE 10
    END,
    CASE p_pass_type
      WHEN 'vip' THEN 300
      WHEN 'business' THEN 150
      ELSE 30
    END;
END;
$$;


--
-- Name: get_pass_type_limits(public.pass_type); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pass_type_limits(p_pass_type public.pass_type) RETURNS TABLE(max_requests integer, max_boost numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY SELECT 
        CASE 
            WHEN p_pass_type = 'vip' THEN 50
            WHEN p_pass_type = 'business' THEN 20
            ELSE 5
        END as max_requests,
        CASE 
            WHEN p_pass_type = 'vip' THEN 1000.00
            WHEN p_pass_type = 'business' THEN 500.00
            ELSE 100.00
        END as max_boost;
END;
$$;


--
-- Name: FUNCTION get_pass_type_limits(p_pass_type public.pass_type); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_pass_type_limits(p_pass_type public.pass_type) IS 'Returns the request limits for a given pass type.';


--
-- Name: get_speaker_available_slots(text, date, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_speaker_available_slots(p_speaker_id text, p_date date DEFAULT NULL::date, p_duration_minutes integer DEFAULT 15, p_requester_id text DEFAULT NULL::text, p_event_id text DEFAULT NULL::text) RETURNS TABLE(slot_time timestamp with time zone, date date, start_time time without time zone, end_time time without time zone, duration_minutes integer, is_available boolean)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_speaker RECORD;
  v_requester_uuid uuid;
  v_event_id text := NULLIF(trim(COALESCE(p_event_id, '')), '');
  v_event_starts_at timestamptz;
  v_event_ends_at timestamptz;
  v_event_timezone text;
BEGIN
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'A valid event id is required';
  END IF;

  SELECT e.starts_at, e.ends_at, COALESCE(e.timezone, 'UTC')
  INTO v_event_starts_at, v_event_ends_at, v_event_timezone
  FROM public.events e
  WHERE e.id = v_event_id;

  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL
     OR NOT COALESCE(v_speaker.is_active, false)
     OR NOT COALESCE(v_speaker.is_accepting_meetings, true) THEN
    RETURN;
  END IF;

  IF p_requester_id IS NOT NULL THEN
    BEGIN
      v_requester_uuid := p_requester_id::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_requester_uuid := NULL;
    END;
  END IF;

  RETURN QUERY
  WITH day_bounds AS (
    SELECT generate_series(
      date_trunc('day', v_event_starts_at AT TIME ZONE v_event_timezone),
      date_trunc('day', v_event_ends_at AT TIME ZONE v_event_timezone),
      interval '1 day'
    ) AS day_local
    WHERE v_event_starts_at IS NOT NULL AND v_event_ends_at IS NOT NULL
  ),
  generated_slots AS (
    SELECT
      ((db.day_local + make_interval(hours => wh_hour.hour, mins => wh_minute.minute))
        AT TIME ZONE v_event_timezone) AS slot_time
    FROM day_bounds db
    CROSS JOIN generate_series(7, 18) AS wh_hour(hour)
    CROSS JOIN (VALUES (0), (15), (30), (45)) AS wh_minute(minute)
  ),
  default_free_candidates AS (
    SELECT
      gs.slot_time,
      gs.slot_time::date AS date,
      gs.slot_time::time AS start_time,
      (gs.slot_time + (p_duration_minutes || ' minutes')::interval)::time AS end_time
    FROM generated_slots gs
    WHERE gs.slot_time >= GREATEST(now(), v_event_starts_at)
      AND gs.slot_time < v_event_ends_at
      AND (p_date IS NULL OR gs.slot_time::date = p_date)
      AND NOT EXISTS (
        SELECT 1 FROM public.meeting_slots ms
        WHERE ms.user_id = v_speaker.user_id
          AND ms.start_time = gs.slot_time
          AND ms.status <> 'available'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_agenda_status uas
        WHERE uas.user_id = v_speaker.user_id
          AND uas.event_id = v_event_id
          AND uas.slot_time = gs.slot_time
          AND NOT (
            uas.agenda_id IS NULL
            AND uas.meeting_id IS NULL
            AND COALESCE(uas.slot_status, '') IN ('available', 'interested')
          )
      )
  ),
  legacy_explicit_candidates AS (
    -- Only reachable for tenants with no configured event window, where
    -- day_bounds/generated_slots/default_free_candidates are empty above.
    SELECT
      ms.start_time AS slot_time,
      ms.start_time::date AS date,
      ms.start_time::time AS start_time,
      ms.end_time::time AS end_time
    FROM public.meeting_slots ms
    WHERE v_event_starts_at IS NULL
      AND ms.user_id = v_speaker.user_id
      AND ms.status = 'available'
      AND (p_date IS NULL OR ms.start_time::date = p_date)
      AND ms.start_time >= now()

    UNION

    SELECT
      uas.slot_time,
      uas.slot_time::date AS date,
      uas.slot_time::time AS start_time,
      (uas.slot_time + (p_duration_minutes || ' minutes')::interval)::time AS end_time
    FROM public.user_agenda_status uas
    WHERE v_event_starts_at IS NULL
      AND uas.user_id = v_speaker.user_id
      AND uas.event_id = v_event_id
      AND uas.slot_time IS NOT NULL
      AND uas.slot_status IN ('available', 'interested')
      AND (p_date IS NULL OR uas.slot_time::date = p_date)
      AND uas.slot_time >= now()
  ),
  candidate_slots AS (
    SELECT * FROM default_free_candidates
    UNION
    SELECT * FROM legacy_explicit_candidates
  )
  SELECT
    c.slot_time,
    c.date,
    c.start_time,
    c.end_time,
    p_duration_minutes,
    true
  FROM candidate_slots c
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.meetings m
    WHERE (
      m.speaker_id::text = v_speaker.id
      OR m.host_id = v_speaker.user_id
      OR m.requester_id = v_speaker.user_id
    )
      AND m.status IN ('scheduled', 'confirmed', 'tentative', 'in_progress')
      AND (
        (m.scheduled_at <= c.slot_time AND m.end_time > c.slot_time)
        OR (c.slot_time <= m.scheduled_at
          AND (c.slot_time + (p_duration_minutes || ' minutes')::interval) > m.scheduled_at)
      )
  )
  AND (
    v_requester_uuid IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.meetings m
      WHERE m.requester_id = v_requester_uuid
        AND m.status IN ('scheduled', 'confirmed', 'tentative', 'in_progress')
        AND (
          (m.scheduled_at <= c.slot_time AND m.end_time > c.slot_time)
          OR (c.slot_time <= m.scheduled_at
            AND (c.slot_time + (p_duration_minutes || ' minutes')::interval) > m.scheduled_at)
        )
    )
  )
  ORDER BY c.slot_time;
END;
$$;


--
-- Name: get_speaker_by_id_or_slug(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_speaker_by_id_or_slug(p_id text) RETURNS TABLE(id text, name text, title text, company text, bio text, imageurl text, linkedin text, twitter text, tags text[], availability jsonb, user_id uuid, is_active boolean, is_accepting_meetings boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id::text,
    s.name,
    s.title,
    s.company,
    s.bio,
    s.imageurl,
    s.linkedin,
    s.twitter,
    s.tags,
    s.availability,
    s.user_id,
    s.is_active,
    s.is_accepting_meetings,
    s.created_at,
    s.updated_at
  FROM public.bsl_speakers s
  WHERE s.id::text = p_id
     OR lower(s.name) = lower(p_id)
     OR lower(COALESCE(to_jsonb(s)->>'slug', '')) = lower(p_id)
     OR s.user_id::text = p_id
  LIMIT 1;
END;
$$;


--
-- Name: get_user_balance(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_balance(p_user_id uuid, p_token_symbol text DEFAULT 'LUKAS'::text) RETURNS numeric
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_balance NUMERIC(20, 8);
BEGIN
    SELECT balance INTO v_balance
    FROM public.user_balances
    WHERE user_id = p_user_id AND token_symbol = p_token_symbol;

    RETURN COALESCE(v_balance, 0);
END;
$$;


--
-- Name: FUNCTION get_user_balance(p_user_id uuid, p_token_symbol text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_user_balance(p_user_id uuid, p_token_symbol text) IS 'Gets user balance for a specific token (defaults to LUKAS); returns 0 if no balance row exists';


--
-- Name: get_user_chat_public_key(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_chat_public_key(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_key text;
BEGIN
  SELECT public_key INTO v_key FROM public.user_chat_keys WHERE user_id = p_user_id;
  IF v_key IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'key_not_found');
  END IF;
  RETURN jsonb_build_object('success', true, 'public_key', v_key);
END;
$$;


--
-- Name: get_user_email_tracking(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_email_tracking(p_user_id uuid) RETURNS TABLE(email_type text, sent_at timestamp with time zone, locale text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        uet.email_type,
        uet.sent_at,
        uet.locale
    FROM public.user_email_tracking uet
    WHERE uet.user_id = p_user_id
    ORDER BY uet.sent_at DESC;
END;
$$;


--
-- Name: FUNCTION get_user_email_tracking(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.get_user_email_tracking(p_user_id uuid) IS 'Gets all email tracking records for a user';


--
-- Name: get_user_meeting_request_counts(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_meeting_request_counts(p_user_id text) RETURNS TABLE(total_requests bigint, accepted_requests bigint, approved_requests bigint, pending_requests bigint, declined_requests bigint, cancelled_requests bigint, remaining_requests integer, remaining_boost numeric, max_requests integer, max_boost numeric, pass_type text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_event_id text := COALESCE(NULLIF(current_setting('app.event_id', true), ''), 'bsl2025');
  v_pass RECORD;
  v_total bigint := 0;
  v_accepted bigint := 0;
  v_approved bigint := 0;
  v_pending bigint := 0;
  v_declined bigint := 0;
  v_cancelled bigint := 0;
BEGIN
  SELECT
    p.id,
    p.pass_type::text AS pass_type,
    p.max_meeting_requests,
    p.max_boost_amount,
    p.used_meeting_requests,
    p.used_boost_amount
  INTO v_pass
  FROM public.passes p
  WHERE p.user_id = p_user_id
    AND p.event_id = v_event_id
    AND p.status = 'active'
  ORDER BY p.created_at DESC
  LIMIT 1;

  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE status IN ('accepted', 'approved'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('accepted', 'approved'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('pending', 'requested'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('declined', 'rejected'))::bigint,
    COUNT(*) FILTER (WHERE status = 'cancelled')::bigint
  INTO v_total, v_accepted, v_approved, v_pending, v_declined, v_cancelled
  FROM public.meeting_requests
  WHERE requester_id::text = p_user_id
    AND event_id = v_event_id
    AND status NOT IN ('cancelled', 'expired');

  RETURN QUERY
  SELECT
    v_total,
    v_accepted,
    v_approved,
    v_pending,
    v_declined,
    v_cancelled,
    GREATEST(0, COALESCE(v_pass.max_meeting_requests, 0) - v_total::int),
    GREATEST(0, COALESCE(v_pass.max_boost_amount, 0) - COALESCE(v_pass.used_boost_amount, 0)),
    COALESCE(v_pass.max_meeting_requests, 0),
    COALESCE(v_pass.max_boost_amount, 0),
    COALESCE(v_pass.pass_type, 'general');
END;
$$;


--
-- Name: get_user_meeting_request_counts(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_meeting_request_counts(p_user_id text, p_event_id text) RETURNS TABLE(total_requests bigint, accepted_requests bigint, approved_requests bigint, pending_requests bigint, declined_requests bigint, cancelled_requests bigint, remaining_requests integer, remaining_boost numeric, max_requests integer, max_boost numeric, pass_type text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_event_id text := NULLIF(trim(COALESCE(p_event_id, '')), '');
  v_pass RECORD;
  v_accepted bigint := 0;
  v_approved bigint := 0;
  v_pending bigint := 0;
  v_declined bigint := 0;
  v_cancelled bigint := 0;
BEGIN
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'A valid event id is required';
  END IF;

  SELECT
    p.id,
    p.pass_type::text AS pass_type,
    p.max_meeting_requests,
    p.max_boost_amount,
    p.used_meeting_requests,
    p.used_boost_amount
  INTO v_pass
  FROM public.passes p
  WHERE p.user_id::text = p_user_id
    AND p.event_id = v_event_id
    AND p.status = 'active'
  ORDER BY p.created_at DESC
  LIMIT 1;

  SELECT
    COUNT(*) FILTER (WHERE status IN ('accepted', 'approved'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('accepted', 'approved'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('pending', 'requested'))::bigint,
    COUNT(*) FILTER (WHERE status IN ('declined', 'rejected'))::bigint,
    COUNT(*) FILTER (WHERE status = 'cancelled')::bigint
  INTO v_accepted, v_approved, v_pending, v_declined, v_cancelled
  FROM public.meeting_requests
  WHERE requester_id::text = p_user_id
    AND event_id = v_event_id;

  RETURN QUERY
  SELECT
    COALESCE(v_pass.used_meeting_requests, 0)::bigint,
    v_accepted,
    v_approved,
    v_pending,
    v_declined,
    v_cancelled,
    GREATEST(0, COALESCE(v_pass.max_meeting_requests, 0) - COALESCE(v_pass.used_meeting_requests, 0)),
    GREATEST(0, COALESCE(v_pass.max_boost_amount, 0) - COALESCE(v_pass.used_boost_amount, 0)),
    COALESCE(v_pass.max_meeting_requests, 0),
    COALESCE(v_pass.max_boost_amount, 0),
    COALESCE(v_pass.pass_type, 'general');
END;
$$;


--
-- Name: get_user_pass_info(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_pass_info(p_user_id uuid) RETURNS TABLE(pass_id text, pass_type public.pass_type, status public.pass_status, pass_number text, max_requests integer, used_requests integer, remaining_requests integer, max_boost numeric, used_boost numeric, remaining_boost numeric, access_features text[], special_perks text[])
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.pass_type,
        p.status,
        p.pass_number,
        p.max_meeting_requests,
        p.used_meeting_requests,
        (p.max_meeting_requests - p.used_meeting_requests),
        p.max_boost_amount,
        p.used_boost_amount,
        (p.max_boost_amount - p.used_boost_amount),
        p.access_features,
        p.special_perks
    FROM passes p
    WHERE p.user_id = p_user_id 
    AND p.event_id = 'bsl2025' 
    AND p.status = 'active';
END;
$$;


--
-- Name: get_user_transactions(uuid, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_transactions(p_user_id uuid, p_token_symbol text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, token_symbol text, transaction_type public.reward_transaction_type, amount numeric, balance_after numeric, source public.reward_source, reference_id uuid, reference_type text, description text, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT
        rt.id, rt.token_symbol, rt.transaction_type, rt.amount, rt.balance_after,
        rt.source, rt.reference_id, rt.reference_type, rt.description, rt.created_at
    FROM public.reward_transactions rt
    WHERE rt.user_id = p_user_id
    AND (p_token_symbol IS NULL OR rt.token_symbol = p_token_symbol)
    ORDER BY rt.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;


--
-- Name: handle_auth_user_deleted(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_auth_user_deleted() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public."user"
  SET status = 'deleted', deleted_at = now(), updated_at = now()
  WHERE auth_user_id = OLD.id::text
     OR email = lower(coalesce(OLD.email, ''));
  RETURN OLD;
END;
$$;


--
-- Name: handle_booking_status_change(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_booking_status_change(booking_id text, new_status text, user_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_booking RECORD;
  v_normalized_status text;
  v_attendee_email text;
BEGIN
  SELECT * INTO v_booking
  FROM public.meetings
  WHERE id = booking_id::uuid
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'booking_not_found');
  END IF;

  IF v_booking.host_id::text <> user_id AND v_booking.attendee_id::text <> user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  v_normalized_status := CASE new_status
    WHEN 'accepted' THEN 'confirmed'
    WHEN 'confirmed' THEN 'confirmed'
    WHEN 'rejected' THEN 'cancelled'
    WHEN 'cancelled' THEN 'cancelled'
    ELSE new_status
  END;

  UPDATE public.meetings
  SET status = v_normalized_status, updated_at = now()
  WHERE id = v_booking.id;

  IF v_booking.slot_id IS NOT NULL THEN
    UPDATE public.meeting_slots
    SET
      status = CASE v_normalized_status
        WHEN 'confirmed' THEN 'booked'
        WHEN 'cancelled' THEN 'available'
        ELSE status
      END,
      meeting_id = CASE WHEN v_normalized_status = 'cancelled' THEN NULL ELSE meeting_id END,
      updated_at = now()
    WHERE id = v_booking.slot_id;
  END IF;

  SELECT p.email INTO v_attendee_email
  FROM public.profiles p
  WHERE p.id = v_booking.attendee_id;

  RETURN jsonb_build_object(
    'success', true,
    'meeting_id', v_booking.id,
    'status', v_normalized_status,
    'attendee_email', v_attendee_email,
    'start_time', v_booking.start_time,
    'location', v_booking.location
  );
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    pass_id TEXT;
    user_email TEXT;
    user_locale TEXT := 'en';
BEGIN
    -- Create a default pass for new users
    SELECT create_default_pass(NEW.id, 'general') INTO pass_id;
    
    -- Log the pass creation
    RAISE NOTICE 'Created default pass % for new user %', pass_id, NEW.id;
    
    -- Get user email and locale from metadata
    user_email := COALESCE(NEW.email, NEW.raw_user_meta_data->>'email');
    user_locale := COALESCE(NEW.raw_user_meta_data->>'locale', 'en');
    
    -- Queue welcome email (actual sending will be done by application)
    -- We create a tracking record with sent_at = NOW() but the application
    -- should check and send the email asynchronously
    INSERT INTO public.user_email_tracking (user_id, email_type, locale, sent_at)
    VALUES (NEW.id, 'welcome', user_locale, NOW())
    ON CONFLICT (user_id, email_type)
    DO NOTHING;
    
    RAISE NOTICE 'Queued welcome email for user % (email: %, locale: %)', NEW.id, user_email, user_locale;
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log the error but don't prevent user creation
    RAISE WARNING 'Failed to create default pass or queue welcome email for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION handle_new_user(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.handle_new_user() IS 'Automatically creates a default pass when a new user signs up.';


--
-- Name: handle_user_deletion_email_tracking(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_user_deletion_email_tracking() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- Delete email tracking records when user is deleted
    DELETE FROM public.user_email_tracking
    WHERE user_id = OLD.id;
    
    RETURN OLD;
END;
$$;


--
-- Name: has_email_been_sent(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_email_been_sent(p_user_id uuid, p_email_type text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_sent BOOLEAN;
    v_current_user_id UUID;
BEGIN
    -- Get current authenticated user ID
    v_current_user_id := auth.uid();
    
    -- Security check: users can only check their own email tracking
    -- Service role can check any user's tracking
    IF v_current_user_id IS NULL THEN
        -- No authenticated user, deny access
        RAISE EXCEPTION 'Authentication required';
    END IF;
    
    IF v_current_user_id != p_user_id AND (auth.jwt() ->> 'role') != 'service_role' THEN
        -- User is trying to check another user's tracking, deny access
        RAISE EXCEPTION 'Access denied: can only check own email tracking';
    END IF;
    
    -- Check if email has been sent
    SELECT EXISTS(
        SELECT 1 
        FROM public.user_email_tracking 
        WHERE user_id = p_user_id 
        AND email_type = p_email_type
    ) INTO v_sent;
    
    RETURN v_sent;
END;
$$;


--
-- Name: FUNCTION has_email_been_sent(p_user_id uuid, p_email_type text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.has_email_been_sent(p_user_id uuid, p_email_type text) IS 'Checks if a specific email type has been sent to a user';


--
-- Name: has_event_admin_access(uuid, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_event_admin_access(p_user_id uuid, p_event_id text, p_include_moderator boolean DEFAULT false) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
      AND ur.role IN ('admin'::public.user_role, 'super_admin'::public.user_role)
      AND (ur.expires_at IS NULL OR ur.expires_at > now())
  ) OR EXISTS (
    SELECT 1
    FROM public.event_roles er
    WHERE er.user_id = p_user_id
      AND (er.expires_at IS NULL OR er.expires_at > now())
      AND (er.role = 'event_admin'::public.event_role
        OR (p_include_moderator AND er.role = 'moderator'::public.event_role))
      AND (
        er.event_id = p_event_id
        OR EXISTS (
          SELECT 1
          FROM public.events target_event
          WHERE target_event.id = p_event_id
            AND target_event.metadata ->> 'hubEventId' = er.event_id
        )
      )
  );
$$;


--
-- Name: insert_meeting_request(text, text, text, text, text, text, text, text, text, text, numeric, integer, timestamp with time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.insert_meeting_request(p_requester_id text, p_speaker_id text, p_speaker_name text, p_requester_name text, p_requester_company text, p_requester_title text, p_requester_ticket_type text, p_meeting_type text, p_message text, p_note text DEFAULT NULL::text, p_boost_amount numeric DEFAULT 0, p_duration_minutes integer DEFAULT 15, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_event_id text DEFAULT NULL::text) RETURNS TABLE(id uuid, requester_id uuid, speaker_id uuid, status text, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_speaker RECORD;
  v_request_id uuid := gen_random_uuid();
  v_consumed_pass_id text;
  v_event_id text := NULLIF(trim(COALESCE(p_event_id, '')), '');
BEGIN
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'A valid event id is required';
  END IF;

  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL THEN
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

  INSERT INTO public.meeting_requests (
    id, requester_id, speaker_id, event_id, speaker_name, requester_name,
    requester_company, requester_title, requester_ticket_type, meeting_type,
    message, note, boost_amount, duration_minutes, expires_at, status,
    created_at, updated_at
  ) VALUES (
    v_request_id, p_requester_id::uuid, v_speaker.user_id, v_event_id,
    p_speaker_name, p_requester_name, p_requester_company, p_requester_title,
    p_requester_ticket_type, COALESCE(NULLIF(p_meeting_type, ''), 'networking'),
    COALESCE(p_message, ''), p_note, COALESCE(p_boost_amount, 0),
    COALESCE(p_duration_minutes, 15), COALESCE(p_expires_at, now() + interval '3 days'),
    'pending', now(), now()
  );

  -- The conditional update serializes concurrent sends and ensures this exact
  -- event's newest active pass is consumed once for each persisted request.
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

  PERFORM public.send_prioritized_notification(
    v_speaker.id::text, p_requester_name, p_requester_company,
    p_requester_ticket_type, COALESCE(p_boost_amount, 0), v_request_id
  );

  RETURN QUERY
  SELECT v_request_id, p_requester_id::uuid, v_speaker.user_id, 'pending', now();
END;
$$;


--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin(p_user_id uuid) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id
    AND role IN ('admin'::public.user_role, 'super_admin'::public.user_role)
    AND (expires_at IS NULL OR expires_at > now())
  );
END;
$$;


--
-- Name: is_speaker_active(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_speaker_active(p_speaker_id text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_speaker RECORD;
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  RETURN COALESCE(v_speaker.is_active, false);
END;
$$;


--
-- Name: is_speaker_online(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_speaker_online(p_speaker_id text) RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_speaker RECORD;
  v_last_sign_in timestamptz;
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT COALESCE(v_speaker.is_active, false) THEN
    RETURN false;
  END IF;

  SELECT last_sign_in_at INTO v_last_sign_in
  FROM auth.users
  WHERE id = v_speaker.user_id;

  RETURN v_last_sign_in IS NOT NULL AND v_last_sign_in > now() - interval '5 minutes';
END;
$$;


--
-- Name: is_super_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin(p_user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id
      AND role = 'super_admin'::public.user_role
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;


--
-- Name: list_support_events(uuid, uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_support_events(p_ticket_id uuid, p_visitor_id uuid, p_cursor text DEFAULT NULL::text, p_limit integer DEFAULT 30) RETURNS TABLE(cursor text, event_type text, occurred_at timestamp with time zone, payload jsonb)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.support_tickets st WHERE st.id = p_ticket_id AND st.visitor_id = p_visitor_id
  ) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  RETURN QUERY
  WITH combined AS (
    SELECT
      to_char(m.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || ':' || m.id::text AS cursor,
      'message.created'::text AS event_type,
      m.created_at AS occurred_at,
      jsonb_build_object(
        'id', m.id, 'ticketId', m.ticket_id, 'author', m.author,
        'body', m.body, 'createdAt', m.created_at, 'deliveryStatus', m.delivery_status
      ) AS payload
    FROM public.support_messages m
    WHERE m.ticket_id = p_ticket_id

    UNION ALL

    SELECT
      to_char(t.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || ':' || t.id::text AS cursor,
      'ticket.updated'::text AS event_type,
      t.updated_at AS occurred_at,
      jsonb_build_object(
        'id', t.id, 'subject', t.subject, 'status', t.status, 'priority', t.priority,
        'createdAt', t.created_at, 'updatedAt', t.updated_at
      ) AS payload
    FROM public.support_tickets t
    WHERE t.id = p_ticket_id
  )
  SELECT c.cursor, c.event_type, c.occurred_at, c.payload
  FROM combined c
  WHERE p_cursor IS NULL OR c.cursor > p_cursor
  ORDER BY c.cursor ASC
  LIMIT v_limit;
END;
$$;


--
-- Name: list_support_messages(uuid, uuid, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_support_messages(p_ticket_id uuid, p_visitor_id uuid, p_cursor uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 30) RETURNS TABLE(id uuid, ticket_id uuid, author text, body text, delivery_status text, created_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_cursor_created_at timestamptz;
  v_cursor_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.support_tickets st WHERE st.id = p_ticket_id AND st.visitor_id = p_visitor_id
  ) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  IF p_cursor IS NOT NULL THEN
    SELECT sm.created_at, sm.id INTO v_cursor_created_at, v_cursor_id
    FROM public.support_messages sm WHERE sm.id = p_cursor AND sm.ticket_id = p_ticket_id;
  END IF;

  RETURN QUERY
  SELECT m.id, m.ticket_id, m.author, m.body, m.delivery_status, m.created_at
  FROM public.support_messages m
  WHERE m.ticket_id = p_ticket_id
    AND (v_cursor_id IS NULL OR (m.created_at, m.id) > (v_cursor_created_at, v_cursor_id))
  ORDER BY m.created_at ASC, m.id ASC
  LIMIT v_limit;
END;
$$;


--
-- Name: list_support_tickets_admin(text, text, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_support_tickets_admin(p_app_id text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_cursor uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS TABLE(id uuid, app_id text, visitor_id uuid, subject text, status text, priority text, needs_human boolean, context jsonb, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_cursor_updated_at timestamptz;
  v_cursor_id uuid;
BEGIN
  IF p_cursor IS NOT NULL THEN
    SELECT st.updated_at, st.id INTO v_cursor_updated_at, v_cursor_id
    FROM public.support_tickets st WHERE st.id = p_cursor;
  END IF;

  RETURN QUERY
  SELECT t.id, t.app_id, t.visitor_id, t.subject, t.status, t.priority,
         t.needs_human, t.context, t.created_at, t.updated_at
  FROM public.support_tickets t
  WHERE (p_app_id IS NULL OR t.app_id = p_app_id)
    AND (p_status IS NULL OR t.status = p_status)
    AND (v_cursor_id IS NULL OR (t.updated_at, t.id) < (v_cursor_updated_at, v_cursor_id))
  ORDER BY t.updated_at DESC, t.id DESC
  LIMIT v_limit;
END;
$$;


--
-- Name: list_support_tickets_for_visitor(uuid, text, uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_support_tickets_for_visitor(p_visitor_id uuid, p_status text DEFAULT NULL::text, p_cursor uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 20) RETURNS TABLE(id uuid, app_id text, visitor_id uuid, subject text, status text, priority text, needs_human boolean, context jsonb, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_cursor_updated_at timestamptz;
  v_cursor_id uuid;
BEGIN
  IF p_cursor IS NOT NULL THEN
    SELECT st.updated_at, st.id INTO v_cursor_updated_at, v_cursor_id
    FROM public.support_tickets st WHERE st.id = p_cursor AND st.visitor_id = p_visitor_id;
  END IF;

  RETURN QUERY
  SELECT t.id, t.app_id, t.visitor_id, t.subject, t.status, t.priority,
         t.needs_human, t.context, t.created_at, t.updated_at
  FROM public.support_tickets t
  WHERE t.visitor_id = p_visitor_id
    AND (p_status IS NULL OR t.status = p_status)
    AND (v_cursor_id IS NULL OR (t.updated_at, t.id) < (v_cursor_updated_at, v_cursor_id))
  ORDER BY t.updated_at DESC, t.id DESC
  LIMIT v_limit;
END;
$$;


--
-- Name: mark_email_as_sent(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_email_as_sent(p_user_id uuid, p_email_type text, p_locale text DEFAULT 'en'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_tracking_id UUID;
BEGIN
    INSERT INTO public.user_email_tracking (user_id, email_type, locale, sent_at)
    VALUES (p_user_id, p_email_type, p_locale, NOW())
    ON CONFLICT (user_id, email_type)
    DO UPDATE SET
        sent_at = NOW(),
        locale = p_locale
    RETURNING id INTO v_tracking_id;
    
    RETURN v_tracking_id;
END;
$$;


--
-- Name: FUNCTION mark_email_as_sent(p_user_id uuid, p_email_type text, p_locale text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.mark_email_as_sent(p_user_id uuid, p_email_type text, p_locale text) IS 'Marks an email as sent for a user';


--
-- Name: mark_ticket_read(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_ticket_read(p_ticket_id uuid, p_visitor_id uuid, p_cursor text DEFAULT NULL::text) RETURNS TABLE(id uuid, app_id text, visitor_id uuid, subject text, status text, priority text, needs_human boolean, context jsonb, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.support_tickets st WHERE st.id = p_ticket_id AND st.visitor_id = p_visitor_id
  ) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  INSERT INTO public.support_ticket_reads (ticket_id, visitor_id, last_read_cursor, updated_at)
  VALUES (p_ticket_id, p_visitor_id, p_cursor, now())
  ON CONFLICT (ticket_id, visitor_id)
  DO UPDATE SET last_read_cursor = EXCLUDED.last_read_cursor, updated_at = now();

  RETURN QUERY
  SELECT t.id, t.app_id, t.visitor_id, t.subject, t.status, t.priority,
         t.needs_human, t.context, t.created_at, t.updated_at
  FROM public.support_tickets t WHERE t.id = p_ticket_id;
END;
$$;


--
-- Name: notify_meeting_request_created(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_meeting_request_created() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    can_request BOOLEAN;
    reason TEXT;
    user_pass_type pass_type;
    remaining_requests INTEGER;
    remaining_boost DECIMAL;
BEGIN
    -- Check if user can make meeting request
    SELECT * INTO can_request, reason, user_pass_type, remaining_requests, remaining_boost
    FROM can_make_meeting_request(NEW.requester_id, NEW.speaker_id, NEW.boost_amount);
    
    IF NOT can_request THEN
        -- Raise exception to prevent meeting request creation
        RAISE EXCEPTION 'Cannot create meeting request: %', reason;
    END IF;
    
    -- Update pass usage
    PERFORM update_pass_after_request(NEW.requester_id, NEW.boost_amount);
    
    -- Send prioritized notification (now works with TEXT speaker_id)
    PERFORM send_prioritized_notification(
        NEW.speaker_id,
        NEW.requester_name,
        NEW.requester_company,
        NEW.requester_ticket_type,
        NEW.boost_amount,
        NEW.id
    );
    
    -- Update request limits (if the function exists)
    BEGIN
        PERFORM update_request_limits_after_send(
            NEW.requester_id,
            'bsl2025', -- Event ID
            NEW.requester_ticket_type
        );
    EXCEPTION
        WHEN undefined_function THEN
            -- Function doesn't exist, skip this step
            NULL;
    END;
    
    RETURN NEW;
END;
$$;


--
-- Name: notify_meeting_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_meeting_status_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.status != NEW.status THEN
        -- Update pass based on response
        PERFORM update_pass_after_response(
            NEW.requester_id,
            NEW.id,
            NEW.status
        );
        
        -- Send notifications
        CASE NEW.status
            WHEN 'accepted' THEN
                PERFORM create_notification(
                    NEW.requester_id,
                    'meeting_accepted',
                    'Meeting Request Accepted! 🎉',
                    NEW.speaker_name || ' has accepted your meeting request',
                    NEW.id,
                    NEW.speaker_id,
                    true
                );
            WHEN 'declined' THEN
                PERFORM create_notification(
                    NEW.requester_id,
                    'meeting_declined',
                    'Meeting Request Declined',
                    NEW.speaker_name || ' has declined your meeting request. Your request and boost amount have been refunded.',
                    NEW.id,
                    NEW.speaker_id,
                    false
                );
            WHEN 'expired' THEN
                PERFORM create_notification(
                    NEW.requester_id,
                    'meeting_expired',
                    'Meeting Request Expired',
                    'Your meeting request to ' || NEW.speaker_name || ' has expired. Your request and boost amount have been refunded.',
                    NEW.id,
                    NEW.speaker_id,
                    false
                );
        END CASE;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: provision_upcoming_bsl_general_passes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.provision_upcoming_bsl_general_passes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL AND NEW.confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_upcoming_bsl_general_pass_for_user(NEW.id, 'chile2026');
  PERFORM public.create_upcoming_bsl_general_pass_for_user(NEW.id, 'colombia2026');
  RETURN NEW;
END;
$$;


--
-- Name: publish_user_chat_public_key(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.publish_user_chat_public_key(p_user_id uuid, p_public_key text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  IF length(coalesce(p_public_key, '')) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_public_key');
  END IF;

  INSERT INTO public.user_chat_keys (user_id, public_key)
  VALUES (p_user_id, p_public_key)
  ON CONFLICT (user_id) DO UPDATE SET
    public_key = EXCLUDED.public_key,
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: queue_welcome_email(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.queue_welcome_email(p_user_id uuid, p_email text, p_locale text DEFAULT 'en'::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    -- This function is a placeholder for the application to call
    -- The actual email sending will be handled by the application layer
    -- We just ensure the tracking is set up correctly
    INSERT INTO public.user_email_tracking (user_id, email_type, locale, sent_at)
    VALUES (p_user_id, 'welcome', p_locale, NOW())
    ON CONFLICT (user_id, email_type)
    DO UPDATE SET
        sent_at = NOW(),
        locale = p_locale;
END;
$$;


--
-- Name: FUNCTION queue_welcome_email(p_user_id uuid, p_email text, p_locale text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.queue_welcome_email(p_user_id uuid, p_email text, p_locale text) IS 'Queues a welcome email to be sent (called by application)';


--
-- Name: reactivate_qr_code(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reactivate_qr_code(p_token text, p_admin_user_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_qr_id UUID;
BEGIN
    UPDATE public.qr_codes
    SET 
        status = 'active',
        revoked_by = NULL,
        revoked_at = NULL,
        revoked_reason = NULL,
        updated_at = NOW()
    WHERE token = p_token AND status IN ('revoked', 'suspended')
    RETURNING id INTO v_qr_id;
    
    RETURN v_qr_id IS NOT NULL;
END;
$$;


--
-- Name: release_speaker_identity_claim_before_auth_user_delete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_speaker_identity_claim_before_auth_user_delete() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- Remove only the event roles granted automatically by a speaker claim.
  DELETE FROM public.event_roles AS event_role
  USING public.speaker_identity_claims AS claim
  JOIN public.speaker_identity_claim_event_roles AS role_grant
    ON role_grant.claim_id = claim.id
  WHERE claim.claimed_user_id = OLD.id
    AND event_role.user_id = OLD.id
    AND event_role.event_id = role_grant.event_id
    AND event_role.role = role_grant.role
    AND event_role.metadata ->> 'source' = 'speaker_identity_claim'
    AND event_role.metadata ->> 'claim_id' = claim.id::text;

  UPDATE public.bsl_speakers AS speaker
     SET user_id = NULL,
         updated_at = now()
    FROM public.speaker_identity_claims AS claim
   WHERE claim.claimed_user_id = OLD.id
     AND speaker.id::text = claim.speaker_id
     AND speaker.user_id = OLD.id;

  UPDATE public.speaker_identity_claims
     SET status = 'unclaimed',
         claimed_user_id = NULL,
         claimed_at = NULL,
         claim_error = 'Claim released because the linked account was deleted',
         updated_at = now()
   WHERE claimed_user_id = OLD.id
     AND status = 'claimed';

  RETURN OLD;
END;
$$;


--
-- Name: request_ticket_handoff(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_ticket_handoff(p_ticket_id uuid, p_visitor_id uuid) RETURNS TABLE(id uuid, app_id text, visitor_id uuid, subject text, status text, priority text, needs_human boolean, context jsonb, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.support_tickets st WHERE st.id = p_ticket_id AND st.visitor_id = p_visitor_id
  ) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  UPDATE public.support_tickets st
  SET needs_human = true,
      status = CASE WHEN st.status IN ('resolved', 'closed') THEN 'open' ELSE st.status END,
      priority = CASE WHEN st.priority IN ('low', 'normal') THEN 'high' ELSE st.priority END,
      updated_at = now()
  WHERE st.id = p_ticket_id;

  RETURN QUERY
  SELECT t.id, t.app_id, t.visitor_id, t.subject, t.status, t.priority,
         t.needs_human, t.context, t.created_at, t.updated_at
  FROM public.support_tickets t WHERE t.id = p_ticket_id;
END;
$$;


--
-- Name: reset_user_email_tracking(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_user_email_tracking(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    DELETE FROM public.user_email_tracking
    WHERE user_id = p_user_id;
END;
$$;


--
-- Name: FUNCTION reset_user_email_tracking(p_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reset_user_email_tracking(p_user_id uuid) IS 'Resets email tracking for a user (used on account deletion)';


--
-- Name: resolve_meeting_slot_conflict(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resolve_meeting_slot_conflict(p_meeting_id uuid, p_user_id uuid, p_action text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_meeting RECORD;
  v_conflict_ids uuid[];
  v_old RECORD;
BEGIN
  IF p_action NOT IN ('replace', 'keep_existing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_action');
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  SELECT * INTO v_meeting
  FROM public.meetings
  WHERE id = p_meeting_id
    AND status = 'tentative'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'meeting_not_pending_resolution');
  END IF;

  IF v_meeting.requester_id <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  SELECT array_agg(m.id) INTO v_conflict_ids
  FROM public.meetings m
  WHERE m.requester_id = p_user_id
    AND m.id <> p_meeting_id
    AND m.status IN ('scheduled', 'confirmed', 'accepted', 'tentative', 'in_progress')
    AND m.start_time < v_meeting.end_time
    AND m.end_time > v_meeting.start_time;

  -- Race: the old conflict is already gone (cancelled some other way
  -- between notification and resolution). Auto-promote regardless of which
  -- action was requested rather than honoring a literal "keep_existing"
  -- and destroying the requester's only remaining meeting.
  IF v_conflict_ids IS NULL THEN
    UPDATE public.meetings
    SET status = 'confirmed', updated_at = now()
    WHERE id = p_meeting_id;

    RETURN jsonb_build_object(
      'success', true, 'action', 'already_resolved', 'meeting_id', p_meeting_id,
      'status', 'confirmed', 'cancelled_meeting_ids', '{}'::uuid[]
    );
  END IF;

  IF p_action = 'replace' THEN
    FOR v_old IN
      SELECT id, meeting_request_id, host_id, requester_name
      FROM public.meetings
      WHERE id = ANY(v_conflict_ids)
    LOOP
      UPDATE public.meetings
      SET status = 'cancelled', updated_at = now()
      WHERE id = v_old.id;
      UPDATE public.meeting_slots
      SET status = 'available', meeting_id = NULL, updated_at = now()
      WHERE meeting_id = v_old.id;
      DELETE FROM public.user_agenda_status WHERE meeting_id = v_old.id;
      IF v_old.meeting_request_id IS NOT NULL THEN
        UPDATE public.meeting_requests
        SET status = 'cancelled', updated_at = now()
        WHERE id = v_old.meeting_request_id;
      END IF;
      PERFORM public.create_notification(
        v_old.host_id, 'meeting_cancelled', 'Meeting Cancelled',
        COALESCE(v_old.requester_name, 'A user') || ' resolved a scheduling conflict and this meeting has been cancelled.',
        v_old.meeting_request_id, NULL, false, v_old.id
      );
    END LOOP;

    UPDATE public.meetings
    SET status = 'confirmed', updated_at = now()
    WHERE id = p_meeting_id;

    PERFORM public.create_notification(
      v_meeting.host_id, 'meeting_accepted', 'Meeting Confirmed',
      COALESCE(v_meeting.requester_name, 'A user') || ' resolved a scheduling conflict and confirmed this meeting.',
      v_meeting.meeting_request_id, NULL, false, p_meeting_id
    );

    RETURN jsonb_build_object(
      'success', true, 'action', 'replace', 'meeting_id', p_meeting_id,
      'status', 'confirmed', 'cancelled_meeting_ids', v_conflict_ids
    );
  ELSE
    UPDATE public.meetings
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_meeting_id;
    UPDATE public.meeting_slots
    SET status = 'available', meeting_id = NULL, updated_at = now()
    WHERE meeting_id = p_meeting_id;
    DELETE FROM public.user_agenda_status WHERE meeting_id = p_meeting_id;
    IF v_meeting.meeting_request_id IS NOT NULL THEN
      UPDATE public.meeting_requests
      SET status = 'cancelled', updated_at = now()
      WHERE id = v_meeting.meeting_request_id;
    END IF;

    PERFORM public.create_notification(
      v_meeting.host_id, 'meeting_cancelled', 'Meeting Cancelled',
      COALESCE(v_meeting.requester_name, 'A user') || ' could not confirm this time slot due to a scheduling conflict. It has reopened on your calendar.',
      v_meeting.meeting_request_id, NULL, false, p_meeting_id
    );

    RETURN jsonb_build_object(
      'success', true, 'action', 'keep_existing', 'meeting_id', p_meeting_id,
      'status', 'cancelled', 'cancelled_meeting_ids', '{}'::uuid[]
    );
  END IF;
END;
$$;


--
-- Name: revoke_qr_code(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.revoke_qr_code(p_token text, p_admin_user_id text, p_reason text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_qr_id UUID;
BEGIN
    UPDATE public.qr_codes
    SET 
        status = 'revoked',
        revoked_by = p_admin_user_id,
        revoked_at = NOW(),
        revoked_reason = p_reason,
        updated_at = NOW()
    WHERE token = p_token AND status = 'active'
    RETURNING id INTO v_qr_id;
    
    RETURN v_qr_id IS NOT NULL;
END;
$$;


--
-- Name: FUNCTION revoke_qr_code(p_token text, p_admin_user_id text, p_reason text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.revoke_qr_code(p_token text, p_admin_user_id text, p_reason text) IS 'Admin function to revoke a QR code';


--
-- Name: reward_meeting_accepted(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reward_meeting_accepted(p_meeting_id uuid, p_speaker_user_id uuid, p_requester_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_speaker_result JSONB;
    v_requester_result JSONB;
    v_meeting_record RECORD;
BEGIN
    SELECT * INTO v_meeting_record
    FROM public.meetings
    WHERE id = p_meeting_id;

    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Meeting not found'
        );
    END IF;

    v_speaker_result := add_reward(
        p_user_id := p_speaker_user_id,
        p_amount := 1.0,
        p_token_symbol := 'LUKAS',
        p_source := 'meeting_accepted',
        p_reference_id := p_meeting_id,
        p_reference_type := 'meeting',
        p_description := 'Reward for accepting and scheduling a meeting',
        p_metadata := json_build_object(
            'meeting_id', p_meeting_id,
            'role', 'speaker',
            'requester_id', p_requester_user_id
        )
    );

    v_requester_result := add_reward(
        p_user_id := p_requester_user_id,
        p_amount := 1.0,
        p_token_symbol := 'LUKAS',
        p_source := 'meeting_accepted',
        p_reference_id := p_meeting_id,
        p_reference_type := 'meeting',
        p_description := 'Reward for having a meeting request accepted',
        p_metadata := json_build_object(
            'meeting_id', p_meeting_id,
            'role', 'requester',
            'speaker_id', p_speaker_user_id
        )
    );

    RETURN json_build_object(
        'success', true,
        'speaker_reward', v_speaker_result,
        'requester_reward', v_requester_result
    );
END;
$$;


--
-- Name: FUNCTION reward_meeting_accepted(p_meeting_id uuid, p_speaker_user_id uuid, p_requester_user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.reward_meeting_accepted(p_meeting_id uuid, p_speaker_user_id uuid, p_requester_user_id uuid) IS 'Rewards both speaker and requester with 1 LUKAS when a meeting is accepted and scheduled';


--
-- Name: send_meeting_chat_message(uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_meeting_chat_message(p_meeting_id uuid, p_sender_id uuid, p_ciphertext text, p_nonce text, p_message_type text DEFAULT 'text'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_meeting RECORD;
  v_recipient_id uuid;
  v_sender_name text;
  v_id uuid;
  v_created_at timestamptz;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so participancy must be re-checked here
  -- explicitly -- mirrors the table's own INSERT policy predicate above.
  SELECT * INTO v_meeting FROM public.meetings m WHERE m.id = p_meeting_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'meeting_not_found');
  END IF;

  IF p_sender_id IS DISTINCT FROM v_meeting.requester_id
     AND p_sender_id IS DISTINCT FROM v_meeting.host_id
     AND p_sender_id IS DISTINCT FROM v_meeting.attendee_id
     AND NOT EXISTS (
       SELECT 1 FROM public.bsl_speakers s
       WHERE s.id::text = v_meeting.speaker_id::text AND s.user_id = p_sender_id
     ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_participant');
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> p_sender_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  IF length(coalesce(p_ciphertext, '')) = 0 OR length(coalesce(p_nonce, '')) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_message');
  END IF;

  INSERT INTO public.meeting_chat_messages (meeting_id, sender_id, ciphertext, nonce, message_type)
  VALUES (p_meeting_id, p_sender_id, p_ciphertext, p_nonce, COALESCE(NULLIF(p_message_type, ''), 'text'))
  RETURNING id, created_at INTO v_id, v_created_at;

  -- Notify the other participant -- generic, content-free (the server
  -- cannot read the ciphertext to summarize it even if it wanted to).
  v_recipient_id := CASE WHEN v_meeting.requester_id = p_sender_id THEN v_meeting.host_id ELSE v_meeting.requester_id END;
  v_sender_name := CASE WHEN v_meeting.requester_id = p_sender_id THEN v_meeting.requester_name ELSE v_meeting.speaker_name END;

  IF v_recipient_id IS NOT NULL THEN
    PERFORM public.create_notification(
      v_recipient_id, 'chat_message', 'New message',
      COALESCE(v_sender_name, 'Someone') || ' sent you a message.',
      NULL, p_sender_id::text, false, p_meeting_id
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_id, 'created_at', v_created_at);
END;
$$;


--
-- Name: send_prioritized_notification(text, text, text, text, numeric, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_prioritized_notification(p_speaker_id text, p_requester_name text, p_requester_company text, p_ticket_type text, p_boost_amount numeric, p_meeting_request_id uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_speaker RECORD;
  v_notification_id uuid;
  v_title text;
  v_message text;
BEGIN
  SELECT * INTO v_speaker
  FROM public.get_speaker_by_id_or_slug(p_speaker_id)
  LIMIT 1;

  IF v_speaker.user_id IS NULL THEN
    RETURN gen_random_uuid();
  END IF;

  v_title := CASE
    WHEN p_ticket_type = 'vip' THEN 'VIP Meeting Request'
    WHEN p_ticket_type = 'business' THEN 'Business Meeting Request'
    ELSE 'Meeting Request'
  END;

  v_message := COALESCE(p_requester_name, 'Someone') || ' wants to meet with you';
  IF COALESCE(p_requester_company, '') <> '' THEN
    v_message := v_message || ' from ' || p_requester_company;
  END IF;
  IF COALESCE(p_boost_amount, 0) > 0 THEN
    v_message := v_message || ' with a boost of ' || p_boost_amount::text;
  END IF;

  v_notification_id := public.create_notification(
    v_speaker.user_id,
    'meeting_request',
    v_title,
    v_message,
    p_meeting_request_id,
    v_speaker.id,
    true,
    NULL
  );

  RETURN v_notification_id;
END;
$$;


--
-- Name: send_support_message(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_support_message(p_ticket_id uuid, p_visitor_id uuid, p_body text) RETURNS TABLE(id uuid, ticket_id uuid, author text, body text, delivery_status text, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
DECLARE
  v_message_id uuid := gen_random_uuid();
  v_body text := NULLIF(trim(COALESCE(p_body, '')), '');
BEGIN
  IF v_body IS NULL THEN
    RAISE EXCEPTION 'A message body is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.support_tickets st WHERE st.id = p_ticket_id AND st.visitor_id = p_visitor_id
  ) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  INSERT INTO public.support_messages (id, ticket_id, author, body)
  VALUES (v_message_id, p_ticket_id, 'customer', v_body);

  UPDATE public.support_tickets st
  SET updated_at = now(),
      status = CASE WHEN st.status IN ('resolved', 'closed') THEN 'open' ELSE st.status END
  WHERE st.id = p_ticket_id;

  RETURN QUERY
  SELECT m.id, m.ticket_id, m.author, m.body, m.delivery_status, m.created_at
  FROM public.support_messages m WHERE m.id = v_message_id;
END;
$$;


--
-- Name: set_ticket_status(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_ticket_status(p_ticket_id uuid, p_visitor_id uuid, p_status text) RETURNS TABLE(id uuid, app_id text, visitor_id uuid, subject text, status text, priority text, needs_human boolean, context jsonb, created_at timestamp with time zone, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
#variable_conflict use_column
BEGIN
  IF p_status NOT IN ('open', 'resolved') THEN
    RAISE EXCEPTION 'Unsupported status transition';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.support_tickets st WHERE st.id = p_ticket_id AND st.visitor_id = p_visitor_id
  ) THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  UPDATE public.support_tickets st SET status = p_status, updated_at = now() WHERE st.id = p_ticket_id;

  RETURN QUERY
  SELECT t.id, t.app_id, t.visitor_id, t.subject, t.status, t.priority,
         t.needs_human, t.context, t.created_at, t.updated_at
  FROM public.support_tickets t WHERE t.id = p_ticket_id;
END;
$$;


--
-- Name: set_users_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_users_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: suspend_qr_code(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.suspend_qr_code(p_token text, p_admin_user_id text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_qr_id UUID;
BEGIN
    UPDATE public.qr_codes
    SET 
        status = 'suspended',
        updated_at = NOW()
    WHERE token = p_token AND status = 'active'
    RETURNING id INTO v_qr_id;
    
    RETURN v_qr_id IS NOT NULL;
END;
$$;


--
-- Name: sync_auth_user_to_public_users(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_auth_user_to_public_users() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_provider   text;
  v_full_name  text;
  v_avatar_url text;
  v_payload    jsonb;
BEGIN
  v_provider  := coalesce(NEW.raw_app_meta_data->>'provider', 'email');
  v_full_name := coalesce(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    trim(coalesce(NEW.raw_user_meta_data->>'first_name','') || ' ' ||
         coalesce(NEW.raw_user_meta_data->>'last_name',''))
  );
  v_avatar_url := coalesce(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );

  v_payload := jsonb_build_object(
    'provider',          v_provider,
    'auth_provider',     v_provider,
    'auth_user_id',      NEW.id::text,
    'email',             lower(coalesce(NEW.email, '')),
    'first_name',        NEW.raw_user_meta_data->>'first_name',
    'last_name',         NEW.raw_user_meta_data->>'last_name',
    'full_name',         nullif(trim(v_full_name), ''),
    'avatar_url',        v_avatar_url,
    'phone',             NEW.phone,
    'role',              'user',
    'status',            'active',
    'email_verified_at', NEW.email_confirmed_at,
    'last_sign_in_at',   NEW.last_sign_in_at,
    'deleted_at',        NULL,
    'auth_metadata',     coalesce(NEW.raw_app_meta_data, '{}'),
    'profile_metadata',  coalesce(NEW.raw_user_meta_data, '{}'),
    'provider_ids',      jsonb_build_object(v_provider, NEW.id::text, 'supabase', NEW.id::text)
  );

  IF NEW.email IS NULL OR trim(NEW.email) = '' THEN RETURN NEW; END IF;
  PERFORM public.upsert_public_user_registry(v_payload);
  RETURN NEW;
END;
$$;


--
-- Name: sync_public_user_to_profiles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_public_user_to_profiles() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    company,
    title,
    bio,
    phone,
    metadata,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NULLIF(NEW.full_name, ''),
      NULLIF(NEW.profile_metadata->>'full_name', ''),
      NULLIF(trim(COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')), '')
    ),
    NEW.avatar_url,
    NULLIF(NEW.profile_metadata->>'company', ''),
    NULLIF(NEW.profile_metadata->>'title', ''),
    NULLIF(NEW.profile_metadata->>'bio', ''),
    NEW.phone,
    COALESCE(NEW.profile_metadata, '{}'::jsonb),
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    company = COALESCE(EXCLUDED.company, public.profiles.company),
    title = COALESCE(EXCLUDED.title, public.profiles.title),
    bio = COALESCE(EXCLUDED.bio, public.profiles.bio),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    metadata = COALESCE(public.profiles.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
    updated_at = now();

  RETURN NEW;
END;
$$;


--
-- Name: sync_user_profiles_to_profiles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_user_profiles_to_profiles() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    company,
    title,
    bio,
    phone,
    metadata,
    created_at,
    updated_at
  ) VALUES (
    NEW.user_id,
    NEW.email,
    COALESCE(NULLIF(NEW.full_name, ''), NULLIF(NEW.display_name, '')),
    NEW.avatar_url,
    NULLIF(NEW.company, ''),
    NULLIF(NEW.title, ''),
    NULLIF(NEW.bio, ''),
    NEW.phone,
    COALESCE(NEW.metadata, '{}'::jsonb),
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    company = COALESCE(EXCLUDED.company, public.profiles.company),
    title = COALESCE(EXCLUDED.title, public.profiles.title),
    bio = COALESCE(EXCLUDED.bio, public.profiles.bio),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    metadata = COALESCE(public.profiles.metadata, '{}'::jsonb) || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
    updated_at = now();

  RETURN NEW;
END;
$$;


--
-- Name: toggle_user_block(text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.toggle_user_block(p_speaker_id text, p_user_id uuid, p_reason text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    block_exists BOOLEAN;
BEGIN
    -- Check if block already exists
    SELECT EXISTS(
        SELECT 1 FROM user_blocks 
        WHERE speaker_id = p_speaker_id 
        AND blocked_user_id = p_user_id
    ) INTO block_exists;
    
    IF block_exists THEN
        -- Remove block
        DELETE FROM user_blocks 
        WHERE speaker_id = p_speaker_id 
        AND blocked_user_id = p_user_id;
        RETURN false; -- User is now unblocked
    ELSE
        -- Add block
        INSERT INTO user_blocks (speaker_id, blocked_user_id, reason)
        VALUES (p_speaker_id, p_user_id, p_reason);
        RETURN true; -- User is now blocked
    END IF;
END;
$$;


--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_chat_last_seen(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_chat_last_seen(p_user_id uuid, p_meeting_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_seen timestamptz;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  -- Not touching updated_at here: prod's chat_last_seen never had that
  -- column (dev's does, via its own trigger) -- last_seen_at alone is the
  -- column this feature actually depends on, so leaving updated_at out of
  -- this statement keeps it portable across both shapes.
  INSERT INTO public.chat_last_seen (user_id, meeting_id, last_seen_at)
  VALUES (p_user_id, p_meeting_id, now())
  ON CONFLICT (meeting_id, user_id) DO UPDATE SET
    last_seen_at = now()
  RETURNING last_seen_at INTO v_seen;

  RETURN jsonb_build_object('success', true, 'last_seen_at', v_seen);
END;
$$;


--
-- Name: update_existing_passes_with_qr(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_existing_passes_with_qr() RETURNS TABLE(pass_id text, qr_created boolean, error_message text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_pass RECORD;
    v_qr_id UUID;
    v_error TEXT;
BEGIN
    -- Loop through all active passes that don't have QR codes
    FOR v_pass IN 
        SELECT p.id, p.pass_number, p.pass_type, p.user_id, p.event_id, p.status
        FROM public.passes p
        WHERE p.status = 'active'
        AND NOT EXISTS (
            SELECT 1 
            FROM public.qr_codes qr 
            WHERE qr.pass_id = p.id 
            AND qr.status = 'active'
            AND qr.expires_at > NOW()
        )
        ORDER BY p.created_at DESC
    LOOP
        BEGIN
            -- Generate QR code for this pass
            SELECT generate_pass_qr(v_pass.id, 30, 1) INTO v_qr_id;
            
            IF v_qr_id IS NOT NULL THEN
                pass_id := v_pass.id;
                qr_created := TRUE;
                error_message := NULL;
            ELSE
                pass_id := v_pass.id;
                qr_created := FALSE;
                error_message := 'QR generation returned NULL';
            END IF;
            
            RETURN NEXT;
            
        EXCEPTION WHEN OTHERS THEN
            pass_id := v_pass.id;
            qr_created := FALSE;
            error_message := SQLERRM;
            RETURN NEXT;
        END;
    END LOOP;
    
    RETURN;
END;
$$;


--
-- Name: FUNCTION update_existing_passes_with_qr(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.update_existing_passes_with_qr() IS 'Updates existing active passes to have QR codes';


--
-- Name: update_pass_after_request(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_pass_after_request(p_user_id uuid, p_boost_amount numeric DEFAULT 0) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    user_pass RECORD;
BEGIN
    -- Get user's pass
    SELECT * INTO user_pass 
    FROM passes 
    WHERE user_id = p_user_id 
    AND event_id = 'bsl2025' 
    AND status = 'active';
    
    IF user_pass IS NULL THEN
        RETURN false;
    END IF;
    
    -- Update pass usage
    UPDATE passes 
    SET 
        used_meeting_requests = used_meeting_requests + 1,
        used_boost_amount = used_boost_amount + p_boost_amount,
        updated_at = NOW()
    WHERE id = user_pass.id;
    
    RETURN true;
END;
$$;


--
-- Name: update_pass_after_response(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_pass_after_response(p_user_id uuid, p_meeting_request_id uuid, p_status text) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    user_pass RECORD;
    meeting_request RECORD;
BEGIN
    -- Get meeting request details
    SELECT * INTO meeting_request 
    FROM meeting_requests 
    WHERE id = p_meeting_request_id;
    
    IF meeting_request IS NULL THEN
        RETURN false;
    END IF;
    
    -- Get user's pass
    SELECT * INTO user_pass 
    FROM passes 
    WHERE user_id = p_user_id 
    AND event_id = 'bsl2025' 
    AND status = 'active';
    
    IF user_pass IS NULL THEN
        RETURN false;
    END IF;
    
    -- Update pass based on response
    IF p_status = 'declined' THEN
        -- Refund the request and boost amount
        UPDATE passes 
        SET 
            used_meeting_requests = GREATEST(0, used_meeting_requests - 1),
            used_boost_amount = GREATEST(0, used_boost_amount - COALESCE(meeting_request.boost_amount, 0)),
            updated_at = NOW()
        WHERE id = user_pass.id;
    END IF;
    
    RETURN true;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_user_agenda_status_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_user_agenda_status_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: upsert_public_user_registry(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.upsert_public_user_registry(p_payload jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_email              text;
  v_provider           text;
  v_auth_provider      text;
  v_auth_user_id       text;
  v_first_name         text;
  v_last_name          text;
  v_full_name          text;
  v_avatar_url         text;
  v_phone              text;
  v_role               text;
  v_status             text;
  v_email_verified_at  timestamptz;
  v_last_sign_in_at    timestamptz;
  v_deleted_at         timestamptz;
  v_auth_metadata      jsonb;
  v_profile_metadata   jsonb;
  v_provider_ids       jsonb;
  v_existing_ids       jsonb;
  v_merged_ids         jsonb;
  v_result_id          uuid;
BEGIN
  v_email             := lower(trim(p_payload->>'email'));
  v_provider          := coalesce(nullif(trim(p_payload->>'provider'), ''), 'email');
  v_auth_provider     := coalesce(nullif(trim(p_payload->>'auth_provider'), ''), v_provider);
  v_auth_user_id      := nullif(trim(p_payload->>'auth_user_id'), '');
  v_first_name        := nullif(trim(p_payload->>'first_name'), '');
  v_last_name         := nullif(trim(p_payload->>'last_name'), '');
  v_full_name         := nullif(trim(p_payload->>'full_name'), '');
  v_avatar_url        := nullif(trim(p_payload->>'avatar_url'), '');
  v_phone             := nullif(trim(p_payload->>'phone'), '');
  v_role              := coalesce(nullif(trim(p_payload->>'role'), ''), 'user');
  v_status            := coalesce(nullif(trim(p_payload->>'status'), ''), 'active');
  v_auth_metadata     := coalesce(p_payload->'auth_metadata', '{}');
  v_profile_metadata  := coalesce(p_payload->'profile_metadata', '{}');
  v_provider_ids      := coalesce(p_payload->'provider_ids', '{}');

  BEGIN
    v_email_verified_at := (p_payload->>'email_verified_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN v_email_verified_at := NULL; END;
  BEGIN
    v_last_sign_in_at := (p_payload->>'last_sign_in_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN v_last_sign_in_at := NULL; END;
  BEGIN
    v_deleted_at := (p_payload->>'deleted_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN v_deleted_at := NULL; END;

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'upsert_public_user_registry: email is required';
  END IF;

  SELECT provider_ids INTO v_existing_ids
  FROM public."user" WHERE email = v_email;

  v_merged_ids := coalesce(v_existing_ids, '{}') || v_provider_ids;

  INSERT INTO public."user" (
    email, provider, auth_provider, auth_user_id,
    first_name, last_name, full_name, avatar_url, phone,
    role, status, email_verified_at, last_sign_in_at, deleted_at,
    auth_metadata, profile_metadata, provider_ids
  ) VALUES (
    v_email, v_provider, v_auth_provider, v_auth_user_id,
    v_first_name, v_last_name, v_full_name, v_avatar_url, v_phone,
    v_role, v_status, v_email_verified_at, v_last_sign_in_at, v_deleted_at,
    v_auth_metadata, v_profile_metadata, v_merged_ids
  )
  ON CONFLICT (email) DO UPDATE SET
    provider          = CASE WHEN public."user".provider IN ('email','unknown') THEN EXCLUDED.provider ELSE public."user".provider END,
    auth_provider     = EXCLUDED.auth_provider,
    auth_user_id      = coalesce(EXCLUDED.auth_user_id, public."user".auth_user_id),
    first_name        = coalesce(EXCLUDED.first_name, public."user".first_name),
    last_name         = coalesce(EXCLUDED.last_name, public."user".last_name),
    full_name         = coalesce(EXCLUDED.full_name, public."user".full_name),
    avatar_url        = coalesce(EXCLUDED.avatar_url, public."user".avatar_url),
    phone             = coalesce(EXCLUDED.phone, public."user".phone),
    role              = CASE
                          WHEN EXCLUDED.role IN ('admin','super_admin','organizer','speaker') THEN EXCLUDED.role
                          ELSE coalesce(public."user".role, EXCLUDED.role)
                        END,
    status            = CASE
                          WHEN EXCLUDED.status = 'deleted' THEN 'deleted'
                          WHEN public."user".status = 'deleted' THEN 'deleted'
                          ELSE EXCLUDED.status
                        END,
    email_verified_at = coalesce(EXCLUDED.email_verified_at, public."user".email_verified_at),
    last_sign_in_at   = coalesce(EXCLUDED.last_sign_in_at, public."user".last_sign_in_at),
    deleted_at        = EXCLUDED.deleted_at,
    auth_metadata     = public."user".auth_metadata  || EXCLUDED.auth_metadata,
    profile_metadata  = public."user".profile_metadata || EXCLUDED.profile_metadata,
    provider_ids      = v_merged_ids,
    updated_at        = now()
  RETURNING id INTO v_result_id;

  RETURN jsonb_build_object('id', v_result_id);
END;
$$;


--
-- Name: validate_and_use_qr(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_and_use_qr(p_token text, p_scanner_user_id text DEFAULT NULL::text, p_scanner_device_id text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_qr RECORD;
    v_result JSONB;
BEGIN
    -- Get QR code
    SELECT * INTO v_qr
    FROM public.qr_codes
    WHERE token = p_token;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'valid', false,
            'status', 'invalid',
            'message', 'QR code not found'
        );
    END IF;
    
    -- Check if already used
    IF v_qr.status = 'used' THEN
        INSERT INTO public.qr_scan_logs (
            qr_code_id, token, scanned_by_user_id, scanned_by_device_id,
            scan_status, scan_message
        ) VALUES (
            v_qr.id, p_token, p_scanner_user_id, p_scanner_device_id,
            'already_used', 'QR code has already been used'
        );
        
        RETURN jsonb_build_object(
            'valid', false,
            'status', 'already_used',
            'message', 'This QR code has already been used',
            'used_at', v_qr.used_at,
            'usage_count', v_qr.usage_count
        );
    END IF;
    
    -- Check if revoked
    IF v_qr.status = 'revoked' THEN
        INSERT INTO public.qr_scan_logs (
            qr_code_id, token, scanned_by_user_id, scanned_by_device_id,
            scan_status, scan_message
        ) VALUES (
            v_qr.id, p_token, p_scanner_user_id, p_scanner_device_id,
            'revoked', COALESCE(v_qr.revoked_reason, 'QR code has been revoked')
        );
        
        RETURN jsonb_build_object(
            'valid', false,
            'status', 'revoked',
            'message', COALESCE(v_qr.revoked_reason, 'QR code has been revoked'),
            'revoked_at', v_qr.revoked_at
        );
    END IF;
    
    -- Check if suspended
    IF v_qr.status = 'suspended' THEN
        INSERT INTO public.qr_scan_logs (
            qr_code_id, token, scanned_by_user_id, scanned_by_device_id,
            scan_status, scan_message
        ) VALUES (
            v_qr.id, p_token, p_scanner_user_id, p_scanner_device_id,
            'suspended', 'QR code is suspended'
        );
        
        RETURN jsonb_build_object(
            'valid', false,
            'status', 'suspended',
            'message', 'QR code is suspended'
        );
    END IF;
    
    -- Check if expired
    IF v_qr.expires_at IS NOT NULL AND v_qr.expires_at < NOW() THEN
        -- Auto-update status to expired
        UPDATE public.qr_codes
        SET status = 'expired', updated_at = NOW()
        WHERE id = v_qr.id;
        
        INSERT INTO public.qr_scan_logs (
            qr_code_id, token, scanned_by_user_id, scanned_by_device_id,
            scan_status, scan_message
        ) VALUES (
            v_qr.id, p_token, p_scanner_user_id, p_scanner_device_id,
            'expired', 'QR code has expired'
        );
        
        RETURN jsonb_build_object(
            'valid', false,
            'status', 'expired',
            'message', 'QR code has expired',
            'expires_at', v_qr.expires_at
        );
    END IF;
    
    -- Check usage limit
    IF v_qr.usage_count >= v_qr.max_uses THEN
        UPDATE public.qr_codes
        SET status = 'used', updated_at = NOW()
        WHERE id = v_qr.id;
        
        INSERT INTO public.qr_scan_logs (
            qr_code_id, token, scanned_by_user_id, scanned_by_device_id,
            scan_status, scan_message
        ) VALUES (
            v_qr.id, p_token, p_scanner_user_id, p_scanner_device_id,
            'already_used', 'QR code usage limit reached'
        );
        
        RETURN jsonb_build_object(
            'valid', false,
            'status', 'limit_reached',
            'message', 'QR code usage limit reached'
        );
    END IF;
    
    -- Valid QR - update usage
    UPDATE public.qr_codes
    SET 
        usage_count = usage_count + 1,
        used_at = CASE WHEN used_at IS NULL THEN NOW() ELSE used_at END,
        last_checked_at = NOW(),
        status = CASE WHEN usage_count + 1 >= max_uses THEN 'used' ELSE status END,
        updated_at = NOW()
    WHERE id = v_qr.id;
    
    -- Log successful scan
    INSERT INTO public.qr_scan_logs (
        qr_code_id, token, scanned_by_user_id, scanned_by_device_id,
        scan_status, scan_message
    ) VALUES (
        v_qr.id, p_token, p_scanner_user_id, p_scanner_device_id,
        'valid', 'QR code validated successfully'
    );
    
    -- Return success with QR data
    RETURN jsonb_build_object(
        'valid', true,
        'status', 'valid',
        'message', 'QR code is valid',
        'qr_data', v_qr.qr_data,
        'display_data', v_qr.display_data,
        'usage_count', v_qr.usage_count + 1,
        'max_uses', v_qr.max_uses
    );
END;
$$;


--
-- Name: FUNCTION validate_and_use_qr(p_token text, p_scanner_user_id text, p_scanner_device_id text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.validate_and_use_qr(p_token text, p_scanner_user_id text, p_scanner_device_id text) IS 'Validates QR code and prevents double spending';


--
-- Name: bsl_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bsl_audit (
    id bigint NOT NULL,
    event text NOT NULL,
    ref_id text,
    actor uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: BSL_Audit; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public."BSL_Audit" AS
 SELECT id,
    event,
    ref_id,
    actor,
    metadata,
    created_at AS "createdAt"
   FROM public.bsl_audit;


--
-- Name: bsl_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bsl_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    speakerid text NOT NULL,
    attendeeid uuid,
    start timestamp with time zone NOT NULL,
    "end" timestamp with time zone NOT NULL,
    status public.booking_status DEFAULT 'requested'::public.booking_status NOT NULL,
    createdat timestamp with time zone DEFAULT now()
);


--
-- Name: BSL_Bookings; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public."BSL_Bookings" AS
 SELECT id,
    speakerid AS "speakerId",
    attendeeid AS "attendeeId",
    start,
    "end",
    status,
    createdat AS "createdAt"
   FROM public.bsl_bookings;


--
-- Name: bsl_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bsl_tickets (
    ticketid text NOT NULL,
    userid uuid,
    verified boolean DEFAULT false,
    used boolean DEFAULT false,
    issuedat timestamp with time zone DEFAULT now(),
    verifiedat timestamp with time zone
);


--
-- Name: BSL_Tickets; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public."BSL_Tickets" AS
 SELECT ticketid AS "ticketId",
    userid AS "userId",
    verified,
    used,
    issuedat AS "issuedAt",
    verifiedat AS "verifiedAt"
   FROM public.bsl_tickets;


--
-- Name: account; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account (
    id text NOT NULL,
    "accountId" text NOT NULL,
    "providerId" text NOT NULL,
    "userId" text NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "idToken" text,
    "accessTokenExpiresAt" timestamp with time zone,
    "refreshTokenExpiresAt" timestamp with time zone,
    scope text,
    password text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: admin_action_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_action_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid NOT NULL,
    event_id text,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_email_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_email_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    sent_by uuid NOT NULL,
    recipient_user_id uuid,
    recipient_email text NOT NULL,
    audience text NOT NULL,
    subject text NOT NULL,
    heading text NOT NULL,
    message text NOT NULL,
    status text NOT NULL,
    provider_message_id text,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    template text DEFAULT 'branded'::text NOT NULL,
    CONSTRAINT admin_email_deliveries_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text]))),
    CONSTRAINT admin_email_deliveries_template_check CHECK ((template = ANY (ARRAY['branded'::text, 'raw'::text])))
);


--
-- Name: admin_matchmaking_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_matchmaking_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    created_by uuid NOT NULL,
    mode text NOT NULL,
    requested_count integer NOT NULL,
    created_count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'completed'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT admin_matchmaking_runs_mode_check CHECK ((mode = ANY (ARRAY['manual'::text, 'random'::text])))
);


--
-- Name: ba_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ba_users (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    "emailVerified" boolean NOT NULL,
    image text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: bsl_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bsl_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bsl_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bsl_audit_id_seq OWNED BY public.bsl_audit.id;


--
-- Name: bsl_speakers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bsl_speakers (
    id text NOT NULL,
    name text NOT NULL,
    title text,
    linkedin text,
    bio text,
    imageurl text,
    tags text[] DEFAULT '{}'::text[],
    availability jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    company text,
    twitter text,
    updated_at timestamp with time zone DEFAULT now(),
    user_id uuid,
    is_active boolean DEFAULT true NOT NULL,
    is_accepting_meetings boolean DEFAULT true NOT NULL
);


--
-- Name: COLUMN bsl_speakers.user_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bsl_speakers.user_id IS 'Links speaker record to auth.users table for generic speaker detection';


--
-- Name: chat_last_seen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_last_seen (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meeting_id uuid NOT NULL,
    user_id uuid NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: directus_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_access (
    id uuid NOT NULL,
    role uuid,
    "user" uuid,
    policy uuid NOT NULL,
    sort integer
);


--
-- Name: directus_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_activity (
    id integer NOT NULL,
    action character varying(45) NOT NULL,
    "user" uuid,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    ip character varying(50),
    user_agent text,
    collection character varying(64) NOT NULL,
    item character varying(255) NOT NULL,
    origin character varying(255)
);


--
-- Name: directus_activity_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directus_activity_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directus_activity_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directus_activity_id_seq OWNED BY public.directus_activity.id;


--
-- Name: directus_collections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_collections (
    collection character varying(64) NOT NULL,
    icon character varying(64),
    note text,
    display_template character varying(255),
    hidden boolean DEFAULT false NOT NULL,
    singleton boolean DEFAULT false NOT NULL,
    translations json,
    archive_field character varying(64),
    archive_app_filter boolean DEFAULT true NOT NULL,
    archive_value character varying(255),
    unarchive_value character varying(255),
    sort_field character varying(64),
    accountability character varying(255) DEFAULT 'all'::character varying,
    color character varying(255),
    item_duplication_fields json,
    sort integer,
    "group" character varying(64),
    collapse character varying(255) DEFAULT 'open'::character varying NOT NULL,
    preview_url character varying(255),
    versioning boolean DEFAULT false NOT NULL
);


--
-- Name: directus_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_comments (
    id uuid NOT NULL,
    collection character varying(64) NOT NULL,
    item character varying(255) NOT NULL,
    comment text NOT NULL,
    date_created timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    date_updated timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_created uuid,
    user_updated uuid
);


--
-- Name: directus_dashboards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_dashboards (
    id uuid NOT NULL,
    name character varying(255) NOT NULL,
    icon character varying(64) DEFAULT 'dashboard'::character varying NOT NULL,
    note text,
    date_created timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_created uuid,
    color character varying(255)
);


--
-- Name: directus_extensions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_extensions (
    enabled boolean DEFAULT true NOT NULL,
    id uuid NOT NULL,
    folder character varying(255) NOT NULL,
    source character varying(255) NOT NULL,
    bundle uuid
);


--
-- Name: directus_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_fields (
    id integer NOT NULL,
    collection character varying(64) NOT NULL,
    field character varying(64) NOT NULL,
    special character varying(64),
    interface character varying(64),
    options json,
    display character varying(64),
    display_options json,
    readonly boolean DEFAULT false NOT NULL,
    hidden boolean DEFAULT false NOT NULL,
    sort integer,
    width character varying(30) DEFAULT 'full'::character varying,
    translations json,
    note text,
    conditions json,
    required boolean DEFAULT false,
    "group" character varying(64),
    validation json,
    validation_message text,
    searchable boolean DEFAULT true NOT NULL
);


--
-- Name: directus_fields_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directus_fields_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directus_fields_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directus_fields_id_seq OWNED BY public.directus_fields.id;


--
-- Name: directus_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_files (
    id uuid NOT NULL,
    storage character varying(255) NOT NULL,
    filename_disk character varying(255),
    filename_download character varying(255) NOT NULL,
    title character varying(255),
    type character varying(255),
    folder uuid,
    uploaded_by uuid,
    created_on timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    modified_by uuid,
    modified_on timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    charset character varying(50),
    filesize bigint,
    width integer,
    height integer,
    duration integer,
    embed character varying(200),
    description text,
    location text,
    tags text,
    metadata json,
    focal_point_x integer,
    focal_point_y integer,
    tus_id character varying(64),
    tus_data json,
    uploaded_on timestamp with time zone
);


--
-- Name: directus_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_flows (
    id uuid NOT NULL,
    name character varying(255) NOT NULL,
    icon character varying(64),
    color character varying(255),
    description text,
    status character varying(255) DEFAULT 'active'::character varying NOT NULL,
    trigger character varying(255),
    accountability character varying(255) DEFAULT 'all'::character varying,
    options json,
    operation uuid,
    date_created timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_created uuid
);


--
-- Name: directus_folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_folders (
    id uuid NOT NULL,
    name character varying(255) NOT NULL,
    parent uuid
);


--
-- Name: directus_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_migrations (
    version character varying(255) NOT NULL,
    name character varying(255) NOT NULL,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: directus_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_notifications (
    id integer NOT NULL,
    "timestamp" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    status character varying(255) DEFAULT 'inbox'::character varying,
    recipient uuid NOT NULL,
    sender uuid,
    subject character varying(255) NOT NULL,
    message text,
    collection character varying(64),
    item character varying(255)
);


--
-- Name: directus_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directus_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directus_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directus_notifications_id_seq OWNED BY public.directus_notifications.id;


--
-- Name: directus_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_operations (
    id uuid NOT NULL,
    name character varying(255),
    key character varying(255) NOT NULL,
    type character varying(255) NOT NULL,
    position_x integer NOT NULL,
    position_y integer NOT NULL,
    options json,
    resolve uuid,
    reject uuid,
    flow uuid NOT NULL,
    date_created timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_created uuid
);


--
-- Name: directus_panels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_panels (
    id uuid NOT NULL,
    dashboard uuid NOT NULL,
    name character varying(255),
    icon character varying(64) DEFAULT NULL::character varying,
    color character varying(10),
    show_header boolean DEFAULT false NOT NULL,
    note text,
    type character varying(255) NOT NULL,
    position_x integer NOT NULL,
    position_y integer NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    options json,
    date_created timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_created uuid
);


--
-- Name: directus_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_permissions (
    id integer NOT NULL,
    collection character varying(64) NOT NULL,
    action character varying(10) NOT NULL,
    permissions json,
    validation json,
    presets json,
    fields text,
    policy uuid NOT NULL
);


--
-- Name: directus_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directus_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directus_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directus_permissions_id_seq OWNED BY public.directus_permissions.id;


--
-- Name: directus_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_policies (
    id uuid NOT NULL,
    name character varying(100) NOT NULL,
    icon character varying(64) DEFAULT 'badge'::character varying NOT NULL,
    description text,
    ip_access text,
    enforce_tfa boolean DEFAULT false NOT NULL,
    admin_access boolean DEFAULT false NOT NULL,
    app_access boolean DEFAULT false NOT NULL
);


--
-- Name: directus_presets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_presets (
    id integer NOT NULL,
    bookmark character varying(255),
    "user" uuid,
    role uuid,
    collection character varying(64),
    search character varying(100),
    layout character varying(100) DEFAULT 'tabular'::character varying,
    layout_query json,
    layout_options json,
    refresh_interval integer,
    filter json,
    icon character varying(64) DEFAULT 'bookmark'::character varying,
    color character varying(255)
);


--
-- Name: directus_presets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directus_presets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directus_presets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directus_presets_id_seq OWNED BY public.directus_presets.id;


--
-- Name: directus_relations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_relations (
    id integer NOT NULL,
    many_collection character varying(64) NOT NULL,
    many_field character varying(64) NOT NULL,
    one_collection character varying(64),
    one_field character varying(64),
    one_collection_field character varying(64),
    one_allowed_collections text,
    junction_field character varying(64),
    sort_field character varying(64),
    one_deselect_action character varying(255) DEFAULT 'nullify'::character varying NOT NULL
);


--
-- Name: directus_relations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directus_relations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directus_relations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directus_relations_id_seq OWNED BY public.directus_relations.id;


--
-- Name: directus_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_revisions (
    id integer NOT NULL,
    activity integer NOT NULL,
    collection character varying(64) NOT NULL,
    item character varying(255) NOT NULL,
    data json,
    delta json,
    parent integer,
    version uuid
);


--
-- Name: directus_revisions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directus_revisions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directus_revisions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directus_revisions_id_seq OWNED BY public.directus_revisions.id;


--
-- Name: directus_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_roles (
    id uuid NOT NULL,
    name character varying(100) NOT NULL,
    icon character varying(64) DEFAULT 'supervised_user_circle'::character varying NOT NULL,
    description text,
    parent uuid
);


--
-- Name: directus_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_sessions (
    token character varying(64) NOT NULL,
    "user" uuid,
    expires timestamp with time zone NOT NULL,
    ip character varying(255),
    user_agent text,
    share uuid,
    origin character varying(255),
    next_token character varying(64)
);


--
-- Name: directus_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_settings (
    id integer NOT NULL,
    project_name character varying(100) DEFAULT 'Directus'::character varying NOT NULL,
    project_url character varying(255),
    project_color character varying(255) DEFAULT '#6644FF'::character varying NOT NULL,
    project_logo uuid,
    public_foreground uuid,
    public_background uuid,
    public_note text,
    auth_login_attempts integer DEFAULT 25,
    auth_password_policy character varying(100),
    storage_asset_transform character varying(7) DEFAULT 'all'::character varying,
    storage_asset_presets json,
    custom_css text,
    storage_default_folder uuid,
    basemaps json,
    mapbox_key character varying(255),
    module_bar json,
    project_descriptor character varying(100),
    default_language character varying(255) DEFAULT 'en-US'::character varying NOT NULL,
    custom_aspect_ratios json,
    public_favicon uuid,
    default_appearance character varying(255) DEFAULT 'auto'::character varying NOT NULL,
    default_theme_light character varying(255),
    theme_light_overrides json,
    default_theme_dark character varying(255),
    theme_dark_overrides json,
    report_error_url character varying(255),
    report_bug_url character varying(255),
    report_feature_url character varying(255),
    public_registration boolean DEFAULT false NOT NULL,
    public_registration_verify_email boolean DEFAULT true NOT NULL,
    public_registration_role uuid,
    public_registration_email_filter json,
    visual_editor_urls json,
    project_id uuid,
    mcp_enabled boolean DEFAULT false NOT NULL,
    mcp_allow_deletes boolean DEFAULT false NOT NULL,
    mcp_prompts_collection character varying(255) DEFAULT NULL::character varying,
    mcp_system_prompt_enabled boolean DEFAULT true NOT NULL,
    mcp_system_prompt text,
    project_owner character varying(255),
    project_usage character varying(255),
    org_name character varying(255),
    product_updates boolean,
    project_status character varying(255),
    ai_openai_api_key text,
    ai_anthropic_api_key text,
    ai_system_prompt text
);


--
-- Name: directus_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directus_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directus_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directus_settings_id_seq OWNED BY public.directus_settings.id;


--
-- Name: directus_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_shares (
    id uuid NOT NULL,
    name character varying(255),
    collection character varying(64) NOT NULL,
    item character varying(255) NOT NULL,
    role uuid,
    password character varying(255),
    user_created uuid,
    date_created timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    date_start timestamp with time zone,
    date_end timestamp with time zone,
    times_used integer DEFAULT 0,
    max_uses integer
);


--
-- Name: directus_translations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_translations (
    id uuid NOT NULL,
    language character varying(255) NOT NULL,
    key character varying(255) NOT NULL,
    value text NOT NULL
);


--
-- Name: directus_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_users (
    id uuid NOT NULL,
    first_name character varying(50),
    last_name character varying(50),
    email character varying(128),
    password character varying(255),
    location character varying(255),
    title character varying(50),
    description text,
    tags json,
    avatar uuid,
    language character varying(255) DEFAULT NULL::character varying,
    tfa_secret character varying(255),
    status character varying(16) DEFAULT 'active'::character varying NOT NULL,
    role uuid,
    token character varying(255),
    last_access timestamp with time zone,
    last_page character varying(255),
    provider character varying(128) DEFAULT 'default'::character varying NOT NULL,
    external_identifier character varying(255),
    auth_data json,
    email_notifications boolean DEFAULT true,
    appearance character varying(255),
    theme_dark character varying(255),
    theme_light character varying(255),
    theme_light_overrides json,
    theme_dark_overrides json,
    text_direction character varying(255) DEFAULT 'auto'::character varying NOT NULL
);


--
-- Name: directus_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_versions (
    id uuid NOT NULL,
    key character varying(64) NOT NULL,
    name character varying(255),
    collection character varying(64) NOT NULL,
    item character varying(255) NOT NULL,
    hash character varying(255),
    date_created timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    date_updated timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    user_created uuid,
    user_updated uuid,
    delta json
);


--
-- Name: directus_webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.directus_webhooks (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    method character varying(10) DEFAULT 'POST'::character varying NOT NULL,
    url character varying(255) NOT NULL,
    status character varying(10) DEFAULT 'active'::character varying NOT NULL,
    data boolean DEFAULT true NOT NULL,
    actions character varying(100) NOT NULL,
    collections character varying(255) NOT NULL,
    headers json,
    was_active_before_deprecation boolean DEFAULT false NOT NULL,
    migrated_flow uuid
);


--
-- Name: directus_webhooks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.directus_webhooks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: directus_webhooks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.directus_webhooks_id_seq OWNED BY public.directus_webhooks.id;


--
-- Name: event_agenda; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_agenda (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    event_id text DEFAULT 'bsl2025'::text NOT NULL,
    "time" timestamp with time zone NOT NULL,
    title text NOT NULL,
    description text,
    speakers text[],
    type text,
    location text,
    day text,
    day_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_agenda_type_check CHECK ((type = ANY (ARRAY['keynote'::text, 'panel'::text, 'workshop'::text, 'networking'::text, 'break'::text, 'registration'::text, 'meal'::text])))
);


--
-- Name: event_pass_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_pass_tiers (
    event_id text NOT NULL,
    pass_type text NOT NULL,
    max_meeting_requests integer NOT NULL,
    max_boost_amount integer NOT NULL,
    price_cents integer,
    currency text DEFAULT 'USD'::text NOT NULL,
    price_label text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_pass_tiers_check CHECK (((price_cents IS NOT NULL) OR (price_label IS NOT NULL))),
    CONSTRAINT event_pass_tiers_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT event_pass_tiers_max_boost_amount_check CHECK ((max_boost_amount >= 0)),
    CONSTRAINT event_pass_tiers_max_meeting_requests_check CHECK ((max_meeting_requests >= 0)),
    CONSTRAINT event_pass_tiers_pass_type_check CHECK ((pass_type = ANY (ARRAY['general'::text, 'business'::text, 'vip'::text]))),
    CONSTRAINT event_pass_tiers_price_cents_check CHECK (((price_cents IS NULL) OR (price_cents >= 0))),
    CONSTRAINT event_pass_tiers_price_label_check CHECK (((price_label IS NULL) OR ((char_length(btrim(price_label)) >= 1) AND (char_length(btrim(price_label)) <= 80))))
);


--
-- Name: event_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    user_id uuid NOT NULL,
    role public.event_role NOT NULL,
    granted_by uuid NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT event_roles_future_expiry CHECK (((expires_at IS NULL) OR (expires_at > granted_at)))
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    timezone text DEFAULT 'UTC'::text NOT NULL,
    venue_name text,
    venue_address text,
    city text,
    country text,
    description text,
    branding jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_date_order CHECK (((ends_at IS NULL) OR (starts_at IS NULL) OR (ends_at >= starts_at))),
    CONSTRAINT events_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: hashpass_schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hashpass_schema_migrations (
    id text NOT NULL,
    file_path text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: meeting_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meeting_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ciphertext text NOT NULL,
    nonce text NOT NULL
);


--
-- Name: meeting_slots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    status text DEFAULT 'available'::text NOT NULL,
    meeting_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: meetings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meetings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    meeting_request_id uuid,
    event_id text DEFAULT 'bsl2025'::text NOT NULL,
    slot_id uuid,
    speaker_id text NOT NULL,
    requester_id uuid NOT NULL,
    host_id uuid NOT NULL,
    attendee_id uuid NOT NULL,
    speaker_name text NOT NULL,
    requester_name text,
    meeting_type text DEFAULT 'networking'::text NOT NULL,
    status text DEFAULT 'confirmed'::text NOT NULL,
    scheduled_at timestamp with time zone NOT NULL,
    start_time timestamp with time zone NOT NULL,
    end_time timestamp with time zone NOT NULL,
    duration_minutes integer DEFAULT 15 NOT NULL,
    location text,
    meeting_link text,
    notes text,
    title text,
    description text,
    attendee_email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT meetings_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'confirmed'::text, 'accepted'::text, 'tentative'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text, 'no_show'::text, 'rejected'::text])))
);


--
-- Name: newsletter_subscribers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.newsletter_subscribers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    subscribed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    email_sent boolean DEFAULT false NOT NULL
);


--
-- Name: TABLE newsletter_subscribers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.newsletter_subscribers IS 'Stores newsletter subscribers information';


--
-- Name: COLUMN newsletter_subscribers.email; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.newsletter_subscribers.email IS 'The email address of the subscriber, must be unique';


--
-- Name: COLUMN newsletter_subscribers.subscribed_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.newsletter_subscribers.subscribed_at IS 'When the user subscribed to the newsletter';


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    is_urgent boolean DEFAULT false NOT NULL,
    is_archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    archived_at timestamp with time zone,
    meeting_request_id uuid,
    speaker_id text,
    meeting_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    level text DEFAULT 'info'::text NOT NULL,
    CONSTRAINT notifications_level_check CHECK ((level = ANY (ARRAY['info'::text, 'important'::text, 'critical'::text]))),
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['meeting_request'::text, 'meeting_accepted'::text, 'meeting_declined'::text, 'meeting_reminder'::text, 'meeting_expired'::text, 'meeting_cancelled'::text, 'boost_received'::text, 'system_alert'::text, 'chat_message'::text])))
);


--
-- Name: COLUMN notifications.level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.level IS 'Delivery severity: info stays in-app; important may use push; critical also requires transactional email delivery.';


--
-- Name: otp_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    code text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '01:00:00'::interval) NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE otp_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.otp_codes IS 'Maps 6-digit OTP codes to Supabase token_hashes for email OTP authentication';


--
-- Name: COLUMN otp_codes.code; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.otp_codes.code IS '6-digit code sent to user via email';


--
-- Name: COLUMN otp_codes.token_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.otp_codes.token_hash IS 'Supabase token_hash used for verification';


--
-- Name: pass_claim_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pass_claim_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    code_hash text NOT NULL,
    pass_type public.pass_type DEFAULT 'general'::public.pass_type NOT NULL,
    max_claims integer DEFAULT 1,
    claimed_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    label text NOT NULL,
    CONSTRAINT pass_claim_codes_claimed_count_check CHECK (((claimed_count >= 0) AND ((max_claims IS NULL) OR (claimed_count <= max_claims)))),
    CONSTRAINT pass_claim_codes_max_claims_check CHECK (((max_claims IS NULL) OR (max_claims > 0)))
);


--
-- Name: pass_code_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pass_code_claims (
    code_id uuid NOT NULL,
    user_id uuid NOT NULL,
    pass_id text NOT NULL,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pass_request_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pass_request_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pass_id text NOT NULL,
    user_id uuid NOT NULL,
    remaining_meeting_requests integer DEFAULT 5,
    remaining_boost_amount numeric(10,2) DEFAULT 100.00,
    last_reset_at timestamp with time zone DEFAULT now()
);


--
-- Name: passes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passes (
    id text NOT NULL,
    user_id text NOT NULL,
    event_id text DEFAULT 'bsl2025'::text NOT NULL,
    pass_type public.pass_type DEFAULT 'general'::public.pass_type,
    status public.pass_status DEFAULT 'active'::public.pass_status,
    pass_number text NOT NULL,
    max_meeting_requests integer DEFAULT 5,
    used_meeting_requests integer DEFAULT 0,
    max_boost_amount numeric(10,2) DEFAULT 100.00,
    used_boost_amount numeric(10,2) DEFAULT 0,
    access_features text[] DEFAULT '{}'::text[],
    special_perks text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text,
    full_name text,
    avatar_url text,
    company text,
    title text,
    bio text,
    phone text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: qr_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qr_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    token text NOT NULL,
    qr_type public.qr_type DEFAULT 'pass'::public.qr_type NOT NULL,
    pass_id text,
    user_id text NOT NULL,
    associated_entity_id text,
    qr_data jsonb,
    display_data jsonb,
    status public.qr_status DEFAULT 'active'::public.qr_status,
    expires_at timestamp with time zone,
    generated_at timestamp with time zone DEFAULT now(),
    used_at timestamp with time zone,
    last_checked_at timestamp with time zone,
    usage_count integer DEFAULT 0,
    max_uses integer DEFAULT 1,
    admin_notes text,
    revoked_by text,
    revoked_at timestamp with time zone,
    revoked_reason text,
    ip_address text,
    device_fingerprint text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE qr_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.qr_codes IS 'Dynamic QR codes with double-spend prevention and admin controls';


--
-- Name: qr_scan_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qr_scan_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    qr_code_id uuid NOT NULL,
    token text NOT NULL,
    scanned_by_user_id text,
    scanned_by_device_id text,
    scan_status text NOT NULL,
    scan_message text,
    scan_location jsonb,
    scan_ip_address text,
    scan_user_agent text,
    scanned_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE qr_scan_logs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.qr_scan_logs IS 'Audit trail for all QR code scans';


--
-- Name: reward_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reward_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_symbol text DEFAULT 'LUKAS'::text NOT NULL,
    transaction_type public.reward_transaction_type NOT NULL,
    amount numeric(20,8) NOT NULL,
    balance_before numeric(20,8) NOT NULL,
    balance_after numeric(20,8) NOT NULL,
    source public.reward_source,
    reference_id uuid,
    reference_type text,
    description text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE reward_transactions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.reward_transactions IS 'Transaction history for all reward operations';


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    id text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    token text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL
);


--
-- Name: speaker_identity_claim_event_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.speaker_identity_claim_event_roles (
    claim_id uuid NOT NULL,
    event_id text NOT NULL,
    role public.event_role NOT NULL
);


--
-- Name: speaker_identity_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.speaker_identity_claims (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    speaker_id text NOT NULL,
    email_normalized text NOT NULL,
    status text DEFAULT 'unclaimed'::text NOT NULL,
    configured_by uuid NOT NULL,
    claimed_user_id uuid,
    claimed_at timestamp with time zone,
    claim_error text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT speaker_identity_claims_email_normalized_check CHECK ((email_normalized = lower(btrim(email_normalized)))),
    CONSTRAINT speaker_identity_claims_status_check CHECK ((status = ANY (ARRAY['unclaimed'::text, 'claimed'::text, 'needs_review'::text]))),
    CONSTRAINT speaker_identity_claims_status_consistency_check CHECK ((((status = 'claimed'::text) AND (claimed_user_id IS NOT NULL) AND (claimed_at IS NOT NULL)) OR ((status <> 'claimed'::text) AND (claimed_user_id IS NULL))))
);


--
-- Name: speakers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.speakers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    user_id uuid,
    name text NOT NULL,
    title text,
    company text,
    bio text,
    image_url text,
    social_links jsonb DEFAULT '{}'::jsonb NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_idempotency_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_idempotency_keys (
    app_id text NOT NULL,
    route text NOT NULL,
    key text NOT NULL,
    response_status integer NOT NULL,
    response_body jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_kapso_inbound_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_kapso_inbound_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    idempotency_key text NOT NULL,
    payload jsonb NOT NULL,
    processed boolean DEFAULT false NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    author text NOT NULL,
    body text NOT NULL,
    delivery_status text DEFAULT 'sent'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_messages_author_check CHECK ((author = ANY (ARRAY['customer'::text, 'ai'::text, 'agent'::text, 'system'::text]))),
    CONSTRAINT support_messages_delivery_status_check CHECK ((delivery_status = ANY (ARRAY['queued'::text, 'sent'::text, 'delivered'::text, 'failed'::text])))
);


--
-- Name: support_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    visitor_id uuid NOT NULL,
    app_id text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_ticket_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_ticket_reads (
    ticket_id uuid NOT NULL,
    visitor_id uuid NOT NULL,
    last_read_cursor text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    app_id text NOT NULL,
    visitor_id uuid NOT NULL,
    subject text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    needs_human boolean DEFAULT false NOT NULL,
    context jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_tickets_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
    CONSTRAINT support_tickets_status_check CHECK ((status = ANY (ARRAY['open'::text, 'pending'::text, 'resolved'::text, 'closed'::text])))
);


--
-- Name: support_visitors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_visitors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    app_id text NOT NULL,
    external_id text,
    email text,
    name text,
    locale text,
    traits jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."user" (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    email text NOT NULL,
    provider text DEFAULT 'email'::text NOT NULL,
    auth_provider text DEFAULT 'email'::text NOT NULL,
    auth_user_id text,
    first_name text,
    last_name text,
    full_name text,
    avatar_url text,
    phone text,
    role text DEFAULT 'user'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    email_verified_at timestamp with time zone,
    last_sign_in_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    auth_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    profile_metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    provider_ids jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: TABLE "user"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."user" IS 'Canonical user registry. Every account is replicated here regardless of auth provider.';


--
-- Name: user_agenda_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_agenda_status (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    agenda_id text,
    event_id text DEFAULT 'bsl2025'::text NOT NULL,
    status text DEFAULT 'unconfirmed'::text NOT NULL,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    slot_time timestamp with time zone,
    slot_status text DEFAULT 'available'::text,
    is_favorite boolean DEFAULT false,
    meeting_id uuid,
    CONSTRAINT user_agenda_status_slot_status_check CHECK ((slot_status = ANY (ARRAY['available'::text, 'interested'::text, 'blocked'::text, 'tentative'::text]))),
    CONSTRAINT user_agenda_status_status_check CHECK ((status = ANY (ARRAY['unconfirmed'::text, 'confirmed'::text, 'available'::text, 'interested'::text, 'blocked'::text, 'tentative'::text])))
);


--
-- Name: TABLE user_agenda_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_agenda_status IS 'Tracks user confirmation status for all schedule slots (agenda events, personal meetings, and free slots)';


--
-- Name: COLUMN user_agenda_status.slot_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_agenda_status.slot_status IS 'Status for free slots: available, interested, blocked, or tentative';


--
-- Name: COLUMN user_agenda_status.is_favorite; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_agenda_status.is_favorite IS 'Marks a confirmed agenda event or meeting as favorite';


--
-- Name: user_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_symbol text DEFAULT 'LUKAS'::text NOT NULL,
    balance numeric(20,8) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_balances_balance_check CHECK ((balance >= (0)::numeric))
);


--
-- Name: user_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    speaker_id text NOT NULL,
    blocked_user_id uuid NOT NULL,
    reason text,
    blocked_at timestamp with time zone DEFAULT now(),
    blocker_user_id uuid,
    is_muted boolean DEFAULT false NOT NULL
);


--
-- Name: user_chat_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_chat_keys (
    user_id uuid NOT NULL,
    public_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_email_tracking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_email_tracking (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    email_type text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    locale text DEFAULT 'en'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_email_tracking_email_type_check CHECK ((email_type = ANY (ARRAY['welcome'::text, 'userOnboarding'::text, 'speakerOnboarding'::text]))),
    CONSTRAINT user_email_tracking_locale_check CHECK ((locale = ANY (ARRAY['en'::text, 'es'::text, 'ko'::text, 'fr'::text, 'pt'::text, 'de'::text])))
);


--
-- Name: TABLE user_email_tracking; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_email_tracking IS 'Tracks which emails have been sent to each user';


--
-- Name: COLUMN user_email_tracking.email_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_email_tracking.email_type IS 'Type of email: welcome, userOnboarding, or speakerOnboarding';


--
-- Name: COLUMN user_email_tracking.locale; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_email_tracking.locale IS 'Locale used when sending the email';


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    user_id uuid NOT NULL,
    full_name text,
    display_name text,
    avatar_url text,
    company text,
    title text,
    bio text,
    wallet_address text,
    email text,
    phone text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_request_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_request_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_id text DEFAULT 'bsl2025'::text NOT NULL,
    ticket_type text DEFAULT 'general'::text NOT NULL,
    total_requests_sent integer DEFAULT 0 NOT NULL,
    successful_requests integer DEFAULT 0 NOT NULL,
    rejected_requests integer DEFAULT 0 NOT NULL,
    last_request_at timestamp with time zone,
    next_request_allowed_at timestamp with time zone,
    total_boosts_used integer DEFAULT 0 NOT NULL,
    total_boost_amount numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_request_limits_ticket_type_check CHECK ((ticket_type = ANY (ARRAY['general'::text, 'business'::text, 'vip'::text])))
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.user_role DEFAULT 'user'::public.user_role NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb
);


--
-- Name: TABLE user_roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_roles IS 'User roles for role-based access control';


--
-- Name: COLUMN user_roles.role; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_roles.role IS 'Role name (e.g., admin, moderator, user)';


--
-- Name: user_schedule_shares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_schedule_shares (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_id text NOT NULL,
    share_token text DEFAULT encode(extensions.gen_random_bytes(16), 'hex'::text) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_tutorial_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_tutorial_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    tutorial_type text NOT NULL,
    status text DEFAULT 'not_started'::text NOT NULL,
    current_step integer DEFAULT 0 NOT NULL,
    total_steps_completed integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    skipped_at timestamp with time zone,
    last_step_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_tutorial_progress_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'completed'::text, 'skipped'::text]))),
    CONSTRAINT user_tutorial_progress_tutorial_type_check CHECK ((tutorial_type = ANY (ARRAY['main'::text, 'networking'::text])))
);


--
-- Name: verification; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.verification (
    id text NOT NULL,
    identifier text NOT NULL,
    value text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: wallet_auth; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_auth (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    wallet_type public.wallet_type NOT NULL,
    wallet_address text NOT NULL,
    nonce text,
    nonce_expires_at timestamp with time zone,
    last_used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE wallet_auth; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.wallet_auth IS 'Wallet addresses linked to user accounts for authentication';


--
-- Name: COLUMN wallet_auth.wallet_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.wallet_auth.wallet_type IS 'Type of wallet: ethereum or solana';


--
-- Name: COLUMN wallet_auth.wallet_address; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.wallet_auth.wallet_address IS 'Ethereum address (0x...) or Solana public key (base58)';


--
-- Name: bsl_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bsl_audit ALTER COLUMN id SET DEFAULT nextval('public.bsl_audit_id_seq'::regclass);


--
-- Name: directus_activity id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_activity ALTER COLUMN id SET DEFAULT nextval('public.directus_activity_id_seq'::regclass);


--
-- Name: directus_fields id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_fields ALTER COLUMN id SET DEFAULT nextval('public.directus_fields_id_seq'::regclass);


--
-- Name: directus_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_notifications ALTER COLUMN id SET DEFAULT nextval('public.directus_notifications_id_seq'::regclass);


--
-- Name: directus_permissions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_permissions ALTER COLUMN id SET DEFAULT nextval('public.directus_permissions_id_seq'::regclass);


--
-- Name: directus_presets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_presets ALTER COLUMN id SET DEFAULT nextval('public.directus_presets_id_seq'::regclass);


--
-- Name: directus_relations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_relations ALTER COLUMN id SET DEFAULT nextval('public.directus_relations_id_seq'::regclass);


--
-- Name: directus_revisions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_revisions ALTER COLUMN id SET DEFAULT nextval('public.directus_revisions_id_seq'::regclass);


--
-- Name: directus_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_settings ALTER COLUMN id SET DEFAULT nextval('public.directus_settings_id_seq'::regclass);


--
-- Name: directus_webhooks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_webhooks ALTER COLUMN id SET DEFAULT nextval('public.directus_webhooks_id_seq'::regclass);


--
-- Name: account account_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT account_pkey PRIMARY KEY (id);


--
-- Name: admin_action_log admin_action_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_action_log
    ADD CONSTRAINT admin_action_log_pkey PRIMARY KEY (id);


--
-- Name: admin_email_deliveries admin_email_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_email_deliveries
    ADD CONSTRAINT admin_email_deliveries_pkey PRIMARY KEY (id);


--
-- Name: admin_matchmaking_runs admin_matchmaking_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_matchmaking_runs
    ADD CONSTRAINT admin_matchmaking_runs_pkey PRIMARY KEY (id);


--
-- Name: ba_users ba_users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ba_users
    ADD CONSTRAINT ba_users_email_key UNIQUE (email);


--
-- Name: ba_users ba_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ba_users
    ADD CONSTRAINT ba_users_pkey PRIMARY KEY (id);


--
-- Name: bsl_audit bsl_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bsl_audit
    ADD CONSTRAINT bsl_audit_pkey PRIMARY KEY (id);


--
-- Name: bsl_bookings bsl_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bsl_bookings
    ADD CONSTRAINT bsl_bookings_pkey PRIMARY KEY (id);


--
-- Name: bsl_bookings bsl_bookings_speakerid_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bsl_bookings
    ADD CONSTRAINT bsl_bookings_speakerid_start_key UNIQUE (speakerid, start);


--
-- Name: bsl_speakers bsl_speakers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bsl_speakers
    ADD CONSTRAINT bsl_speakers_pkey PRIMARY KEY (id);


--
-- Name: bsl_tickets bsl_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bsl_tickets
    ADD CONSTRAINT bsl_tickets_pkey PRIMARY KEY (ticketid);


--
-- Name: chat_last_seen chat_last_seen_meeting_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_last_seen
    ADD CONSTRAINT chat_last_seen_meeting_id_user_id_key UNIQUE (meeting_id, user_id);


--
-- Name: chat_last_seen chat_last_seen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_last_seen
    ADD CONSTRAINT chat_last_seen_pkey PRIMARY KEY (id);


--
-- Name: directus_access directus_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_access
    ADD CONSTRAINT directus_access_pkey PRIMARY KEY (id);


--
-- Name: directus_activity directus_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_activity
    ADD CONSTRAINT directus_activity_pkey PRIMARY KEY (id);


--
-- Name: directus_collections directus_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_collections
    ADD CONSTRAINT directus_collections_pkey PRIMARY KEY (collection);


--
-- Name: directus_comments directus_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_comments
    ADD CONSTRAINT directus_comments_pkey PRIMARY KEY (id);


--
-- Name: directus_dashboards directus_dashboards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_dashboards
    ADD CONSTRAINT directus_dashboards_pkey PRIMARY KEY (id);


--
-- Name: directus_extensions directus_extensions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_extensions
    ADD CONSTRAINT directus_extensions_pkey PRIMARY KEY (id);


--
-- Name: directus_fields directus_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_fields
    ADD CONSTRAINT directus_fields_pkey PRIMARY KEY (id);


--
-- Name: directus_files directus_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_files
    ADD CONSTRAINT directus_files_pkey PRIMARY KEY (id);


--
-- Name: directus_flows directus_flows_operation_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_flows
    ADD CONSTRAINT directus_flows_operation_unique UNIQUE (operation);


--
-- Name: directus_flows directus_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_flows
    ADD CONSTRAINT directus_flows_pkey PRIMARY KEY (id);


--
-- Name: directus_folders directus_folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_folders
    ADD CONSTRAINT directus_folders_pkey PRIMARY KEY (id);


--
-- Name: directus_migrations directus_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_migrations
    ADD CONSTRAINT directus_migrations_pkey PRIMARY KEY (version);


--
-- Name: directus_notifications directus_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_notifications
    ADD CONSTRAINT directus_notifications_pkey PRIMARY KEY (id);


--
-- Name: directus_operations directus_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_operations
    ADD CONSTRAINT directus_operations_pkey PRIMARY KEY (id);


--
-- Name: directus_operations directus_operations_reject_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_operations
    ADD CONSTRAINT directus_operations_reject_unique UNIQUE (reject);


--
-- Name: directus_operations directus_operations_resolve_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_operations
    ADD CONSTRAINT directus_operations_resolve_unique UNIQUE (resolve);


--
-- Name: directus_panels directus_panels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_panels
    ADD CONSTRAINT directus_panels_pkey PRIMARY KEY (id);


--
-- Name: directus_permissions directus_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_permissions
    ADD CONSTRAINT directus_permissions_pkey PRIMARY KEY (id);


--
-- Name: directus_policies directus_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_policies
    ADD CONSTRAINT directus_policies_pkey PRIMARY KEY (id);


--
-- Name: directus_presets directus_presets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_presets
    ADD CONSTRAINT directus_presets_pkey PRIMARY KEY (id);


--
-- Name: directus_relations directus_relations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_relations
    ADD CONSTRAINT directus_relations_pkey PRIMARY KEY (id);


--
-- Name: directus_revisions directus_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_revisions
    ADD CONSTRAINT directus_revisions_pkey PRIMARY KEY (id);


--
-- Name: directus_roles directus_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_roles
    ADD CONSTRAINT directus_roles_pkey PRIMARY KEY (id);


--
-- Name: directus_sessions directus_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_sessions
    ADD CONSTRAINT directus_sessions_pkey PRIMARY KEY (token);


--
-- Name: directus_settings directus_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_settings
    ADD CONSTRAINT directus_settings_pkey PRIMARY KEY (id);


--
-- Name: directus_shares directus_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_shares
    ADD CONSTRAINT directus_shares_pkey PRIMARY KEY (id);


--
-- Name: directus_translations directus_translations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_translations
    ADD CONSTRAINT directus_translations_pkey PRIMARY KEY (id);


--
-- Name: directus_users directus_users_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_users
    ADD CONSTRAINT directus_users_email_unique UNIQUE (email);


--
-- Name: directus_users directus_users_external_identifier_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_users
    ADD CONSTRAINT directus_users_external_identifier_unique UNIQUE (external_identifier);


--
-- Name: directus_users directus_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_users
    ADD CONSTRAINT directus_users_pkey PRIMARY KEY (id);


--
-- Name: directus_users directus_users_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_users
    ADD CONSTRAINT directus_users_token_unique UNIQUE (token);


--
-- Name: directus_versions directus_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_versions
    ADD CONSTRAINT directus_versions_pkey PRIMARY KEY (id);


--
-- Name: directus_webhooks directus_webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_webhooks
    ADD CONSTRAINT directus_webhooks_pkey PRIMARY KEY (id);


--
-- Name: event_agenda event_agenda_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_agenda
    ADD CONSTRAINT event_agenda_pkey PRIMARY KEY (id);


--
-- Name: event_pass_tiers event_pass_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_pass_tiers
    ADD CONSTRAINT event_pass_tiers_pkey PRIMARY KEY (event_id, pass_type);


--
-- Name: event_roles event_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_roles
    ADD CONSTRAINT event_roles_pkey PRIMARY KEY (id);


--
-- Name: event_roles event_roles_unique_assignment; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_roles
    ADD CONSTRAINT event_roles_unique_assignment UNIQUE (event_id, user_id, role);


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: events events_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_slug_key UNIQUE (slug);


--
-- Name: hashpass_schema_migrations hashpass_schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hashpass_schema_migrations
    ADD CONSTRAINT hashpass_schema_migrations_pkey PRIMARY KEY (id);


--
-- Name: meeting_chat_messages meeting_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_chat_messages
    ADD CONSTRAINT meeting_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: meeting_requests meeting_requests_duration_minutes_supported_range; Type: CHECK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE public.meeting_requests
    ADD CONSTRAINT meeting_requests_duration_minutes_supported_range CHECK (((duration_minutes >= 5) AND (duration_minutes <= 30))) NOT VALID;


--
-- Name: meeting_requests meeting_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_requests
    ADD CONSTRAINT meeting_requests_pkey PRIMARY KEY (id);


--
-- Name: meeting_slots meeting_slots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_slots
    ADD CONSTRAINT meeting_slots_pkey PRIMARY KEY (id);


--
-- Name: meetings meetings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_pkey PRIMARY KEY (id);


--
-- Name: newsletter_subscribers newsletter_subscribers_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_email_key UNIQUE (email);


--
-- Name: newsletter_subscribers newsletter_subscribers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.newsletter_subscribers
    ADD CONSTRAINT newsletter_subscribers_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: otp_codes otp_codes_email_code_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_codes
    ADD CONSTRAINT otp_codes_email_code_token_hash_key UNIQUE (email, code, token_hash);


--
-- Name: otp_codes otp_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_codes
    ADD CONSTRAINT otp_codes_pkey PRIMARY KEY (id);


--
-- Name: pass_claim_codes pass_claim_codes_code_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pass_claim_codes
    ADD CONSTRAINT pass_claim_codes_code_hash_key UNIQUE (code_hash);


--
-- Name: pass_claim_codes pass_claim_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pass_claim_codes
    ADD CONSTRAINT pass_claim_codes_pkey PRIMARY KEY (id);


--
-- Name: pass_code_claims pass_code_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pass_code_claims
    ADD CONSTRAINT pass_code_claims_pkey PRIMARY KEY (code_id, user_id);


--
-- Name: pass_request_limits pass_request_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pass_request_limits
    ADD CONSTRAINT pass_request_limits_pkey PRIMARY KEY (id);


--
-- Name: passes passes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passes
    ADD CONSTRAINT passes_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: qr_codes qr_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_codes
    ADD CONSTRAINT qr_codes_pkey PRIMARY KEY (id);


--
-- Name: qr_codes qr_codes_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_codes
    ADD CONSTRAINT qr_codes_token_key UNIQUE (token);


--
-- Name: qr_scan_logs qr_scan_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_scan_logs
    ADD CONSTRAINT qr_scan_logs_pkey PRIMARY KEY (id);


--
-- Name: reward_transactions reward_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_transactions
    ADD CONSTRAINT reward_transactions_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (id);


--
-- Name: session session_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_token_key UNIQUE (token);


--
-- Name: speaker_identity_claim_event_roles speaker_identity_claim_event_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speaker_identity_claim_event_roles
    ADD CONSTRAINT speaker_identity_claim_event_roles_pkey PRIMARY KEY (claim_id, event_id, role);


--
-- Name: speaker_identity_claims speaker_identity_claims_claimed_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speaker_identity_claims
    ADD CONSTRAINT speaker_identity_claims_claimed_user_id_key UNIQUE (claimed_user_id);


--
-- Name: speaker_identity_claims speaker_identity_claims_email_normalized_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speaker_identity_claims
    ADD CONSTRAINT speaker_identity_claims_email_normalized_key UNIQUE (email_normalized);


--
-- Name: speaker_identity_claims speaker_identity_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speaker_identity_claims
    ADD CONSTRAINT speaker_identity_claims_pkey PRIMARY KEY (id);


--
-- Name: speaker_identity_claims speaker_identity_claims_speaker_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speaker_identity_claims
    ADD CONSTRAINT speaker_identity_claims_speaker_id_key UNIQUE (speaker_id);


--
-- Name: speakers speakers_event_user_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speakers
    ADD CONSTRAINT speakers_event_user_unique UNIQUE NULLS NOT DISTINCT (event_id, user_id);


--
-- Name: speakers speakers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speakers
    ADD CONSTRAINT speakers_pkey PRIMARY KEY (id);


--
-- Name: support_idempotency_keys support_idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_idempotency_keys
    ADD CONSTRAINT support_idempotency_keys_pkey PRIMARY KEY (app_id, route, key);


--
-- Name: support_kapso_inbound_events support_kapso_inbound_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_kapso_inbound_events
    ADD CONSTRAINT support_kapso_inbound_events_pkey PRIMARY KEY (id);


--
-- Name: support_messages support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);


--
-- Name: support_sessions support_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_sessions
    ADD CONSTRAINT support_sessions_pkey PRIMARY KEY (id);


--
-- Name: support_ticket_reads support_ticket_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_reads
    ADD CONSTRAINT support_ticket_reads_pkey PRIMARY KEY (ticket_id, visitor_id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: support_visitors support_visitors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_visitors
    ADD CONSTRAINT support_visitors_pkey PRIMARY KEY (id);


--
-- Name: passes unique_pass_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passes
    ADD CONSTRAINT unique_pass_number UNIQUE (pass_number);


--
-- Name: user_blocks unique_speaker_user_block; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT unique_speaker_user_block UNIQUE (speaker_id, blocked_user_id);


--
-- Name: meeting_slots unique_user_slot; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_slots
    ADD CONSTRAINT unique_user_slot UNIQUE (user_id, start_time);


--
-- Name: user_agenda_status user_agenda_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_agenda_status
    ADD CONSTRAINT user_agenda_status_pkey PRIMARY KEY (id);


--
-- Name: user_agenda_status user_agenda_status_user_slot_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_agenda_status
    ADD CONSTRAINT user_agenda_status_user_slot_key UNIQUE (user_id, slot_time);


--
-- Name: user_balances user_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_balances
    ADD CONSTRAINT user_balances_pkey PRIMARY KEY (id);


--
-- Name: user_balances user_balances_user_id_token_symbol_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_balances
    ADD CONSTRAINT user_balances_user_id_token_symbol_key UNIQUE (user_id, token_symbol);


--
-- Name: user_blocks user_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_pkey PRIMARY KEY (id);


--
-- Name: user_chat_keys user_chat_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_chat_keys
    ADD CONSTRAINT user_chat_keys_pkey PRIMARY KEY (user_id);


--
-- Name: user_email_tracking user_email_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_email_tracking
    ADD CONSTRAINT user_email_tracking_pkey PRIMARY KEY (id);


--
-- Name: user_email_tracking user_email_tracking_user_id_email_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_email_tracking
    ADD CONSTRAINT user_email_tracking_user_id_email_type_key UNIQUE (user_id, email_type);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: user_request_limits user_request_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_request_limits
    ADD CONSTRAINT user_request_limits_pkey PRIMARY KEY (id);


--
-- Name: user_request_limits user_request_limits_user_id_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_request_limits
    ADD CONSTRAINT user_request_limits_user_id_event_id_key UNIQUE (user_id, event_id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: user_schedule_shares user_schedule_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_schedule_shares
    ADD CONSTRAINT user_schedule_shares_pkey PRIMARY KEY (id);


--
-- Name: user_schedule_shares user_schedule_shares_share_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_schedule_shares
    ADD CONSTRAINT user_schedule_shares_share_token_key UNIQUE (share_token);


--
-- Name: user_schedule_shares user_schedule_shares_user_id_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_schedule_shares
    ADD CONSTRAINT user_schedule_shares_user_id_event_id_key UNIQUE (user_id, event_id);


--
-- Name: user_tutorial_progress user_tutorial_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tutorial_progress
    ADD CONSTRAINT user_tutorial_progress_pkey PRIMARY KEY (id);


--
-- Name: user_tutorial_progress user_tutorial_progress_user_id_tutorial_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tutorial_progress
    ADD CONSTRAINT user_tutorial_progress_user_id_tutorial_type_key UNIQUE (user_id, tutorial_type);


--
-- Name: user users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: user users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."user"
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: verification verification_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.verification
    ADD CONSTRAINT verification_pkey PRIMARY KEY (id);


--
-- Name: wallet_auth wallet_auth_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_auth
    ADD CONSTRAINT wallet_auth_pkey PRIMARY KEY (id);


--
-- Name: wallet_auth wallet_auth_wallet_type_wallet_address_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_auth
    ADD CONSTRAINT wallet_auth_wallet_type_wallet_address_key UNIQUE (wallet_type, wallet_address);


--
-- Name: account_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "account_userId_idx" ON public.account USING btree ("userId");


--
-- Name: admin_email_deliveries_event_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_email_deliveries_event_created_idx ON public.admin_email_deliveries USING btree (event_id, created_at DESC);


--
-- Name: directus_activity_timestamp_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX directus_activity_timestamp_index ON public.directus_activity USING btree ("timestamp");


--
-- Name: directus_revisions_parent_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX directus_revisions_parent_index ON public.directus_revisions USING btree (parent);


--
-- Name: idx_admin_action_actor_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_action_actor_created ON public.admin_action_log USING btree (actor_user_id, created_at DESC);


--
-- Name: idx_admin_action_event_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_action_event_created ON public.admin_action_log USING btree (event_id, created_at DESC);


--
-- Name: idx_bsl_speakers_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bsl_speakers_user_id ON public.bsl_speakers USING btree (user_id);


--
-- Name: idx_chat_last_seen_meeting_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_last_seen_meeting_user ON public.chat_last_seen USING btree (meeting_id, user_id);


--
-- Name: idx_event_pass_tiers_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_pass_tiers_event ON public.event_pass_tiers USING btree (event_id, pass_type);


--
-- Name: idx_event_roles_user_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_roles_user_event ON public.event_roles USING btree (user_id, event_id);


--
-- Name: idx_meeting_chat_messages_meeting; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_chat_messages_meeting ON public.meeting_chat_messages USING btree (meeting_id);


--
-- Name: idx_meeting_requests_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_requests_expires_at ON public.meeting_requests USING btree (expires_at) WHERE (status = ANY (ARRAY['pending'::text, 'requested'::text, 'approved'::text, 'accepted'::text]));


--
-- Name: idx_meeting_requests_requester; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_requests_requester ON public.meeting_requests USING btree (requester_id);


--
-- Name: idx_meeting_requests_speaker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_requests_speaker ON public.meeting_requests USING btree (speaker_id);


--
-- Name: idx_meeting_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_requests_status ON public.meeting_requests USING btree (status);


--
-- Name: idx_meeting_requests_unique_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_meeting_requests_unique_active ON public.meeting_requests USING btree (event_id, requester_id, speaker_id) WHERE (status = ANY (ARRAY['pending'::text, 'requested'::text, 'approved'::text, 'accepted'::text]));


--
-- Name: idx_meeting_slots_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_slots_status ON public.meeting_slots USING btree (status);


--
-- Name: idx_meeting_slots_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_slots_user_id ON public.meeting_slots USING btree (user_id);


--
-- Name: idx_meeting_slots_user_start; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_meeting_slots_user_start ON public.meeting_slots USING btree (user_id, start_time);


--
-- Name: idx_meetings_attendee; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meetings_attendee ON public.meetings USING btree (attendee_id);


--
-- Name: idx_meetings_host; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meetings_host ON public.meetings USING btree (host_id);


--
-- Name: idx_meetings_requester; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meetings_requester ON public.meetings USING btree (requester_id);


--
-- Name: idx_meetings_scheduled_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meetings_scheduled_at ON public.meetings USING btree (scheduled_at);


--
-- Name: idx_meetings_speaker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meetings_speaker ON public.meetings USING btree (speaker_id);


--
-- Name: idx_newsletter_subscribers_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newsletter_subscribers_email ON public.newsletter_subscribers USING btree (email);


--
-- Name: idx_otp_codes_email_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_codes_email_code ON public.otp_codes USING btree (email, code);


--
-- Name: idx_otp_codes_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_codes_expires_at ON public.otp_codes USING btree (expires_at);


--
-- Name: idx_otp_codes_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_codes_token_hash ON public.otp_codes USING btree (token_hash);


--
-- Name: idx_pass_claim_codes_event_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pass_claim_codes_event_active ON public.pass_claim_codes USING btree (event_id, is_active, created_at DESC);


--
-- Name: idx_pass_request_limits_pass; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pass_request_limits_pass ON public.pass_request_limits USING btree (pass_id);


--
-- Name: idx_pass_request_limits_pass_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pass_request_limits_pass_id ON public.pass_request_limits USING btree (pass_id);


--
-- Name: idx_pass_request_limits_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pass_request_limits_user_id ON public.pass_request_limits USING btree (user_id);


--
-- Name: idx_passes_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passes_event_id ON public.passes USING btree (event_id);


--
-- Name: idx_passes_event_status_created_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passes_event_status_created_id ON public.passes USING btree (event_id, status, created_at DESC, id DESC);


--
-- Name: idx_passes_pass_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passes_pass_type ON public.passes USING btree (pass_type);


--
-- Name: idx_passes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passes_status ON public.passes USING btree (status);


--
-- Name: idx_passes_type_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passes_type_status ON public.passes USING btree (pass_type, status);


--
-- Name: idx_passes_user_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passes_user_event ON public.passes USING btree (user_id, event_id);


--
-- Name: idx_passes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passes_user_id ON public.passes USING btree (user_id);


--
-- Name: idx_qr_codes_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_codes_active ON public.qr_codes USING btree (status, expires_at) WHERE (status = 'active'::public.qr_status);


--
-- Name: idx_qr_codes_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_codes_expires_at ON public.qr_codes USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_qr_codes_pass_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_codes_pass_id ON public.qr_codes USING btree (pass_id);


--
-- Name: idx_qr_codes_qr_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_codes_qr_type ON public.qr_codes USING btree (qr_type);


--
-- Name: idx_qr_codes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_codes_status ON public.qr_codes USING btree (status);


--
-- Name: idx_qr_codes_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_codes_token ON public.qr_codes USING btree (token);


--
-- Name: idx_qr_codes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_codes_user_id ON public.qr_codes USING btree (user_id);


--
-- Name: idx_qr_scan_logs_qr_code_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_scan_logs_qr_code_id ON public.qr_scan_logs USING btree (qr_code_id);


--
-- Name: idx_qr_scan_logs_scanned_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_scan_logs_scanned_at ON public.qr_scan_logs USING btree (scanned_at);


--
-- Name: idx_qr_scan_logs_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_qr_scan_logs_token ON public.qr_scan_logs USING btree (token);


--
-- Name: idx_reward_transactions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reward_transactions_created_at ON public.reward_transactions USING btree (created_at DESC);


--
-- Name: idx_reward_transactions_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reward_transactions_reference ON public.reward_transactions USING btree (reference_id, reference_type);


--
-- Name: idx_reward_transactions_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reward_transactions_source ON public.reward_transactions USING btree (source);


--
-- Name: idx_reward_transactions_token_symbol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reward_transactions_token_symbol ON public.reward_transactions USING btree (token_symbol);


--
-- Name: idx_reward_transactions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reward_transactions_type ON public.reward_transactions USING btree (transaction_type);


--
-- Name: idx_reward_transactions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reward_transactions_user_id ON public.reward_transactions USING btree (user_id);


--
-- Name: idx_speakers_event_sort; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_speakers_event_sort ON public.speakers USING btree (event_id, sort_order, name);


--
-- Name: idx_support_kapso_inbound_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_support_kapso_inbound_idempotency ON public.support_kapso_inbound_events USING btree (idempotency_key);


--
-- Name: idx_support_messages_ticket_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_messages_ticket_created ON public.support_messages USING btree (ticket_id, created_at, id);


--
-- Name: idx_support_sessions_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_sessions_expires_at ON public.support_sessions USING btree (expires_at);


--
-- Name: idx_support_sessions_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_support_sessions_token_hash ON public.support_sessions USING btree (token_hash);


--
-- Name: idx_support_sessions_visitor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_sessions_visitor ON public.support_sessions USING btree (visitor_id);


--
-- Name: idx_support_tickets_app_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_app_status ON public.support_tickets USING btree (app_id, status, updated_at DESC);


--
-- Name: idx_support_tickets_visitor_updated; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_support_tickets_visitor_updated ON public.support_tickets USING btree (visitor_id, updated_at DESC, id DESC);


--
-- Name: idx_support_visitors_app_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_support_visitors_app_email ON public.support_visitors USING btree (app_id, email) WHERE (email IS NOT NULL);


--
-- Name: idx_support_visitors_app_external; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_support_visitors_app_external ON public.support_visitors USING btree (app_id, external_id) WHERE (external_id IS NOT NULL);


--
-- Name: idx_user_agenda_status_agenda_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_agenda_status_agenda_id ON public.user_agenda_status USING btree (agenda_id);


--
-- Name: idx_user_agenda_status_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_agenda_status_event_id ON public.user_agenda_status USING btree (event_id);


--
-- Name: idx_user_agenda_status_is_favorite; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_agenda_status_is_favorite ON public.user_agenda_status USING btree (is_favorite) WHERE (is_favorite = true);


--
-- Name: idx_user_agenda_status_slot_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_agenda_status_slot_status ON public.user_agenda_status USING btree (slot_status);


--
-- Name: idx_user_agenda_status_slot_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_agenda_status_slot_time ON public.user_agenda_status USING btree (slot_time);


--
-- Name: idx_user_agenda_status_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_agenda_status_status ON public.user_agenda_status USING btree (status);


--
-- Name: idx_user_agenda_status_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_agenda_status_user_id ON public.user_agenda_status USING btree (user_id);


--
-- Name: idx_user_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_auth_user_id ON public."user" USING btree (auth_user_id);


--
-- Name: idx_user_balances_token_symbol; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_balances_token_symbol ON public.user_balances USING btree (token_symbol);


--
-- Name: idx_user_balances_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_balances_user_id ON public.user_balances USING btree (user_id);


--
-- Name: idx_user_balances_user_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_balances_user_token ON public.user_balances USING btree (user_id, token_symbol);


--
-- Name: idx_user_blocks_blocker_blocked; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_blocks_blocker_blocked ON public.user_blocks USING btree (blocker_user_id, blocked_user_id) WHERE (blocker_user_id IS NOT NULL);


--
-- Name: idx_user_blocks_speaker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_blocks_speaker ON public.user_blocks USING btree (speaker_id);


--
-- Name: idx_user_blocks_speaker_blocked; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_blocks_speaker_blocked ON public.user_blocks USING btree (speaker_id, blocked_user_id) WHERE (speaker_id IS NOT NULL);


--
-- Name: idx_user_blocks_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_blocks_user ON public.user_blocks USING btree (blocked_user_id);


--
-- Name: idx_user_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_email ON public."user" USING btree (email);


--
-- Name: idx_user_email_tracking_email_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_email_tracking_email_type ON public.user_email_tracking USING btree (email_type);


--
-- Name: idx_user_email_tracking_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_email_tracking_sent_at ON public.user_email_tracking USING btree (sent_at);


--
-- Name: idx_user_email_tracking_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_email_tracking_user_id ON public.user_email_tracking USING btree (user_id);


--
-- Name: idx_user_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_provider ON public."user" USING btree (provider);


--
-- Name: idx_user_request_limits_user_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_request_limits_user_event ON public.user_request_limits USING btree (user_id, event_id);


--
-- Name: idx_user_roles_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_role ON public.user_roles USING btree (role);


--
-- Name: idx_user_roles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_roles_user_id ON public.user_roles USING btree (user_id);


--
-- Name: idx_user_schedule_shares_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_schedule_shares_token ON public.user_schedule_shares USING btree (share_token);


--
-- Name: idx_user_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_status ON public."user" USING btree (status) WHERE (status = 'active'::text);


--
-- Name: idx_user_tutorial_progress_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_tutorial_progress_user_id ON public.user_tutorial_progress USING btree (user_id);


--
-- Name: idx_wallet_auth_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_auth_address ON public.wallet_auth USING btree (wallet_address);


--
-- Name: idx_wallet_auth_type_address; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_auth_type_address ON public.wallet_auth USING btree (wallet_type, wallet_address);


--
-- Name: idx_wallet_auth_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_auth_user_id ON public.wallet_auth USING btree (user_id);


--
-- Name: notifications_user_level_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_level_created_at_idx ON public.notifications USING btree (user_id, level, created_at DESC);


--
-- Name: session_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "session_userId_idx" ON public.session USING btree ("userId");


--
-- Name: verification_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_identifier_idx ON public.verification USING btree (identifier);


--
-- Name: chat_last_seen trg_chat_last_seen_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_chat_last_seen_updated_at BEFORE UPDATE ON public.chat_last_seen FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: event_agenda trg_event_agenda_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_event_agenda_updated_at BEFORE UPDATE ON public.event_agenda FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: meeting_requests trg_meeting_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_meeting_requests_updated_at BEFORE UPDATE ON public.meeting_requests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: meetings trg_meetings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_meetings_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: notifications trg_notifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: profiles trg_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: user trg_public_user_sync_profiles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_public_user_sync_profiles AFTER INSERT OR UPDATE ON public."user" FOR EACH ROW EXECUTE FUNCTION public.sync_public_user_to_profiles();


--
-- Name: user_profiles trg_user_profiles_sync_profiles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_profiles_sync_profiles AFTER INSERT OR UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.sync_user_profiles_to_profiles();


--
-- Name: user_profiles trg_user_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: user_request_limits trg_user_request_limits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_request_limits_updated_at BEFORE UPDATE ON public.user_request_limits FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: user_tutorial_progress trg_user_tutorial_progress_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_tutorial_progress_updated_at BEFORE UPDATE ON public.user_tutorial_progress FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: user trg_user_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_updated_at BEFORE UPDATE ON public."user" FOR EACH ROW EXECUTE FUNCTION public.set_users_updated_at();


--
-- Name: passes trigger_auto_generate_pass_qr; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_auto_generate_pass_qr AFTER INSERT ON public.passes FOR EACH ROW WHEN ((new.status = 'active'::public.pass_status)) EXECUTE FUNCTION public.auto_generate_pass_qr();


--
-- Name: passes trigger_auto_generate_pass_qr_on_activate; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_auto_generate_pass_qr_on_activate AFTER UPDATE ON public.passes FOR EACH ROW WHEN (((new.status = 'active'::public.pass_status) AND (old.status <> 'active'::public.pass_status))) EXECUTE FUNCTION public.auto_generate_pass_qr();


--
-- Name: bsl_speakers update_bsl_speakers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_bsl_speakers_updated_at BEFORE UPDATE ON public.bsl_speakers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: newsletter_subscribers update_newsletter_subscribers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_newsletter_subscribers_updated_at BEFORE UPDATE ON public.newsletter_subscribers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pass_request_limits update_pass_request_limits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_pass_request_limits_updated_at BEFORE UPDATE ON public.pass_request_limits FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: passes update_passes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_passes_updated_at BEFORE UPDATE ON public.passes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: qr_codes update_qr_codes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_qr_codes_updated_at BEFORE UPDATE ON public.qr_codes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_roles update_user_roles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: wallet_auth update_wallet_auth_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_wallet_auth_updated_at BEFORE UPDATE ON public.wallet_auth FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: user_agenda_status user_agenda_status_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER user_agenda_status_updated_at BEFORE UPDATE ON public.user_agenda_status FOR EACH ROW EXECUTE FUNCTION public.update_user_agenda_status_updated_at();


--
-- Name: account account_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account
    ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.ba_users(id) ON DELETE CASCADE;


--
-- Name: admin_action_log admin_action_log_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_action_log
    ADD CONSTRAINT admin_action_log_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE SET NULL;


--
-- Name: bsl_bookings bsl_bookings_attendeeid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bsl_bookings
    ADD CONSTRAINT bsl_bookings_attendeeid_fkey FOREIGN KEY (attendeeid) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: bsl_bookings bsl_bookings_speakerid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bsl_bookings
    ADD CONSTRAINT bsl_bookings_speakerid_fkey FOREIGN KEY (speakerid) REFERENCES public.bsl_speakers(id) ON DELETE CASCADE;


--
-- Name: bsl_speakers bsl_speakers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bsl_speakers
    ADD CONSTRAINT bsl_speakers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: chat_last_seen chat_last_seen_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_last_seen
    ADD CONSTRAINT chat_last_seen_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: chat_last_seen chat_last_seen_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_last_seen
    ADD CONSTRAINT chat_last_seen_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;


--
-- Name: directus_access directus_access_policy_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_access
    ADD CONSTRAINT directus_access_policy_foreign FOREIGN KEY (policy) REFERENCES public.directus_policies(id) ON DELETE CASCADE;


--
-- Name: directus_access directus_access_role_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_access
    ADD CONSTRAINT directus_access_role_foreign FOREIGN KEY (role) REFERENCES public.directus_roles(id) ON DELETE CASCADE;


--
-- Name: directus_access directus_access_user_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_access
    ADD CONSTRAINT directus_access_user_foreign FOREIGN KEY ("user") REFERENCES public.directus_users(id) ON DELETE CASCADE;


--
-- Name: directus_collections directus_collections_group_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_collections
    ADD CONSTRAINT directus_collections_group_foreign FOREIGN KEY ("group") REFERENCES public.directus_collections(collection);


--
-- Name: directus_comments directus_comments_user_created_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_comments
    ADD CONSTRAINT directus_comments_user_created_foreign FOREIGN KEY (user_created) REFERENCES public.directus_users(id) ON DELETE SET NULL;


--
-- Name: directus_comments directus_comments_user_updated_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_comments
    ADD CONSTRAINT directus_comments_user_updated_foreign FOREIGN KEY (user_updated) REFERENCES public.directus_users(id);


--
-- Name: directus_dashboards directus_dashboards_user_created_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_dashboards
    ADD CONSTRAINT directus_dashboards_user_created_foreign FOREIGN KEY (user_created) REFERENCES public.directus_users(id) ON DELETE SET NULL;


--
-- Name: directus_files directus_files_folder_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_files
    ADD CONSTRAINT directus_files_folder_foreign FOREIGN KEY (folder) REFERENCES public.directus_folders(id) ON DELETE SET NULL;


--
-- Name: directus_files directus_files_modified_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_files
    ADD CONSTRAINT directus_files_modified_by_foreign FOREIGN KEY (modified_by) REFERENCES public.directus_users(id);


--
-- Name: directus_files directus_files_uploaded_by_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_files
    ADD CONSTRAINT directus_files_uploaded_by_foreign FOREIGN KEY (uploaded_by) REFERENCES public.directus_users(id);


--
-- Name: directus_flows directus_flows_user_created_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_flows
    ADD CONSTRAINT directus_flows_user_created_foreign FOREIGN KEY (user_created) REFERENCES public.directus_users(id) ON DELETE SET NULL;


--
-- Name: directus_folders directus_folders_parent_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_folders
    ADD CONSTRAINT directus_folders_parent_foreign FOREIGN KEY (parent) REFERENCES public.directus_folders(id);


--
-- Name: directus_notifications directus_notifications_recipient_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_notifications
    ADD CONSTRAINT directus_notifications_recipient_foreign FOREIGN KEY (recipient) REFERENCES public.directus_users(id) ON DELETE CASCADE;


--
-- Name: directus_notifications directus_notifications_sender_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_notifications
    ADD CONSTRAINT directus_notifications_sender_foreign FOREIGN KEY (sender) REFERENCES public.directus_users(id);


--
-- Name: directus_operations directus_operations_flow_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_operations
    ADD CONSTRAINT directus_operations_flow_foreign FOREIGN KEY (flow) REFERENCES public.directus_flows(id) ON DELETE CASCADE;


--
-- Name: directus_operations directus_operations_reject_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_operations
    ADD CONSTRAINT directus_operations_reject_foreign FOREIGN KEY (reject) REFERENCES public.directus_operations(id);


--
-- Name: directus_operations directus_operations_resolve_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_operations
    ADD CONSTRAINT directus_operations_resolve_foreign FOREIGN KEY (resolve) REFERENCES public.directus_operations(id);


--
-- Name: directus_operations directus_operations_user_created_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_operations
    ADD CONSTRAINT directus_operations_user_created_foreign FOREIGN KEY (user_created) REFERENCES public.directus_users(id) ON DELETE SET NULL;


--
-- Name: directus_panels directus_panels_dashboard_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_panels
    ADD CONSTRAINT directus_panels_dashboard_foreign FOREIGN KEY (dashboard) REFERENCES public.directus_dashboards(id) ON DELETE CASCADE;


--
-- Name: directus_panels directus_panels_user_created_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_panels
    ADD CONSTRAINT directus_panels_user_created_foreign FOREIGN KEY (user_created) REFERENCES public.directus_users(id) ON DELETE SET NULL;


--
-- Name: directus_permissions directus_permissions_policy_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_permissions
    ADD CONSTRAINT directus_permissions_policy_foreign FOREIGN KEY (policy) REFERENCES public.directus_policies(id) ON DELETE CASCADE;


--
-- Name: directus_presets directus_presets_role_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_presets
    ADD CONSTRAINT directus_presets_role_foreign FOREIGN KEY (role) REFERENCES public.directus_roles(id) ON DELETE CASCADE;


--
-- Name: directus_presets directus_presets_user_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_presets
    ADD CONSTRAINT directus_presets_user_foreign FOREIGN KEY ("user") REFERENCES public.directus_users(id) ON DELETE CASCADE;


--
-- Name: directus_revisions directus_revisions_activity_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_revisions
    ADD CONSTRAINT directus_revisions_activity_foreign FOREIGN KEY (activity) REFERENCES public.directus_activity(id) ON DELETE CASCADE;


--
-- Name: directus_revisions directus_revisions_parent_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_revisions
    ADD CONSTRAINT directus_revisions_parent_foreign FOREIGN KEY (parent) REFERENCES public.directus_revisions(id);


--
-- Name: directus_revisions directus_revisions_version_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_revisions
    ADD CONSTRAINT directus_revisions_version_foreign FOREIGN KEY (version) REFERENCES public.directus_versions(id) ON DELETE CASCADE;


--
-- Name: directus_roles directus_roles_parent_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_roles
    ADD CONSTRAINT directus_roles_parent_foreign FOREIGN KEY (parent) REFERENCES public.directus_roles(id);


--
-- Name: directus_sessions directus_sessions_share_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_sessions
    ADD CONSTRAINT directus_sessions_share_foreign FOREIGN KEY (share) REFERENCES public.directus_shares(id) ON DELETE CASCADE;


--
-- Name: directus_sessions directus_sessions_user_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_sessions
    ADD CONSTRAINT directus_sessions_user_foreign FOREIGN KEY ("user") REFERENCES public.directus_users(id) ON DELETE CASCADE;


--
-- Name: directus_settings directus_settings_project_logo_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_settings
    ADD CONSTRAINT directus_settings_project_logo_foreign FOREIGN KEY (project_logo) REFERENCES public.directus_files(id);


--
-- Name: directus_settings directus_settings_public_background_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_settings
    ADD CONSTRAINT directus_settings_public_background_foreign FOREIGN KEY (public_background) REFERENCES public.directus_files(id);


--
-- Name: directus_settings directus_settings_public_favicon_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_settings
    ADD CONSTRAINT directus_settings_public_favicon_foreign FOREIGN KEY (public_favicon) REFERENCES public.directus_files(id);


--
-- Name: directus_settings directus_settings_public_foreground_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_settings
    ADD CONSTRAINT directus_settings_public_foreground_foreign FOREIGN KEY (public_foreground) REFERENCES public.directus_files(id);


--
-- Name: directus_settings directus_settings_public_registration_role_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_settings
    ADD CONSTRAINT directus_settings_public_registration_role_foreign FOREIGN KEY (public_registration_role) REFERENCES public.directus_roles(id) ON DELETE SET NULL;


--
-- Name: directus_settings directus_settings_storage_default_folder_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_settings
    ADD CONSTRAINT directus_settings_storage_default_folder_foreign FOREIGN KEY (storage_default_folder) REFERENCES public.directus_folders(id) ON DELETE SET NULL;


--
-- Name: directus_shares directus_shares_collection_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_shares
    ADD CONSTRAINT directus_shares_collection_foreign FOREIGN KEY (collection) REFERENCES public.directus_collections(collection) ON DELETE CASCADE;


--
-- Name: directus_shares directus_shares_role_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_shares
    ADD CONSTRAINT directus_shares_role_foreign FOREIGN KEY (role) REFERENCES public.directus_roles(id) ON DELETE CASCADE;


--
-- Name: directus_shares directus_shares_user_created_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_shares
    ADD CONSTRAINT directus_shares_user_created_foreign FOREIGN KEY (user_created) REFERENCES public.directus_users(id) ON DELETE SET NULL;


--
-- Name: directus_users directus_users_role_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_users
    ADD CONSTRAINT directus_users_role_foreign FOREIGN KEY (role) REFERENCES public.directus_roles(id) ON DELETE SET NULL;


--
-- Name: directus_versions directus_versions_collection_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_versions
    ADD CONSTRAINT directus_versions_collection_foreign FOREIGN KEY (collection) REFERENCES public.directus_collections(collection) ON DELETE CASCADE;


--
-- Name: directus_versions directus_versions_user_created_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_versions
    ADD CONSTRAINT directus_versions_user_created_foreign FOREIGN KEY (user_created) REFERENCES public.directus_users(id) ON DELETE SET NULL;


--
-- Name: directus_versions directus_versions_user_updated_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_versions
    ADD CONSTRAINT directus_versions_user_updated_foreign FOREIGN KEY (user_updated) REFERENCES public.directus_users(id);


--
-- Name: directus_webhooks directus_webhooks_migrated_flow_foreign; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.directus_webhooks
    ADD CONSTRAINT directus_webhooks_migrated_flow_foreign FOREIGN KEY (migrated_flow) REFERENCES public.directus_flows(id) ON DELETE SET NULL;


--
-- Name: event_pass_tiers event_pass_tiers_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_pass_tiers
    ADD CONSTRAINT event_pass_tiers_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_roles event_roles_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_roles
    ADD CONSTRAINT event_roles_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_roles event_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_roles
    ADD CONSTRAINT event_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: bsl_tickets fk_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bsl_tickets
    ADD CONSTRAINT fk_user FOREIGN KEY (userid) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: meeting_chat_messages meeting_chat_messages_meeting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_chat_messages
    ADD CONSTRAINT meeting_chat_messages_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;


--
-- Name: meeting_chat_messages meeting_chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_chat_messages
    ADD CONSTRAINT meeting_chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;


--
-- Name: meeting_requests meeting_requests_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_requests
    ADD CONSTRAINT meeting_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;


--
-- Name: meeting_requests meeting_requests_speaker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_requests
    ADD CONSTRAINT meeting_requests_speaker_id_fkey FOREIGN KEY (speaker_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;


--
-- Name: meeting_slots meeting_slots_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meeting_slots
    ADD CONSTRAINT meeting_slots_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;


--
-- Name: meetings meetings_attendee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_attendee_id_fkey FOREIGN KEY (attendee_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;


--
-- Name: meetings meetings_host_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_host_id_fkey FOREIGN KEY (host_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;


--
-- Name: meetings meetings_meeting_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_meeting_request_id_fkey FOREIGN KEY (meeting_request_id) REFERENCES public.meeting_requests(id) ON DELETE SET NULL;


--
-- Name: meetings meetings_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;


--
-- Name: meetings meetings_slot_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES public.meeting_slots(id) ON DELETE SET NULL;


--
-- Name: meetings meetings_speaker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_speaker_id_fkey FOREIGN KEY (speaker_id) REFERENCES public.bsl_speakers(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: pass_claim_codes pass_claim_codes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pass_claim_codes
    ADD CONSTRAINT pass_claim_codes_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: pass_code_claims pass_code_claims_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pass_code_claims
    ADD CONSTRAINT pass_code_claims_code_id_fkey FOREIGN KEY (code_id) REFERENCES public.pass_claim_codes(id) ON DELETE CASCADE;


--
-- Name: pass_code_claims pass_code_claims_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pass_code_claims
    ADD CONSTRAINT pass_code_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: pass_request_limits pass_request_limits_pass_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pass_request_limits
    ADD CONSTRAINT pass_request_limits_pass_id_fkey FOREIGN KEY (pass_id) REFERENCES public.passes(id) ON DELETE CASCADE;


--
-- Name: pass_request_limits pass_request_limits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pass_request_limits
    ADD CONSTRAINT pass_request_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: passes passes_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passes
    ADD CONSTRAINT passes_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) NOT VALID;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: qr_codes qr_codes_pass_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_codes
    ADD CONSTRAINT qr_codes_pass_id_fkey FOREIGN KEY (pass_id) REFERENCES public.passes(id) ON DELETE CASCADE;


--
-- Name: qr_scan_logs qr_scan_logs_qr_code_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_scan_logs
    ADD CONSTRAINT qr_scan_logs_qr_code_id_fkey FOREIGN KEY (qr_code_id) REFERENCES public.qr_codes(id) ON DELETE CASCADE;


--
-- Name: reward_transactions reward_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reward_transactions
    ADD CONSTRAINT reward_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: session session_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.ba_users(id) ON DELETE CASCADE;


--
-- Name: speaker_identity_claim_event_roles speaker_identity_claim_event_roles_claim_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speaker_identity_claim_event_roles
    ADD CONSTRAINT speaker_identity_claim_event_roles_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.speaker_identity_claims(id) ON DELETE CASCADE;


--
-- Name: speaker_identity_claim_event_roles speaker_identity_claim_event_roles_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speaker_identity_claim_event_roles
    ADD CONSTRAINT speaker_identity_claim_event_roles_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: speaker_identity_claims speaker_identity_claims_claimed_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speaker_identity_claims
    ADD CONSTRAINT speaker_identity_claims_claimed_user_id_fkey FOREIGN KEY (claimed_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: speaker_identity_claims speaker_identity_claims_configured_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speaker_identity_claims
    ADD CONSTRAINT speaker_identity_claims_configured_by_fkey FOREIGN KEY (configured_by) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- Name: speakers speakers_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speakers
    ADD CONSTRAINT speakers_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: support_messages support_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_sessions support_sessions_visitor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_sessions
    ADD CONSTRAINT support_sessions_visitor_id_fkey FOREIGN KEY (visitor_id) REFERENCES public.support_visitors(id) ON DELETE CASCADE;


--
-- Name: support_ticket_reads support_ticket_reads_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_reads
    ADD CONSTRAINT support_ticket_reads_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- Name: support_ticket_reads support_ticket_reads_visitor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_reads
    ADD CONSTRAINT support_ticket_reads_visitor_id_fkey FOREIGN KEY (visitor_id) REFERENCES public.support_visitors(id) ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_visitor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_visitor_id_fkey FOREIGN KEY (visitor_id) REFERENCES public.support_visitors(id) ON DELETE CASCADE;


--
-- Name: user_agenda_status user_agenda_status_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_agenda_status
    ADD CONSTRAINT user_agenda_status_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE NOT VALID;


--
-- Name: user_balances user_balances_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_balances
    ADD CONSTRAINT user_balances_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_blocked_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocked_user_id_fkey FOREIGN KEY (blocked_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_speaker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_speaker_id_fkey FOREIGN KEY (speaker_id) REFERENCES public.bsl_speakers(id) ON DELETE CASCADE;


--
-- Name: user_chat_keys user_chat_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_chat_keys
    ADD CONSTRAINT user_chat_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_email_tracking user_email_tracking_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_email_tracking
    ADD CONSTRAINT user_email_tracking_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: user_request_limits user_request_limits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_request_limits
    ADD CONSTRAINT user_request_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_schedule_shares user_schedule_shares_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_schedule_shares
    ADD CONSTRAINT user_schedule_shares_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: user_tutorial_progress user_tutorial_progress_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tutorial_progress
    ADD CONSTRAINT user_tutorial_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: wallet_auth wallet_auth_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_auth
    ADD CONSTRAINT wallet_auth_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: newsletter_subscribers Enable insert for all users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable insert for all users" ON public.newsletter_subscribers FOR INSERT TO authenticated, anon WITH CHECK (true);


--
-- Name: newsletter_subscribers Enable read access for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable read access for authenticated users" ON public.newsletter_subscribers FOR SELECT TO authenticated USING (true);


--
-- Name: otp_codes Service role can manage OTP codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage OTP codes" ON public.otp_codes USING ((auth.role() = 'service_role'::text));


--
-- Name: user_balances Service role can manage all balances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all balances" ON public.user_balances USING ((auth.role() = 'service_role'::text));


--
-- Name: user_roles Service role can manage all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all roles" ON public.user_roles USING ((auth.role() = 'service_role'::text));


--
-- Name: POLICY "Service role can manage all roles" ON user_roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY "Service role can manage all roles" ON public.user_roles IS 'Allows service role to manage all roles. Used for admin operations via API endpoints.';


--
-- Name: reward_transactions Service role can manage all transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all transactions" ON public.reward_transactions USING ((auth.role() = 'service_role'::text));


--
-- Name: wallet_auth Service role can manage all wallets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all wallets" ON public.wallet_auth USING ((auth.role() = 'service_role'::text));


--
-- Name: user_email_tracking Service role can manage email tracking; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage email tracking" ON public.user_email_tracking USING (((auth.jwt() ->> 'role'::text) = 'service_role'::text));


--
-- Name: user_blocks Speakers can manage blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Speakers can manage blocks" ON public.user_blocks USING ((speaker_id IN ( SELECT bsl_speakers.id
   FROM public.bsl_speakers
  WHERE (bsl_speakers.id = user_blocks.speaker_id))));


--
-- Name: passes System can insert passes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can insert passes" ON public.passes FOR INSERT WITH CHECK (((auth.uid())::text = user_id));


--
-- Name: pass_request_limits System can manage limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System can manage limits" ON public.pass_request_limits USING (true);


--
-- Name: qr_codes Users can generate QR for their passes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can generate QR for their passes" ON public.qr_codes FOR INSERT WITH CHECK ((user_id = (auth.uid())::text));


--
-- Name: user_email_tracking Users can insert their own email tracking; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own email tracking" ON public.user_email_tracking FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: passes Users can insert their own passes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own passes" ON public.passes FOR INSERT WITH CHECK ((user_id = (auth.uid())::text));


--
-- Name: wallet_auth Users can insert their own wallets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own wallets" ON public.wallet_auth FOR INSERT WITH CHECK (((user_id = auth.uid()) OR (user_id IS NULL)));


--
-- Name: passes Users can update their own passes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own passes" ON public.passes FOR UPDATE USING ((user_id = (auth.uid())::text));


--
-- Name: wallet_auth Users can update their own wallets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own wallets" ON public.wallet_auth FOR UPDATE USING (((user_id = auth.uid()) OR (user_id IS NULL)));


--
-- Name: user_blocks Users can view blocks affecting them; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view blocks affecting them" ON public.user_blocks FOR SELECT USING ((auth.uid() = blocked_user_id));


--
-- Name: qr_scan_logs Users can view their QR scan logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their QR scan logs" ON public.qr_scan_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.qr_codes
  WHERE ((qr_codes.id = qr_scan_logs.qr_code_id) AND (qr_codes.user_id = (auth.uid())::text)))));


--
-- Name: qr_codes Users can view their own QR codes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own QR codes" ON public.qr_codes FOR SELECT USING ((user_id = (auth.uid())::text));


--
-- Name: user_balances Users can view their own balances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own balances" ON public.user_balances FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: user_email_tracking Users can view their own email tracking; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own email tracking" ON public.user_email_tracking FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: pass_request_limits Users can view their own limits; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own limits" ON public.pass_request_limits FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: passes Users can view their own passes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own passes" ON public.passes FOR SELECT USING ((user_id = (auth.uid())::text));


--
-- Name: user_roles Users can view their own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: POLICY "Users can view their own roles" ON user_roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON POLICY "Users can view their own roles" ON public.user_roles IS 'Allows users to view their own roles. Safe - no recursion because it only checks auth.uid()';


--
-- Name: reward_transactions Users can view their own transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own transactions" ON public.reward_transactions FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: wallet_auth Users can view their own wallets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own wallets" ON public.wallet_auth FOR SELECT USING (((user_id = auth.uid()) OR (user_id IS NULL)));


--
-- Name: account; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_action_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_action_log ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_email_deliveries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_email_deliveries ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_matchmaking_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_matchmaking_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: bsl_audit audit_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_select ON public.bsl_audit FOR SELECT USING (true);


--
-- Name: ba_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ba_users ENABLE ROW LEVEL SECURITY;

--
-- Name: bsl_bookings bookings_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_insert ON public.bsl_bookings FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.bsl_tickets t
  WHERE ((t.userid = auth.uid()) AND (t.verified = true)))));


--
-- Name: bsl_bookings bookings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_select ON public.bsl_bookings FOR SELECT USING (((attendeeid = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.bsl_speakers s
  WHERE (s.id = bsl_bookings.speakerid)))));


--
-- Name: bsl_bookings bookings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_update ON public.bsl_bookings FOR UPDATE USING (((attendeeid = auth.uid()) OR ((COALESCE(current_setting('request.jwt.claims'::text, true), ''::text) <> ''::text) AND (((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text))));


--
-- Name: bsl_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bsl_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: bsl_bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bsl_bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: bsl_speakers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bsl_speakers ENABLE ROW LEVEL SECURITY;

--
-- Name: bsl_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bsl_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_last_seen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_last_seen ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_last_seen chat_last_seen_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_last_seen_insert_own ON public.chat_last_seen FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: chat_last_seen chat_last_seen_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_last_seen_select_own ON public.chat_last_seen FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: chat_last_seen chat_last_seen_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY chat_last_seen_update_own ON public.chat_last_seen FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: directus_access; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_access ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_collections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_collections ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_dashboards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_dashboards ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_extensions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_extensions ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_files ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_flows; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_flows ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_folders ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_operations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_operations ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_panels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_panels ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_permissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_permissions ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_presets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_presets ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_relations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_relations ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_revisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_shares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_shares ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_translations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_translations ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_users ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: directus_webhooks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.directus_webhooks ENABLE ROW LEVEL SECURITY;

--
-- Name: event_agenda; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_agenda ENABLE ROW LEVEL SECURITY;

--
-- Name: event_agenda event_agenda_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_agenda_public_read ON public.event_agenda FOR SELECT USING (true);


--
-- Name: event_pass_tiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_pass_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: event_pass_tiers event_pass_tiers_published_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_pass_tiers_published_read ON public.event_pass_tiers FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = event_pass_tiers.event_id) AND (e.status = ANY (ARRAY['published'::text, 'archived'::text]))))));


--
-- Name: event_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: event_roles event_roles_self_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_roles_self_read ON public.event_roles FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: events events_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY events_public_read ON public.events FOR SELECT USING ((status = ANY (ARRAY['published'::text, 'archived'::text])));


--
-- Name: hashpass_schema_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hashpass_schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meeting_chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_chat_messages meeting_chat_messages_insert_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meeting_chat_messages_insert_participant ON public.meeting_chat_messages FOR INSERT WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.meetings m
  WHERE ((m.id = meeting_chat_messages.meeting_id) AND ((m.requester_id = auth.uid()) OR (m.host_id = auth.uid()) OR (m.attendee_id = auth.uid()) OR (m.speaker_id IN ( SELECT s.id
           FROM public.bsl_speakers s
          WHERE (s.user_id = auth.uid())))))))));


--
-- Name: meeting_chat_messages meeting_chat_messages_select_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meeting_chat_messages_select_participant ON public.meeting_chat_messages FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.meetings m
  WHERE ((m.id = meeting_chat_messages.meeting_id) AND ((m.requester_id = auth.uid()) OR (m.host_id = auth.uid()) OR (m.attendee_id = auth.uid()) OR (m.speaker_id IN ( SELECT s.id
           FROM public.bsl_speakers s
          WHERE (s.user_id = auth.uid()))))))));


--
-- Name: meeting_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meeting_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_requests meeting_requests_delete_requester; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meeting_requests_delete_requester ON public.meeting_requests FOR DELETE USING ((requester_id = auth.uid()));


--
-- Name: meeting_requests meeting_requests_insert_requester; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meeting_requests_insert_requester ON public.meeting_requests FOR INSERT WITH CHECK ((requester_id = auth.uid()));


--
-- Name: meeting_requests meeting_requests_select_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meeting_requests_select_participant ON public.meeting_requests FOR SELECT USING (((requester_id = auth.uid()) OR (speaker_id = auth.uid())));


--
-- Name: meeting_requests meeting_requests_update_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meeting_requests_update_participant ON public.meeting_requests FOR UPDATE USING (((requester_id = auth.uid()) OR (speaker_id = auth.uid()))) WITH CHECK (((requester_id = auth.uid()) OR (speaker_id = auth.uid())));


--
-- Name: meeting_slots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meeting_slots ENABLE ROW LEVEL SECURITY;

--
-- Name: meeting_slots meeting_slots_select_owner_or_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meeting_slots_select_owner_or_participant ON public.meeting_slots FOR SELECT USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.meetings m
  WHERE ((m.slot_id = meeting_slots.id) AND ((m.requester_id = auth.uid()) OR (m.host_id = auth.uid()) OR (m.attendee_id = auth.uid())))))));


--
-- Name: meetings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

--
-- Name: meetings meetings_select_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meetings_select_participant ON public.meetings FOR SELECT USING (((requester_id = auth.uid()) OR (host_id = auth.uid()) OR (attendee_id = auth.uid()) OR (speaker_id IN ( SELECT bsl_speakers.id
   FROM public.bsl_speakers
  WHERE (bsl_speakers.user_id = auth.uid())))));


--
-- Name: meetings meetings_update_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meetings_update_participant ON public.meetings FOR UPDATE USING (((requester_id = auth.uid()) OR (host_id = auth.uid()) OR (attendee_id = auth.uid()))) WITH CHECK (((requester_id = auth.uid()) OR (host_id = auth.uid()) OR (attendee_id = auth.uid())));


--
-- Name: newsletter_subscribers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: notifications notifications_insert_service; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_insert_service ON public.notifications FOR INSERT WITH CHECK (true);


--
-- Name: notifications notifications_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: notifications notifications_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: otp_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: pass_claim_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pass_claim_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: pass_code_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pass_code_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: pass_request_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pass_request_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: passes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.passes ENABLE ROW LEVEL SECURITY;

--
-- Name: passes passes_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY passes_admin_all ON public.passes USING (public.is_admin(public.get_current_user_id()));


--
-- Name: passes passes_event_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY passes_event_admin_read ON public.passes FOR SELECT USING (public.has_event_admin_access(auth.uid(), event_id, false));


--
-- Name: passes passes_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY passes_insert_own ON public.passes FOR INSERT WITH CHECK ((user_id = COALESCE((auth.uid())::text, (public.get_current_user_id())::text)));


--
-- Name: passes passes_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY passes_select_own ON public.passes FOR SELECT USING ((user_id = COALESCE((auth.uid())::text, (public.get_current_user_id())::text)));


--
-- Name: passes passes_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY passes_update_own ON public.passes FOR UPDATE USING ((user_id = COALESCE((auth.uid())::text, (public.get_current_user_id())::text))) WITH CHECK ((user_id = COALESCE((auth.uid())::text, (public.get_current_user_id())::text)));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_all ON public.profiles FOR SELECT USING (true);


--
-- Name: qr_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: qr_scan_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qr_scan_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: reward_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reward_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles roles_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_admin_all ON public.user_roles USING (public.is_admin(public.get_current_user_id()));


--
-- Name: session; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session ENABLE ROW LEVEL SECURITY;

--
-- Name: speaker_identity_claim_event_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.speaker_identity_claim_event_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: speaker_identity_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.speaker_identity_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: speakers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.speakers ENABLE ROW LEVEL SECURITY;

--
-- Name: bsl_speakers speakers_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY speakers_insert_own ON public.bsl_speakers FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: speakers speakers_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY speakers_public_read ON public.speakers FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = speakers.event_id) AND (e.status = ANY (ARRAY['published'::text, 'archived'::text]))))));


--
-- Name: bsl_speakers speakers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY speakers_select ON public.bsl_speakers FOR SELECT USING (true);


--
-- Name: bsl_speakers speakers_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY speakers_update_own ON public.bsl_speakers FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: support_idempotency_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_idempotency_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: support_kapso_inbound_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_kapso_inbound_events ENABLE ROW LEVEL SECURITY;

--
-- Name: support_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: support_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: support_ticket_reads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_ticket_reads ENABLE ROW LEVEL SECURITY;

--
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: support_visitors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.support_visitors ENABLE ROW LEVEL SECURITY;

--
-- Name: bsl_tickets tickets_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tickets_select ON public.bsl_tickets FOR SELECT USING ((auth.uid() = userid));


--
-- Name: user; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_agenda_status; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_agenda_status ENABLE ROW LEVEL SECURITY;

--
-- Name: user_agenda_status user_agenda_status_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_agenda_status_delete_own ON public.user_agenda_status FOR DELETE USING ((user_id IN ( SELECT "user".id
   FROM public."user"
  WHERE (("user".provider_ids ->> 'supabase'::text) = (auth.uid())::text))));


--
-- Name: user_agenda_status user_agenda_status_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_agenda_status_insert ON public.user_agenda_status FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_agenda_status user_agenda_status_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_agenda_status_insert_own ON public.user_agenda_status FOR INSERT WITH CHECK ((user_id IN ( SELECT "user".id
   FROM public."user"
  WHERE (("user".provider_ids ->> 'supabase'::text) = (auth.uid())::text))));


--
-- Name: user_agenda_status user_agenda_status_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_agenda_status_select ON public.user_agenda_status FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_agenda_status user_agenda_status_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_agenda_status_select_own ON public.user_agenda_status FOR SELECT USING ((user_id IN ( SELECT "user".id
   FROM public."user"
  WHERE (("user".provider_ids ->> 'supabase'::text) = (auth.uid())::text))));


--
-- Name: user_agenda_status user_agenda_status_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_agenda_status_update ON public.user_agenda_status FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_agenda_status user_agenda_status_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_agenda_status_update_own ON public.user_agenda_status FOR UPDATE USING ((user_id IN ( SELECT "user".id
   FROM public."user"
  WHERE (("user".provider_ids ->> 'supabase'::text) = (auth.uid())::text)))) WITH CHECK ((user_id IN ( SELECT "user".id
   FROM public."user"
  WHERE (("user".provider_ids ->> 'supabase'::text) = (auth.uid())::text))));


--
-- Name: user_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: user_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: user_blocks user_blocks_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_blocks_delete_own ON public.user_blocks FOR DELETE USING (((blocker_user_id = auth.uid()) OR (speaker_id IN ( SELECT bsl_speakers.id
   FROM public.bsl_speakers
  WHERE (bsl_speakers.user_id = auth.uid())))));


--
-- Name: user_blocks user_blocks_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_blocks_insert_own ON public.user_blocks FOR INSERT WITH CHECK (((blocker_user_id = auth.uid()) OR (speaker_id IN ( SELECT bsl_speakers.id
   FROM public.bsl_speakers
  WHERE (bsl_speakers.user_id = auth.uid())))));


--
-- Name: user_blocks user_blocks_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_blocks_select_own ON public.user_blocks FOR SELECT USING (((blocker_user_id = auth.uid()) OR (speaker_id IN ( SELECT bsl_speakers.id
   FROM public.bsl_speakers
  WHERE (bsl_speakers.user_id = auth.uid())))));


--
-- Name: user_blocks user_blocks_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_blocks_update_own ON public.user_blocks FOR UPDATE USING (((blocker_user_id = auth.uid()) OR (speaker_id IN ( SELECT bsl_speakers.id
   FROM public.bsl_speakers
  WHERE (bsl_speakers.user_id = auth.uid()))))) WITH CHECK (((blocker_user_id = auth.uid()) OR (speaker_id IN ( SELECT bsl_speakers.id
   FROM public.bsl_speakers
  WHERE (bsl_speakers.user_id = auth.uid())))));


--
-- Name: user_chat_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_chat_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: user_chat_keys user_chat_keys_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_chat_keys_insert_own ON public.user_chat_keys FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_chat_keys user_chat_keys_select_any; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_chat_keys_select_any ON public.user_chat_keys FOR SELECT USING (true);


--
-- Name: user_chat_keys user_chat_keys_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_chat_keys_update_own ON public.user_chat_keys FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_email_tracking; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_email_tracking ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles user_profiles_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_profiles_delete_own ON public.user_profiles FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: user_profiles user_profiles_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_profiles_insert_own ON public.user_profiles FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_profiles user_profiles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_profiles_select_own ON public.user_profiles FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: user_profiles user_profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_profiles_update_own ON public.user_profiles FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_request_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_request_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: user_request_limits user_request_limits_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_request_limits_select_own ON public.user_request_limits FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: user_request_limits user_request_limits_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_request_limits_update_own ON public.user_request_limits FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_schedule_shares; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_schedule_shares ENABLE ROW LEVEL SECURITY;

--
-- Name: user_schedule_shares user_schedule_shares_owner_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_schedule_shares_owner_insert ON public.user_schedule_shares FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: user_schedule_shares user_schedule_shares_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_schedule_shares_owner_select ON public.user_schedule_shares FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user user_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_select_own ON public."user" FOR SELECT USING (((auth_user_id = (auth.uid())::text) OR (email = (auth.jwt() ->> 'email'::text))));


--
-- Name: user_tutorial_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_tutorial_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: user_tutorial_progress user_tutorial_progress_own_rows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_tutorial_progress_own_rows ON public.user_tutorial_progress USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: verification; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.verification ENABLE ROW LEVEL SECURITY;

--
-- Name: wallet_auth; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wallet_auth ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict gOe8WDGuR9lmWbfSCJacAj0vlcOSXRbsMoIvjAhuia3EzRRtVfSDTW5YiukHfeh

