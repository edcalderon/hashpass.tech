-- Run against a disposable database after V175 with the fixture user below.
DO $$
DECLARE u uuid := '00000000-0000-4000-8000-000000000001';
  counter bigint := floor(extract(epoch FROM clock_timestamp()) / 30)::bigint;
  sealed text := repeat('x', 80); hashes text[] := array_fill(repeat('a',64), ARRAY[8]);
  ok boolean; i integer;
BEGIN
  IF has_table_privilege('authenticated', 'public.user_authenticator', 'SELECT') OR
    has_table_privilege('service_role', 'public.user_authenticator', 'SELECT') OR
    has_function_privilege('authenticated', 'public.get_user_authenticator(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticator access boundary failed';
  END IF;
  ok := public.begin_user_authenticator(u, sealed);
  IF NOT ok THEN RAISE EXCEPTION 'enrollment did not begin'; END IF;
  IF public.begin_user_authenticator(u, repeat('z',80)) THEN RAISE EXCEPTION 'pending factor replaced'; END IF;
  IF public.consume_user_authenticator(u, sealed, counter, false) THEN RAISE EXCEPTION 'unconfirmed factor accepted'; END IF;
  IF NOT public.consume_user_authenticator(u, sealed, counter, true, NULL, hashes) THEN RAISE EXCEPTION 'confirmation failed'; END IF;
  IF public.begin_user_authenticator(u, repeat('z',80)) THEN RAISE EXCEPTION 'active factor replaced'; END IF;
  IF public.consume_user_authenticator(u, sealed, counter, false) THEN RAISE EXCEPTION 'counter replay accepted'; END IF;
  IF public.consume_user_authenticator(u, sealed, counter + 2, false) THEN RAISE EXCEPTION 'future code accepted'; END IF;
  IF public.consume_user_authenticator(u, repeat('z',80), counter + 1, false) THEN RAISE EXCEPTION 'stale secret accepted'; END IF;
  IF NOT public.consume_user_authenticator(u, sealed, counter + 1, false) THEN RAISE EXCEPTION 'next counter failed'; END IF;
  IF NOT public.consume_user_authenticator(u, sealed, NULL, false, repeat('a',64)) THEN RAISE EXCEPTION 'recovery failed'; END IF;
  IF public.consume_user_authenticator(u, sealed, NULL, false, repeat('a',64)) THEN RAISE EXCEPTION 'recovery reused'; END IF;
  UPDATE public.user_authenticator SET failed_attempts=0 WHERE user_id=u;
  FOR i IN 1..10 LOOP
    IF public.consume_user_authenticator(u, sealed, NULL, false) THEN RAISE EXCEPTION 'invalid code accepted'; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM public.user_authenticator WHERE user_id=u AND failed_attempts=5 AND locked_until > now()) THEN RAISE EXCEPTION 'lockout failed'; END IF;
  IF public.consume_user_authenticator(u, sealed, counter + 1, false) THEN RAISE EXCEPTION 'locked code accepted'; END IF;
  UPDATE public.user_authenticator SET locked_until=now()-interval '1 second' WHERE user_id=u;
  PERFORM public.consume_user_authenticator(u, sealed, NULL, false);
  IF NOT EXISTS(SELECT 1 FROM public.user_authenticator WHERE user_id=u AND failed_attempts=1 AND locked_until IS NULL) THEN RAISE EXCEPTION 'lockout reset failed'; END IF;
END $$;
