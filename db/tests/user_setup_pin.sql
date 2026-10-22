\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public."user" (id uuid PRIMARY KEY);
INSERT INTO public."user" VALUES ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
\ir ../migrations/V128__user_setup_and_pin.sql

\set u1 '''00000000-0000-4000-8000-000000000001'''

-- 1. Access boundary: browser roles cannot touch tables or functions, and even
--    service_role cannot read the PIN verifier directly.
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM * FROM public.user_setup; RAISE EXCEPTION 'authenticated_setup_table_access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.user_pin; RAISE EXCEPTION 'authenticated_pin_table_access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.get_user_setup('00000000-0000-4000-8000-000000000001'); RAISE EXCEPTION 'authenticated_get_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.save_user_setup('00000000-0000-4000-8000-000000000001', '{}'); RAISE EXCEPTION 'authenticated_save_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('a', 64)); RAISE EXCEPTION 'authenticated_verify_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.set_user_pin('00000000-0000-4000-8000-000000000001', repeat('a', 64)); RAISE EXCEPTION 'authenticated_set_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('a', 64)); RAISE EXCEPTION 'anon_verify_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE service_role;
DO $$ BEGIN
  BEGIN PERFORM * FROM public.user_pin; RAISE EXCEPTION 'service_role_can_read_verifier';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.user_pin(user_id, verifier) VALUES ('00000000-0000-4000-8000-000000000001', decode(repeat('a', 64), 'hex')); RAISE EXCEPTION 'service_role_can_write_verifier';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.user_setup SET status = 'complete'; RAISE EXCEPTION 'service_role_direct_setup_write';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SET ROLE service_role;

-- 2. Reading never writes; a stranger reads as private defaults with no PIN.
DO $$ DECLARE s jsonb; BEGIN
  s := public.get_user_setup('00000000-0000-4000-8000-000000000001');
  IF s->>'status' <> 'not_started' OR s->>'privacyScope' <> 'private' OR (s->'pin'->>'enabled')::boolean THEN
    RAISE EXCEPTION 'defaults_wrong: %', s;
  END IF;
  IF s::text LIKE '%verifier%' THEN RAISE EXCEPTION 'verifier_leaked'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.user_setup) <> 0 THEN RAISE EXCEPTION 'read_created_row'; END IF;
END $$;
SET ROLE service_role;

-- 3. Wizard progress: partial saves stay in_progress, completion needs consent.
SELECT public.save_user_setup(:u1, '{"step":1,"goals":["learn","friends"]}');
DO $$ DECLARE s jsonb; BEGIN
  s := public.get_user_setup('00000000-0000-4000-8000-000000000001');
  IF s->>'status' <> 'in_progress' OR (s->>'step')::int <> 1 OR jsonb_array_length(s->'goals') <> 2 THEN
    RAISE EXCEPTION 'progress_wrong: %', s;
  END IF;
  BEGIN
    PERFORM public.save_user_setup('00000000-0000-4000-8000-000000000001', '{"complete":true}');
    RAISE EXCEPTION 'completed_without_consent';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- 4. Validation: unknown keys, wrong types, duplicates, unknown topics, too many.
DO $$
DECLARE patch text;
BEGIN
  FOREACH patch IN ARRAY ARRAY[
    '{"role":"admin"}',
    '{"goals":"learn"}',
    '{"goals":["learn","learn"]}',
    '{"goals":["learn","hire","friends","investors"]}',
    '{"goals":["become-king"]}',
    '{"topics":["AI","Web3","Design","Startups","Payments","DeFi"]}',
    '{"topics":["Cooking"]}',
    '{"privacyScope":"everyone"}',
    '{"consentVersion":"one"}',
    '{"consentVersion":0}'
  ] LOOP
    BEGIN
      PERFORM public.save_user_setup('00000000-0000-4000-8000-000000000001', patch::jsonb);
      RAISE EXCEPTION 'accepted_invalid_patch: %', patch;
    EXCEPTION WHEN check_violation THEN NULL; END;
  END LOOP;
END $$;

-- 5. Completion records versioned consent, and complete never regresses.
SELECT public.save_user_setup(:u1, '{"topics":["AI","Web3"],"privacyScope":"public","consentVersion":1,"step":3,"complete":true}');
DO $$ DECLARE s jsonb; BEGIN
  s := public.get_user_setup('00000000-0000-4000-8000-000000000001');
  IF s->>'status' <> 'complete' OR s->>'privacyScope' <> 'public' OR (s->>'consentVersion')::int <> 1
    OR s->>'completedAt' IS NULL THEN RAISE EXCEPTION 'complete_wrong: %', s; END IF;
END $$;
SELECT public.save_user_setup(:u1, '{"privacyScope":"private","step":1}');
DO $$ DECLARE s jsonb; BEGIN
  s := public.get_user_setup('00000000-0000-4000-8000-000000000001');
  IF s->>'status' <> 'complete' OR s->>'privacyScope' <> 'private' THEN
    RAISE EXCEPTION 'revisit_regressed_or_ignored: %', s;
  END IF;
  IF (s->>'consentVersion')::int <> 1 THEN RAISE EXCEPTION 'consent_version_regressed'; END IF;
END $$;
-- A consent version can only move forward.
SELECT public.save_user_setup(:u1, '{"consentVersion":3}');
SELECT public.save_user_setup(:u1, '{"consentVersion":2}');
DO $$ BEGIN
  IF (public.get_user_setup('00000000-0000-4000-8000-000000000001')->>'consentVersion')::int <> 3 THEN
    RAISE EXCEPTION 'consent_version_went_backwards';
  END IF;
  -- Another user is untouched.
  IF public.get_user_setup('00000000-0000-4000-8000-000000000002')->>'status' <> 'not_started' THEN
    RAISE EXCEPTION 'other_user_modified';
  END IF;
END $$;

-- 6. PIN: first set needs no proof, a second set without the current PIN fails.
DO $$ BEGIN
  IF NOT (public.set_user_pin('00000000-0000-4000-8000-000000000001', repeat('a', 64))->>'ok')::boolean THEN
    RAISE EXCEPTION 'first_set_failed';
  END IF;
  IF NOT (public.get_user_setup('00000000-0000-4000-8000-000000000001')->'pin'->>'enabled')::boolean THEN
    RAISE EXCEPTION 'pin_not_reported_enabled';
  END IF;
  BEGIN
    PERFORM public.set_user_pin('00000000-0000-4000-8000-000000000001', repeat('b', 64));
    RAISE EXCEPTION 'replaced_without_current';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.set_user_pin('00000000-0000-4000-8000-000000000001', 'not-hex');
    RAISE EXCEPTION 'accepted_bad_verifier';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.verify_user_pin('00000000-0000-4000-8000-000000000001', 'short');
    RAISE EXCEPTION 'accepted_bad_candidate';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- 7. Verification: correct PIN passes, wrong PIN counts and the counter survives.
DO $$ DECLARE r jsonb; BEGIN
  IF NOT (public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('a', 64))->>'ok')::boolean THEN
    RAISE EXCEPTION 'correct_pin_rejected';
  END IF;
  r := public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('c', 64));
  IF (r->>'ok')::boolean OR (r->>'remainingAttempts')::int <> 4 THEN RAISE EXCEPTION 'first_miss_wrong: %', r; END IF;
  -- Success resets the counter.
  PERFORM public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('a', 64));
END $$;
RESET ROLE;
-- The counter reset is checked as the table owner (service_role cannot read it).
DO $$ BEGIN
  IF (SELECT failed_attempts FROM public.user_pin WHERE user_id = '00000000-0000-4000-8000-000000000001') <> 0 THEN
    RAISE EXCEPTION 'success_did_not_reset_counter';
  END IF;
END $$;
SET ROLE service_role;

-- 8. Lockout: five misses lock, even the right PIN is refused while locked.
DO $$ DECLARE r jsonb; i int; BEGIN
  FOR i IN 1..4 LOOP
    r := public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('c', 64));
    IF r->>'lockedUntil' IS NOT NULL THEN RAISE EXCEPTION 'locked_too_early at %', i; END IF;
  END LOOP;
  r := public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('c', 64));
  IF r->>'lockedUntil' IS NULL OR (r->>'remainingAttempts')::int <> 0 THEN RAISE EXCEPTION 'not_locked_after_five: %', r; END IF;
  r := public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('a', 64));
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'right_pin_accepted_while_locked'; END IF;
  IF (public.get_user_setup('00000000-0000-4000-8000-000000000001')->'pin'->>'lockedUntil') IS NULL THEN
    RAISE EXCEPTION 'lock_not_reported';
  END IF;
  -- A locked PIN cannot be changed by guessing the current value either.
  r := public.set_user_pin('00000000-0000-4000-8000-000000000001', repeat('b', 64), repeat('a', 64));
  IF (r->>'ok')::boolean THEN RAISE EXCEPTION 'changed_while_locked'; END IF;
END $$;

-- 9. The lock expires, then a correct PIN works and a change needs the current one.
RESET ROLE;
UPDATE public.user_pin SET locked_until = now() - interval '1 second'
  WHERE user_id = '00000000-0000-4000-8000-000000000001';
SET ROLE service_role;
DO $$ DECLARE r jsonb; BEGIN
  -- After expiry a further wrong guess re-locks immediately with a longer delay.
  r := public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('c', 64));
  IF r->>'lockedUntil' IS NULL THEN RAISE EXCEPTION 'no_escalation_after_expiry: %', r; END IF;
END $$;
RESET ROLE;
UPDATE public.user_pin SET locked_until = now() - interval '1 second'
  WHERE user_id = '00000000-0000-4000-8000-000000000001';
SET ROLE service_role;
DO $$ DECLARE r jsonb; BEGIN
  r := public.set_user_pin('00000000-0000-4000-8000-000000000001', repeat('b', 64), repeat('a', 64));
  IF NOT (r->>'ok')::boolean THEN RAISE EXCEPTION 'change_with_current_failed: %', r; END IF;
  IF (public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('a', 64))->>'ok')::boolean THEN
    RAISE EXCEPTION 'old_pin_still_valid';
  END IF;
END $$;
RESET ROLE;
UPDATE public.user_pin SET locked_until = NULL, failed_attempts = 0 WHERE user_id = '00000000-0000-4000-8000-000000000001';
SET ROLE service_role;
DO $$ BEGIN
  IF NOT (public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('b', 64))->>'ok')::boolean THEN
    RAISE EXCEPTION 'new_pin_rejected';
  END IF;
END $$;

-- 10. Isolation: user 2 has no PIN, and user 1's PIN does not unlock user 2.
DO $$ DECLARE r jsonb; BEGIN
  r := public.verify_user_pin('00000000-0000-4000-8000-000000000002', repeat('b', 64));
  IF (r->>'ok')::boolean OR (r->>'enabled')::boolean THEN RAISE EXCEPTION 'cross_user_unlock: %', r; END IF;
END $$;
RESET ROLE;

-- 11. Deleting the user removes setup and PIN.
DELETE FROM public."user" WHERE id = '00000000-0000-4000-8000-000000000001';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.user_pin) <> 0 OR (SELECT count(*) FROM public.user_setup) <> 0 THEN
    RAISE EXCEPTION 'cascade_failed';
  END IF;
END $$;
