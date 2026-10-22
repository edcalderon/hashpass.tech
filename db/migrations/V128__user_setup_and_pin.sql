-- Per-user setup state (first-run wizard) and a 4-digit PIN second factor.
--
-- Both tables are server-only. The authenticated API resolves the actor from its
-- verified session and calls the SECURITY DEFINER functions below; browsers and
-- the anon/authenticated roles have no table or function access.
--
-- user_pin stores only a peppered verifier computed by the API (the pepper never
-- reaches the database), so a database leak alone cannot be brute-forced offline
-- even though the PIN space is only 10,000 values. service_role has NO table
-- privileges on user_pin: the verifier is unreadable even with the service key.
-- Attempt counting and lockout happen inside verify_user_pin() in one locked
-- transaction, so concurrent guesses cannot race the counter.
BEGIN;

CREATE TABLE public.user_setup (
  user_id uuid PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'complete')),
  step smallint NOT NULL DEFAULT 0 CHECK (step BETWEEN 0 AND 3),
  goals text[] NOT NULL DEFAULT '{}' CHECK (
    cardinality(goals) <= 3
    AND goals <@ ARRAY['hire', 'get_hired', 'cofounders', 'learn', 'investors', 'friends']::text[]
  ),
  topics text[] NOT NULL DEFAULT '{}' CHECK (
    cardinality(topics) <= 5
    AND topics <@ ARRAY['AI', 'Web3', 'Design', 'Startups', 'Payments', 'DeFi', 'Infrastructure', 'Gaming', 'Policy', 'Community']::text[]
  ),
  -- Private is the default: nothing is shared until the person chooses Public.
  privacy_scope text NOT NULL DEFAULT 'private' CHECK (privacy_scope IN ('private', 'public')),
  consent_version smallint CHECK (consent_version > 0),
  consented_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'complete' OR (completed_at IS NOT NULL AND consent_version IS NOT NULL AND consented_at IS NOT NULL))
);

CREATE TABLE public.user_pin (
  user_id uuid PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  verifier bytea NOT NULL CHECK (octet_length(verifier) = 32),
  -- Version of the API-side derivation, so the algorithm can be upgraded later.
  kdf_version smallint NOT NULL DEFAULT 1,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  set_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_setup ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_pin ENABLE ROW LEVEL SECURITY;
-- No browser/JWT policies and no direct table grants to any API role: the
-- SECURITY DEFINER functions below are the only way in.
REVOKE ALL ON public.user_setup, public.user_pin FROM PUBLIC, anon, authenticated, service_role;

-- Read model. Never returns the verifier. A user without a row reads as defaults,
-- so reading never writes.
CREATE FUNCTION public.get_user_setup(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
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

-- Partial update. Unknown keys are rejected; 'complete' requires a consent version.
-- A completed setup never regresses: revisiting from settings edits preferences
-- but the person stays complete.
CREATE FUNCTION public.save_user_setup(p_user_id uuid, p_patch jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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

-- Atomic attempt accounting. Returns a result instead of raising on a wrong PIN:
-- raising would roll the failure counter back and make guesses free.
-- Five wrong guesses lock the PIN; after that every wrong guess re-locks with a
-- doubling delay (30s, 60s, ... capped at one hour) until a correct PIN resets it.
CREATE FUNCTION public.verify_user_pin(p_user_id uuid, p_candidate text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
$$;

-- First-time set needs no proof. Changing an existing PIN requires the current
-- one, routed through verify_user_pin so a wrong "current" counts as a guess.
CREATE FUNCTION public.set_user_pin(p_user_id uuid, p_verifier text, p_current text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
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
$$;

REVOKE ALL ON FUNCTION public.get_user_setup(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_user_setup(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_user_pin(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_user_pin(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_setup(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_user_setup(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_user_pin(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_user_pin(uuid, text, text) TO service_role;

COMMENT ON TABLE public.user_setup IS 'Per-user first-run setup: goals, topics, privacy scope and versioned consent. Server-only.';
COMMENT ON TABLE public.user_pin IS 'Peppered 4-digit PIN verifier plus lockout state. The verifier is never readable by any API role; use verify_user_pin().';
COMMIT;
