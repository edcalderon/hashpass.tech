-- Run after V092/V093 on the CBWeek database. Every fixture is rolled back.
BEGIN;
DO $$
DECLARE
  v_user_id uuid := gen_random_uuid();
  v_unverified_id uuid := gen_random_uuid();
  v_speaker_id uuid := gen_random_uuid();
  v_email text := 'pass-test-' || gen_random_uuid()::text || '@example.invalid';
  v_pass_id text;
  v_repeat_id text;
BEGIN
  INSERT INTO public.speakers(id, event_id, name)
  VALUES(v_speaker_id, 'cbweek2026', 'Transactional pass test');
  INSERT INTO public.event_account_grants(event_id, email_normalized, pass_type, speaker_id, event_role, configured_by)
  VALUES('cbweek2026', v_email, 'vip', v_speaker_id, 'event_admin', v_user_id);

  INSERT INTO auth.users(id, email) VALUES(v_user_id, v_email);
  IF EXISTS(SELECT 1 FROM public.passes WHERE user_id = v_user_id::text AND event_id = 'cbweek2026')
    OR EXISTS(SELECT 1 FROM public.event_roles WHERE user_id = v_user_id)
    OR EXISTS(SELECT 1 FROM public.speakers WHERE id = v_speaker_id AND user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Unverified signup received an entitlement';
  END IF;

  UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_user_id;
  IF NOT EXISTS(SELECT 1 FROM public.passes WHERE user_id = v_user_id::text AND event_id = 'cbweek2026'
    AND pass_type = 'vip' AND status = 'active' AND max_meeting_requests = 50 AND max_boost_amount = 500) THEN
    RAISE EXCEPTION 'Verified VIP grant was not applied';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.speakers WHERE id = v_speaker_id AND user_id = v_user_id)
    OR NOT EXISTS(SELECT 1 FROM public.event_roles WHERE user_id = v_user_id AND event_id = 'cbweek2026' AND role = 'event_admin') THEN
    RAISE EXCEPTION 'Speaker or event-admin association is missing';
  END IF;
  IF EXISTS(SELECT 1 FROM public.event_roles WHERE user_id = v_user_id AND event_id <> 'cbweek2026') THEN
    RAISE EXCEPTION 'Grant escaped the event scope';
  END IF;

  UPDATE public.passes SET used_meeting_requests = 2 WHERE user_id = v_user_id::text AND event_id = 'cbweek2026';
  v_pass_id := public.create_default_pass(v_user_id::text, 'general', 'cbweek2026');
  v_repeat_id := public.create_default_pass(v_user_id::text, 'general', 'cbweek2026');
  UPDATE auth.users SET email_confirmed_at = now() WHERE id = v_user_id;
  IF v_pass_id <> v_repeat_id OR
    (SELECT count(*) FROM public.passes WHERE user_id = v_user_id::text AND event_id = 'cbweek2026') <> 1 OR
    NOT EXISTS(SELECT 1 FROM public.passes WHERE id::text = v_pass_id AND pass_type = 'vip' AND used_meeting_requests = 2) THEN
    RAISE EXCEPTION 'Repeated provisioning duplicated, downgraded, or reset the pass';
  END IF;

  UPDATE public.passes SET status = 'suspended' WHERE id::text = v_pass_id;
  PERFORM public.create_default_pass(v_user_id::text, 'general', 'cbweek2026');
  IF NOT EXISTS(SELECT 1 FROM public.passes WHERE id::text = v_pass_id AND status = 'suspended') THEN
    RAISE EXCEPTION 'Self-service provisioning reactivated a suspended pass';
  END IF;

  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES(v_unverified_id, 'general-' || v_email, now());
  IF NOT EXISTS(SELECT 1 FROM public.passes WHERE user_id = v_unverified_id::text
    AND event_id = 'cbweek2026' AND pass_type = 'general' AND status = 'active') THEN
    RAISE EXCEPTION 'Ordinary verified signup has no General pass';
  END IF;

  DELETE FROM auth.users WHERE id = v_user_id;
  IF EXISTS(SELECT 1 FROM public.speakers WHERE id = v_speaker_id AND user_id IS NOT NULL)
    OR EXISTS(SELECT 1 FROM public.event_account_grants WHERE email_normalized = v_email AND claimed_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Account deletion did not release the speaker grant';
  END IF;
  IF has_function_privilege('authenticated', 'public.create_default_pass(text,text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.claim_event_account_grants(uuid)', 'EXECUTE')
    OR has_table_privilege('authenticated', 'public.event_account_grants', 'INSERT') THEN
    RAISE EXCEPTION 'A client can issue privileged grants directly';
  END IF;
END;
$$;
ROLLBACK;
