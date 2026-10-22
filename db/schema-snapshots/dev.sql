--
-- PostgreSQL database dump
--

\restrict a1CtmNCu8wajGimhyia1SUrm0hpAmK8J3DAiEBCalRt8rwvzC14p5U1LekBz8BL

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

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
-- Name: event_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.event_role AS ENUM (
    'event_admin',
    'moderator'
);


--
-- Name: meeting_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.meeting_request_status AS ENUM (
    'pending',
    'accepted',
    'declined',
    'expired',
    'cancelled',
    'completed'
);


--
-- Name: meeting_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.meeting_status AS ENUM (
    'scheduled',
    'confirmed',
    'tentative',
    'in_progress',
    'completed',
    'cancelled',
    'no_show'
);


--
-- Name: pass_tier; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.pass_tier AS ENUM (
    'free',
    'general',
    'speaker',
    'vip',
    'platinum',
    'enterprise'
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
-- Name: qr_auth_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.qr_auth_status AS ENUM (
    'pending',
    'approved',
    'denied',
    'expired',
    'consumed',
    'cancelled'
);


--
-- Name: qr_link_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.qr_link_status AS ENUM (
    'active',
    'paused',
    'expired',
    'archived'
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
-- Name: transaction_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.transaction_type AS ENUM (
    'reward',
    'spend',
    'transfer_in',
    'transfer_out',
    'boost',
    'refund',
    'admin_adjustment'
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
     AND event_id = p_event_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown speaker profile for this event' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'grant' THEN
    v_target_email := lower(btrim(COALESCE(p_target_email, '')));
    IF v_target_email = '' OR position('@' IN v_target_email) < 2 THEN
      RAISE EXCEPTION 'A valid existing account email is required' USING ERRCODE = '22023';
    END IF;

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
     WHERE id::text = p_speaker_id
       AND event_id = p_event_id;

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
     WHERE id::text = p_speaker_id
       AND event_id = p_event_id;
    DELETE FROM public.speaker_identity_claims WHERE speaker_id = p_speaker_id;

  ELSE
    IF p_action = 'activate' AND v_speaker_user_id IS NULL THEN
      RAISE EXCEPTION 'Assign an account before activating a speaker' USING ERRCODE = '22023';
    END IF;
    UPDATE public.bsl_speakers
       SET is_active = (p_action = 'activate'),
           updated_at = now()
     WHERE id::text = p_speaker_id
       AND event_id = p_event_id;
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
   WHERE id::text = p_speaker_id
     AND event_id = p_event_id;

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
-- Name: can_make_meeting_request(uuid, uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_make_meeting_request(p_requester_id uuid, p_speaker_id uuid, p_boost_amount numeric DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_pass passes%ROWTYPE;
  v_speaker bsl_speakers%ROWTYPE;
  v_is_blocked boolean;
  v_existing_request meeting_requests%ROWTYPE;
  v_requests_today integer;
BEGIN
  -- Get requester's pass
  SELECT * INTO v_pass FROM passes
  WHERE user_id = p_requester_id::text
  AND event_id = 'bsl2025'
  AND is_active = true
  LIMIT 1;
  
  IF v_pass.id IS NULL THEN
    RETURN jsonb_build_object(
      'can_request', false,
      'reason', 'no_valid_pass',
      'message', 'You need a valid pass to send meeting requests'
    );
  END IF;
  
  -- Check remaining requests
  IF v_pass.requests_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'can_request', false,
      'reason', 'no_requests_remaining',
      'message', 'You have used all your meeting requests',
      'requests_sent', v_pass.requests_sent,
      'max_allowed', v_pass.max_requests_allowed
    );
  END IF;
  
  -- Get speaker
  SELECT * INTO v_speaker FROM bsl_speakers
  WHERE id = p_speaker_id AND is_active = true;
  
  IF v_speaker.id IS NULL THEN
    RETURN jsonb_build_object(
      'can_request', false,
      'reason', 'speaker_not_found',
      'message', 'Speaker not found or not available'
    );
  END IF;
  
  -- Check if speaker is accepting meetings
  IF NOT v_speaker.is_accepting_meetings THEN
    RETURN jsonb_build_object(
      'can_request', false,
      'reason', 'not_accepting_meetings',
      'message', 'This speaker is not accepting meeting requests'
    );
  END IF;
  
  -- Check if blocked
  SELECT EXISTS (
    SELECT 1 FROM user_blocks
    WHERE (blocker_id = p_speaker_id AND blocked_id = p_requester_id)
       OR (blocker_id = p_requester_id AND blocked_id = p_speaker_id)
  ) INTO v_is_blocked;
  
  IF v_is_blocked THEN
    RETURN jsonb_build_object(
      'can_request', false,
      'reason', 'blocked',
      'message', 'Cannot send request to this speaker'
    );
  END IF;
  
  -- Check for existing pending request
  SELECT * INTO v_existing_request FROM meeting_requests
  WHERE requester_id = p_requester_id
    AND speaker_id = p_speaker_id
    AND status = 'pending';
  
  IF v_existing_request.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'can_request', false,
      'reason', 'existing_pending_request',
      'message', 'You already have a pending request to this speaker'
    );
  END IF;
  
  -- All checks passed
  RETURN jsonb_build_object(
    'can_request', true,
    'requests_remaining', v_pass.requests_remaining - 1,
    'speaker_name', v_speaker.name
  );
END;
$$;


--
-- Name: can_make_meeting_request(text, text, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_make_meeting_request(p_user_id text, p_speaker_id text, p_boost_amount numeric DEFAULT 0, p_event_id text DEFAULT NULL::text) RETURNS TABLE(can_request boolean, reason text, pass_type text, remaining_requests integer, remaining_boost numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
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
    AND mr.status::text IN ('pending', 'requested', 'approved', 'accepted')
    AND (
      mr.speaker_id::text = v_speaker.id::text
      OR (v_speaker.user_id IS NOT NULL AND mr.speaker_id::text = v_speaker.user_id::text)
    )
  LIMIT 1;

  IF v_existing_request.id IS NOT NULL THEN
    RETURN QUERY SELECT false, 'existing_request', v_pass.pass_type, v_remaining_requests, v_remaining_boost;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_blocks'
      AND column_name = 'blocker_user_id'
  ) THEN
    EXECUTE 'SELECT EXISTS (
      SELECT 1
      FROM public.user_blocks ub
      WHERE (
        ub.blocked_user_id = $1::uuid
        AND (ub.speaker_id::text = $2 OR ub.blocker_user_id = $3::uuid)
      ) OR (
        ub.blocker_user_id = $1::uuid
        AND $3 IS NOT NULL
        AND ub.blocked_user_id = $3::uuid
      )
    )'
    INTO v_blocked
    USING p_user_id, v_speaker.id::text, v_speaker.user_id::text;
  ELSIF v_speaker.user_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.user_blocks ub
      WHERE (ub.blocked_id = p_user_id::uuid AND ub.blocker_id = v_speaker.user_id)
         OR (ub.blocker_id = p_user_id::uuid AND ub.blocked_id = v_speaker.user_id)
    ) INTO v_blocked;
  END IF;

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
$_$;


--
-- Name: can_make_meeting_request(uuid, uuid, numeric, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_make_meeting_request(p_requester_id uuid, p_speaker_id uuid, p_boost_amount numeric DEFAULT 0, p_event_id text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    AS $$
DECLARE
  v_event_id text := COALESCE(NULLIF(p_event_id, ''), NULLIF(current_setting('app.event_id', true), ''), 'bsl');
  v_pass passes%ROWTYPE;
  v_speaker bsl_speakers%ROWTYPE;
  v_is_blocked boolean;
  v_existing_request meeting_requests%ROWTYPE;
  v_requests_today integer;
BEGIN
  -- Get requester's pass
  SELECT * INTO v_pass FROM passes
  WHERE user_id = p_requester_id::text
  AND event_id = v_event_id
  AND is_active = true
  LIMIT 1;
  
  IF v_pass.id IS NULL THEN
    RETURN jsonb_build_object(
      'can_request', false,
      'reason', 'no_valid_pass',
      'message', 'You need a valid pass to send meeting requests'
    );
  END IF;
  
  -- Check remaining requests
  IF v_pass.requests_remaining <= 0 THEN
    RETURN jsonb_build_object(
      'can_request', false,
      'reason', 'no_requests_remaining',
      'message', 'You have used all your meeting requests',
      'requests_sent', v_pass.requests_sent,
      'max_allowed', v_pass.max_requests_allowed
    );
  END IF;
  
  -- Get speaker
  SELECT * INTO v_speaker FROM bsl_speakers
  WHERE id = p_speaker_id AND is_active = true;
  
  IF v_speaker.id IS NULL THEN
    RETURN jsonb_build_object(
      'can_request', false,
      'reason', 'speaker_not_found',
      'message', 'Speaker not found or not available'
    );
  END IF;
  
  -- Check if speaker is accepting meetings
  IF NOT v_speaker.is_accepting_meetings THEN
    RETURN jsonb_build_object(
      'can_request', false,
      'reason', 'not_accepting_meetings',
      'message', 'This speaker is not accepting meeting requests'
    );
  END IF;
  
  -- Check if blocked
  SELECT EXISTS (
    SELECT 1 FROM user_blocks
    WHERE (blocker_id = p_speaker_id AND blocked_id = p_requester_id)
       OR (blocker_id = p_requester_id AND blocked_id = p_speaker_id)
  ) INTO v_is_blocked;
  
  IF v_is_blocked THEN
    RETURN jsonb_build_object(
      'can_request', false,
      'reason', 'blocked',
      'message', 'Cannot send request to this speaker'
    );
  END IF;
  
  -- Check for existing pending request
  SELECT * INTO v_existing_request FROM meeting_requests
  WHERE requester_id = p_requester_id
    AND speaker_id = p_speaker_id
    AND status = 'pending';
  
  IF v_existing_request.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'can_request', false,
      'reason', 'existing_pending_request',
      'message', 'You already have a pending request to this speaker'
    );
  END IF;
  
  -- All checks passed
  RETURN jsonb_build_object(
    'can_request', true,
    'requests_remaining', v_pass.requests_remaining - 1,
    'speaker_name', v_speaker.name
  );
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

CREATE FUNCTION public.check_wallet_auth_rate_limit(p_wallet_address text, p_wallet_type public.wallet_type, p_ip_address text, p_max_attempts integer DEFAULT 5, p_window_minutes integer DEFAULT 5, p_block_duration_minutes integer DEFAULT 15) RETURNS TABLE(allowed boolean, remaining_attempts integer, blocked_until timestamp with time zone)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_record record;
  v_window_start timestamptz;
BEGIN
  PERFORM cleanup_expired_rate_limits();

  SELECT * INTO v_record
  FROM public.wallet_auth_rate_limits
  WHERE wallet_address = p_wallet_address
    AND wallet_type = p_wallet_type
    AND (ip_address = p_ip_address OR ip_address IS NULL OR p_ip_address IS NULL)
  FOR UPDATE;

  v_window_start := now() - (p_window_minutes || ' minutes')::interval;

  IF v_record IS NULL THEN
    INSERT INTO public.wallet_auth_rate_limits (wallet_address, wallet_type, ip_address, attempt_count, window_start)
    VALUES (p_wallet_address, p_wallet_type, p_ip_address, 1, now())
    ON CONFLICT (wallet_address, wallet_type, ip_address) DO NOTHING;

    RETURN QUERY SELECT true, p_max_attempts - 1, NULL::timestamptz;
  ELSIF v_record.blocked_until IS NOT NULL AND v_record.blocked_until > now() THEN
    RETURN QUERY SELECT false, 0, v_record.blocked_until;
  ELSIF v_record.window_start < v_window_start THEN
    UPDATE public.wallet_auth_rate_limits
    SET attempt_count = 1, window_start = now(), blocked_until = NULL
    WHERE id = v_record.id;

    RETURN QUERY SELECT true, p_max_attempts - 1, NULL::timestamptz;
  ELSIF v_record.attempt_count >= p_max_attempts THEN
    UPDATE public.wallet_auth_rate_limits
    SET blocked_until = now() + (p_block_duration_minutes || ' minutes')::interval
    WHERE id = v_record.id;

    RETURN QUERY SELECT false, 0, now() + (p_block_duration_minutes || ' minutes')::interval;
  ELSE
    UPDATE public.wallet_auth_rate_limits
    SET attempt_count = attempt_count + 1
    WHERE id = v_record.id;

    RETURN QUERY SELECT true, p_max_attempts - v_record.attempt_count - 1, NULL::timestamptz;
  END IF;
END;
$$;


--
-- Name: claim_business_invite(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_business_invite(p_code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_campaign public.business_invite_campaigns%ROWTYPE;
  v_existing_pass_id text;
  v_event record;
  v_pass_id text;
  v_primary_pass_id text;
  v_max_requests integer;
  v_max_boost numeric;
  v_pass_ids jsonb := '{}'::jsonb;
  v_already_claimed boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to claim a business invitation' USING ERRCODE = '42501';
  END IF;

  SELECT lower(email) INTO v_email
  FROM auth.users WHERE id = v_user_id AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Verify your email before claiming this business invitation' USING ERRCODE = '42501';
  END IF;

  IF p_code IS NULL
    OR length(btrim(p_code)) < 4
    OR length(btrim(p_code)) > 64
    OR upper(btrim(p_code)) !~ '^[A-Z0-9][A-Z0-9_-]{3,63}$' THEN
    RAISE EXCEPTION 'Invalid business invitation code' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign
  FROM public.business_invite_campaigns
  WHERE code_hash = encode(digest(upper(btrim(p_code)), 'sha256'), 'hex')
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND OR (v_campaign.expires_at IS NOT NULL AND v_campaign.expires_at <= now()) THEN
    RAISE EXCEPTION 'Invalid or expired business invitation code' USING ERRCODE = '22023';
  END IF;

  SELECT pass_id INTO v_existing_pass_id
  FROM public.business_invite_claims
  WHERE campaign_id = v_campaign.id AND user_id = v_user_id;
  v_already_claimed := v_existing_pass_id IS NOT NULL;

  IF NOT v_already_claimed
    AND v_campaign.max_claims IS NOT NULL
    AND v_campaign.claimed_count >= v_campaign.max_claims THEN
    RAISE EXCEPTION 'This business invitation has reached its limit' USING ERRCODE = '22023';
  END IF;

  FOR v_event IN
    SELECT targets.event_id
    FROM public.business_invite_campaign_events AS targets
    JOIN public.events AS event ON event.id = targets.event_id
    JOIN public.event_pass_tiers AS tier
      ON tier.event_id = targets.event_id AND tier.pass_type = 'business'
    WHERE targets.campaign_id = v_campaign.id
      AND event.status = 'published'
    ORDER BY CASE targets.event_id WHEN 'bsl' THEN 0 WHEN 'cbweek2026' THEN 1 ELSE 2 END
  LOOP
    SELECT max_meeting_requests, max_boost_amount
    INTO v_max_requests, v_max_boost
    FROM public.event_pass_tiers
    WHERE event_id = v_event.event_id AND pass_type = 'business';

    v_pass_id := public.create_default_pass(v_user_id::text, 'general', v_event.event_id);
    IF NOT EXISTS (
      SELECT 1 FROM public.passes
      WHERE id::text = v_pass_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'An active event pass is required for this invitation' USING ERRCODE = '22023';
    END IF;

    -- Upgrade in place only. VIP stays VIP and consumed counters stay intact.
    UPDATE public.passes AS pass
    SET pass_type = 'business'::public.pass_type,
        max_meeting_requests = v_max_requests,
        max_boost_amount = v_max_boost,
        access_features = ARRAY['all_sessions', 'networking', 'business_events'],
        special_perks = ARRAY['business_lounge', 'networking_tools'],
        updated_at = now()
    WHERE pass.id::text = v_pass_id
      AND pass.status = 'active'
      AND CASE pass.pass_type::text WHEN 'vip' THEN 2 WHEN 'business' THEN 1 ELSE 0 END <= 1;

    v_primary_pass_id := COALESCE(v_primary_pass_id, v_pass_id);
    v_pass_ids := v_pass_ids || jsonb_build_object(v_event.event_id, v_pass_id);
  END LOOP;

  IF v_primary_pass_id IS NULL THEN
    RAISE EXCEPTION 'Business access is not configured for this invitation' USING ERRCODE = '22023';
  END IF;

  IF NOT v_already_claimed THEN
    INSERT INTO public.business_invite_claims (campaign_id, user_id, pass_id)
    VALUES (v_campaign.id, v_user_id, v_primary_pass_id);
    UPDATE public.business_invite_campaigns
    SET claimed_count = claimed_count + 1, updated_at = now()
    WHERE id = v_campaign.id;
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_already_claimed THEN 'already_claimed' ELSE 'claimed' END,
    'pass_id', COALESCE(v_existing_pass_id, v_primary_pass_id),
    'pass_ids', v_pass_ids,
    'event_id', v_campaign.event_id
  );
END;
$_$;


--
-- Name: claim_event_account_grants(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_event_account_grants(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_email text;
  v_grant public.event_account_grants%ROWTYPE;
  v_pass_id text;
BEGIN
  SELECT lower(email) INTO v_email FROM auth.users
  WHERE id = p_user_id AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN RETURN; END IF;

  FOR v_grant IN
    SELECT * FROM public.event_account_grants
    WHERE email_normalized = v_email AND claimed_user_id IS NULL
    FOR UPDATE
  LOOP
    IF v_grant.speaker_id IS NOT NULL THEN
      UPDATE public.speakers SET user_id = p_user_id, updated_at = now()
      WHERE id = v_grant.speaker_id AND event_id = v_grant.event_id
        AND (user_id IS NULL OR user_id = p_user_id);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Speaker grant conflicts with the event or linked account';
      END IF;
    END IF;

    v_pass_id := public.create_default_pass(p_user_id::text, 'general', v_grant.event_id);
    IF NOT EXISTS (SELECT 1 FROM public.passes WHERE id::text = v_pass_id AND status = 'active')
      OR NOT EXISTS (SELECT 1 FROM public.event_pass_tiers WHERE event_id = v_grant.event_id AND pass_type = v_grant.pass_type) THEN
      RAISE EXCEPTION 'Grant requires an active pass and a configured event tier';
    END IF;
    -- Upgrade the existing entitlement in place: this also works on tenant
    -- schemas with UNIQUE(user_id, event_id). Never reset consumed usage.
    UPDATE public.passes AS p
    SET pass_type = v_grant.pass_type::public.pass_type,
        max_meeting_requests = t.max_meeting_requests,
        max_boost_amount = t.max_boost_amount,
        access_features = CASE v_grant.pass_type
          WHEN 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
          WHEN 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
          ELSE ARRAY['general_sessions'] END,
        special_perks = CASE v_grant.pass_type
          WHEN 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
          WHEN 'business' THEN ARRAY['business_lounge', 'networking_tools']
          ELSE ARRAY['basic_swag'] END,
        updated_at = now()
    FROM public.event_pass_tiers AS t
    WHERE p.id::text = v_pass_id AND p.status = 'active'
      AND t.event_id = v_grant.event_id AND t.pass_type = v_grant.pass_type
      AND CASE p.pass_type::text WHEN 'vip' THEN 2 WHEN 'business' THEN 1 ELSE 0 END
        <= CASE v_grant.pass_type WHEN 'vip' THEN 2 WHEN 'business' THEN 1 ELSE 0 END;

    IF v_grant.event_role IS NOT NULL THEN
      INSERT INTO public.event_roles(event_id, user_id, role, granted_by, metadata)
      VALUES (v_grant.event_id, p_user_id, v_grant.event_role, v_grant.configured_by,
        jsonb_build_object('source', 'verified_event_account_grant'))
      ON CONFLICT (event_id, user_id, role) DO NOTHING;
    END IF;

    UPDATE public.event_account_grants
    SET claimed_user_id = p_user_id, claimed_at = now()
    WHERE event_id = v_grant.event_id AND email_normalized = v_grant.email_normalized;
  END LOOP;
END;
$$;


--
-- Name: claim_event_account_grants_on_signup(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_event_account_grants_on_signup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  PERFORM public.claim_event_account_grants(NEW.id);
  RETURN NEW;
END;
$$;


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
-- Name: claim_sms_delivery_slot(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_sms_delivery_slot(p_phone_lookup_hmac text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  bucket_start timestamptz := date_trunc('hour', now())
    + (floor(extract(minute FROM now()) / 10) * interval '10 minutes');
BEGIN
  INSERT INTO public.sms_delivery_rate_limits (
    phone_lookup_hmac,
    window_started_at,
    request_count
  ) VALUES (p_phone_lookup_hmac, bucket_start, 1)
  ON CONFLICT (phone_lookup_hmac) DO UPDATE
  SET window_started_at = CASE
        WHEN public.sms_delivery_rate_limits.window_started_at < bucket_start THEN bucket_start
        ELSE public.sms_delivery_rate_limits.window_started_at
      END,
      request_count = CASE
        WHEN public.sms_delivery_rate_limits.window_started_at < bucket_start THEN 1
        ELSE public.sms_delivery_rate_limits.request_count + 1
      END
  WHERE public.sms_delivery_rate_limits.window_started_at < bucket_start
    OR public.sms_delivery_rate_limits.request_count < 3;

  RETURN FOUND;
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
  WHERE expires_at < now() OR used = true;
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
  WHERE (window_start < now() - interval '1 hour' AND blocked_until IS NULL)
     OR (blocked_until IS NOT NULL AND blocked_until < now());
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
-- Name: consume_email_otp(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_email_otp(p_email text, p_code_hmac text, p_purpose text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  challenge public.otp_codes;
BEGIN
  SELECT * INTO challenge
  FROM public.otp_codes
  WHERE email = p_email
    AND purpose = p_purpose
    AND used = false
    AND expires_at > now()
    AND attempt_count < 5
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF challenge.code_hmac IS NULL OR challenge.code_hmac <> p_code_hmac THEN
    UPDATE public.otp_codes
    SET attempt_count = LEAST(attempt_count + 1, 5)
    WHERE id = challenge.id;
    RETURN jsonb_build_object(
      'ok', false,
      'reason', CASE WHEN challenge.attempt_count >= 4 THEN 'locked' ELSE 'invalid' END
    );
  END IF;

  UPDATE public.otp_codes
  SET used = true
  WHERE id = challenge.id;

  RETURN jsonb_build_object(
    'ok', true,
    'tokenHash', challenge.token_hash,
    'email', challenge.email
  );
END;
$$;


--
-- Name: consume_sms_auth_challenge(uuid, uuid, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_sms_auth_challenge(p_challenge_id uuid, p_user_id uuid, p_email_lookup_hmac text, p_code_hmac text, p_purpose text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  challenge public.sms_auth_challenges;
BEGIN
  SELECT * INTO challenge
  FROM public.sms_auth_challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND
    OR challenge.purpose <> p_purpose
    OR challenge.email_lookup_hmac <> p_email_lookup_hmac
    OR (p_user_id IS NOT NULL AND challenge.user_id <> p_user_id)
    OR (p_user_id IS NULL AND challenge.user_id IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF challenge.consumed_at IS NOT NULL OR challenge.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  IF challenge.attempt_count >= 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'locked');
  END IF;

  IF challenge.code_hmac <> p_code_hmac THEN
    UPDATE public.sms_auth_challenges
    SET attempt_count = attempt_count + 1
    WHERE id = challenge.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  UPDATE public.sms_auth_challenges
  SET phone_verified_at = now(),
      consumed_at = CASE WHEN challenge.purpose = 'enrollment' THEN now() ELSE consumed_at END
  WHERE id = challenge.id;

  RETURN jsonb_build_object(
    'ok', true,
    'phoneLookupHmac', challenge.phone_lookup_hmac,
    'phoneLast4', challenge.phone_last4
  );
END;
$$;


--
-- Name: consume_sms_registration(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.consume_sms_registration(p_challenge_id uuid, p_email_lookup_hmac text, p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  challenge public.sms_auth_challenges;
  active_phone_count integer;
BEGIN
  SELECT * INTO challenge
  FROM public.sms_auth_challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND
    OR challenge.purpose <> 'registration'
    OR challenge.email_lookup_hmac <> p_email_lookup_hmac
    OR challenge.phone_verified_at IS NULL
    OR challenge.consumed_at IS NOT NULL
    OR challenge.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  -- Lock this account's capacity check so concurrent requests cannot bind a
  -- third number. Two active phone authenticators are intentionally allowed.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  SELECT count(*) INTO active_phone_count
  FROM public.user_phone_authenticators
  WHERE user_id = p_user_id AND revoked_at IS NULL;
  IF active_phone_count >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_limit');
  END IF;

  INSERT INTO public.user_phone_authenticators (
    user_id,
    phone_lookup_hmac,
    phone_last4,
    verified_at
  ) VALUES (
    p_user_id,
    challenge.phone_lookup_hmac,
    challenge.phone_last4,
    now()
  ) ON CONFLICT (phone_lookup_hmac) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'phone_unavailable');
  END IF;

  UPDATE public.sms_auth_challenges SET consumed_at = now() WHERE id = challenge.id;
  RETURN jsonb_build_object(
    'ok', true,
    'phoneLookupHmac', challenge.phone_lookup_hmac,
    'phoneLast4', challenge.phone_last4
  );
END;
$$;


--
-- Name: contact_network(uuid, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.contact_network(p_user_id uuid, p_action text, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  target uuid;
  profile jsonb;
  selected_topics text[];
  result jsonb;
BEGIN
  IF p_action = 'profile' THEN
    profile := p_payload->'profile';
    SELECT coalesce(array_agg(value), '{}') INTO selected_topics FROM jsonb_array_elements_text(profile->'topics');
    IF cardinality(selected_topics) <> (SELECT count(DISTINCT t) FROM unnest(selected_topics) t) THEN
      RAISE EXCEPTION 'Duplicate topics';
    END IF;
    INSERT INTO contact_profiles (id, name, role, company, topics, discoverable, leaderboard)
    VALUES (p_user_id, btrim(profile->>'name'), btrim(profile->>'role'), btrim(profile->>'company'), selected_topics,
      (profile->>'discoverable')::boolean, (profile->>'leaderboard')::boolean)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, company = EXCLUDED.company,
      topics = EXCLUDED.topics, discoverable = EXCLUDED.discoverable, leaderboard = EXCLUDED.leaderboard;
  ELSIF p_action = 'request' THEN
    SELECT id INTO target FROM contact_profiles WHERE share_id = (p_payload->>'card')::uuid;
    IF target IS NULL OR target = p_user_id OR NOT EXISTS (SELECT 1 FROM contact_profiles WHERE id = p_user_id) THEN
      RAISE EXCEPTION 'Invalid contact request';
    END IF;
    IF (SELECT count(*) FROM contact_requests WHERE sender = p_user_id AND status = 'pending') >= 50 THEN
      RAISE EXCEPTION 'Pending request limit reached';
    END IF;
    IF EXISTS (SELECT 1 FROM contact_requests WHERE LEAST(sender,recipient) = LEAST(p_user_id,target)
      AND GREATEST(sender,recipient) = GREATEST(p_user_id,target) AND status IN ('declined','cancelled')) THEN
      RAISE EXCEPTION 'Request not available';
    END IF;
    INSERT INTO contact_requests (sender, recipient) VALUES (p_user_id, target)
    ON CONFLICT DO NOTHING;
  ELSIF p_action IN ('accept', 'decline', 'cancel') THEN
    UPDATE contact_requests SET status = CASE p_action WHEN 'accept' THEN 'accepted' WHEN 'decline' THEN 'declined' ELSE 'cancelled' END
    WHERE id = (p_payload->>'requestId')::uuid AND status = 'pending'
      AND CASE WHEN p_action = 'cancel' THEN sender = p_user_id ELSE recipient = p_user_id END;
    IF NOT FOUND THEN RAISE EXCEPTION 'Request not available'; END IF;
  ELSIF p_action <> 'read' THEN
    RAISE EXCEPTION 'Unknown contacts action';
  END IF;

  SELECT jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM contact_network_profiles p WHERE p.id = p_user_id),
    'contacts', coalesce((SELECT jsonb_agg(to_jsonb(p) - 'share_id' ORDER BY p.name, p.id)
      FROM contact_network_profiles p JOIN contact_requests r
      ON ((r.sender = p_user_id AND r.recipient = p.id) OR (r.recipient = p_user_id AND r.sender = p.id)) AND r.status = 'accepted'), '[]'),
    'incoming', coalesce((SELECT jsonb_agg(jsonb_build_object('id', r.id, 'profile', to_jsonb(p) - 'share_id') ORDER BY r.created_at DESC)
      FROM contact_requests r JOIN contact_network_profiles p ON p.id = r.sender
      WHERE r.recipient = p_user_id AND r.status = 'pending'), '[]'),
    'outgoing', coalesce((SELECT jsonb_agg(r.recipient) FROM contact_requests r WHERE r.sender = p_user_id AND r.status = 'pending'), '[]'),
    'suggestions', coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM (
      SELECT p.* FROM contact_network_profiles p JOIN contact_profiles me ON me.id = p_user_id
      WHERE p.discoverable AND p.id <> p_user_id AND p.topics && me.topics
        AND NOT EXISTS (SELECT 1 FROM contact_requests r WHERE LEAST(r.sender,r.recipient) = LEAST(p.id,p_user_id) AND GREATEST(r.sender,r.recipient) = GREATEST(p.id,p_user_id))
      ORDER BY cardinality(ARRAY(SELECT unnest(p.topics) INTERSECT SELECT unnest(me.topics))) DESC, p.id LIMIT 30
    ) p), '[]'),
    'leaderboard', coalesce((SELECT jsonb_agg(to_jsonb(p) - 'share_id' ORDER BY p.points DESC, p.id) FROM (
      SELECT * FROM contact_network_profiles WHERE leaderboard AND points > 0 ORDER BY points DESC, id LIMIT 20
    ) p), '[]'),
    'shared', (SELECT to_jsonb(p) FROM contact_network_profiles p WHERE p.share_id = nullif(p_payload->>'card', '')::uuid)
  ) INTO result;
  RETURN result;
END;
$$;


--
-- Name: FUNCTION contact_network(p_user_id uuid, p_action text, p_payload jsonb); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.contact_network(p_user_id uuid, p_action text, p_payload jsonb) IS 'Server-only Contacts read/write model. Never expose actor selection to clients. Network XP is not wallet HashPoints.';


--
-- Name: create_default_pass(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_default_pass(p_user_id text, p_pass_type text DEFAULT 'general'::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_event_id text := COALESCE(NULLIF(current_setting('app.event_id', true), ''), 'bsl2025');
  v_pass_id text;
  v_max_requests integer;
  v_max_boost integer;
  v_existing_id text;
BEGIN
  SELECT id INTO v_existing_id
  FROM public.passes
  WHERE user_id = p_user_id
    AND event_id = v_event_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  SELECT max_requests, max_boost INTO v_max_requests, v_max_boost
  FROM public.get_pass_type_limits(p_pass_type)
  LIMIT 1;

  INSERT INTO public.passes (
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
    p_user_id,
    v_event_id,
    p_pass_type::pass_type,
    'active',
    'BSL-' || upper(p_pass_type) || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    COALESCE(v_max_requests, 10),
    0,
    COALESCE(v_max_boost, 100),
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
  )
  RETURNING id INTO v_pass_id;

  RETURN v_pass_id;
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

CREATE FUNCTION public.create_default_pass(p_user_id text, p_pass_type text DEFAULT 'general'::text, p_event_id text DEFAULT 'colombia2026'::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
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
  v_access_features text[] := ARRAY['general_sessions'];
  v_special_perks text[] := ARRAY['basic_swag'];
BEGIN
  IF NULLIF(trim(p_user_id), '') IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required' USING ERRCODE = '22023';
  END IF;
  IF v_event_id IS NULL OR v_event_id NOT IN ('bsl2025', 'peru2026', 'chile2026', 'colombia2026', 'cbweek2026') THEN
    RAISE EXCEPTION 'Unsupported pass event: %', p_event_id USING ERRCODE = '22023';
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

  IF v_pass_type = 'business' THEN
    v_access_features := ARRAY['all_sessions', 'networking', 'business_events'];
    v_special_perks := ARRAY['business_lounge', 'networking_tools'];
  ELSIF v_pass_type = 'vip' THEN
    v_access_features := ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access'];
    v_special_perks := ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag'];
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('hashpass:pass:' || p_user_id || ':' || v_event_id || ':' || CASE WHEN v_event_id = 'cbweek2026' THEN 'general' ELSE v_pass_type END, 0)
  );

  SELECT id::text
  INTO v_existing_id
  FROM public.passes
  WHERE user_id::text = p_user_id
    AND event_id = v_event_id
    AND (pass_type::text = v_pass_type OR v_event_id = 'cbweek2026')
    AND (status = 'active' OR v_event_id = 'cbweek2026')
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;

  SELECT max_meeting_requests, max_boost_amount
  INTO v_max_requests, v_max_boost
  FROM public.event_pass_tiers
  WHERE event_id = v_event_id AND pass_type = v_pass_type AND v_event_id = 'cbweek2026';
  v_max_requests := COALESCE(v_max_requests, CASE v_pass_type WHEN 'vip' THEN 50 WHEN 'business' THEN 20 ELSE 10 END);
  v_max_boost := COALESCE(v_max_boost, CASE v_pass_type WHEN 'vip' THEN 500 WHEN 'business' THEN 300 ELSE 100 END);

  v_pass_id := gen_random_uuid();
  SELECT data_type
  INTO v_pass_number_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'passes'
    AND column_name = 'pass_number';

  IF v_pass_number_type IN ('text', 'character varying') THEN
    EXECUTE '
      INSERT INTO public.passes (
        id, user_id, event_id, pass_type, status, pass_number,
        max_meeting_requests, used_meeting_requests, max_boost_amount,
        used_boost_amount, access_features, special_perks
      ) VALUES (
        $1, $2, $3, $4::public.pass_type, ''active'', $5,
        $6, 0, $7, 0,
        $8, $9
      )
      RETURNING id::text'
    INTO v_return_id
    USING v_pass_id, p_user_id, v_event_id, v_pass_type, v_pass_number,
      v_max_requests, v_max_boost, v_access_features, v_special_perks;
  ELSE
    INSERT INTO public.passes (
      id, user_id, event_id, pass_type, status,
      max_meeting_requests, used_meeting_requests, max_boost_amount,
      used_boost_amount, access_features, special_perks
    ) VALUES (
      v_pass_id, p_user_id, v_event_id, v_pass_type::public.pass_type, 'active',
      v_max_requests, 0, v_max_boost, 0,
      v_access_features, v_special_perks
    )
    RETURNING id::text INTO v_return_id;
  END IF;

  RETURN v_return_id;
END;
$_$;


--
-- Name: create_demo_general_pass_for_user(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_demo_general_pass_for_user(p_user_id uuid, p_event_id text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_pass_id text;
  v_existing_id text;
  v_tier public.event_pass_tiers%ROWTYPE;
  v_event_id text;
  v_id_type text;
  v_pass_number_type text;
  v_id_value text;
  v_pass_number_value text;
BEGIN
  SELECT e.id
  INTO v_event_id
  FROM public.events e
  WHERE e.id = p_event_id
    AND e.is_demo
    AND e.status = 'published';

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Courtesy demo pass requested for an unpublished or non-demo event: %', p_event_id
      USING ERRCODE = '22023';
  END IF;

  -- A transaction-scoped lock plus the existing-pass check makes repeated
  -- confirmation updates and concurrent OAuth callbacks safe and idempotent.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('hashpass:demo-pass:' || p_user_id::text || ':' || p_event_id, 0)
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

  -- A future demo event needs no one-off SQL to become usable. Organizers may
  -- configure richer limits later; an existing General tier is never replaced.
  INSERT INTO public.event_pass_tiers (
    event_id, pass_type, max_meeting_requests, max_boost_amount, price_cents, currency, price_label
  ) VALUES (
    p_event_id, 'general', 10, 100, 0, 'USD', 'Demo courtesy pass'
  )
  ON CONFLICT (event_id, pass_type) DO NOTHING;

  SELECT *
  INTO v_tier
  FROM public.event_pass_tiers
  WHERE event_id = p_event_id
    AND pass_type = 'general';

  SELECT data_type INTO v_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'passes' AND column_name = 'id';

  SELECT data_type INTO v_pass_number_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'passes' AND column_name = 'pass_number';

  v_id_value := gen_random_uuid()::text;
  v_pass_number_value := CASE
    WHEN v_pass_number_type IN ('integer', 'bigint', 'smallint') THEN
      (trunc(random() * 900000000 + 100000000))::bigint::text
    ELSE
      upper(p_event_id) || '-GENERAL-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)
  END;

  EXECUTE format(
    'INSERT INTO public.passes (
       id, user_id, event_id, pass_type, status, pass_number,
       max_meeting_requests, used_meeting_requests,
       max_boost_amount, used_boost_amount, access_features, special_perks
     ) VALUES (
       %L%s, $1, $2, ''general''::public.pass_type, ''active'', %L%s,
       $3, 0, $4, 0, $5, $6
     ) RETURNING id::text',
    v_id_value, CASE WHEN v_id_type = 'uuid' THEN '::uuid' ELSE '' END,
    v_pass_number_value, CASE WHEN v_pass_number_type IN ('integer', 'bigint', 'smallint') THEN '::' || v_pass_number_type ELSE '' END
  )
  INTO v_pass_id
  USING p_user_id::text, p_event_id, v_tier.max_meeting_requests, v_tier.max_boost_amount,
    ARRAY['general_sessions'], ARRAY['basic_swag'];

  RETURN v_pass_id;
END;
$_$;


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
    AS $_$
DECLARE
  v_pass_id text;
  v_existing_id text;
  v_tier public.event_pass_tiers%ROWTYPE;
  v_id_type text;
  v_pass_number_type text;
  v_id_value text;
  v_pass_number_value text;
BEGIN
  IF p_event_id NOT IN ('chile2026', 'colombia2026', 'criptolatinfest') THEN
    RAISE EXCEPTION 'Unsupported upcoming general-pass event: %', p_event_id USING ERRCODE = '22023';
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

  SELECT data_type INTO v_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'passes' AND column_name = 'id';

  SELECT data_type INTO v_pass_number_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'passes' AND column_name = 'pass_number';

  v_id_value := gen_random_uuid()::text;

  v_pass_number_value := CASE
    WHEN v_pass_number_type IN ('integer', 'bigint', 'smallint') THEN
      (trunc(random() * 900000000 + 100000000))::bigint::text
    ELSE
      upper(p_event_id) || '-GENERAL-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8)
  END;

  EXECUTE format(
    'INSERT INTO public.passes (
       id, user_id, event_id, pass_type, status, pass_number,
       max_meeting_requests, used_meeting_requests,
       max_boost_amount, used_boost_amount, access_features, special_perks
     ) VALUES (
       %L%s, $1, $2, ''general''::public.pass_type, ''active'', %L%s,
       $3, 0, $4, 0, $5, $6
     ) RETURNING id::text',
    v_id_value, CASE WHEN v_id_type = 'uuid' THEN '::uuid' ELSE '' END,
    v_pass_number_value, CASE WHEN v_pass_number_type IN ('integer', 'bigint', 'smallint') THEN '::' || v_pass_number_type ELSE '' END
  )
  INTO v_pass_id
  USING p_user_id::text, p_event_id, v_tier.max_meeting_requests, v_tier.max_boost_amount,
    ARRAY['general_sessions'], ARRAY['basic_swag'];

  RETURN v_pass_id;
END;
$_$;


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
-- Name: ensure_business_invite_event_pass(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_business_invite_event_pass(p_user_id uuid, p_event_id text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_existing_id text;
  v_pass_id uuid;
  v_return_id text;
  v_pass_number text := 'HP-GENERAL-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  v_pass_number_type text;
BEGIN
  IF p_user_id IS NULL OR NULLIF(btrim(p_event_id), '') IS NULL THEN
    RAISE EXCEPTION 'Business invitation pass identity is required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('hashpass:business-invite-pass:' || p_user_id::text || ':' || p_event_id, 0)
  );

  SELECT pass.id::text INTO v_existing_id
  FROM public.passes AS pass
  WHERE pass.user_id = p_user_id::text
    AND pass.event_id = p_event_id
    AND pass.status = 'active'
  ORDER BY CASE pass.pass_type::text WHEN 'vip' THEN 2 WHEN 'business' THEN 1 ELSE 0 END DESC,
           pass.created_at DESC
  LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  SELECT data_type INTO v_pass_number_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'passes' AND column_name = 'pass_number';

  v_pass_id := gen_random_uuid();
  BEGIN
    IF v_pass_number_type IN ('text', 'character varying') THEN
      EXECUTE '
        INSERT INTO public.passes (
          id, user_id, event_id, pass_type, status, pass_number,
          max_meeting_requests, used_meeting_requests, max_boost_amount,
          used_boost_amount, access_features, special_perks
        ) VALUES ($1, $2, $3, ''general''::public.pass_type, ''active'', $4,
          10, 0, 100, 0, $5, $6)
        RETURNING id::text'
      INTO v_return_id
      USING v_pass_id, p_user_id::text, p_event_id, v_pass_number,
        ARRAY['general_sessions'], ARRAY['basic_swag'];
    ELSE
      INSERT INTO public.passes (
        id, user_id, event_id, pass_type, status,
        max_meeting_requests, used_meeting_requests, max_boost_amount,
        used_boost_amount, access_features, special_perks
      ) VALUES (
        v_pass_id, p_user_id::text, p_event_id, 'general'::public.pass_type, 'active',
        10, 0, 100, 0, ARRAY['general_sessions'], ARRAY['basic_swag']
      )
      RETURNING id::text INTO v_return_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    SELECT pass.id::text INTO v_return_id
    FROM public.passes AS pass
    WHERE pass.user_id = p_user_id::text
      AND pass.event_id = p_event_id
      AND pass.status = 'active'
    ORDER BY CASE pass.pass_type::text WHEN 'vip' THEN 2 WHEN 'business' THEN 1 ELSE 0 END DESC,
             pass.created_at DESC
    LIMIT 1;
  END;

  IF v_return_id IS NULL THEN
    RAISE EXCEPTION 'Unable to provision the Business invitation event pass' USING ERRCODE = '22023';
  END IF;
  RETURN v_return_id;
END;
$_$;


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
-- Name: get_current_tenant_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
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
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    requester_id uuid NOT NULL,
    speaker_id uuid NOT NULL,
    message text,
    note text,
    meeting_type text DEFAULT 'networking'::text,
    status public.meeting_request_status DEFAULT 'pending'::public.meeting_request_status,
    scheduled_at timestamp with time zone,
    duration_minutes integer DEFAULT 15,
    location text,
    meeting_link text,
    boost_amount numeric(20,8) DEFAULT 0,
    speaker_response text,
    speaker_response_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + '48:00:00'::interval),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    event_id text DEFAULT 'bsl2025'::text NOT NULL
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
  v_total bigint := 0;
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
    COUNT(*)::bigint,
    COUNT(*) FILTER (WHERE status::text IN ('accepted', 'approved'))::bigint,
    COUNT(*) FILTER (WHERE status::text IN ('accepted', 'approved'))::bigint,
    COUNT(*) FILTER (WHERE status::text IN ('pending', 'requested'))::bigint,
    COUNT(*) FILTER (WHERE status::text IN ('declined', 'rejected'))::bigint,
    COUNT(*) FILTER (WHERE status::text = 'cancelled')::bigint
  INTO v_total, v_accepted, v_approved, v_pending, v_declined, v_cancelled
  FROM public.meeting_requests
  WHERE requester_id::text = p_user_id
    AND event_id = v_event_id
    AND status::text NOT IN ('cancelled', 'expired');

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
-- Name: get_user_setup(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_setup(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'status', coalesce(s.status, 'not_started'),
    'step', coalesce(s.step, 0),
    'goals', to_jsonb(coalesce(s.goals, '{}'::text[])),
    'topics', to_jsonb(coalesce(s.topics, '{}'::text[])),
    'privacyScope', coalesce(s.privacy_scope, 'private'),
    'consentVersion', s.consent_version,
    'completedAt', s.completed_at,
    'pin', jsonb_build_object(
      'enabled', p.user_id IS NOT NULL,
      'lockedUntil', CASE WHEN p.locked_until > now() THEN p.locked_until END,
      'remainingAttempts', CASE WHEN p.user_id IS NULL THEN NULL ELSE greatest(0, 5 - p.failed_attempts) END
    )
  )
  FROM (SELECT 1) AS anchor
  LEFT JOIN public.user_setup s ON s.user_id = p_user_id
  LEFT JOIN public.user_pin p ON p.user_id = p_user_id;
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
-- Name: has_email_been_sent(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_email_been_sent(p_user_id uuid, p_email_type text) RETURNS boolean
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM email_sent_log
    WHERE user_id = p_user_id AND email_type = p_email_type
  );
END;
$$;


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
-- Name: ingest_event_source_sync(text, timestamp with time zone, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ingest_event_source_sync(p_source_id text, p_attempted_at timestamp with time zone, p_status text, p_error text, p_events jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_run_id uuid;
  v_event jsonb;
  v_existing public.external_events%ROWTYPE;
  v_review boolean;
  v_observation_id uuid;
  v_payload_hash text;
BEGIN
  IF p_status NOT IN ('healthy', 'degraded', 'failed') OR jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'Invalid event ingestion payload' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.event_sources WHERE id = p_source_id AND active) THEN
    RAISE EXCEPTION 'Unknown or inactive event source' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.event_source_sync_runs(source_id, attempted_at, status, event_count, error_summary)
  VALUES (p_source_id, p_attempted_at, p_status, jsonb_array_length(p_events), left(p_error, 1000))
  RETURNING id INTO v_run_id;

  UPDATE public.event_sources SET
    last_success_at = CASE WHEN p_status = 'healthy' THEN p_attempted_at ELSE last_success_at END,
    consecutive_failures = CASE WHEN p_status = 'healthy' THEN 0 ELSE consecutive_failures + 1 END,
    updated_at = now()
  WHERE id = p_source_id;

  -- A degraded/failed fetch records durable health only. Retained rows are not
  -- new source observations and must not advance last_seen_at.
  IF p_status <> 'healthy' THEN
    RETURN;
  END IF;

  FOR v_event IN SELECT value FROM jsonb_array_elements(p_events)
  LOOP
    IF v_event->>'sourceId' IS DISTINCT FROM p_source_id OR coalesce(v_event->>'externalId', '') = '' THEN
      RAISE EXCEPTION 'Event identity does not match source' USING ERRCODE = '22023';
    END IF;

    v_payload_hash := encode(digest(v_event::text, 'sha256'), 'hex');
    INSERT INTO public.external_event_observations(
      sync_run_id, source_id, external_id, observed_at, payload_hash,
      normalized_payload, confidence, needs_review
    ) VALUES (
      v_run_id, p_source_id, v_event->>'externalId', p_attempted_at,
      v_payload_hash, v_event,
      (v_event->>'confidence')::numeric, (v_event->>'needsReview')::boolean
    ) RETURNING id INTO v_observation_id;

    SELECT * INTO v_existing FROM public.external_events
    WHERE source_id = p_source_id AND external_id = v_event->>'externalId' FOR UPDATE;

    v_review := ((v_event->>'needsReview')::boolean
      OR (v_event->>'confidence')::numeric < 0.90
      OR v_event->>'status' IN ('stale', 'cancelled')
      OR (v_existing.source_id IS NOT NULL AND (
        v_existing.normalized_payload->>'startsAt' IS DISTINCT FROM v_event->>'startsAt'
        OR v_existing.normalized_payload->>'title' IS DISTINCT FROM v_event->>'title'
        OR v_existing.normalized_payload->>'venueName' IS DISTINCT FROM v_event->>'venueName'
        OR v_existing.normalized_payload->>'sourceUrl' IS DISTINCT FROM v_event->>'sourceUrl'
      ))) AND (v_existing.source_id IS NULL
        OR v_existing.last_reviewed_payload_hash IS DISTINCT FROM v_payload_hash);

    INSERT INTO public.external_events(
      source_id, external_id, source_status, publication_status, normalized_payload,
      candidate_payload, confidence, first_seen_at, last_seen_at, published_at, review_reason
    ) VALUES (
      p_source_id, v_event->>'externalId', v_event->>'status',
      CASE WHEN v_review THEN 'needs_review' ELSE 'published' END,
      v_event, CASE WHEN v_review THEN v_event ELSE NULL END,
      (v_event->>'confidence')::numeric, p_attempted_at, p_attempted_at,
      CASE WHEN v_review THEN NULL ELSE p_attempted_at END,
      CASE WHEN v_review THEN 'Source marked the event for review or a protected field changed' ELSE NULL END
    ) ON CONFLICT (source_id, external_id) DO UPDATE SET
      source_status = EXCLUDED.source_status,
      publication_status = CASE WHEN v_review THEN 'needs_review' ELSE external_events.publication_status END,
      normalized_payload = CASE WHEN v_review THEN external_events.normalized_payload ELSE EXCLUDED.normalized_payload END,
      candidate_payload = CASE WHEN v_review THEN EXCLUDED.normalized_payload ELSE NULL END,
      confidence = EXCLUDED.confidence,
      last_seen_at = EXCLUDED.last_seen_at,
      published_at = CASE WHEN NOT v_review AND external_events.published_at IS NULL THEN p_attempted_at ELSE external_events.published_at END,
      review_reason = CASE WHEN v_review THEN EXCLUDED.review_reason ELSE NULL END;
  END LOOP;
END;
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
-- Name: link_pending_speaker_requests_on_claim(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_pending_speaker_requests_on_claim() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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


--
-- Name: list_business_invite_approver_user_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_business_invite_approver_user_ids() RETURNS TABLE(user_id uuid)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT user_record.id
  FROM auth.users AS user_record
  JOIN public.business_invite_approvers AS approver
    ON approver.email_hash = encode(extensions.digest(lower(user_record.email), 'sha256'), 'hex')
  WHERE user_record.email_confirmed_at IS NOT NULL;
$$;


--
-- Name: list_business_invite_requests_for_approver(uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_business_invite_requests_for_approver(p_actor_user_id uuid, p_status text DEFAULT 'pending'::text, p_limit integer DEFAULT 100) RETURNS TABLE(id uuid, user_id uuid, user_email text, status text, requested_at timestamp with time zone, reviewed_at timestamp with time zone, reviewed_by uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF p_status NOT IN ('pending', 'approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid Business invitation status' USING ERRCODE = '22023';
  END IF;
  IF p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Invalid Business invitation page size' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users AS actor
    JOIN public.business_invite_approvers AS approver
      ON approver.email_hash = encode(extensions.digest(lower(actor.email), 'sha256'), 'hex')
    WHERE actor.id = p_actor_user_id AND actor.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Business invitation approval is not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT request.id, request.user_id, requester.email, request.status,
         request.requested_at, request.reviewed_at, request.reviewed_by
  FROM public.business_invite_requests AS request
  JOIN auth.users AS requester ON requester.id = request.user_id
  WHERE request.status = p_status
  ORDER BY request.requested_at ASC
  LIMIT p_limit;
END;
$$;


--
-- Name: list_speaker_claim_requests(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_speaker_claim_requests(p_actor_user_id uuid, p_event_id text) RETURNS TABLE(claim_id uuid, speaker_id text, event_id text, speaker_name text, speaker_title text, speaker_company text, requester_user_id uuid, requester_email text, status text, request_note text, created_at timestamp with time zone, review_note text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_temp'
    AS $$
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Only an event administrator may review speaker claims'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT request.id,
         request.speaker_id,
         request.event_id,
         speaker.name,
         speaker.title,
         speaker.company,
         request.requester_user_id,
         lower(auth_user.email),
         request.status,
         request.request_note,
         request.created_at,
         request.review_note
    FROM public.speaker_claim_requests AS request
    JOIN public.bsl_speakers AS speaker
      ON speaker.id::text = request.speaker_id
     AND speaker.event_id = request.event_id
    JOIN auth.users AS auth_user
      ON auth_user.id = request.requester_user_id
   WHERE request.event_id = p_event_id
   ORDER BY request.created_at DESC
   LIMIT 200;
END;
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
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 101);
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
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 101);
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
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 101);
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
-- Name: mark_email_as_sent(uuid, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_email_as_sent(p_user_id uuid, p_email_type text, p_recipient_email text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  INSERT INTO email_sent_log (user_id, email_type, recipient_email, metadata)
  VALUES (p_user_id, p_email_type, p_recipient_email, p_metadata)
  ON CONFLICT (user_id, email_type) DO NOTHING;
END;
$$;


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
-- Name: parse_iso8601_immutable(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.parse_iso8601_immutable(value text) RETURNS timestamp with time zone
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT value::timestamptz
$$;


--
-- Name: provision_bsl_colombia_business_invite_campaign(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.provision_bsl_colombia_business_invite_campaign() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.id = 'colombia2026' AND NEW.status = 'published' THEN
    INSERT INTO public.business_invite_campaigns (
      event_id, code_hash, label, max_claims, is_active
    ) VALUES (
      'colombia2026',
      encode(digest('9899', 'sha256'), 'hex'),
      'Blockchain Summit Latam Colombia 2026 Business invitation',
      NULL,
      true
    )
    ON CONFLICT (code_hash) DO UPDATE
    SET event_id = EXCLUDED.event_id,
        label = EXCLUDED.label,
        max_claims = EXCLUDED.max_claims,
        expires_at = NULL,
        is_active = true,
        updated_at = now()
    WHERE public.business_invite_campaigns.claimed_count = 0;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: provision_cbweek_general_pass(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.provision_cbweek_general_pass() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.events WHERE id = 'cbweek2026' AND status = 'published'
  ) THEN
    PERFORM public.create_default_pass(NEW.id::text, 'general', 'cbweek2026');
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
DECLARE
  v_demo_event record;
BEGIN
  IF NEW.email_confirmed_at IS NULL AND NEW.confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Preserve the standard BSL entitlements.
  PERFORM public.create_upcoming_bsl_general_pass_for_user(NEW.id, 'chile2026');
  PERFORM public.create_upcoming_bsl_general_pass_for_user(NEW.id, 'colombia2026');

  -- New and future published demo events automatically participate.
  FOR v_demo_event IN
    SELECT e.id
    FROM public.events e
    WHERE e.is_demo
      AND e.status = 'published'
  LOOP
    PERFORM public.create_demo_general_pass_for_user(NEW.id, v_demo_event.id);
  END LOOP;

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
-- Name: release_event_account_grants(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_event_account_grants() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.speakers AS s SET user_id = NULL, updated_at = now()
  FROM public.event_account_grants AS g
  WHERE g.claimed_user_id = OLD.id AND s.id = g.speaker_id AND s.user_id = OLD.id;
  UPDATE public.event_account_grants SET claimed_user_id = NULL, claimed_at = NULL
  WHERE claimed_user_id = OLD.id;
  RETURN OLD;
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
-- Name: request_business_invite_for_user(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_business_invite_for_user(p_user_id uuid, p_code text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_email text;
  v_campaign public.business_invite_campaigns%ROWTYPE;
  v_request public.business_invite_requests%ROWTYPE;
  v_created boolean := false;
  v_event_ids jsonb;
  v_approver record;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to request Business access' USING ERRCODE = '42501';
  END IF;

  SELECT lower(email) INTO v_email
  FROM auth.users
  WHERE id = p_user_id AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Verify your email before requesting Business access' USING ERRCODE = '42501';
  END IF;

  IF p_code IS NULL
    OR length(btrim(p_code)) < 4
    OR length(btrim(p_code)) > 64
    OR upper(btrim(p_code)) !~ '^[A-Z0-9][A-Z0-9_-]{3,63}$' THEN
    RAISE EXCEPTION 'Invalid Business invitation code' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign
  FROM public.business_invite_campaigns
  WHERE code_hash = encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex')
    AND is_active = true
  FOR UPDATE;
  IF NOT FOUND OR (v_campaign.expires_at IS NOT NULL AND v_campaign.expires_at <= now()) THEN
    RAISE EXCEPTION 'Invalid or expired Business invitation code' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_agg(target.event_id ORDER BY target.event_id)
  INTO v_event_ids
  FROM public.business_invite_campaign_events AS target
  JOIN public.events AS event ON event.id = target.event_id AND event.status = 'published'
  JOIN public.event_pass_tiers AS tier
    ON tier.event_id = target.event_id AND tier.pass_type = 'business'
  WHERE target.campaign_id = v_campaign.id;
  IF v_event_ids IS NULL THEN
    RAISE EXCEPTION 'Business access is not configured for this invitation' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.business_invite_requests (campaign_id, user_id)
  VALUES (v_campaign.id, p_user_id)
  ON CONFLICT (campaign_id, user_id) DO NOTHING
  RETURNING * INTO v_request;

  v_created := FOUND;
  IF NOT v_created THEN
    SELECT * INTO v_request
    FROM public.business_invite_requests
    WHERE campaign_id = v_campaign.id AND user_id = p_user_id
    FOR UPDATE;
  END IF;

  IF v_created THEN
    PERFORM public.create_notification(
      p_user_id,
      'business_invite_pending',
      'Business access pending review',
      'Your Business access request is pending confirmation by HASHPASS.',
      NULL, NULL, false, NULL, 'important'
    );

    FOR v_approver IN
      SELECT user_id FROM public.list_business_invite_approver_user_ids()
    LOOP
      PERFORM public.create_notification(
        v_approver.user_id,
        'business_invite_review_required',
        'Business access approval requested',
        'A verified account requested BSL and Colombia Blockchain Week Business access.',
        NULL, NULL, true, NULL, 'critical'
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'status', v_request.status,
    'request_id', v_request.id,
    'created', v_created,
    'event_ids', v_event_ids
  );
END;
$_$;


--
-- Name: request_speaker_profile_claim(text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.request_speaker_profile_claim(p_speaker_id text, p_requester_user_id uuid, p_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_speaker public.bsl_speakers%ROWTYPE;
  v_existing public.speaker_claim_requests%ROWTYPE;
  v_email text;
BEGIN
  SELECT lower(email)
    INTO v_email
    FROM auth.users
   WHERE id = p_requester_user_id
     AND email IS NOT NULL
     AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'A confirmed email is required to request a speaker profile claim'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_speaker
    FROM public.bsl_speakers
   WHERE id::text = btrim(COALESCE(p_speaker_id, ''))
     AND user_id IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Speaker profile is not available for claiming'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.bsl_speakers
     WHERE user_id = p_requester_user_id
  ) THEN
    RAISE EXCEPTION 'This account is already linked to a speaker profile'
      USING ERRCODE = '23505';
  END IF;

  SELECT *
    INTO v_existing
    FROM public.speaker_claim_requests
   WHERE speaker_id = v_speaker.id::text
     AND status = 'pending'
   FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'claim_id', v_existing.id,
      'speaker_id', v_existing.speaker_id,
      'status', v_existing.status
    );
  END IF;

  INSERT INTO public.speaker_claim_requests (
    speaker_id,
    event_id,
    requester_user_id,
    request_note
  ) VALUES (
    v_speaker.id::text,
    v_speaker.event_id,
    p_requester_user_id,
    NULLIF(left(btrim(COALESCE(p_note, '')), 1000), '')
  )
  RETURNING * INTO v_existing;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (
    p_requester_user_id,
    v_speaker.event_id,
    'speaker_claim.requested',
    'speaker',
    v_speaker.id::text,
    jsonb_build_object('claim_id', v_existing.id)
  );

  RETURN jsonb_build_object(
    'claim_id', v_existing.id,
    'speaker_id', v_existing.speaker_id,
    'status', v_existing.status
  );
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
-- Name: reset_meeting_request_limits(text, text, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reset_meeting_request_limits(p_user_id text, p_event_id text, p_boost_cost numeric DEFAULT 50) RETURNS TABLE(pass_id text, event_id text, reset_cost numeric, remaining_requests integer, remaining_boost numeric, pass_type text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_event_id text := NULLIF(trim(COALESCE(p_event_id, '')), '');
  v_user_id text := NULLIF(trim(COALESCE(p_user_id, '')), '');
  v_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_pass RECORD;
  v_updated_pass_id text;
  v_remaining_requests integer;
  v_remaining_boost numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'A valid user id is required' USING ERRCODE = '22023';
  END IF;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'A valid event id is required' USING ERRCODE = '22023';
  END IF;
  IF p_boost_cost IS DISTINCT FROM 50 THEN
    RAISE EXCEPTION 'The meeting-request reset costs exactly 50 Boost points'
      USING ERRCODE = '22023';
  END IF;

  IF v_role <> 'service_role'
     AND auth.uid() IS NOT NULL
     AND auth.uid()::text <> v_user_id THEN
    RAISE EXCEPTION 'You may only reset your own meeting request limits'
      USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'service_role'
     AND auth.uid() IS NULL
     AND public.get_current_user_id()::text IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'An authenticated user is required'
      USING ERRCODE = '42501';
  END IF;

  SELECT
    p.id,
    p.max_meeting_requests,
    p.used_meeting_requests,
    p.max_boost_amount,
    p.used_boost_amount,
    p.pass_type::text AS pass_type
  INTO v_pass
  FROM public.passes p
  WHERE p.user_id::text = v_user_id
    AND p.event_id = v_event_id
    AND p.status = 'active'
  ORDER BY p.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_pass.id IS NULL THEN
    RAISE EXCEPTION 'No active pass found for this event' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_pass.used_meeting_requests, 0)
       < COALESCE(v_pass.max_meeting_requests, 0) THEN
    RAISE EXCEPTION 'The meeting request limit has not been reached'
      USING ERRCODE = '22023';
  END IF;
  IF COALESCE(v_pass.max_boost_amount, 0)
       - COALESCE(v_pass.used_boost_amount, 0) < p_boost_cost THEN
    RAISE EXCEPTION 'Not enough Boost points remain for this reset'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.passes p
  SET used_meeting_requests = 0,
      used_boost_amount = COALESCE(p.used_boost_amount, 0) + p_boost_cost,
      updated_at = now()
  WHERE p.id = v_pass.id
  RETURNING p.id::text,
            GREATEST(0, COALESCE(p.max_meeting_requests, 0) - COALESCE(p.used_meeting_requests, 0)),
            GREATEST(0, COALESCE(p.max_boost_amount, 0) - COALESCE(p.used_boost_amount, 0))
  INTO v_updated_pass_id, v_remaining_requests, v_remaining_boost;

  UPDATE public.pass_request_limits AS prl
  SET requests_used = 0,
      reset_at = now(),
      updated_at = now()
  WHERE prl.pass_id = v_pass.id
    AND prl.user_id = v_user_id;

  RETURN QUERY
  SELECT v_updated_pass_id,
         v_event_id,
         p_boost_cost,
         v_remaining_requests,
         v_remaining_boost,
         v_pass.pass_type;
END;
$$;


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
-- Name: review_business_invite_request(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.review_business_invite_request(p_request_id uuid, p_actor_user_id uuid, p_decision text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_request public.business_invite_requests%ROWTYPE;
  v_campaign public.business_invite_campaigns%ROWTYPE;
  v_event record;
  v_pass_id text;
  v_primary_pass_id text;
  v_max_requests integer;
  v_max_boost numeric;
  v_pass_ids jsonb := '{}'::jsonb;
  v_has_claim boolean;
BEGIN
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Invalid Business invitation decision' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users AS user_record
    JOIN public.business_invite_approvers AS approver
      ON approver.email_hash = encode(extensions.digest(lower(user_record.email), 'sha256'), 'hex')
    WHERE user_record.id = p_actor_user_id AND user_record.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Business invitation approval is not authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_request
  FROM public.business_invite_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business invitation request was not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_request.status <> 'pending' THEN
    RETURN jsonb_build_object(
      'request_id', v_request.id,
      'user_id', v_request.user_id,
      'status', v_request.status,
      'already_reviewed', true
    );
  END IF;

  SELECT * INTO v_campaign
  FROM public.business_invite_campaigns
  WHERE id = v_request.campaign_id
  FOR UPDATE;
  IF NOT FOUND OR NOT v_campaign.is_active
    OR (v_campaign.expires_at IS NOT NULL AND v_campaign.expires_at <= now()) THEN
    RAISE EXCEPTION 'Business invitation campaign is unavailable' USING ERRCODE = '22023';
  END IF;

  IF p_decision = 'reject' THEN
    UPDATE public.business_invite_requests
    SET status = 'rejected', reviewed_at = now(), reviewed_by = p_actor_user_id, updated_at = now()
    WHERE id = v_request.id;

    PERFORM public.create_notification(
      v_request.user_id,
      'business_invite_rejected',
      'Business access request not approved',
      'Your Business access request was reviewed and was not approved.',
      NULL, NULL, false, NULL, 'important'
    );

    RETURN jsonb_build_object(
      'request_id', v_request.id,
      'user_id', v_request.user_id,
      'status', 'rejected',
      'already_reviewed', false
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.business_invite_claims
    WHERE campaign_id = v_campaign.id AND user_id = v_request.user_id
  ) INTO v_has_claim;

  IF NOT v_has_claim
    AND v_campaign.max_claims IS NOT NULL
    AND v_campaign.claimed_count >= v_campaign.max_claims THEN
    RAISE EXCEPTION 'This Business invitation has reached its limit' USING ERRCODE = '22023';
  END IF;

  FOR v_event IN
    SELECT target.event_id
    FROM public.business_invite_campaign_events AS target
    JOIN public.events AS event ON event.id = target.event_id
    JOIN public.event_pass_tiers AS tier
      ON tier.event_id = target.event_id AND tier.pass_type = 'business'
    WHERE target.campaign_id = v_campaign.id AND event.status = 'published'
    ORDER BY CASE target.event_id WHEN 'bsl' THEN 0 WHEN 'cbweek2026' THEN 1 ELSE 2 END
  LOOP
    SELECT max_meeting_requests, max_boost_amount
    INTO v_max_requests, v_max_boost
    FROM public.event_pass_tiers
    WHERE event_id = v_event.event_id AND pass_type = 'business';

    v_pass_id := public.ensure_business_invite_event_pass(v_request.user_id, v_event.event_id);
    IF NOT EXISTS (
      SELECT 1 FROM public.passes
      WHERE id::text = v_pass_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'An active event pass is required for this invitation' USING ERRCODE = '22023';
    END IF;

    -- Upgrade in place only; a VIP entitlement and its consumed counters stay intact.
    UPDATE public.passes AS pass
    SET pass_type = 'business'::public.pass_type,
        max_meeting_requests = v_max_requests,
        max_boost_amount = v_max_boost,
        access_features = ARRAY['all_sessions', 'networking', 'business_events'],
        special_perks = ARRAY['business_lounge', 'networking_tools'],
        updated_at = now()
    WHERE pass.id::text = v_pass_id
      AND pass.status = 'active'
      AND CASE pass.pass_type::text WHEN 'vip' THEN 2 WHEN 'business' THEN 1 ELSE 0 END <= 1;

    v_primary_pass_id := COALESCE(v_primary_pass_id, v_pass_id);
    v_pass_ids := v_pass_ids || jsonb_build_object(v_event.event_id, v_pass_id);
  END LOOP;

  IF v_primary_pass_id IS NULL THEN
    RAISE EXCEPTION 'Business access is not configured for this invitation' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.business_invite_claims (campaign_id, user_id, pass_id)
  VALUES (v_campaign.id, v_request.user_id, v_primary_pass_id)
  ON CONFLICT (campaign_id, user_id) DO UPDATE
  SET pass_id = EXCLUDED.pass_id, claimed_at = now();

  IF NOT v_has_claim THEN
    UPDATE public.business_invite_campaigns
    SET claimed_count = claimed_count + 1, updated_at = now()
    WHERE id = v_campaign.id;
  END IF;

  UPDATE public.business_invite_requests
  SET status = 'approved', reviewed_at = now(), reviewed_by = p_actor_user_id, updated_at = now()
  WHERE id = v_request.id;

  PERFORM public.create_notification(
    v_request.user_id,
    'business_invite_approved',
    'Business access approved',
    'Your BSL and Colombia Blockchain Week Business access is now active.',
    NULL, NULL, false, NULL, 'important'
  );

  RETURN jsonb_build_object(
    'request_id', v_request.id,
    'user_id', v_request.user_id,
    'status', 'approved',
    'pass_ids', v_pass_ids,
    'already_reviewed', false
  );
END;
$$;


--
-- Name: review_external_event_candidate(text, text, text, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.review_external_event_candidate(p_source_id text, p_external_id text, p_decision text, p_reviewer uuid, p_reason text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_event public.external_events%ROWTYPE;
  v_observation_id uuid;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') OR p_reviewer IS NULL THEN
    RAISE EXCEPTION 'Invalid ingestion review' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_event FROM public.external_events
  WHERE source_id = p_source_id AND external_id = p_external_id FOR UPDATE;
  IF NOT FOUND OR v_event.publication_status <> 'needs_review' OR v_event.candidate_payload IS NULL THEN
    RAISE EXCEPTION 'No reviewable event candidate found' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_observation_id FROM public.external_event_observations
  WHERE source_id = p_source_id AND external_id = p_external_id
  ORDER BY observed_at DESC LIMIT 1;

  INSERT INTO public.event_ingestion_reviews(source_id, external_id, observation_id, decision, reason, reviewed_by)
  VALUES (p_source_id, p_external_id, v_observation_id, p_decision, left(p_reason, 1000), p_reviewer);

  UPDATE public.external_events SET
    normalized_payload = CASE WHEN p_decision = 'approved' THEN candidate_payload ELSE normalized_payload END,
    source_status = CASE WHEN p_decision = 'approved' THEN candidate_payload->>'status' ELSE source_status END,
    publication_status = CASE
      WHEN p_decision = 'approved' AND candidate_payload->>'status' IN ('upcoming', 'live') THEN 'published'
      WHEN p_decision = 'approved' THEN 'rejected'
      ELSE 'rejected'
    END,
    candidate_payload = NULL,
    published_at = CASE WHEN p_decision = 'approved' AND candidate_payload->>'status' IN ('upcoming', 'live') THEN now() ELSE published_at END,
    reviewed_at = now(), reviewed_by = p_reviewer,
    review_reason = left(p_reason, 1000),
    last_reviewed_payload_hash = encode(digest(candidate_payload::text, 'sha256'), 'hex')
  WHERE source_id = p_source_id AND external_id = p_external_id;
END;
$$;


--
-- Name: review_speaker_profile_claim(uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.review_speaker_profile_claim(p_actor_user_id uuid, p_claim_id uuid, p_action text, p_review_note text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'pg_temp'
    AS $$
DECLARE
  v_claim public.speaker_claim_requests%ROWTYPE;
  v_speaker public.bsl_speakers%ROWTYPE;
  v_email text;
BEGIN
  SELECT *
    INTO v_claim
    FROM public.speaker_claim_requests
   WHERE id = p_claim_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Speaker claim request not found' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_event_admin_access(p_actor_user_id, v_claim.event_id, false) THEN
    RAISE EXCEPTION 'Only an event administrator may review speaker claims'
      USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Unsupported speaker claim review action' USING ERRCODE = '22023';
  END IF;
  IF v_claim.status <> 'pending' THEN
    RAISE EXCEPTION 'This speaker claim has already been reviewed' USING ERRCODE = '23505';
  END IF;

  SELECT *
    INTO v_speaker
    FROM public.bsl_speakers
   WHERE id::text = v_claim.speaker_id
     AND event_id = v_claim.event_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Speaker profile not found for this event' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'approve' THEN
    SELECT lower(email)
      INTO v_email
      FROM auth.users
     WHERE id = v_claim.requester_user_id
       AND email IS NOT NULL
       AND email_confirmed_at IS NOT NULL;
    IF v_email IS NULL THEN
      RAISE EXCEPTION 'The claimant must have a confirmed email before approval'
        USING ERRCODE = '42501';
    END IF;
    IF v_speaker.user_id IS NOT NULL THEN
      RAISE EXCEPTION 'Speaker profile is already linked to an account'
        USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.bsl_speakers
       WHERE user_id = v_claim.requester_user_id
         AND id::text <> v_claim.speaker_id
    ) THEN
      RAISE EXCEPTION 'This account is already linked to another speaker profile'
        USING ERRCODE = '23505';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.speaker_identity_claims
       WHERE (claimed_user_id = v_claim.requester_user_id OR email_normalized = v_email)
         AND speaker_id <> v_claim.speaker_id
    ) THEN
      RAISE EXCEPTION 'This account or email is already linked to another speaker profile'
        USING ERRCODE = '23505';
    END IF;

    UPDATE public.bsl_speakers
       SET user_id = v_claim.requester_user_id,
           is_active = true,
           is_accepting_meetings = true,
           directory_visible = true,
           updated_at = now()
     WHERE id::text = v_claim.speaker_id
       AND event_id = v_claim.event_id;

    INSERT INTO public.speaker_identity_claims (
      speaker_id, email_normalized, status, configured_by,
      claimed_user_id, claimed_at, metadata
    ) VALUES (
      v_claim.speaker_id, v_email, 'claimed', p_actor_user_id,
      v_claim.requester_user_id, now(),
      jsonb_build_object('source', 'speaker_claim_request', 'claim_request_id', v_claim.id)
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
  END IF;

  UPDATE public.speaker_claim_requests
     SET status = p_action,
         reviewed_by = p_actor_user_id,
         review_note = NULLIF(left(btrim(COALESCE(p_review_note, '')), 1000), ''),
         reviewed_at = now(),
         updated_at = now()
   WHERE id = v_claim.id;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (
    p_actor_user_id,
    v_claim.event_id,
    'speaker_claim.' || p_action,
    'speaker',
    v_claim.speaker_id,
    jsonb_build_object('claim_id', v_claim.id, 'requester_user_id', v_claim.requester_user_id)
  );

  RETURN jsonb_build_object(
    'claim_id', v_claim.id,
    'speaker_id', v_claim.speaker_id,
    'status', p_action
  );
END;
$$;


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
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: save_user_setup(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_user_setup(p_user_id uuid, p_patch jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  current_row public.user_setup;
  unknown_keys text[];
  next_goals text[];
  next_topics text[];
  next_scope text;
  next_step smallint;
  next_consent smallint;
  finishing boolean := false;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'invalid_setup_request' USING ERRCODE = '23514';
  END IF;
  SELECT array_agg(k) INTO unknown_keys FROM jsonb_object_keys(p_patch) AS k
    WHERE k NOT IN ('step', 'goals', 'topics', 'privacyScope', 'consentVersion', 'complete');
  IF unknown_keys IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_setup_request' USING ERRCODE = '23514';
  END IF;
  IF (p_patch ? 'goals' AND jsonb_typeof(p_patch->'goals') <> 'array')
    OR (p_patch ? 'topics' AND jsonb_typeof(p_patch->'topics') <> 'array')
    OR (p_patch ? 'step' AND jsonb_typeof(p_patch->'step') <> 'number')
    OR (p_patch ? 'consentVersion' AND jsonb_typeof(p_patch->'consentVersion') <> 'number')
    OR (p_patch ? 'privacyScope' AND jsonb_typeof(p_patch->'privacyScope') <> 'string')
    OR (p_patch ? 'complete' AND jsonb_typeof(p_patch->'complete') <> 'boolean') THEN
    RAISE EXCEPTION 'invalid_setup_request' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.user_setup(user_id) VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO current_row FROM public.user_setup WHERE user_id = p_user_id FOR UPDATE;

  next_goals := CASE WHEN p_patch ? 'goals'
    THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'goals')) ELSE current_row.goals END;
  next_topics := CASE WHEN p_patch ? 'topics'
    THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'topics')) ELSE current_row.topics END;
  IF cardinality(next_goals) <> (SELECT count(DISTINCT g) FROM unnest(next_goals) g)
    OR cardinality(next_topics) <> (SELECT count(DISTINCT t) FROM unnest(next_topics) t) THEN
    RAISE EXCEPTION 'invalid_setup_request' USING ERRCODE = '23514';
  END IF;
  next_scope := CASE WHEN p_patch ? 'privacyScope' THEN p_patch->>'privacyScope' ELSE current_row.privacy_scope END;
  next_step := CASE WHEN p_patch ? 'step' THEN (p_patch->>'step')::smallint ELSE current_row.step END;
  next_consent := CASE WHEN p_patch ? 'consentVersion'
    THEN greatest(coalesce(current_row.consent_version, 0), (p_patch->>'consentVersion')::smallint)
    ELSE current_row.consent_version END;
  finishing := coalesce((p_patch->>'complete')::boolean, false);
  IF finishing AND next_consent IS NULL THEN
    RAISE EXCEPTION 'consent_required' USING ERRCODE = '23514';
  END IF;

  UPDATE public.user_setup SET
    goals = next_goals,
    topics = next_topics,
    privacy_scope = next_scope,
    step = CASE WHEN current_row.status = 'complete' THEN current_row.step ELSE next_step END,
    consent_version = next_consent,
    consented_at = CASE WHEN p_patch ? 'consentVersion' THEN now() ELSE current_row.consented_at END,
    status = CASE WHEN current_row.status = 'complete' OR finishing THEN 'complete' ELSE 'in_progress' END,
    completed_at = CASE WHEN current_row.status = 'complete' THEN current_row.completed_at
      WHEN finishing THEN now() ELSE NULL END,
    updated_at = now()
  WHERE user_id = p_user_id;
  RETURN public.get_user_setup(p_user_id);
END;
$$;


--
-- Name: send_event_chat_room_message(text, uuid, text, text, text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_event_chat_room_message(p_event_id text, p_sender_id uuid, p_message text, p_message_type text DEFAULT 'text'::text, p_sender_display_name text DEFAULT NULL::text, p_reply_to_message_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, event_id text, sender_id uuid, sender_display_name text, message text, message_type text, reply_to_message_id uuid, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  trailing_sender uuid;
  consecutive_count integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_event_id || ':' || p_sender_id::text, 0)
  );

  IF p_reply_to_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.event_chat_messages reply
    WHERE reply.id = p_reply_to_message_id
      AND reply.event_id = p_event_id
  ) THEN
    RAISE EXCEPTION 'The reply target does not belong to this event room'
      USING ERRCODE = '22023';
  END IF;

  FOR trailing_sender IN
    SELECT recent.sender_id
    FROM public.event_chat_messages recent
    WHERE recent.event_id = p_event_id
    ORDER BY recent.created_at DESC, recent.id DESC
    LIMIT 5
  LOOP
    IF trailing_sender <> p_sender_id THEN
      EXIT;
    END IF;
    consecutive_count := consecutive_count + 1;
  END LOOP;

  IF consecutive_count >= 5 THEN
    RAISE EXCEPTION 'A reply from another attendee is required before you can send another message'
      USING ERRCODE = 'P0001', DETAIL = 'CHAT_RATE_LIMIT';
  END IF;

  RETURN QUERY
  INSERT INTO public.event_chat_messages (
    event_id,
    sender_id,
    sender_display_name,
    message,
    message_type,
    reply_to_message_id
  )
  VALUES (
    p_event_id,
    p_sender_id,
    p_sender_display_name,
    btrim(p_message),
    p_message_type,
    p_reply_to_message_id
  )
  RETURNING
    event_chat_messages.id,
    event_chat_messages.event_id,
    event_chat_messages.sender_id,
    event_chat_messages.sender_display_name,
    event_chat_messages.message,
    event_chat_messages.message_type,
    event_chat_messages.reply_to_message_id,
    event_chat_messages.created_at;
END;
$$;


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
-- Name: set_session_context(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_session_context(p_user_id uuid DEFAULT NULL::uuid, p_tenant_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF p_user_id IS NOT NULL THEN
    PERFORM set_config('app.user_id', p_user_id::text, true);
  END IF;
  IF p_tenant_id IS NOT NULL THEN
    PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
  END IF;
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
-- Name: set_user_pin(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_pin(p_user_id uuid, p_verifier text, p_current text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  outcome jsonb;
  inserted integer;
BEGIN
  IF p_verifier IS NULL OR p_verifier !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_pin_request' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_pin WHERE user_id = p_user_id) THEN
    INSERT INTO public.user_pin(user_id, verifier) VALUES (p_user_id, decode(p_verifier, 'hex'))
      ON CONFLICT (user_id) DO NOTHING;
    GET DIAGNOSTICS inserted = ROW_COUNT;
    IF inserted = 1 THEN
      RETURN jsonb_build_object('ok', true, 'enabled', true, 'remainingAttempts', 5, 'lockedUntil', NULL);
    END IF;
  END IF;
  -- A PIN already exists (possibly created a moment ago by a concurrent request).
  IF p_current IS NULL THEN
    RAISE EXCEPTION 'pin_already_set' USING ERRCODE = '23514';
  END IF;
  outcome := public.verify_user_pin(p_user_id, p_current);
  IF NOT (outcome->>'ok')::boolean THEN
    RETURN outcome;
  END IF;
  UPDATE public.user_pin SET verifier = decode(p_verifier, 'hex'), set_at = now(), updated_at = now()
    WHERE user_id = p_user_id;
  RETURN outcome;
END;
$_$;


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
-- Name: sync_bsl_public_programme(text, text, jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_bsl_public_programme(p_event_id text, p_source_id text, p_speakers jsonb, p_agenda jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  v_speaker_count integer;
  v_agenda_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required' USING ERRCODE = '42501';
  END IF;
  IF p_event_id !~ '^[a-z0-9-]{2,80}$' OR p_source_id !~ '^[a-z0-9-]{2,100}$' THEN
    RAISE EXCEPTION 'invalid event or source id' USING ERRCODE = '22023';
  END IF;
  v_speaker_count := jsonb_array_length(p_speakers);
  v_agenda_count := jsonb_array_length(p_agenda);
  IF v_speaker_count < 10 OR v_speaker_count > 500 OR v_agenda_count < 20 OR v_agenda_count > 1000 THEN
    RAISE EXCEPTION 'programme size outside safety bounds' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.bsl_speakers
    (event_id, slug, name, title, company, bio, imageurl, is_active,
     is_accepting_meetings, directory_visible, metadata, updated_at)
  SELECT p_event_id, x.slug, x.name, x.title, x.company, x.bio, x.imageurl,
    false, true, true, x.metadata, x.updated_at
  FROM jsonb_to_recordset(p_speakers) AS x(
    slug text, name text, title text, company text, bio text, imageurl text,
    metadata jsonb, updated_at timestamptz
  )
  ON CONFLICT (event_id, slug) WHERE slug IS NOT NULL DO UPDATE SET
    name = EXCLUDED.name,
    title = EXCLUDED.title,
    company = EXCLUDED.company,
    bio = EXCLUDED.bio,
    imageurl = EXCLUDED.imageurl,
    is_active = CASE
      WHEN public.bsl_speakers.user_id IS NULL THEN false
      ELSE public.bsl_speakers.is_active
    END,
    is_accepting_meetings = CASE
      WHEN public.bsl_speakers.user_id IS NULL THEN true
      ELSE public.bsl_speakers.is_accepting_meetings
    END,
    directory_visible = CASE
      WHEN public.bsl_speakers.user_id IS NULL THEN true
      ELSE public.bsl_speakers.directory_visible
    END,
    metadata = EXCLUDED.metadata,
    updated_at = EXCLUDED.updated_at;

  UPDATE public.bsl_speakers speaker
  SET is_active = false,
      is_accepting_meetings = false,
      directory_visible = false,
      updated_at = now()
  WHERE speaker.event_id = p_event_id
    AND speaker.metadata ->> 'source' = p_source_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_speakers) item
      WHERE item ->> 'slug' = speaker.slug
    );

  INSERT INTO public.event_agenda
    (id, event_id, source_id, time, title, description, speakers, type,
     location, day, day_name, updated_at)
  SELECT x.id, p_event_id, p_source_id, x.time, x.title, x.description,
    x.speakers, x.type, x.location, x.day, x.day_name, x.updated_at
  FROM jsonb_to_recordset(p_agenda) AS x(
    id text, time timestamptz, title text, description text, speakers text[],
    type text, location text, day text, day_name text, updated_at timestamptz
  )
  ON CONFLICT (id) DO UPDATE SET
    event_id = EXCLUDED.event_id,
    source_id = EXCLUDED.source_id,
    time = EXCLUDED.time,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    speakers = EXCLUDED.speakers,
    type = EXCLUDED.type,
    location = EXCLUDED.location,
    day = EXCLUDED.day,
    day_name = EXCLUDED.day_name,
    updated_at = EXCLUDED.updated_at;

  DELETE FROM public.event_agenda agenda
  WHERE agenda.event_id = p_event_id
    AND agenda.source_id = p_source_id
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_agenda) item
      WHERE item ->> 'id' = agenda.id
    );

  RETURN jsonb_build_object('speakers', v_speaker_count, 'agenda', v_agenda_count);
END;
$_$;


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
-- Name: touch_qr_link(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_qr_link() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
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
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
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
-- Name: verify_user_pin(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.verify_user_pin(p_user_id uuid, p_candidate text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  stored public.user_pin;
  attempts integer;
  lock_for interval;
BEGIN
  IF p_candidate IS NULL OR p_candidate !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_pin_request' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO stored FROM public.user_pin WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'enabled', false, 'remainingAttempts', 0, 'lockedUntil', NULL);
  END IF;
  IF stored.locked_until IS NOT NULL AND stored.locked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'enabled', true, 'remainingAttempts', 0, 'lockedUntil', stored.locked_until);
  END IF;
  IF stored.verifier = decode(p_candidate, 'hex') THEN
    UPDATE public.user_pin SET failed_attempts = 0, locked_until = NULL,
      last_verified_at = now(), updated_at = now() WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', true, 'enabled', true, 'remainingAttempts', 5, 'lockedUntil', NULL);
  END IF;
  attempts := stored.failed_attempts + 1;
  IF attempts >= 5 THEN
    lock_for := least(interval '1 hour', interval '30 seconds' * power(2, least(attempts - 5, 7))::integer);
  END IF;
  UPDATE public.user_pin SET failed_attempts = attempts, updated_at = now(),
    locked_until = CASE WHEN lock_for IS NULL THEN NULL ELSE now() + lock_for END
    WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok', false, 'enabled', true,
    'remainingAttempts', greatest(0, 5 - attempts),
    'lockedUntil', CASE WHEN lock_for IS NULL THEN NULL ELSE now() + lock_for END);
END;
$_$;


--
-- Name: bsl_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bsl_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event text NOT NULL,
    ref_id text,
    actor text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
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
    attendeeid text NOT NULL,
    start timestamp with time zone NOT NULL,
    "end" timestamp with time zone NOT NULL,
    status text DEFAULT 'requested'::text NOT NULL,
    createdat timestamp with time zone DEFAULT now() NOT NULL
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
    userid text NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    used boolean DEFAULT false NOT NULL,
    issuedat timestamp with time zone DEFAULT now() NOT NULL,
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
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
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
-- Name: bsl_speakers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bsl_speakers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid,
    name text NOT NULL,
    slug text,
    title text,
    company text,
    bio text,
    image_url text,
    linkedin_url text,
    twitter_url text,
    website_url text,
    day text,
    day_name text,
    session_time text,
    session_title text,
    session_type text,
    is_active boolean DEFAULT false,
    is_accepting_meetings boolean DEFAULT true,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    imageurl text,
    linkedin text,
    twitter text,
    tags text[],
    availability jsonb,
    event_id text DEFAULT 'bsl2025'::text NOT NULL,
    directory_visible boolean DEFAULT true NOT NULL
);


--
-- Name: business_invite_approvers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_invite_approvers (
    email_hash text NOT NULL,
    label text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_invite_approvers_label_check CHECK (((length(btrim(label)) >= 1) AND (length(btrim(label)) <= 120)))
);


--
-- Name: business_invite_campaign_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_invite_campaign_events (
    campaign_id uuid NOT NULL,
    event_id text NOT NULL
);


--
-- Name: business_invite_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_invite_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    code_hash text NOT NULL,
    label text NOT NULL,
    max_claims integer,
    claimed_count integer DEFAULT 0 NOT NULL,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_invite_campaigns_check CHECK (((max_claims IS NULL) OR (claimed_count <= max_claims))),
    CONSTRAINT business_invite_campaigns_claimed_count_check CHECK ((claimed_count >= 0)),
    CONSTRAINT business_invite_campaigns_label_check CHECK (((length(btrim(label)) >= 1) AND (length(btrim(label)) <= 160))),
    CONSTRAINT business_invite_campaigns_max_claims_check CHECK (((max_claims IS NULL) OR (max_claims > 0)))
);


--
-- Name: business_invite_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_invite_claims (
    campaign_id uuid NOT NULL,
    user_id uuid NOT NULL,
    pass_id text NOT NULL,
    claimed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: business_invite_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.business_invite_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT business_invite_requests_check CHECK ((((status = 'pending'::text) AND (reviewed_at IS NULL) AND (reviewed_by IS NULL)) OR ((status = ANY (ARRAY['approved'::text, 'rejected'::text])) AND (reviewed_at IS NOT NULL) AND (reviewed_by IS NOT NULL)))),
    CONSTRAINT business_invite_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: chat_last_seen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_last_seen (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now()
);


--
-- Name: contact_network_profiles; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.contact_network_profiles AS
SELECT
    NULL::uuid AS id,
    NULL::text AS name,
    NULL::text AS role,
    NULL::text AS company,
    NULL::text[] AS topics,
    NULL::boolean AS discoverable,
    NULL::boolean AS leaderboard,
    NULL::uuid AS share_id,
    NULL::integer AS connections,
    NULL::integer AS points;


--
-- Name: contact_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_profiles (
    id uuid NOT NULL,
    name text NOT NULL,
    role text DEFAULT ''::text NOT NULL,
    company text DEFAULT ''::text NOT NULL,
    topics text[] DEFAULT '{}'::text[] NOT NULL,
    discoverable boolean DEFAULT false NOT NULL,
    leaderboard boolean DEFAULT false NOT NULL,
    share_id uuid DEFAULT gen_random_uuid() NOT NULL,
    CONSTRAINT contact_profiles_company_check CHECK ((length(company) <= 100)),
    CONSTRAINT contact_profiles_name_check CHECK (((length(btrim(name)) >= 1) AND (length(btrim(name)) <= 80))),
    CONSTRAINT contact_profiles_role_check CHECK ((length(role) <= 100)),
    CONSTRAINT contact_profiles_topics_check CHECK (((cardinality(topics) <= 5) AND (topics <@ ARRAY['AI'::text, 'Web3'::text, 'Design'::text, 'Startups'::text, 'Payments'::text, 'DeFi'::text, 'Infrastructure'::text, 'Gaming'::text, 'Policy'::text, 'Community'::text])))
);


--
-- Name: contact_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender uuid NOT NULL,
    recipient uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contact_requests_check CHECK ((sender <> recipient)),
    CONSTRAINT contact_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text])))
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
-- Name: email_sent_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_sent_log (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    email_type text NOT NULL,
    recipient_email text,
    metadata jsonb DEFAULT '{}'::jsonb,
    sent_at timestamp with time zone DEFAULT now()
);


--
-- Name: event_account_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_account_grants (
    event_id text NOT NULL,
    email_normalized text NOT NULL,
    pass_type text NOT NULL,
    speaker_id uuid,
    event_role public.event_role,
    configured_by uuid NOT NULL,
    claimed_user_id uuid,
    claimed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_account_grants_email_normalized_check CHECK ((email_normalized = lower(btrim(email_normalized)))),
    CONSTRAINT event_account_grants_event_role_check CHECK ((event_role = ANY (ARRAY['event_admin'::public.event_role, 'moderator'::public.event_role]))),
    CONSTRAINT event_account_grants_pass_type_check CHECK ((pass_type = ANY (ARRAY['general'::text, 'business'::text, 'vip'::text])))
);


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
    source_id text,
    CONSTRAINT event_agenda_type_check CHECK ((type = ANY (ARRAY['keynote'::text, 'panel'::text, 'workshop'::text, 'networking'::text, 'break'::text, 'registration'::text, 'meal'::text])))
);


--
-- Name: event_auth_allies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_auth_allies (
    event_id text NOT NULL,
    allowed_ally_ids text[] DEFAULT ARRAY['hash-poker-room'::text] NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_auth_allies_allowed_ids_nonempty CHECK ((cardinality(allowed_ally_ids) >= 1)),
    CONSTRAINT event_auth_allies_hash_poker_required CHECK (('hash-poker-room'::text = ANY (allowed_ally_ids)))
);


--
-- Name: event_chat_direct_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_chat_direct_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    sender_id uuid NOT NULL,
    recipient_id uuid NOT NULL,
    sender_display_name text,
    message text NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reply_to_message_id uuid,
    CONSTRAINT event_chat_direct_messages_check CHECK ((sender_id <> recipient_id)),
    CONSTRAINT event_chat_direct_messages_message_check CHECK (((char_length(btrim(message)) >= 1) AND (char_length(btrim(message)) <= 2000))),
    CONSTRAINT event_chat_direct_messages_message_type_check CHECK ((message_type = ANY (ARRAY['text'::text, 'emoji'::text]))),
    CONSTRAINT event_chat_direct_messages_sender_display_name_check CHECK (((sender_display_name IS NULL) OR ((char_length(btrim(sender_display_name)) >= 1) AND (char_length(btrim(sender_display_name)) <= 80))))
);

ALTER TABLE ONLY public.event_chat_direct_messages REPLICA IDENTITY FULL;


--
-- Name: event_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id text NOT NULL,
    sender_id uuid NOT NULL,
    sender_display_name text,
    message text NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reply_to_message_id uuid,
    CONSTRAINT event_chat_messages_message_check CHECK (((char_length(btrim(message)) >= 1) AND (char_length(btrim(message)) <= 2000))),
    CONSTRAINT event_chat_messages_message_type_check CHECK ((message_type = ANY (ARRAY['text'::text, 'emoji'::text]))),
    CONSTRAINT event_chat_messages_sender_display_name_check CHECK (((sender_display_name IS NULL) OR ((char_length(btrim(sender_display_name)) >= 1) AND (char_length(btrim(sender_display_name)) <= 80))))
);

ALTER TABLE ONLY public.event_chat_messages REPLICA IDENTITY FULL;


--
-- Name: event_chat_presence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_chat_presence (
    event_id text NOT NULL,
    user_id uuid NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_chat_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_chat_rooms (
    event_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: event_ingestion_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_ingestion_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id text NOT NULL,
    external_id text NOT NULL,
    observation_id uuid,
    decision text NOT NULL,
    reason text,
    reviewed_by uuid NOT NULL,
    reviewed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_ingestion_reviews_decision_check CHECK ((decision = ANY (ARRAY['approved'::text, 'rejected'::text])))
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
-- Name: event_source_sync_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_source_sync_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id text NOT NULL,
    attempted_at timestamp with time zone NOT NULL,
    finished_at timestamp with time zone DEFAULT now() NOT NULL,
    status text NOT NULL,
    event_count integer DEFAULT 0 NOT NULL,
    error_summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_source_sync_runs_status_check CHECK ((status = ANY (ARRAY['healthy'::text, 'degraded'::text, 'failed'::text])))
);


--
-- Name: event_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.event_sources (
    id text NOT NULL,
    name text NOT NULL,
    base_url text NOT NULL,
    adapter text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    poll_interval_minutes integer DEFAULT 360 NOT NULL,
    last_success_at timestamp with time zone,
    consecutive_failures integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT event_sources_poll_interval_minutes_check CHECK (((poll_interval_minutes >= 15) AND (poll_interval_minutes <= 10080)))
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
    is_demo boolean DEFAULT false NOT NULL,
    search_aliases text[] DEFAULT ARRAY[]::text[] NOT NULL,
    CONSTRAINT events_date_order CHECK (((ends_at IS NULL) OR (starts_at IS NULL) OR (ends_at >= starts_at))),
    CONSTRAINT events_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])))
);


--
-- Name: COLUMN events.search_aliases; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.events.search_aliases IS 'Canonical alternative names and hashtag-style discovery terms for event search.';


--
-- Name: external_event_observations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_event_observations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sync_run_id uuid NOT NULL,
    source_id text NOT NULL,
    external_id text NOT NULL,
    observed_at timestamp with time zone NOT NULL,
    payload_hash text NOT NULL,
    normalized_payload jsonb NOT NULL,
    confidence numeric(4,3) NOT NULL,
    needs_review boolean NOT NULL
);


--
-- Name: external_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_events (
    source_id text NOT NULL,
    external_id text NOT NULL,
    source_status text NOT NULL,
    publication_status text DEFAULT 'pending'::text NOT NULL,
    normalized_payload jsonb NOT NULL,
    candidate_payload jsonb,
    confidence numeric(4,3) NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    review_reason text,
    last_reviewed_payload_hash text,
    CONSTRAINT external_events_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT external_events_publication_status_check CHECK ((publication_status = ANY (ARRAY['pending'::text, 'published'::text, 'needs_review'::text, 'rejected'::text]))),
    CONSTRAINT external_events_source_status_check CHECK ((source_status = ANY (ARRAY['upcoming'::text, 'live'::text, 'past'::text, 'stale'::text, 'cancelled'::text])))
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
-- Name: invite_scan_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invite_scan_events (
    id bigint NOT NULL,
    invite_code text NOT NULL,
    scanned_at timestamp with time zone DEFAULT now() NOT NULL,
    device_type text NOT NULL,
    bot_classification text NOT NULL,
    CONSTRAINT invite_scan_events_bot_classification_check CHECK ((bot_classification = ANY (ARRAY['human'::text, 'bot'::text]))),
    CONSTRAINT invite_scan_events_invite_code_check CHECK ((invite_code ~ '^[A-Za-z0-9_-]{1,64}$'::text))
);


--
-- Name: TABLE invite_scan_events; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.invite_scan_events IS 'Invite URL GET visits since tracking was enabled; includes shared-link opens and classified bots, not proven camera scans. HEAD and prefetch requests excluded.';


--
-- Name: invite_scan_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.invite_scan_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.invite_scan_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: jwks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jwks (
    id text NOT NULL,
    "publicKey" text NOT NULL,
    "privateKey" text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp with time zone,
    alg text,
    crv text
);


--
-- Name: meeting_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meeting_chat_messages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    sender_id uuid NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    ciphertext text NOT NULL,
    nonce text NOT NULL,
    meeting_id uuid NOT NULL,
    message_type text DEFAULT 'text'::text NOT NULL,
    read_at timestamp with time zone
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
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT meeting_slots_status_check CHECK ((status = ANY (ARRAY['available'::text, 'booked'::text, 'unavailable'::text])))
);


--
-- Name: meetings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meetings (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    meeting_request_id uuid,
    speaker_id uuid NOT NULL,
    requester_id uuid NOT NULL,
    speaker_name text,
    requester_name text,
    meeting_type text DEFAULT 'networking'::text,
    status public.meeting_status DEFAULT 'scheduled'::public.meeting_status,
    scheduled_at timestamp with time zone NOT NULL,
    duration_minutes integer DEFAULT 15,
    location text,
    meeting_link text,
    notes text,
    title text,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    event_id text DEFAULT 'bsl2025'::text NOT NULL,
    slot_id uuid,
    host_id uuid,
    attendee_id uuid,
    start_time timestamp with time zone,
    end_time timestamp with time zone,
    attendee_email text
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
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['meeting_request'::text, 'meeting_accepted'::text, 'meeting_declined'::text, 'meeting_reminder'::text, 'meeting_expired'::text, 'meeting_cancelled'::text, 'boost_received'::text, 'system_alert'::text, 'chat_message'::text, 'business_invite_pending'::text, 'business_invite_review_required'::text, 'business_invite_rejected'::text, 'business_invite_approved'::text])))
);


--
-- Name: COLUMN notifications.level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.level IS 'Delivery severity: info stays in-app; important may use push; critical also requires transactional email delivery.';


--
-- Name: oauthAccessToken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."oauthAccessToken" (
    id text NOT NULL,
    token text NOT NULL,
    "clientId" text NOT NULL,
    "sessionId" text,
    "userId" text,
    "referenceId" text,
    "authorizationCodeId" text,
    resources jsonb,
    "requestedUserInfoClaims" jsonb,
    "refreshId" text,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    revoked timestamp with time zone,
    confirmation jsonb,
    scopes jsonb NOT NULL
);


--
-- Name: oauthClient; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."oauthClient" (
    id text NOT NULL,
    "clientId" text NOT NULL,
    "clientSecret" text,
    "clientDiscoveryId" text,
    disabled boolean DEFAULT false,
    "skipConsent" boolean,
    "enableEndSession" boolean,
    "subjectType" text,
    scopes jsonb,
    "clientCredentialsScopes" jsonb DEFAULT '[]'::jsonb,
    "userId" text,
    "createdAt" timestamp with time zone,
    "updatedAt" timestamp with time zone,
    name text,
    uri text,
    icon text,
    contacts jsonb,
    tos text,
    policy text,
    "softwareId" text,
    "softwareVersion" text,
    "softwareStatement" text,
    "redirectUris" jsonb NOT NULL,
    "postLogoutRedirectUris" jsonb,
    "backchannelLogoutUri" text,
    "backchannelLogoutSessionRequired" boolean,
    "tokenEndpointAuthMethod" text,
    "applicationType" text,
    jwks text,
    "jwksUri" text,
    "grantTypes" jsonb,
    "responseTypes" jsonb,
    "requirePKCE" boolean,
    "dpopBoundAccessTokens" boolean DEFAULT false,
    "referenceId" text,
    metadata jsonb
);


--
-- Name: oauthClientAssertion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."oauthClientAssertion" (
    id text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL
);


--
-- Name: oauthClientResource; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."oauthClientResource" (
    id text NOT NULL,
    "clientId" text NOT NULL,
    "resourceId" text NOT NULL,
    metadata jsonb,
    "createdAt" timestamp with time zone
);


--
-- Name: oauthConsent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."oauthConsent" (
    id text NOT NULL,
    "clientId" text NOT NULL,
    "userId" text,
    "referenceId" text,
    resources jsonb,
    "requestedUserInfoClaims" jsonb,
    scopes jsonb NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: oauthRefreshToken; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."oauthRefreshToken" (
    id text NOT NULL,
    token text NOT NULL,
    "clientId" text NOT NULL,
    "sessionId" text,
    "userId" text NOT NULL,
    "referenceId" text,
    "authorizationCodeId" text,
    resources jsonb,
    "requestedUserInfoClaims" jsonb,
    "expiresAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    revoked timestamp with time zone,
    "rotatedAt" timestamp with time zone,
    "rotationReplayResponse" text,
    "rotationReplayExpiresAt" timestamp with time zone,
    "authTime" timestamp with time zone,
    confirmation jsonb,
    scopes jsonb NOT NULL
);


--
-- Name: oauthResource; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."oauthResource" (
    id text NOT NULL,
    identifier text NOT NULL,
    name text NOT NULL,
    "accessTokenTtl" integer,
    "refreshTokenTtl" integer,
    "signingAlgorithm" text,
    "signingKeyId" text,
    "allowedScopes" jsonb,
    "customClaims" jsonb,
    "dpopBoundAccessTokensRequired" boolean DEFAULT false,
    disabled boolean DEFAULT false,
    "createdAt" timestamp with time zone,
    "updatedAt" timestamp with time zone,
    "policyVersion" integer DEFAULT 1,
    metadata jsonb
);


--
-- Name: otp_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '01:00:00'::interval) NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    code_hmac text,
    purpose text DEFAULT 'email-login'::text NOT NULL,
    attempt_count smallint DEFAULT 0 NOT NULL,
    CONSTRAINT otp_codes_attempt_count_check CHECK (((attempt_count >= 0) AND (attempt_count <= 5))),
    CONSTRAINT otp_codes_purpose_check CHECK ((purpose = ANY (ARRAY['email-login'::text, 'account-delete'::text])))
);


--
-- Name: TABLE otp_codes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.otp_codes IS 'Canonical server-only email OTP challenges. Raw OTP codes are never stored; code_hmac is consumed atomically by consume_email_otp.';


--
-- Name: COLUMN otp_codes.token_hash; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.otp_codes.token_hash IS 'Server-only GoTrue token material required to exchange a verified OTP for a session.';


--
-- Name: COLUMN otp_codes.code_hmac; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.otp_codes.code_hmac IS 'HMAC-SHA256 verifier for the short-lived code; keyed with the server service secret and never exposed to clients.';


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
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id text NOT NULL,
    pass_id uuid,
    max_requests integer DEFAULT 5,
    requests_used integer DEFAULT 0,
    reset_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: passes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passes (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id text NOT NULL,
    pass_number integer NOT NULL,
    tier public.pass_tier DEFAULT 'free'::public.pass_tier,
    event_id text DEFAULT COALESCE(NULLIF(current_setting('app.event_id'::text, true), ''::text), 'bsl'::text),
    name text,
    email text,
    company text,
    title text,
    max_requests_allowed integer DEFAULT 5,
    requests_remaining integer DEFAULT 5,
    requests_sent integer DEFAULT 0,
    request_limit_percentage numeric(5,2) DEFAULT 100.00,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    pass_type public.pass_type DEFAULT 'general'::public.pass_type NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    max_meeting_requests integer DEFAULT 10 NOT NULL,
    used_meeting_requests integer DEFAULT 0 NOT NULL,
    max_boost_amount numeric DEFAULT 100 NOT NULL,
    used_boost_amount numeric DEFAULT 0 NOT NULL,
    access_features text[] DEFAULT '{}'::text[] NOT NULL,
    special_perks text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: passes_pass_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.passes_pass_number_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: passes_pass_number_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.passes_pass_number_seq OWNED BY public.passes.pass_number;


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
-- Name: published_external_events; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.published_external_events WITH (security_invoker='true') AS
 SELECT source_id,
    external_id,
    normalized_payload,
    confidence,
    last_seen_at,
    published_at
   FROM public.external_events
  WHERE ((publication_status = 'published'::text) AND (source_status = ANY (ARRAY['upcoming'::text, 'live'::text])));


--
-- Name: qr_auth_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qr_auth_challenges (
    id text NOT NULL,
    browser_binding_hash text NOT NULL,
    state_hash text NOT NULL,
    code_challenge text NOT NULL,
    status public.qr_auth_status DEFAULT 'pending'::public.qr_auth_status NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    approved_by_user_id uuid,
    authorization_code_hash text,
    authorization_code_secret text,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT qr_auth_challenges_check CHECK ((expires_at <= (created_at + '00:05:00'::interval))),
    CONSTRAINT qr_auth_challenges_id_check CHECK ((char_length(id) >= 32))
);


--
-- Name: qr_auth_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qr_auth_events (
    id bigint NOT NULL,
    challenge_id text NOT NULL,
    type text NOT NULL,
    actor_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: qr_auth_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.qr_auth_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.qr_auth_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: qr_link_audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qr_link_audit_events (
    id bigint NOT NULL,
    qr_link_id uuid NOT NULL,
    actor_id uuid,
    event_type text NOT NULL,
    before_summary jsonb,
    after_summary jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: qr_link_audit_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.qr_link_audit_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.qr_link_audit_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: qr_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qr_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    owner_id uuid NOT NULL,
    organization_id uuid,
    public_slug text NOT NULL,
    name text NOT NULL,
    description text,
    destination_url text NOT NULL,
    campaign_source text,
    campaign_medium text,
    campaign_name text,
    campaign_term text,
    campaign_content text,
    visual_config jsonb DEFAULT '{"logo": false, "margin": 4, "modules": "square", "logoSize": 18, "finderEye": "rounded", "background": "#ffffff", "foreground": "#071426", "errorCorrection": "Q"}'::jsonb NOT NULL,
    status public.qr_link_status DEFAULT 'active'::public.qr_link_status NOT NULL,
    expires_at timestamp with time zone,
    archived_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    starts_at timestamp with time zone,
    CONSTRAINT qr_links_availability_window_chk CHECK (((starts_at IS NULL) OR (expires_at IS NULL) OR (starts_at < expires_at))),
    CONSTRAINT qr_links_description_check CHECK ((char_length(description) <= 1000)),
    CONSTRAINT qr_links_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 120))),
    CONSTRAINT qr_links_public_slug_check CHECK ((public_slug ~ '^[A-Za-z0-9_-]{3,48}$'::text))
);


--
-- Name: qr_scan_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.qr_scan_events (
    id bigint NOT NULL,
    qr_link_id uuid NOT NULL,
    scanned_at timestamp with time zone DEFAULT now() NOT NULL,
    visitor_hash text NOT NULL,
    country text,
    city text,
    device_type text DEFAULT 'unknown'::text NOT NULL,
    os text,
    browser text,
    referrer text,
    bot_classification text DEFAULT 'unknown'::text NOT NULL,
    campaign jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: qr_scan_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.qr_scan_events ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.qr_scan_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


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
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    id text NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    token text NOT NULL,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "userId" text NOT NULL
);


--
-- Name: sms_auth_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_auth_challenges (
    id uuid NOT NULL,
    user_id uuid,
    email_lookup_hmac text NOT NULL,
    phone_lookup_hmac text NOT NULL,
    phone_last4 text NOT NULL,
    purpose text NOT NULL,
    code_hmac text NOT NULL,
    attempt_count smallint DEFAULT 0 NOT NULL,
    delivery_count smallint DEFAULT 1 NOT NULL,
    phone_verified_at timestamp with time zone,
    consumed_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sms_auth_challenges_attempt_count_check CHECK (((attempt_count >= 0) AND (attempt_count <= 5))),
    CONSTRAINT sms_auth_challenges_check CHECK (((purpose = 'enrollment'::text) = (user_id IS NOT NULL))),
    CONSTRAINT sms_auth_challenges_code_hmac_check CHECK ((code_hmac ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT sms_auth_challenges_delivery_count_check CHECK (((delivery_count >= 1) AND (delivery_count <= 3))),
    CONSTRAINT sms_auth_challenges_email_lookup_hmac_check CHECK ((email_lookup_hmac ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT sms_auth_challenges_phone_last4_check CHECK ((phone_last4 ~ '^[0-9]{4}$'::text)),
    CONSTRAINT sms_auth_challenges_phone_lookup_hmac_check CHECK ((phone_lookup_hmac ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT sms_auth_challenges_purpose_check CHECK ((purpose = ANY (ARRAY['enrollment'::text, 'registration'::text])))
);


--
-- Name: TABLE sms_auth_challenges; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sms_auth_challenges IS 'Short-lived server-only SMS challenges with keyed OTP verifiers and locked attempt accounting.';


--
-- Name: sms_delivery_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sms_delivery_rate_limits (
    phone_lookup_hmac text NOT NULL,
    window_started_at timestamp with time zone NOT NULL,
    request_count smallint DEFAULT 1 NOT NULL,
    CONSTRAINT sms_delivery_rate_limits_phone_lookup_hmac_check CHECK ((phone_lookup_hmac ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT sms_delivery_rate_limits_request_count_check CHECK (((request_count > 0) AND (request_count <= 3)))
);


--
-- Name: speaker_claim_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.speaker_claim_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    speaker_id text NOT NULL,
    event_id text NOT NULL,
    requester_user_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    request_note text,
    reviewed_by uuid,
    review_note text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT speaker_claim_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
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
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    visitor_id uuid NOT NULL
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
    event_id text DEFAULT 'bsl2025'::text NOT NULL,
    agenda_id text,
    meeting_id uuid,
    slot_time timestamp with time zone,
    status text DEFAULT 'tentative'::text NOT NULL,
    slot_status text,
    is_favorite boolean DEFAULT false NOT NULL,
    confirmed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_balances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_balances (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    token_symbol text DEFAULT 'LUKAS'::text NOT NULL,
    balance numeric(20,8) DEFAULT 0,
    total_earned numeric(20,8) DEFAULT 0,
    total_spent numeric(20,8) DEFAULT 0,
    last_transaction_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT positive_balance CHECK ((balance >= (0)::numeric))
);


--
-- Name: user_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_blocks (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    blocker_id uuid NOT NULL,
    blocked_id uuid NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now()
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
-- Name: user_phone_authenticators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_phone_authenticators (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    phone_lookup_hmac text NOT NULL,
    phone_last4 text NOT NULL,
    verified_at timestamp with time zone DEFAULT now() NOT NULL,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_phone_authenticators_phone_last4_check CHECK ((phone_last4 ~ '^[0-9]{4}$'::text)),
    CONSTRAINT user_phone_authenticators_phone_lookup_hmac_check CHECK ((phone_lookup_hmac ~ '^[0-9a-f]{64}$'::text))
);


--
-- Name: TABLE user_phone_authenticators; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_phone_authenticators IS 'Server-only verified SMS authenticators; phone values are keyed HMAC lookups, never plaintext.';


--
-- Name: user_pin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_pin (
    user_id uuid NOT NULL,
    verifier bytea NOT NULL,
    kdf_version smallint DEFAULT 1 NOT NULL,
    failed_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone,
    set_at timestamp with time zone DEFAULT now() NOT NULL,
    last_verified_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_pin_failed_attempts_check CHECK ((failed_attempts >= 0)),
    CONSTRAINT user_pin_verifier_check CHECK ((octet_length(verifier) = 32))
);


--
-- Name: TABLE user_pin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_pin IS 'Peppered 4-digit PIN verifier plus lockout state. The verifier is never readable by any API role; use verify_user_pin().';


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
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
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
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
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    role public.user_role DEFAULT 'user'::public.user_role,
    granted_by uuid,
    granted_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb
);


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
-- Name: user_setup; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_setup (
    user_id uuid NOT NULL,
    status text DEFAULT 'not_started'::text NOT NULL,
    step smallint DEFAULT 0 NOT NULL,
    goals text[] DEFAULT '{}'::text[] NOT NULL,
    topics text[] DEFAULT '{}'::text[] NOT NULL,
    privacy_scope text DEFAULT 'private'::text NOT NULL,
    consent_version smallint,
    consented_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_setup_check CHECK (((status <> 'complete'::text) OR ((completed_at IS NOT NULL) AND (consent_version IS NOT NULL) AND (consented_at IS NOT NULL)))),
    CONSTRAINT user_setup_consent_version_check CHECK ((consent_version > 0)),
    CONSTRAINT user_setup_goals_check CHECK (((cardinality(goals) <= 3) AND (goals <@ ARRAY['hire'::text, 'get_hired'::text, 'cofounders'::text, 'learn'::text, 'investors'::text, 'friends'::text]))),
    CONSTRAINT user_setup_privacy_scope_check CHECK ((privacy_scope = ANY (ARRAY['private'::text, 'public'::text]))),
    CONSTRAINT user_setup_status_check CHECK ((status = ANY (ARRAY['not_started'::text, 'in_progress'::text, 'complete'::text]))),
    CONSTRAINT user_setup_step_check CHECK (((step >= 0) AND (step <= 3))),
    CONSTRAINT user_setup_topics_check CHECK (((cardinality(topics) <= 5) AND (topics <@ ARRAY['AI'::text, 'Web3'::text, 'Design'::text, 'Startups'::text, 'Payments'::text, 'DeFi'::text, 'Infrastructure'::text, 'Gaming'::text, 'Policy'::text, 'Community'::text])))
);


--
-- Name: TABLE user_setup; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_setup IS 'Per-user first-run setup: goals, topics, privacy scope and versioned consent. Server-only.';


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
-- Name: passes pass_number; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passes ALTER COLUMN pass_number SET DEFAULT nextval('public.passes_pass_number_seq'::regclass);


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
-- Name: business_invite_approvers business_invite_approvers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invite_approvers
    ADD CONSTRAINT business_invite_approvers_pkey PRIMARY KEY (email_hash);


--
-- Name: business_invite_campaign_events business_invite_campaign_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invite_campaign_events
    ADD CONSTRAINT business_invite_campaign_events_pkey PRIMARY KEY (campaign_id, event_id);


--
-- Name: business_invite_campaigns business_invite_campaigns_code_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invite_campaigns
    ADD CONSTRAINT business_invite_campaigns_code_hash_key UNIQUE (code_hash);


--
-- Name: business_invite_campaigns business_invite_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invite_campaigns
    ADD CONSTRAINT business_invite_campaigns_pkey PRIMARY KEY (id);


--
-- Name: business_invite_claims business_invite_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invite_claims
    ADD CONSTRAINT business_invite_claims_pkey PRIMARY KEY (campaign_id, user_id);


--
-- Name: business_invite_requests business_invite_requests_campaign_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invite_requests
    ADD CONSTRAINT business_invite_requests_campaign_id_user_id_key UNIQUE (campaign_id, user_id);


--
-- Name: business_invite_requests business_invite_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invite_requests
    ADD CONSTRAINT business_invite_requests_pkey PRIMARY KEY (id);


--
-- Name: chat_last_seen chat_last_seen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_last_seen
    ADD CONSTRAINT chat_last_seen_pkey PRIMARY KEY (id);


--
-- Name: contact_profiles contact_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_profiles
    ADD CONSTRAINT contact_profiles_pkey PRIMARY KEY (id);


--
-- Name: contact_profiles contact_profiles_share_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_profiles
    ADD CONSTRAINT contact_profiles_share_id_key UNIQUE (share_id);


--
-- Name: contact_requests contact_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_requests
    ADD CONSTRAINT contact_requests_pkey PRIMARY KEY (id);


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
-- Name: email_sent_log email_sent_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sent_log
    ADD CONSTRAINT email_sent_log_pkey PRIMARY KEY (id);


--
-- Name: event_account_grants event_account_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_account_grants
    ADD CONSTRAINT event_account_grants_pkey PRIMARY KEY (event_id, email_normalized);


--
-- Name: event_account_grants event_account_grants_speaker_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_account_grants
    ADD CONSTRAINT event_account_grants_speaker_id_key UNIQUE (speaker_id);


--
-- Name: event_agenda event_agenda_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_agenda
    ADD CONSTRAINT event_agenda_pkey PRIMARY KEY (id);


--
-- Name: event_auth_allies event_auth_allies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_auth_allies
    ADD CONSTRAINT event_auth_allies_pkey PRIMARY KEY (event_id);


--
-- Name: event_chat_direct_messages event_chat_direct_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_chat_direct_messages
    ADD CONSTRAINT event_chat_direct_messages_pkey PRIMARY KEY (id);


--
-- Name: event_chat_messages event_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_chat_messages
    ADD CONSTRAINT event_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: event_chat_presence event_chat_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_chat_presence
    ADD CONSTRAINT event_chat_presence_pkey PRIMARY KEY (event_id, user_id);


--
-- Name: event_chat_rooms event_chat_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_chat_rooms
    ADD CONSTRAINT event_chat_rooms_pkey PRIMARY KEY (event_id);


--
-- Name: event_ingestion_reviews event_ingestion_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_ingestion_reviews
    ADD CONSTRAINT event_ingestion_reviews_pkey PRIMARY KEY (id);


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
-- Name: event_source_sync_runs event_source_sync_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_source_sync_runs
    ADD CONSTRAINT event_source_sync_runs_pkey PRIMARY KEY (id);


--
-- Name: event_sources event_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_sources
    ADD CONSTRAINT event_sources_pkey PRIMARY KEY (id);


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
-- Name: external_event_observations external_event_observations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_event_observations
    ADD CONSTRAINT external_event_observations_pkey PRIMARY KEY (id);


--
-- Name: external_event_observations external_event_observations_sync_run_id_source_id_external__key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_event_observations
    ADD CONSTRAINT external_event_observations_sync_run_id_source_id_external__key UNIQUE (sync_run_id, source_id, external_id);


--
-- Name: external_events external_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_events
    ADD CONSTRAINT external_events_pkey PRIMARY KEY (source_id, external_id);


--
-- Name: hashpass_schema_migrations hashpass_schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hashpass_schema_migrations
    ADD CONSTRAINT hashpass_schema_migrations_pkey PRIMARY KEY (id);


--
-- Name: invite_scan_events invite_scan_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invite_scan_events
    ADD CONSTRAINT invite_scan_events_pkey PRIMARY KEY (id);


--
-- Name: jwks jwks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jwks
    ADD CONSTRAINT jwks_pkey PRIMARY KEY (id);


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
-- Name: oauthAccessToken oauthAccessToken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_pkey" PRIMARY KEY (id);


--
-- Name: oauthAccessToken oauthAccessToken_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_token_key" UNIQUE (token);


--
-- Name: oauthClientAssertion oauthClientAssertion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthClientAssertion"
    ADD CONSTRAINT "oauthClientAssertion_pkey" PRIMARY KEY (id);


--
-- Name: oauthClientResource oauthClientResource_clientId_resourceId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthClientResource"
    ADD CONSTRAINT "oauthClientResource_clientId_resourceId_key" UNIQUE ("clientId", "resourceId");


--
-- Name: oauthClientResource oauthClientResource_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthClientResource"
    ADD CONSTRAINT "oauthClientResource_pkey" PRIMARY KEY (id);


--
-- Name: oauthClient oauthClient_clientId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthClient"
    ADD CONSTRAINT "oauthClient_clientId_key" UNIQUE ("clientId");


--
-- Name: oauthClient oauthClient_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthClient"
    ADD CONSTRAINT "oauthClient_pkey" PRIMARY KEY (id);


--
-- Name: oauthConsent oauthConsent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthConsent"
    ADD CONSTRAINT "oauthConsent_pkey" PRIMARY KEY (id);


--
-- Name: oauthRefreshToken oauthRefreshToken_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthRefreshToken"
    ADD CONSTRAINT "oauthRefreshToken_pkey" PRIMARY KEY (id);


--
-- Name: oauthRefreshToken oauthRefreshToken_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthRefreshToken"
    ADD CONSTRAINT "oauthRefreshToken_token_key" UNIQUE (token);


--
-- Name: oauthResource oauthResource_identifier_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthResource"
    ADD CONSTRAINT "oauthResource_identifier_key" UNIQUE (identifier);


--
-- Name: oauthResource oauthResource_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthResource"
    ADD CONSTRAINT "oauthResource_pkey" PRIMARY KEY (id);


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
-- Name: qr_auth_challenges qr_auth_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_auth_challenges
    ADD CONSTRAINT qr_auth_challenges_pkey PRIMARY KEY (id);


--
-- Name: qr_auth_events qr_auth_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_auth_events
    ADD CONSTRAINT qr_auth_events_pkey PRIMARY KEY (id);


--
-- Name: qr_link_audit_events qr_link_audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_link_audit_events
    ADD CONSTRAINT qr_link_audit_events_pkey PRIMARY KEY (id);


--
-- Name: qr_links qr_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_links
    ADD CONSTRAINT qr_links_pkey PRIMARY KEY (id);


--
-- Name: qr_links qr_links_public_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_links
    ADD CONSTRAINT qr_links_public_slug_key UNIQUE (public_slug);


--
-- Name: qr_scan_events qr_scan_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_scan_events
    ADD CONSTRAINT qr_scan_events_pkey PRIMARY KEY (id);


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
-- Name: sms_auth_challenges sms_auth_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_auth_challenges
    ADD CONSTRAINT sms_auth_challenges_pkey PRIMARY KEY (id);


--
-- Name: sms_delivery_rate_limits sms_delivery_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_delivery_rate_limits
    ADD CONSTRAINT sms_delivery_rate_limits_pkey PRIMARY KEY (phone_lookup_hmac);


--
-- Name: speaker_claim_requests speaker_claim_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speaker_claim_requests
    ADD CONSTRAINT speaker_claim_requests_pkey PRIMARY KEY (id);


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
-- Name: speakers speakers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speakers
    ADD CONSTRAINT speakers_pkey PRIMARY KEY (id);


--
-- Name: support_idempotency_keys support_idempotency_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_idempotency_keys
    ADD CONSTRAINT support_idempotency_keys_pkey PRIMARY KEY (app_id, visitor_id, route, key);


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
-- Name: user_blocks unique_block; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT unique_block UNIQUE (blocker_id, blocked_id);


--
-- Name: email_sent_log unique_user_email_type; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sent_log
    ADD CONSTRAINT unique_user_email_type UNIQUE (user_id, email_type);


--
-- Name: passes unique_user_event; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passes
    ADD CONSTRAINT unique_user_event UNIQUE (user_id, event_id);


--
-- Name: pass_request_limits unique_user_limits; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pass_request_limits
    ADD CONSTRAINT unique_user_limits UNIQUE (user_id);


--
-- Name: user_roles unique_user_role; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT unique_user_role UNIQUE (user_id, role);


--
-- Name: user_balances unique_user_token; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_balances
    ADD CONSTRAINT unique_user_token UNIQUE (user_id, token_symbol);


--
-- Name: user_agenda_status user_agenda_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_agenda_status
    ADD CONSTRAINT user_agenda_status_pkey PRIMARY KEY (id);


--
-- Name: user_balances user_balances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_balances
    ADD CONSTRAINT user_balances_pkey PRIMARY KEY (id);


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
-- Name: ba_users user_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ba_users
    ADD CONSTRAINT user_email_key UNIQUE (email);


--
-- Name: user_phone_authenticators user_phone_authenticators_phone_lookup_hmac_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_phone_authenticators
    ADD CONSTRAINT user_phone_authenticators_phone_lookup_hmac_key UNIQUE (phone_lookup_hmac);


--
-- Name: user_phone_authenticators user_phone_authenticators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_phone_authenticators
    ADD CONSTRAINT user_phone_authenticators_pkey PRIMARY KEY (id);


--
-- Name: user_phone_authenticators user_phone_authenticators_user_id_phone_lookup_hmac_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_phone_authenticators
    ADD CONSTRAINT user_phone_authenticators_user_id_phone_lookup_hmac_key UNIQUE (user_id, phone_lookup_hmac);


--
-- Name: user_pin user_pin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_pin
    ADD CONSTRAINT user_pin_pkey PRIMARY KEY (user_id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_key UNIQUE (user_id);


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
-- Name: user_setup user_setup_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_setup
    ADD CONSTRAINT user_setup_pkey PRIMARY KEY (user_id);


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
-- Name: contact_requests_pair; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contact_requests_pair ON public.contact_requests USING btree (LEAST(sender, recipient), GREATEST(sender, recipient));


--
-- Name: contact_requests_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_requests_recipient ON public.contact_requests USING btree (recipient, status);


--
-- Name: contact_requests_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contact_requests_sender ON public.contact_requests USING btree (sender, status);


--
-- Name: directus_activity_timestamp_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX directus_activity_timestamp_index ON public.directus_activity USING btree ("timestamp");


--
-- Name: directus_revisions_parent_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX directus_revisions_parent_index ON public.directus_revisions USING btree (parent);


--
-- Name: event_chat_direct_messages_reply_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_chat_direct_messages_reply_idx ON public.event_chat_direct_messages USING btree (reply_to_message_id);


--
-- Name: event_chat_direct_messages_thread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_chat_direct_messages_thread_idx ON public.event_chat_direct_messages USING btree (event_id, sender_id, recipient_id, created_at);


--
-- Name: event_chat_messages_event_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_chat_messages_event_created_idx ON public.event_chat_messages USING btree (event_id, created_at);


--
-- Name: event_chat_messages_reply_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_chat_messages_reply_idx ON public.event_chat_messages USING btree (reply_to_message_id);


--
-- Name: event_chat_presence_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_chat_presence_active_idx ON public.event_chat_presence USING btree (event_id, last_seen_at);


--
-- Name: event_source_sync_runs_source_attempt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX event_source_sync_runs_source_attempt_idx ON public.event_source_sync_runs USING btree (source_id, attempted_at DESC);


--
-- Name: events_search_aliases_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX events_search_aliases_gin ON public.events USING gin (search_aliases);


--
-- Name: external_event_observations_event_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX external_event_observations_event_idx ON public.external_event_observations USING btree (source_id, external_id, observed_at DESC);


--
-- Name: external_events_publication_start_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX external_events_publication_start_idx ON public.external_events USING btree (publication_status, public.parse_iso8601_immutable((normalized_payload ->> 'startsAt'::text)));


--
-- Name: idx_admin_action_actor_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_action_actor_created ON public.admin_action_log USING btree (actor_user_id, created_at DESC);


--
-- Name: idx_admin_action_event_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_action_event_created ON public.admin_action_log USING btree (event_id, created_at DESC);


--
-- Name: idx_bsl_speakers_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bsl_speakers_active ON public.bsl_speakers USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_bsl_speakers_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bsl_speakers_day ON public.bsl_speakers USING btree (day);


--
-- Name: idx_bsl_speakers_event_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bsl_speakers_event_active ON public.bsl_speakers USING btree (event_id, is_active, name);


--
-- Name: idx_bsl_speakers_event_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_bsl_speakers_event_slug ON public.bsl_speakers USING btree (event_id, slug) WHERE (slug IS NOT NULL);


--
-- Name: idx_bsl_speakers_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bsl_speakers_slug ON public.bsl_speakers USING btree (slug);


--
-- Name: idx_bsl_speakers_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bsl_speakers_user_id ON public.bsl_speakers USING btree (user_id);


--
-- Name: idx_business_invite_campaign_events_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_invite_campaign_events_event ON public.business_invite_campaign_events USING btree (event_id, campaign_id);


--
-- Name: idx_business_invite_campaigns_event_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_invite_campaigns_event_active ON public.business_invite_campaigns USING btree (event_id, is_active, created_at DESC);


--
-- Name: idx_business_invite_requests_review_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_business_invite_requests_review_queue ON public.business_invite_requests USING btree (status, requested_at);


--
-- Name: idx_chat_messages_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_created ON public.meeting_chat_messages USING btree (created_at);


--
-- Name: idx_chat_messages_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_sender ON public.meeting_chat_messages USING btree (sender_id);


--
-- Name: idx_email_log_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_log_type ON public.email_sent_log USING btree (email_type);


--
-- Name: idx_email_log_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_log_user_id ON public.email_sent_log USING btree (user_id);


--
-- Name: idx_event_agenda_event_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_event_agenda_event_source ON public.event_agenda USING btree (event_id, source_id) WHERE (source_id IS NOT NULL);


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
-- Name: idx_meeting_requests_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meeting_requests_expires ON public.meeting_requests USING btree (expires_at) WHERE (status = 'pending'::public.meeting_request_status);


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
-- Name: idx_meetings_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meetings_scheduled ON public.meetings USING btree (scheduled_at);


--
-- Name: idx_meetings_scheduled_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meetings_scheduled_at ON public.meetings USING btree (scheduled_at);


--
-- Name: idx_meetings_speaker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meetings_speaker ON public.meetings USING btree (speaker_id);


--
-- Name: idx_meetings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meetings_status ON public.meetings USING btree (status);


--
-- Name: idx_newsletter_subscribers_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_newsletter_subscribers_email ON public.newsletter_subscribers USING btree (email);


--
-- Name: idx_otp_codes_active_purpose; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_codes_active_purpose ON public.otp_codes USING btree (email, purpose, created_at DESC) WHERE (used = false);


--
-- Name: idx_otp_codes_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_otp_codes_expires_at ON public.otp_codes USING btree (expires_at);


--
-- Name: idx_pass_claim_codes_event_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pass_claim_codes_event_active ON public.pass_claim_codes USING btree (event_id, is_active, created_at DESC);


--
-- Name: idx_pass_limits_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pass_limits_user ON public.pass_request_limits USING btree (user_id);


--
-- Name: idx_passes_event_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passes_event_id ON public.passes USING btree (event_id);


--
-- Name: idx_passes_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passes_tier ON public.passes USING btree (tier);


--
-- Name: idx_passes_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_passes_user_id ON public.passes USING btree (user_id);


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
-- Name: idx_sms_auth_challenges_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_auth_challenges_expiry ON public.sms_auth_challenges USING btree (expires_at);


--
-- Name: idx_sms_auth_challenges_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sms_auth_challenges_phone ON public.sms_auth_challenges USING btree (phone_lookup_hmac, created_at DESC);


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
-- Name: idx_user_agenda_status_user_agenda; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_agenda_status_user_agenda ON public.user_agenda_status USING btree (user_id, event_id, agenda_id) WHERE (agenda_id IS NOT NULL);


--
-- Name: idx_user_agenda_status_user_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_agenda_status_user_event ON public.user_agenda_status USING btree (user_id, event_id);


--
-- Name: idx_user_agenda_status_user_meeting; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_agenda_status_user_meeting ON public.user_agenda_status USING btree (user_id, event_id, meeting_id) WHERE (meeting_id IS NOT NULL);


--
-- Name: idx_user_agenda_status_user_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_agenda_status_user_slot ON public.user_agenda_status USING btree (user_id, event_id, slot_time) WHERE (slot_time IS NOT NULL);


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
-- Name: idx_user_blocks_blocked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_blocks_blocked ON public.user_blocks USING btree (blocked_id);


--
-- Name: idx_user_blocks_blocker; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_blocks_blocker ON public.user_blocks USING btree (blocker_id);


--
-- Name: idx_user_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_email ON public."user" USING btree (email);


--
-- Name: idx_user_phone_authenticators_active_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_phone_authenticators_active_user ON public.user_phone_authenticators USING btree (user_id) WHERE (revoked_at IS NULL);


--
-- Name: idx_user_profiles_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_email ON public.user_profiles USING btree (email);


--
-- Name: idx_user_profiles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_user_id ON public.user_profiles USING btree (user_id);


--
-- Name: idx_user_profiles_wallet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_profiles_wallet ON public.user_profiles USING btree (wallet_address);


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
-- Name: invite_scans_code_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invite_scans_code_time_idx ON public.invite_scan_events USING btree (invite_code, scanned_at DESC);


--
-- Name: notifications_user_level_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_level_created_at_idx ON public.notifications USING btree (user_id, level, created_at DESC);


--
-- Name: oauthAccessToken_authorizationCodeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "oauthAccessToken_authorizationCodeId_idx" ON public."oauthAccessToken" USING btree ("authorizationCodeId");


--
-- Name: oauthAccessToken_clientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "oauthAccessToken_clientId_idx" ON public."oauthAccessToken" USING btree ("clientId");


--
-- Name: oauthAccessToken_refreshId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "oauthAccessToken_refreshId_idx" ON public."oauthAccessToken" USING btree ("refreshId");


--
-- Name: oauthAccessToken_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "oauthAccessToken_sessionId_idx" ON public."oauthAccessToken" USING btree ("sessionId");


--
-- Name: oauthAccessToken_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "oauthAccessToken_userId_idx" ON public."oauthAccessToken" USING btree ("userId");


--
-- Name: oauthClientResource_clientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "oauthClientResource_clientId_idx" ON public."oauthClientResource" USING btree ("clientId");


--
-- Name: oauthClientResource_resourceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "oauthClientResource_resourceId_idx" ON public."oauthClientResource" USING btree ("resourceId");


--
-- Name: oauthClient_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "oauthClient_userId_idx" ON public."oauthClient" USING btree ("userId");


--
-- Name: oauthConsent_clientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "oauthConsent_clientId_idx" ON public."oauthConsent" USING btree ("clientId");


--
-- Name: oauthConsent_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "oauthConsent_userId_idx" ON public."oauthConsent" USING btree ("userId");


--
-- Name: oauthRefreshToken_authorizationCodeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "oauthRefreshToken_authorizationCodeId_idx" ON public."oauthRefreshToken" USING btree ("authorizationCodeId");


--
-- Name: oauthRefreshToken_clientId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "oauthRefreshToken_clientId_idx" ON public."oauthRefreshToken" USING btree ("clientId");


--
-- Name: oauthRefreshToken_sessionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "oauthRefreshToken_sessionId_idx" ON public."oauthRefreshToken" USING btree ("sessionId");


--
-- Name: oauthRefreshToken_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "oauthRefreshToken_userId_idx" ON public."oauthRefreshToken" USING btree ("userId");


--
-- Name: qr_auth_expiry_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX qr_auth_expiry_idx ON public.qr_auth_challenges USING btree (expires_at) WHERE (status = 'pending'::public.qr_auth_status);


--
-- Name: qr_links_expiry_sweep_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX qr_links_expiry_sweep_idx ON public.qr_links USING btree (expires_at) WHERE ((status = 'active'::public.qr_link_status) AND (deleted_at IS NULL) AND (expires_at IS NOT NULL));


--
-- Name: qr_links_owner_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX qr_links_owner_updated_idx ON public.qr_links USING btree (owner_id, updated_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: qr_scans_link_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX qr_scans_link_time_idx ON public.qr_scan_events USING btree (qr_link_id, scanned_at DESC);


--
-- Name: session_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "session_userId_idx" ON public.session USING btree ("userId");


--
-- Name: speaker_claim_requests_event_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX speaker_claim_requests_event_status_idx ON public.speaker_claim_requests USING btree (event_id, status, created_at DESC);


--
-- Name: speaker_claim_requests_pending_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX speaker_claim_requests_pending_unique ON public.speaker_claim_requests USING btree (speaker_id) WHERE (status = 'pending'::text);


--
-- Name: speakers_event_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX speakers_event_user_unique ON public.speakers USING btree (event_id, user_id) WHERE (user_id IS NOT NULL);


--
-- Name: unique_pending_request; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_pending_request ON public.meeting_requests USING btree (requester_id, speaker_id, status) WHERE (status = 'pending'::public.meeting_request_status);


--
-- Name: verification_identifier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX verification_identifier_idx ON public.verification USING btree (identifier);


--
-- Name: contact_network_profiles _RETURN; Type: RULE; Schema: public; Owner: -
--

CREATE OR REPLACE VIEW public.contact_network_profiles WITH (security_invoker='true') AS
 SELECT p.id,
    p.name,
    p.role,
    p.company,
    p.topics,
    p.discoverable,
    p.leaderboard,
    p.share_id,
    (count(r.id))::integer AS connections,
    (((count(r.id) * 100) + (cardinality(p.topics) * 20)))::integer AS points
   FROM (public.contact_profiles p
     LEFT JOIN public.contact_requests r ON ((((r.sender = p.id) OR (r.recipient = p.id)) AND (r.status = 'accepted'::text))))
  GROUP BY p.id;


--
-- Name: qr_links qr_link_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER qr_link_updated BEFORE UPDATE ON public.qr_links FOR EACH ROW EXECUTE FUNCTION public.touch_qr_link();


--
-- Name: bsl_speakers trg_bsl_speakers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bsl_speakers_updated_at BEFORE UPDATE ON public.bsl_speakers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: chat_last_seen trg_chat_last_seen_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_chat_last_seen_updated_at BEFORE UPDATE ON public.chat_last_seen FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: event_agenda trg_event_agenda_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_event_agenda_updated_at BEFORE UPDATE ON public.event_agenda FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: bsl_speakers trg_link_pending_speaker_requests_on_claim; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_link_pending_speaker_requests_on_claim AFTER UPDATE OF user_id ON public.bsl_speakers FOR EACH ROW EXECUTE FUNCTION public.link_pending_speaker_requests_on_claim();


--
-- Name: meeting_requests trg_meeting_requests_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_meeting_requests_updated_at BEFORE UPDATE ON public.meeting_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: meetings trg_meetings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_meetings_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: notifications trg_notifications_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: passes trg_passes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_passes_updated_at BEFORE UPDATE ON public.passes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: profiles trg_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: events trg_provision_bsl_colombia_business_invite_campaign; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_provision_bsl_colombia_business_invite_campaign AFTER INSERT OR UPDATE OF id, status ON public.events FOR EACH ROW EXECUTE FUNCTION public.provision_bsl_colombia_business_invite_campaign();


--
-- Name: user trg_public_user_sync_profiles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_public_user_sync_profiles AFTER INSERT OR UPDATE ON public."user" FOR EACH ROW EXECUTE FUNCTION public.sync_public_user_to_profiles();


--
-- Name: user_balances trg_user_balances_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_balances_updated_at BEFORE UPDATE ON public.user_balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: user_profiles trg_user_profiles_sync_profiles; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_profiles_sync_profiles AFTER INSERT OR UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.sync_user_profiles_to_profiles();


--
-- Name: user_profiles trg_user_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


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
-- Name: newsletter_subscribers update_newsletter_subscribers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_newsletter_subscribers_updated_at BEFORE UPDATE ON public.newsletter_subscribers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: wallet_auth update_wallet_auth_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_wallet_auth_updated_at BEFORE UPDATE ON public.wallet_auth FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


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
-- Name: business_invite_campaign_events business_invite_campaign_events_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invite_campaign_events
    ADD CONSTRAINT business_invite_campaign_events_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.business_invite_campaigns(id) ON DELETE CASCADE;


--
-- Name: business_invite_campaign_events business_invite_campaign_events_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invite_campaign_events
    ADD CONSTRAINT business_invite_campaign_events_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: business_invite_campaigns business_invite_campaigns_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invite_campaigns
    ADD CONSTRAINT business_invite_campaigns_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: business_invite_claims business_invite_claims_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invite_claims
    ADD CONSTRAINT business_invite_claims_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.business_invite_campaigns(id) ON DELETE CASCADE;


--
-- Name: business_invite_claims business_invite_claims_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invite_claims
    ADD CONSTRAINT business_invite_claims_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: business_invite_requests business_invite_requests_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invite_requests
    ADD CONSTRAINT business_invite_requests_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.business_invite_campaigns(id) ON DELETE CASCADE;


--
-- Name: business_invite_requests business_invite_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invite_requests
    ADD CONSTRAINT business_invite_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: business_invite_requests business_invite_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.business_invite_requests
    ADD CONSTRAINT business_invite_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: chat_last_seen chat_last_seen_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_last_seen
    ADD CONSTRAINT chat_last_seen_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;


--
-- Name: contact_profiles contact_profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_profiles
    ADD CONSTRAINT contact_profiles_id_fkey FOREIGN KEY (id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: contact_requests contact_requests_recipient_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_requests
    ADD CONSTRAINT contact_requests_recipient_fkey FOREIGN KEY (recipient) REFERENCES public.contact_profiles(id) ON DELETE CASCADE;


--
-- Name: contact_requests contact_requests_sender_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_requests
    ADD CONSTRAINT contact_requests_sender_fkey FOREIGN KEY (sender) REFERENCES public.contact_profiles(id) ON DELETE CASCADE;


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
-- Name: event_account_grants event_account_grants_claimed_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_account_grants
    ADD CONSTRAINT event_account_grants_claimed_user_id_fkey FOREIGN KEY (claimed_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: event_account_grants event_account_grants_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_account_grants
    ADD CONSTRAINT event_account_grants_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_account_grants event_account_grants_speaker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_account_grants
    ADD CONSTRAINT event_account_grants_speaker_id_fkey FOREIGN KEY (speaker_id) REFERENCES public.speakers(id) ON DELETE CASCADE;


--
-- Name: event_auth_allies event_auth_allies_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_auth_allies
    ADD CONSTRAINT event_auth_allies_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;


--
-- Name: event_auth_allies event_auth_allies_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_auth_allies
    ADD CONSTRAINT event_auth_allies_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: event_chat_direct_messages event_chat_direct_messages_event_room_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_chat_direct_messages
    ADD CONSTRAINT event_chat_direct_messages_event_room_fkey FOREIGN KEY (event_id) REFERENCES public.event_chat_rooms(event_id) NOT VALID;


--
-- Name: event_chat_direct_messages event_chat_direct_messages_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_chat_direct_messages
    ADD CONSTRAINT event_chat_direct_messages_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_chat_direct_messages event_chat_direct_messages_reply_to_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_chat_direct_messages
    ADD CONSTRAINT event_chat_direct_messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES public.event_chat_direct_messages(id) ON DELETE SET NULL;


--
-- Name: event_chat_direct_messages event_chat_direct_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_chat_direct_messages
    ADD CONSTRAINT event_chat_direct_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_chat_messages event_chat_messages_event_room_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_chat_messages
    ADD CONSTRAINT event_chat_messages_event_room_fkey FOREIGN KEY (event_id) REFERENCES public.event_chat_rooms(event_id) NOT VALID;


--
-- Name: event_chat_messages event_chat_messages_reply_to_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_chat_messages
    ADD CONSTRAINT event_chat_messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES public.event_chat_messages(id) ON DELETE SET NULL;


--
-- Name: event_chat_messages event_chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_chat_messages
    ADD CONSTRAINT event_chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_chat_presence event_chat_presence_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_chat_presence
    ADD CONSTRAINT event_chat_presence_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.event_chat_rooms(event_id);


--
-- Name: event_chat_presence event_chat_presence_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_chat_presence
    ADD CONSTRAINT event_chat_presence_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: event_ingestion_reviews event_ingestion_reviews_observation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_ingestion_reviews
    ADD CONSTRAINT event_ingestion_reviews_observation_id_fkey FOREIGN KEY (observation_id) REFERENCES public.external_event_observations(id) ON DELETE SET NULL;


--
-- Name: event_ingestion_reviews event_ingestion_reviews_source_id_external_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_ingestion_reviews
    ADD CONSTRAINT event_ingestion_reviews_source_id_external_id_fkey FOREIGN KEY (source_id, external_id) REFERENCES public.external_events(source_id, external_id) ON DELETE CASCADE;


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
-- Name: event_source_sync_runs event_source_sync_runs_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.event_source_sync_runs
    ADD CONSTRAINT event_source_sync_runs_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.event_sources(id) ON DELETE CASCADE;


--
-- Name: external_event_observations external_event_observations_sync_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_event_observations
    ADD CONSTRAINT external_event_observations_sync_run_id_fkey FOREIGN KEY (sync_run_id) REFERENCES public.event_source_sync_runs(id) ON DELETE CASCADE;


--
-- Name: external_events external_events_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_events
    ADD CONSTRAINT external_events_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.event_sources(id) ON DELETE CASCADE;


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
    ADD CONSTRAINT meetings_meeting_request_id_fkey FOREIGN KEY (meeting_request_id) REFERENCES public.meeting_requests(id);


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
    ADD CONSTRAINT meetings_speaker_id_fkey FOREIGN KEY (speaker_id) REFERENCES public.bsl_speakers(id);


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: oauthAccessToken oauthAccessToken_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."oauthClient"("clientId") ON DELETE CASCADE;


--
-- Name: oauthAccessToken oauthAccessToken_refreshId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_refreshId_fkey" FOREIGN KEY ("refreshId") REFERENCES public."oauthRefreshToken"(id) ON DELETE CASCADE;


--
-- Name: oauthAccessToken oauthAccessToken_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public.session(id) ON DELETE SET NULL;


--
-- Name: oauthAccessToken oauthAccessToken_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthAccessToken"
    ADD CONSTRAINT "oauthAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.ba_users(id) ON DELETE CASCADE;


--
-- Name: oauthClientResource oauthClientResource_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthClientResource"
    ADD CONSTRAINT "oauthClientResource_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."oauthClient"("clientId") ON DELETE CASCADE;


--
-- Name: oauthClientResource oauthClientResource_resourceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthClientResource"
    ADD CONSTRAINT "oauthClientResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES public."oauthResource"(identifier) ON DELETE CASCADE;


--
-- Name: oauthClient oauthClient_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthClient"
    ADD CONSTRAINT "oauthClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.ba_users(id) ON DELETE CASCADE;


--
-- Name: oauthConsent oauthConsent_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthConsent"
    ADD CONSTRAINT "oauthConsent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."oauthClient"("clientId") ON DELETE CASCADE;


--
-- Name: oauthConsent oauthConsent_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthConsent"
    ADD CONSTRAINT "oauthConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.ba_users(id) ON DELETE CASCADE;


--
-- Name: oauthRefreshToken oauthRefreshToken_clientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthRefreshToken"
    ADD CONSTRAINT "oauthRefreshToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES public."oauthClient"("clientId") ON DELETE CASCADE;


--
-- Name: oauthRefreshToken oauthRefreshToken_sessionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthRefreshToken"
    ADD CONSTRAINT "oauthRefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES public.session(id) ON DELETE SET NULL;


--
-- Name: oauthRefreshToken oauthRefreshToken_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."oauthRefreshToken"
    ADD CONSTRAINT "oauthRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.ba_users(id) ON DELETE CASCADE;


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
    ADD CONSTRAINT pass_request_limits_pass_id_fkey FOREIGN KEY (pass_id) REFERENCES public.passes(id);


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
-- Name: qr_auth_challenges qr_auth_challenges_approved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_auth_challenges
    ADD CONSTRAINT qr_auth_challenges_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: qr_auth_events qr_auth_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_auth_events
    ADD CONSTRAINT qr_auth_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: qr_auth_events qr_auth_events_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_auth_events
    ADD CONSTRAINT qr_auth_events_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.qr_auth_challenges(id) ON DELETE CASCADE;


--
-- Name: qr_link_audit_events qr_link_audit_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_link_audit_events
    ADD CONSTRAINT qr_link_audit_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: qr_link_audit_events qr_link_audit_events_qr_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_link_audit_events
    ADD CONSTRAINT qr_link_audit_events_qr_link_id_fkey FOREIGN KEY (qr_link_id) REFERENCES public.qr_links(id) ON DELETE CASCADE;


--
-- Name: qr_links qr_links_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_links
    ADD CONSTRAINT qr_links_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: qr_scan_events qr_scan_events_qr_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.qr_scan_events
    ADD CONSTRAINT qr_scan_events_qr_link_id_fkey FOREIGN KEY (qr_link_id) REFERENCES public.qr_links(id) ON DELETE CASCADE;


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
-- Name: sms_auth_challenges sms_auth_challenges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sms_auth_challenges
    ADD CONSTRAINT sms_auth_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: speaker_claim_requests speaker_claim_requests_requester_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speaker_claim_requests
    ADD CONSTRAINT speaker_claim_requests_requester_user_id_fkey FOREIGN KEY (requester_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: speaker_claim_requests speaker_claim_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.speaker_claim_requests
    ADD CONSTRAINT speaker_claim_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


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
-- Name: user_blocks user_blocks_blocked_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_blocks user_blocks_blocker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_blocks
    ADD CONSTRAINT user_blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_chat_keys user_chat_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_chat_keys
    ADD CONSTRAINT user_chat_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_phone_authenticators user_phone_authenticators_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_phone_authenticators
    ADD CONSTRAINT user_phone_authenticators_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_pin user_pin_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_pin
    ADD CONSTRAINT user_pin_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


--
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


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
-- Name: user_setup user_setup_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_setup
    ADD CONSTRAINT user_setup_user_id_fkey FOREIGN KEY (user_id) REFERENCES public."user"(id) ON DELETE CASCADE;


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
-- Name: reward_transactions Service role can manage all transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all transactions" ON public.reward_transactions USING ((auth.role() = 'service_role'::text));


--
-- Name: wallet_auth Service role can manage all wallets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage all wallets" ON public.wallet_auth USING ((auth.role() = 'service_role'::text));


--
-- Name: wallet_auth Users can insert their own wallets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own wallets" ON public.wallet_auth FOR INSERT WITH CHECK (((user_id = auth.uid()) OR (user_id IS NULL)));


--
-- Name: wallet_auth Users can update their own wallets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own wallets" ON public.wallet_auth FOR UPDATE USING (((user_id = auth.uid()) OR (user_id IS NULL)));


--
-- Name: user_balances Users can view their own balances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their own balances" ON public.user_balances FOR SELECT USING ((user_id = auth.uid()));


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
-- Name: ba_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ba_users ENABLE ROW LEVEL SECURITY;

--
-- Name: user_balances balances_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY balances_select_own ON public.user_balances FOR SELECT USING ((user_id = public.get_current_user_id()));


--
-- Name: user_blocks blocks_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blocks_delete_own ON public.user_blocks FOR DELETE USING ((blocker_id = public.get_current_user_id()));


--
-- Name: user_blocks blocks_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blocks_insert_own ON public.user_blocks FOR INSERT WITH CHECK ((blocker_id = public.get_current_user_id()));


--
-- Name: user_blocks blocks_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY blocks_select_own ON public.user_blocks FOR SELECT USING ((blocker_id = public.get_current_user_id()));


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
-- Name: business_invite_approvers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_invite_approvers ENABLE ROW LEVEL SECURITY;

--
-- Name: business_invite_campaign_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_invite_campaign_events ENABLE ROW LEVEL SECURITY;

--
-- Name: business_invite_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_invite_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: business_invite_claims; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_invite_claims ENABLE ROW LEVEL SECURITY;

--
-- Name: business_invite_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.business_invite_requests ENABLE ROW LEVEL SECURITY;

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
-- Name: contact_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

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
-- Name: email_sent_log email_log_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_log_select_own ON public.email_sent_log FOR SELECT USING ((user_id = public.get_current_user_id()));


--
-- Name: email_sent_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_sent_log ENABLE ROW LEVEL SECURITY;

--
-- Name: event_account_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_account_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: event_agenda; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_agenda ENABLE ROW LEVEL SECURITY;

--
-- Name: event_agenda event_agenda_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY event_agenda_public_read ON public.event_agenda FOR SELECT USING (true);


--
-- Name: event_auth_allies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_auth_allies ENABLE ROW LEVEL SECURITY;

--
-- Name: event_chat_direct_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_chat_direct_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: event_chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: event_chat_presence; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_chat_presence ENABLE ROW LEVEL SECURITY;

--
-- Name: event_chat_rooms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_chat_rooms ENABLE ROW LEVEL SECURITY;

--
-- Name: event_ingestion_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_ingestion_reviews ENABLE ROW LEVEL SECURITY;

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
-- Name: event_source_sync_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_source_sync_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: event_sources; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.event_sources ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: events events_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY events_public_read ON public.events FOR SELECT USING ((status = ANY (ARRAY['published'::text, 'archived'::text])));


--
-- Name: external_event_observations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.external_event_observations ENABLE ROW LEVEL SECURITY;

--
-- Name: external_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.external_events ENABLE ROW LEVEL SECURITY;

--
-- Name: hashpass_schema_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hashpass_schema_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: invite_scan_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invite_scan_events ENABLE ROW LEVEL SECURITY;

--
-- Name: jwks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.jwks ENABLE ROW LEVEL SECURITY;

--
-- Name: pass_request_limits limits_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY limits_select_own ON public.pass_request_limits FOR SELECT USING ((user_id = (public.get_current_user_id())::text));


--
-- Name: pass_request_limits limits_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY limits_update_own ON public.pass_request_limits FOR UPDATE USING ((user_id = (public.get_current_user_id())::text));


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
-- Name: meeting_slots meeting_slots_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY meeting_slots_select_public ON public.meeting_slots FOR SELECT USING (true);


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
-- Name: oauthAccessToken; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."oauthAccessToken" ENABLE ROW LEVEL SECURITY;

--
-- Name: oauthClient; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."oauthClient" ENABLE ROW LEVEL SECURITY;

--
-- Name: oauthClientAssertion; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."oauthClientAssertion" ENABLE ROW LEVEL SECURITY;

--
-- Name: oauthClientResource; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."oauthClientResource" ENABLE ROW LEVEL SECURITY;

--
-- Name: oauthConsent; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."oauthConsent" ENABLE ROW LEVEL SECURITY;

--
-- Name: oauthRefreshToken; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."oauthRefreshToken" ENABLE ROW LEVEL SECURITY;

--
-- Name: oauthResource; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public."oauthResource" ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY passes_insert_own ON public.passes FOR INSERT WITH CHECK ((user_id = (public.get_current_user_id())::text));


--
-- Name: passes passes_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY passes_select_own ON public.passes FOR SELECT USING ((user_id = (public.get_current_user_id())::text));


--
-- Name: passes passes_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY passes_update_own ON public.passes FOR UPDATE USING ((user_id = (public.get_current_user_id())::text));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_profiles profiles_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_own ON public.user_profiles FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: profiles profiles_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_all ON public.profiles FOR SELECT USING (true);


--
-- Name: user_profiles profiles_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_all ON public.user_profiles FOR SELECT USING (true);


--
-- Name: user_profiles profiles_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update_own ON public.user_profiles FOR UPDATE USING ((user_id = auth.uid()));


--
-- Name: external_events published_external_events_are_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY published_external_events_are_public ON public.external_events FOR SELECT TO authenticated, anon USING (((publication_status = 'published'::text) AND (source_status = ANY (ARRAY['upcoming'::text, 'live'::text]))));


--
-- Name: qr_link_audit_events qr_audit_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qr_audit_owner_read ON public.qr_link_audit_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.qr_links q
  WHERE ((q.id = qr_link_audit_events.qr_link_id) AND (q.owner_id = auth.uid())))));


--
-- Name: qr_auth_challenges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qr_auth_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: qr_auth_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qr_auth_events ENABLE ROW LEVEL SECURITY;

--
-- Name: qr_link_audit_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qr_link_audit_events ENABLE ROW LEVEL SECURITY;

--
-- Name: qr_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qr_links ENABLE ROW LEVEL SECURITY;

--
-- Name: qr_links qr_links_owner_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qr_links_owner_all ON public.qr_links USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));


--
-- Name: qr_scan_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.qr_scan_events ENABLE ROW LEVEL SECURITY;

--
-- Name: qr_scan_events qr_scans_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY qr_scans_owner_read ON public.qr_scan_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.qr_links q
  WHERE ((q.id = qr_scan_events.qr_link_id) AND (q.owner_id = auth.uid())))));


--
-- Name: meeting_requests requests_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY requests_insert_own ON public.meeting_requests FOR INSERT WITH CHECK ((requester_id = public.get_current_user_id()));


--
-- Name: meeting_requests requests_select_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY requests_select_participant ON public.meeting_requests FOR SELECT USING (((requester_id = public.get_current_user_id()) OR (speaker_id IN ( SELECT bsl_speakers.id
   FROM public.bsl_speakers
  WHERE (bsl_speakers.user_id = public.get_current_user_id())))));


--
-- Name: meeting_requests requests_update_requester; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY requests_update_requester ON public.meeting_requests FOR UPDATE USING (((requester_id = public.get_current_user_id()) AND (status = 'pending'::public.meeting_request_status)));


--
-- Name: meeting_requests requests_update_speaker; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY requests_update_speaker ON public.meeting_requests FOR UPDATE USING ((speaker_id IN ( SELECT bsl_speakers.id
   FROM public.bsl_speakers
  WHERE (bsl_speakers.user_id = public.get_current_user_id()))));


--
-- Name: reward_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reward_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles roles_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_admin_all ON public.user_roles USING (public.is_admin(public.get_current_user_id()));


--
-- Name: user_roles roles_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY roles_select_own ON public.user_roles FOR SELECT USING ((user_id = public.get_current_user_id()));


--
-- Name: session; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.session ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_auth_challenges; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_auth_challenges ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_delivery_rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sms_delivery_rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: speaker_claim_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.speaker_claim_requests ENABLE ROW LEVEL SECURITY;

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
-- Name: bsl_speakers speakers_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY speakers_admin_all ON public.bsl_speakers USING (public.is_admin(public.get_current_user_id()));


--
-- Name: speakers speakers_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY speakers_public_read ON public.speakers FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.events e
  WHERE ((e.id = speakers.event_id) AND (e.status = ANY (ARRAY['published'::text, 'archived'::text]))))));


--
-- Name: bsl_speakers speakers_select_active; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY speakers_select_active ON public.bsl_speakers FOR SELECT USING ((is_active = true));


--
-- Name: bsl_speakers speakers_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY speakers_update_own ON public.bsl_speakers FOR UPDATE USING ((user_id = public.get_current_user_id()));


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

CREATE POLICY user_agenda_status_delete_own ON public.user_agenda_status FOR DELETE USING ((user_id = auth.uid()));


--
-- Name: user_agenda_status user_agenda_status_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_agenda_status_insert_own ON public.user_agenda_status FOR INSERT WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_agenda_status user_agenda_status_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_agenda_status_select_own ON public.user_agenda_status FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: user_agenda_status user_agenda_status_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY user_agenda_status_update_own ON public.user_agenda_status FOR UPDATE USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: user_balances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_balances ENABLE ROW LEVEL SECURITY;

--
-- Name: user_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

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
-- Name: user_phone_authenticators; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_phone_authenticators ENABLE ROW LEVEL SECURITY;

--
-- Name: user_pin; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_pin ENABLE ROW LEVEL SECURITY;

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
-- Name: user_setup; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_setup ENABLE ROW LEVEL SECURITY;

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

\unrestrict a1CtmNCu8wajGimhyia1SUrm0hpAmK8J3DAiEBCalRt8rwvzC14p5U1LekBz8BL

