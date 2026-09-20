\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public."user" (id uuid PRIMARY KEY);
INSERT INTO public."user" VALUES ('00000000-0000-4000-8000-000000000001');
\ir ../../../../db/migrations/V097__non_custodial_wallet_enrollment.sql
DO $$ BEGIN
  IF (SELECT count(*) FROM public.user_wallet) <> 1 THEN RAISE EXCEPTION 'backfill_failed'; END IF;
END $$;
INSERT INTO public."user" VALUES ('00000000-0000-4000-8000-000000000002');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.user_wallet) <> 2 THEN RAISE EXCEPTION 'signup_trigger_failed'; END IF;
END $$;
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.user_wallet;
    RAISE EXCEPTION 'authenticated_direct_access_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.reserve_user_wallet('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', 'testnet');
    RAISE EXCEPTION 'authenticated_rpc_access_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE service_role;
SELECT public.reserve_user_wallet('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', 'testnet');
-- Same-operation retries are idempotent.
SELECT public.reserve_user_wallet('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', 'testnet');
DO $$ BEGIN
  BEGIN
    PERFORM public.reserve_user_wallet('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', 'testnet');
    RAISE EXCEPTION 'duplicate_generation_allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT public.register_user_wallet('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', 'testnet', 'eth-fixture', 'btc-fixture', 'sol-fixture');
SELECT public.register_user_wallet('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', 'testnet', 'eth-fixture', 'btc-fixture', 'sol-fixture');
DO $$ BEGIN
  BEGIN
    PERFORM public.register_user_wallet('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000010', 'testnet', 'different', 'btc-fixture', 'sol-fixture');
    RAISE EXCEPTION 'wallet_replaced';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF (SELECT state FROM public.user_wallet WHERE user_id = '00000000-0000-4000-8000-000000000002') <> 'enrolled' THEN
    RAISE EXCEPTION 'other_user_modified';
  END IF;
END $$;
RESET ROLE;
