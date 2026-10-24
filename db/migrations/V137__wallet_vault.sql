-- Encrypted hybrid wallet vault. The envelope is produced on the device: the seed is
-- AES-256-GCM encrypted under a random DEK, and the DEK is wrapped by a key derived from
-- the person's PIN plus a server-held share. No seed, DEK, PIN or private key is stored,
-- and the server share is derived from a key that never enters the database.
BEGIN;

CREATE TABLE public.user_wallet_vault (
  user_id uuid PRIMARY KEY REFERENCES public."user"(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL UNIQUE REFERENCES public.user_wallet(id) ON DELETE CASCADE,
  envelope text NOT NULL CHECK (octet_length(envelope) BETWEEN 100 AND 8192),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  key_version smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_wallet_vault ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_wallet_vault FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_user_wallet_vault(p_user_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce((SELECT jsonb_build_object('walletId', wallet_id, 'envelope', envelope,
    'version', version, 'keyVersion', key_version) FROM public.user_wallet_vault WHERE user_id = p_user_id),
    'null'::jsonb);
$$;

-- p_expected_version = 0 creates (fails if a vault exists); n > 0 replaces version n (PIN change).
CREATE FUNCTION public.save_user_wallet_vault(p_user_id uuid, p_wallet_id uuid, p_envelope text,
  p_expected_version integer, p_key_version smallint DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE saved public.user_wallet_vault;
BEGIN
  IF p_envelope IS NULL OR octet_length(p_envelope) NOT BETWEEN 100 AND 8192 OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'invalid_wallet_vault' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.user_wallet WHERE id = p_wallet_id AND user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_wallet_vault' USING ERRCODE = '23514'; END IF;
  IF p_expected_version = 0 THEN
    INSERT INTO public.user_wallet_vault(user_id, wallet_id, envelope, key_version)
      VALUES (p_user_id, p_wallet_id, p_envelope, p_key_version)
      ON CONFLICT (user_id) DO NOTHING RETURNING * INTO saved;
  ELSE
    UPDATE public.user_wallet_vault SET envelope = p_envelope, key_version = p_key_version,
      version = version + 1, updated_at = now()
      WHERE user_id = p_user_id AND wallet_id = p_wallet_id AND version = p_expected_version RETURNING * INTO saved;
  END IF;
  IF saved.user_id IS NULL THEN RAISE EXCEPTION 'wallet_vault_conflict' USING ERRCODE = '23514'; END IF;
  RETURN jsonb_build_object('walletId', saved.wallet_id, 'version', saved.version, 'keyVersion', saved.key_version);
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_wallet_vault(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_user_wallet_vault(uuid, uuid, text, integer, smallint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_wallet_vault(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_user_wallet_vault(uuid, uuid, text, integer, smallint) TO service_role;

COMMENT ON TABLE public.user_wallet_vault IS 'Client-encrypted hybrid wallet envelope (seed under DEK, DEK wrapped by PIN + server share). Server-only; no plaintext secret is ever stored.';
COMMIT;
