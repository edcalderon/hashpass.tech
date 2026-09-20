-- Metadata only. No seed, password, private key or signing capability is stored.
CREATE TABLE public.user_wallet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public."user"(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'enrolled' CHECK (state IN ('enrolled', 'provisioning', 'registered')),
  operation_id uuid,
  network text CHECK (network IN ('mainnet', 'testnet')),
  ethereum_address varchar(64),
  bitcoin_address varchar(100),
  solana_address varchar(64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (state = 'enrolled' AND operation_id IS NULL AND network IS NULL AND ethereum_address IS NULL AND bitcoin_address IS NULL AND solana_address IS NULL)
    OR (state = 'provisioning' AND operation_id IS NOT NULL AND network IS NOT NULL AND ethereum_address IS NULL AND bitcoin_address IS NULL AND solana_address IS NULL)
    OR (state = 'registered' AND operation_id IS NOT NULL AND network IS NOT NULL AND ethereum_address IS NOT NULL AND bitcoin_address IS NOT NULL AND solana_address IS NOT NULL)
  )
);
ALTER TABLE public.user_wallet ENABLE ROW LEVEL SECURITY;
-- No browser/JWT policies: canonical ownership is checked by the authenticated
-- API. Only its service role can read; mutations go through serialized functions.
REVOKE ALL ON public.user_wallet FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.user_wallet TO service_role;

CREATE FUNCTION public.enroll_user_wallet() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.user_wallet(user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enroll_user_wallet() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enroll_user_wallet AFTER INSERT ON public."user"
FOR EACH ROW EXECUTE FUNCTION public.enroll_user_wallet();
INSERT INTO public.user_wallet(user_id) SELECT id FROM public."user" ON CONFLICT (user_id) DO NOTHING;

CREATE FUNCTION public.reserve_user_wallet(p_user_id uuid, p_operation_id uuid, p_network text)
RETURNS public.user_wallet LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.user_wallet;
BEGIN
  IF p_operation_id IS NULL OR p_network IS NULL OR p_network NOT IN ('mainnet', 'testnet') THEN
    RAISE EXCEPTION 'invalid_wallet_request' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO row FROM public.user_wallet WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet_not_enrolled' USING ERRCODE = '23514'; END IF;
  IF row.state = 'enrolled' THEN
    UPDATE public.user_wallet SET state = 'provisioning', operation_id = p_operation_id,
      network = p_network, updated_at = now() WHERE id = row.id RETURNING * INTO row;
  ELSIF row.state <> 'provisioning' OR row.operation_id <> p_operation_id OR row.network <> p_network THEN
    RAISE EXCEPTION 'wallet_already_reserved' USING ERRCODE = '23514';
  END IF;
  RETURN row;
END;
$$;

CREATE FUNCTION public.register_user_wallet(p_user_id uuid, p_operation_id uuid, p_network text,
  p_ethereum_address text, p_bitcoin_address text, p_solana_address text)
RETURNS public.user_wallet LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row public.user_wallet;
BEGIN
  SELECT * INTO row FROM public.user_wallet WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR row.state = 'enrolled' OR p_operation_id IS DISTINCT FROM row.operation_id
    OR p_network IS DISTINCT FROM row.network OR nullif(p_ethereum_address, '') IS NULL
    OR nullif(p_bitcoin_address, '') IS NULL OR nullif(p_solana_address, '') IS NULL THEN
    RAISE EXCEPTION 'wallet_registration_conflict' USING ERRCODE = '23514';
  END IF;
  IF row.state = 'registered' THEN
    IF row.ethereum_address <> p_ethereum_address OR row.bitcoin_address <> p_bitcoin_address OR row.solana_address <> p_solana_address THEN
      RAISE EXCEPTION 'wallet_registration_conflict' USING ERRCODE = '23514';
    END IF;
    RETURN row;
  END IF;
  UPDATE public.user_wallet SET state = 'registered', ethereum_address = p_ethereum_address,
    bitcoin_address = p_bitcoin_address, solana_address = p_solana_address, updated_at = now()
    WHERE id = row.id RETURNING * INTO row;
  RETURN row;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_user_wallet(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.register_user_wallet(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_user_wallet(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_user_wallet(uuid, uuid, text, text, text, text) TO service_role;
COMMENT ON TABLE public.user_wallet IS 'Self-reported public wallet metadata, not verified payout destinations or signing authorization. Secret material stays on device.';
