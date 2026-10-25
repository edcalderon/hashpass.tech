-- Single-PIN model: the whole account (contacts setup wizard, wallet gate, wallet vault)
-- shares exactly one PIN verifier. This file proves the database cannot hold more than one,
-- and that every surface that wants a "different" PIN must go through the same verifier swap.
-- Assertions split by role: service_role drives behavior through the granted functions only
-- (it cannot read user_pin directly), the schema owner checks the table state itself.
\set ON_ERROR_STOP on
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public."user" (id uuid PRIMARY KEY);
INSERT INTO public."user" VALUES ('00000000-0000-4000-8000-000000000001');
\ir ../../../../db/migrations/V128__user_setup_and_pin.sql
-- Minimal otp_codes stand-in: V138 extends its purpose CHECK, and reset_user_pin needs
-- the user_pin shape V128 created above.
CREATE TABLE public.otp_codes (
  email text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('email-login', 'account-delete')),
  code_hmac text,
  token_hash text,
  used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL
);
\ir ../../../../db/migrations/V138__wallet_pin_recovery.sql

SET ROLE service_role;
-- First surface (the contacts setup wizard) creates THE PIN.
SELECT public.set_user_pin('00000000-0000-4000-8000-000000000001', repeat('aa', 32));

-- A second surface (the wallet gate's create wizard) cannot register its own PIN: the
-- server-side answer is pin_already_set, which the client renders as "enter your PIN".
DO $$ BEGIN
  BEGIN
    PERFORM public.set_user_pin('00000000-0000-4000-8000-000000000001', repeat('bb', 32));
    RAISE EXCEPTION 'pin_overwrite_without_current_allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- A wrong "current" PIN counts as a guess and changes nothing (function answer only).
DO $$ BEGIN
  IF (public.set_user_pin('00000000-0000-4000-8000-000000000001', repeat('bb', 32), repeat('ee', 32)) ->> 'ok') <> 'false' THEN
    RAISE EXCEPTION 'wrong_current_accepted';
  END IF;
END $$;

-- The wallet's change-PIN path: verify the current one, swap the verifier. Both surfaces
-- now verify against the new value only, and the function answers carry the state.
SELECT public.set_user_pin('00000000-0000-4000-8000-000000000001', repeat('bb', 32), repeat('aa', 32));
DO $$ BEGIN
  IF (public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('aa', 32)) ->> 'ok') <> 'false' THEN
    RAISE EXCEPTION 'old_pin_still_valid_after_change';
  END IF;
  IF (public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('bb', 32)) ->> 'ok') <> 'true' THEN
    RAISE EXCEPTION 'new_pin_rejected';
  END IF;
END $$;

-- Five wrong guesses lock the PIN, like any brute force against the single verifier; the
-- locked answer carries lockedUntil and refuses even the correct PIN until it clears.
SELECT public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('ee', 32));
SELECT public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('ee', 32));
SELECT public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('ee', 32));
SELECT public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('ee', 32));
SELECT public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('ee', 32));
DO $$ BEGIN
  IF (public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('bb', 32)) ->> 'lockedUntil') IS NULL THEN
    RAISE EXCEPTION 'locked_pin_still_verifiable';
  END IF;
END $$;

-- Recovery (emailed code + phrase) is the only lockout-free replacement, and the function
-- answers show it ends unlocked with a full attempt budget.
SELECT public.reset_user_pin('00000000-0000-4000-8000-000000000001', repeat('cc', 32));
DO $$ BEGIN
  IF (public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('cc', 32)) ->> 'ok') <> 'true' THEN
    RAISE EXCEPTION 'reset_pin_rejected';
  END IF;
  IF (public.verify_user_pin('00000000-0000-4000-8000-000000000001', repeat('cc', 32)) ->> 'remainingAttempts') <> '5' THEN
    RAISE EXCEPTION 'reset_did_not_clear_lockout';
  END IF;
  -- The old PIN is proven dead by the verifier swap below (owner-side), not by another
  -- verify call: a wrong guess here would count against the fresh attempt budget.
END $$;

-- Table-state checks as the schema owner: exactly one row, the right verifier, no residue.
RESET ROLE;
DO $$ BEGIN
  -- Before the change: the wrong "current" counted one guess and left the original verifier.
  -- (Re-verified in order: the checks below run against the final state after reset.)
  IF (SELECT count(*) FROM public.user_pin WHERE user_id = '00000000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'single_row_invariant_broken';
  END IF;
  IF (SELECT encode(verifier, 'hex') FROM public.user_pin WHERE user_id = '00000000-0000-4000-8000-000000000001') <> repeat('cc', 32) THEN
    RAISE EXCEPTION 'reset_did_not_replace';
  END IF;
  IF (SELECT failed_attempts FROM public.user_pin WHERE user_id = '00000000-0000-4000-8000-000000000001') <> 0
     OR (SELECT locked_until IS NOT NULL FROM public.user_pin WHERE user_id = '00000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'reset_did_not_clear_lockout';
  END IF;
  -- The table physically allows only one row per account.
  BEGIN
    INSERT INTO public.user_pin(user_id, verifier) VALUES ('00000000-0000-4000-8000-000000000001', decode(repeat('dd', 32), 'hex'));
    RAISE EXCEPTION 'second_pin_row_allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

-- Even service_role cannot touch the verifier directly: the granted functions are the only
-- way in, for it and for authenticated alike.
SET ROLE service_role;
DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.user_pin;
    RAISE EXCEPTION 'service_role_direct_read_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.user_pin(user_id, verifier) VALUES ('00000000-0000-4000-8000-000000000001', decode(repeat('dd', 32), 'hex'));
    RAISE EXCEPTION 'service_role_direct_write_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.user_pin;
    RAISE EXCEPTION 'authenticated_direct_read_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.set_user_pin('00000000-0000-4000-8000-000000000001', repeat('ff', 32), repeat('cc', 32));
    RAISE EXCEPTION 'authenticated_pin_change_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.reset_user_pin('00000000-0000-4000-8000-000000000001', repeat('ff', 32));
    RAISE EXCEPTION 'authenticated_pin_reset_allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
