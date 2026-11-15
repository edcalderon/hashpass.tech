-- Mandatory authenticator protection for Wallet & Contacts. Secrets are AES-GCM
-- encrypted by the API with a dedicated key; only service-role RPCs can access rows.
BEGIN;
CREATE TABLE public.user_authenticator (
  user_id uuid PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  secret text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  pending_until timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  last_counter bigint NOT NULL DEFAULT -1,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  recovery_hashes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_authenticator ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_authenticator FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_user_authenticator(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('secret', a.secret, 'enabled', a.enabled,
    'pendingUntil', a.pending_until, 'lockedUntil', a.locked_until)
  FROM public.user_authenticator a WHERE a.user_id = p_user_id;
$$;

CREATE FUNCTION public.begin_user_authenticator(p_user_id uuid, p_secret text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF length(p_secret) NOT BETWEEN 40 AND 512 THEN RETURN false; END IF;
  -- Never replace an active factor, or reset guessing limits through re-enrollment.
  INSERT INTO public.user_authenticator(user_id, secret) VALUES(p_user_id, p_secret)
  ON CONFLICT (user_id) DO UPDATE SET secret = excluded.secret,
    pending_until = now() + interval '10 minutes', created_at = now(), last_counter = -1
  WHERE NOT user_authenticator.enabled AND user_authenticator.pending_until <= now()
    AND (user_authenticator.locked_until IS NULL OR user_authenticator.locked_until <= now());
  RETURN FOUND;
END;
$$;

-- The API checks HMAC against server time, then atomically commits the matched counter
-- against the exact encrypted secret it read. Concurrent verification cannot reuse a code.
CREATE FUNCTION public.consume_user_authenticator(p_user_id uuid, p_secret text,
  p_counter bigint DEFAULT NULL, p_enroll boolean DEFAULT false,
  p_recovery_hash text DEFAULT NULL, p_recovery_hashes text[] DEFAULT '{}') RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.user_authenticator; valid boolean;
BEGIN
  SELECT * INTO a FROM public.user_authenticator WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR a.secret <> p_secret OR (a.locked_until IS NOT NULL AND a.locked_until > now()) THEN RETURN false; END IF;
  IF (p_enroll AND (a.enabled OR a.pending_until <= now())) OR (NOT p_enroll AND NOT a.enabled) THEN RETURN false; END IF;
  valid := p_counter IS NOT NULL AND p_counter > a.last_counter
    AND abs(p_counter - floor(extract(epoch FROM clock_timestamp()) / 30)::bigint) <= 1;
  IF NOT p_enroll AND p_recovery_hash IS NOT NULL AND p_recovery_hash = ANY(a.recovery_hashes) THEN
    UPDATE public.user_authenticator SET recovery_hashes = array_remove(recovery_hashes, p_recovery_hash),
      failed_attempts = 0, locked_until = NULL WHERE user_id = p_user_id;
    RETURN true;
  END IF;
  IF valid THEN
    IF p_enroll AND (cardinality(p_recovery_hashes) <> 8 OR EXISTS (
      SELECT 1 FROM unnest(p_recovery_hashes) h WHERE h !~ '^[0-9a-f]{64}$')) THEN RETURN false; END IF;
    UPDATE public.user_authenticator SET enabled = true, last_counter = p_counter,
      failed_attempts = 0, locked_until = NULL,
      recovery_hashes = CASE WHEN p_enroll THEN p_recovery_hashes ELSE recovery_hashes END
    WHERE user_id = p_user_id;
    RETURN true;
  END IF;
  UPDATE public.user_authenticator SET
    failed_attempts = CASE WHEN a.locked_until <= now() THEN 1 ELSE a.failed_attempts + 1 END,
    locked_until = CASE WHEN (CASE WHEN a.locked_until <= now() THEN 1 ELSE a.failed_attempts + 1 END) >= 5
      THEN now() + interval '5 minutes' ELSE NULL END
  WHERE user_id = p_user_id;
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.get_user_authenticator(uuid), public.begin_user_authenticator(uuid,text),
  public.consume_user_authenticator(uuid,text,bigint,boolean,text,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_authenticator(uuid), public.begin_user_authenticator(uuid,text),
  public.consume_user_authenticator(uuid,text,bigint,boolean,text,text[]) TO service_role;
COMMIT;
