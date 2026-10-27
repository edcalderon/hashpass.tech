-- Run after V155/V156 on a database with the core (production-shaped) schema. Every fixture is
-- rolled back. The shared dev project's schema lags the migrations (no V038 columns, a narrower
-- meeting_request_status enum), so the full flow can only run once that drift is repaired.
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests/meeting_request_rules.sql
BEGIN;
DO $$
DECLARE
  v_event text := 'rules-test-' || substr(gen_random_uuid()::text, 1, 8);
  v_day timestamptz := date_trunc('day', now() + interval '3 days');
  v_u_speaker_a uuid := gen_random_uuid();
  v_u_speaker_b uuid := gen_random_uuid();
  v_u_general uuid := gen_random_uuid();
  v_u_business uuid := gen_random_uuid();
  v_u_other uuid := gen_random_uuid();
  v_speaker_a uuid := gen_random_uuid();
  v_speaker_b uuid := gen_random_uuid();
  v_request record;
  v_request_id uuid;
  v_request_b uuid;
  v_result jsonb;
  v_meeting_id uuid;
  v_ten timestamptz := v_day + interval '10 hours';
  v_count integer;
  v_minutes integer;
  v_message text;
BEGIN
  INSERT INTO public.events(id, name, slug, starts_at, ends_at, timezone)
  VALUES (v_event, 'Meeting rules test', v_event, v_day, v_day + interval '1 day', 'UTC');

  INSERT INTO auth.users(id, email) VALUES
    (v_u_speaker_a, v_u_speaker_a || '@example.invalid'),
    (v_u_speaker_b, v_u_speaker_b || '@example.invalid'),
    (v_u_general, v_u_general || '@example.invalid'),
    (v_u_business, v_u_business || '@example.invalid'),
    (v_u_other, v_u_other || '@example.invalid');

  INSERT INTO public.bsl_speakers(id, name, user_id, is_active, is_accepting_meetings, event_id)
  VALUES (v_speaker_a, 'Speaker A', v_u_speaker_a, true, true, v_event),
         (v_speaker_b, 'Speaker B', v_u_speaker_b, true, true, v_event);

  -- passes.id is text on prod and uuid on dev, and pass_number is text on prod but an integer
  -- on dev; %L lets each schema parse the literal itself.
  EXECUTE format(
    'INSERT INTO public.passes(id, user_id, pass_number, event_id, pass_type, status,
       max_meeting_requests, max_boost_amount)
     VALUES (%L, %L, %L, %L, ''general'', ''active'', 10, 100),
            (%L, %L, %L, %L, ''business'', ''active'', 20, 300),
            (%L, %L, %L, %L, ''general'', ''active'', 10, 100)',
    gen_random_uuid(), v_u_general, (900000000 + floor(random() * 99999999))::int, v_event,
    gen_random_uuid(), v_u_business, (800000000 + floor(random() * 99999999))::int, v_event,
    gen_random_uuid(), v_u_other, (700000000 + floor(random() * 99999999))::int, v_event);

  -- 1. Duration rules ---------------------------------------------------------
  IF public.meeting_request_duration('speed', 0, 99) <> 5
    OR public.meeting_request_duration('speed', 9, NULL) <> 5
    OR public.meeting_request_duration('speed', 10, NULL) <> 10
    OR public.meeting_request_duration('speed', 30, NULL) <> 20
    OR public.meeting_request_duration('speed', 50, NULL) <> 30
    OR public.meeting_request_duration('speed', 999, NULL) <> 30
    OR public.meeting_request_duration('coffee', 50, NULL) <> 15
    OR public.meeting_request_duration('coffee', 0, 30) <> 30
    OR public.meeting_request_duration('coffee', 0, 44) <> 30
    OR public.meeting_request_duration('coffee', 0, 90) <> 45
    OR public.meeting_request_duration('coffee', 0, 1) <> 15 THEN
    RAISE EXCEPTION 'Duration rules are wrong';
  END IF;

  -- 2. Requests: baseline, boosted length, priority --------------------------
  SELECT * INTO v_request FROM public.insert_meeting_request(
    v_u_general::text, v_speaker_a::text, 'Speaker A', 'General', NULL, NULL, 'general',
    'networking', 'hi', NULL, 0, 60, NULL, v_event);
  v_request_id := v_request.id;
  IF NOT EXISTS (SELECT 1 FROM public.meeting_requests WHERE id = v_request_id
      AND duration_minutes = 5 AND meeting_type = 'speed' AND priority_score = 50) THEN
    RAISE EXCEPTION 'Unboosted stand-up must be 5 minutes, type speed, priority 50';
  END IF;

  SELECT * INTO v_request FROM public.insert_meeting_request(
    v_u_business::text, v_speaker_a::text, 'Speaker A', 'Business', NULL, NULL, 'business',
    'speed', 'hi', NULL, 20, 5, NULL, v_event);
  v_request_b := v_request.id;
  IF NOT EXISTS (SELECT 1 FROM public.meeting_requests WHERE id = v_request_b
      AND duration_minutes = 15 AND boost_amount = 20 AND priority_score = 70) THEN
    RAISE EXCEPTION '20 boost points must give a 15-minute stand-up at priority 70';
  END IF;

  -- 3. Coffee gate ------------------------------------------------------------
  BEGIN
    PERFORM public.insert_meeting_request(
      v_u_other::text, v_speaker_b::text, 'Speaker B', 'Other', NULL, NULL, 'vip',
      'coffee', 'hi', NULL, 0, 30, NULL, v_event);
    RAISE EXCEPTION 'General pass must not book a coffee break';
  EXCEPTION WHEN SQLSTATE 'HP403' THEN
    NULL; -- claimed vip client-side, still refused: the pass is read from the database
  END;
  IF EXISTS (SELECT 1 FROM public.meeting_requests WHERE requester_id = v_u_other)
    OR EXISTS (SELECT 1 FROM public.passes WHERE user_id = v_u_other::text AND used_meeting_requests <> 0) THEN
    RAISE EXCEPTION 'A refused coffee request must not be stored or charged';
  END IF;

  SELECT * INTO v_request FROM public.insert_meeting_request(
    v_u_business::text, v_speaker_b::text, 'Speaker B', 'Business', NULL, NULL, 'general',
    'coffee', 'hi', NULL, 5, 45, NULL, v_event);
  IF NOT EXISTS (SELECT 1 FROM public.meeting_requests WHERE id = v_request.id
      AND duration_minutes = 45 AND meeting_type = 'coffee' AND priority_score = 55) THEN
    RAISE EXCEPTION 'Business pass coffee break must be 45 minutes, priority 55';
  END IF;

  -- 4. Accepting blocks BOTH people ----------------------------------------
  -- General requester (5 min) with speaker A at 10:00.
  v_result := public.accept_meeting_request(v_request_id::text, v_speaker_a::text, v_ten);
  IF NOT (v_result->>'success')::boolean OR v_result->>'status' <> 'confirmed' THEN
    RAISE EXCEPTION 'Accept failed: %', v_result;
  END IF;
  v_meeting_id := (v_result->>'meeting_id')::uuid;
  IF (v_result->>'end_time')::timestamptz <> v_ten + interval '5 minutes' THEN
    RAISE EXCEPTION 'A 5-minute meeting must end 5 minutes after it starts';
  END IF;
  SELECT count(*) INTO v_count FROM public.meeting_slots
  WHERE meeting_id = v_meeting_id AND status = 'booked'
    AND user_id IN (v_u_speaker_a, v_u_general);
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Both people must hold a booked slot, found %', v_count;
  END IF;

  -- Speaker A is offered neither 10:00 nor an overlapping 10-minute start (09:55),
  -- but 10:05 is free again.
  IF EXISTS (SELECT 1 FROM public.get_speaker_available_slots(
        v_speaker_a::text, NULL, 10, v_u_other::text, v_event)
      WHERE slot_time = v_ten OR slot_time = v_ten - interval '5 minutes') THEN
    RAISE EXCEPTION 'Booked time (or an overlapping start) is still offered for the speaker';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_speaker_available_slots(
        v_speaker_a::text, NULL, 5, v_u_other::text, v_event)
      WHERE slot_time = v_ten + interval '5 minutes') THEN
    RAISE EXCEPTION '5-minute stand-ups must be offered on a 5-minute grid';
  END IF;

  -- The requester is busy too: speaker B's grid hides the same minutes for them...
  IF EXISTS (SELECT 1 FROM public.get_speaker_available_slots(
        v_speaker_b::text, NULL, 5, v_u_general::text, v_event) WHERE slot_time = v_ten) THEN
    RAISE EXCEPTION 'The requester must be blocked for the same time elsewhere';
  END IF;
  -- ...while a different user still sees speaker B at that time.
  IF NOT EXISTS (SELECT 1 FROM public.get_speaker_available_slots(
        v_speaker_b::text, NULL, 5, v_u_other::text, v_event) WHERE slot_time = v_ten) THEN
    RAISE EXCEPTION 'An unrelated speaker slot must stay open for other users';
  END IF;

  -- The speaker cannot be double booked on an overlapping interval.
  v_result := public.accept_meeting_request(v_request_b::text, v_speaker_a::text,
    v_ten + interval '3 minutes');
  IF (v_result->>'success')::boolean OR v_result->>'error' <> 'speaker_slot_conflict' THEN
    RAISE EXCEPTION 'Overlapping accept must be refused with speaker_slot_conflict, got %', v_result;
  END IF;

  -- 5. Requester overlap stays a tentative meeting, never a double booking --
  v_result := public.accept_meeting_request(
    (SELECT id FROM public.meeting_requests WHERE requester_id = v_u_business AND speaker_id = v_u_speaker_b)::text,
    v_speaker_b::text, v_ten + interval '1 hour');
  IF NOT (v_result->>'success')::boolean THEN
    RAISE EXCEPTION 'Coffee accept failed: %', v_result;
  END IF;
  v_minutes := EXTRACT(EPOCH FROM ((v_result->>'end_time')::timestamptz - (v_result->>'start_time')::timestamptz)) / 60;
  IF v_minutes <> 45 THEN
    RAISE EXCEPTION 'Coffee break must block 45 minutes, blocked %', v_minutes;
  END IF;
  -- The business requester is now busy 11:00-11:45, so speaker A at 11:30 must be hidden for them.
  IF EXISTS (SELECT 1 FROM public.get_speaker_available_slots(
        v_speaker_a::text, NULL, 15, v_u_business::text, v_event)
      WHERE slot_time = v_ten + interval '1 hour 30 minutes') THEN
    RAISE EXCEPTION 'A coffee break must block the requester across its full length';
  END IF;

  -- 6. Cancelling frees BOTH people --------------------------------------
  IF NOT public.cancel_meeting_request(v_request_id::text, v_u_general::text) THEN
    RAISE EXCEPTION 'Cancel failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.meeting_slots WHERE meeting_id = v_meeting_id)
    AND EXISTS (SELECT 1 FROM public.meeting_slots WHERE meeting_id = v_meeting_id AND status = 'booked') THEN
    RAISE EXCEPTION 'Cancel left a booked slot behind';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_speaker_available_slots(
        v_speaker_b::text, NULL, 5, v_u_general::text, v_event) WHERE slot_time = v_ten) THEN
    RAISE EXCEPTION 'Cancel must release the requester as well';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.get_speaker_available_slots(
        v_speaker_a::text, NULL, 5, v_u_other::text, v_event) WHERE slot_time = v_ten) THEN
    RAISE EXCEPTION 'Cancel must release the speaker as well';
  END IF;
  IF EXISTS (SELECT 1 FROM public.meeting_slots WHERE user_id = v_u_general AND meeting_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Requester slot rows must be removed on cancel';
  END IF;

  RAISE NOTICE 'meeting_request_rules: all checks passed';
END;
$$;
ROLLBACK;
