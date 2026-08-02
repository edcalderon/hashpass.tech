-- Canonical, event-scoped pass tier configuration.
--
-- Issued passes retain their recorded entitlement. These settings control the
-- catalog displayed to attendees and the defaults used for future admin- and
-- code-created passes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.event_pass_tiers (
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  pass_type text NOT NULL CHECK (pass_type IN ('general', 'business', 'vip')),
  max_meeting_requests integer NOT NULL CHECK (max_meeting_requests >= 0),
  max_boost_amount integer NOT NULL CHECK (max_boost_amount >= 0),
  price_cents integer CHECK (price_cents IS NULL OR price_cents >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  price_label text CHECK (price_label IS NULL OR char_length(btrim(price_label)) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, pass_type),
  CHECK (price_cents IS NOT NULL OR price_label IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_event_pass_tiers_event ON public.event_pass_tiers(event_id, pass_type);

-- Keep the existing live tier values as the initial catalog. Administrators
-- can change these per event from the Passes tab without modifying code.
INSERT INTO public.event_pass_tiers (
  event_id, pass_type, max_meeting_requests, max_boost_amount, price_cents, currency, price_label
)
SELECT e.id, tier.pass_type, tier.max_meeting_requests, tier.max_boost_amount,
       tier.price_cents, 'USD', tier.price_label
FROM public.events e
CROSS JOIN (
  VALUES
    ('general', 10, 100, 9900, NULL::text),
    ('business', 20, 300, 24900, NULL::text),
    ('vip', 50, 500, NULL::integer, 'Premium')
) AS tier(pass_type, max_meeting_requests, max_boost_amount, price_cents, price_label)
ON CONFLICT (event_id, pass_type) DO NOTHING;

ALTER TABLE public.event_pass_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_pass_tiers_published_read ON public.event_pass_tiers;
CREATE POLICY event_pass_tiers_published_read ON public.event_pass_tiers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_id AND e.status IN ('published', 'archived')
    )
  );

CREATE OR REPLACE FUNCTION public.get_event_pass_tiers(p_event_id text)
RETURNS TABLE (
  event_id text,
  pass_type text,
  max_meeting_requests integer,
  max_boost_amount integer,
  price_cents integer,
  currency text,
  price_label text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    tier.event_id,
    tier.pass_type,
    tier.max_meeting_requests,
    tier.max_boost_amount,
    tier.price_cents,
    tier.currency,
    tier.price_label
  FROM public.event_pass_tiers tier
  WHERE tier.event_id = p_event_id
  ORDER BY CASE tier.pass_type
    WHEN 'general' THEN 1
    WHEN 'business' THEN 2
    WHEN 'vip' THEN 3
    ELSE 4
  END;
$$;
REVOKE ALL ON FUNCTION public.get_event_pass_tiers(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_event_pass_tiers(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_update_event_pass_tier(
  p_actor_user_id uuid,
  p_event_id text,
  p_pass_type text,
  p_max_meeting_requests integer,
  p_max_boost_amount integer,
  p_price_cents integer DEFAULT NULL,
  p_currency text DEFAULT 'USD',
  p_price_label text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tier public.event_pass_tiers%ROWTYPE;
  v_currency text := upper(btrim(COALESCE(p_currency, 'USD')));
  v_price_label text := NULLIF(btrim(p_price_label), '');
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Event administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_pass_type NOT IN ('general', 'business', 'vip') THEN
    RAISE EXCEPTION 'A valid pass type is required' USING ERRCODE = '22023';
  END IF;
  IF p_max_meeting_requests IS NULL OR p_max_meeting_requests < 0
    OR p_max_boost_amount IS NULL OR p_max_boost_amount < 0 THEN
    RAISE EXCEPTION 'Pass limits must be non-negative whole numbers' USING ERRCODE = '22023';
  END IF;
  IF p_price_cents IS NOT NULL AND p_price_cents < 0 THEN
    RAISE EXCEPTION 'Price cannot be negative' USING ERRCODE = '22023';
  END IF;
  IF v_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be a three-letter ISO code' USING ERRCODE = '22023';
  END IF;
  IF p_price_cents IS NULL AND v_price_label IS NULL THEN
    RAISE EXCEPTION 'Provide a price or price label' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.event_pass_tiers (
    event_id, pass_type, max_meeting_requests, max_boost_amount, price_cents, currency, price_label
  ) VALUES (
    p_event_id, p_pass_type, p_max_meeting_requests, p_max_boost_amount,
    p_price_cents, v_currency, v_price_label
  )
  ON CONFLICT (event_id, pass_type) DO UPDATE SET
    max_meeting_requests = EXCLUDED.max_meeting_requests,
    max_boost_amount = EXCLUDED.max_boost_amount,
    price_cents = EXCLUDED.price_cents,
    currency = EXCLUDED.currency,
    price_label = EXCLUDED.price_label,
    updated_at = now()
  RETURNING * INTO v_tier;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (
    p_actor_user_id, p_event_id, 'pass_tier.update', 'event_pass_tier', p_pass_type,
    jsonb_build_object(
      'max_meeting_requests', v_tier.max_meeting_requests,
      'max_boost_amount', v_tier.max_boost_amount,
      'price_cents', v_tier.price_cents,
      'currency', v_tier.currency,
      'price_label', v_tier.price_label
    )
  );

  RETURN jsonb_build_object(
    'event_id', v_tier.event_id,
    'pass_type', v_tier.pass_type,
    'max_meeting_requests', v_tier.max_meeting_requests,
    'max_boost_amount', v_tier.max_boost_amount,
    'price_cents', v_tier.price_cents,
    'currency', v_tier.currency,
    'price_label', v_tier.price_label
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_event_pass_tier(uuid, text, text, integer, integer, integer, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_event_pass_tier(uuid, text, text, integer, integer, integer, text, text)
  TO service_role;

-- Ensure admin-created passes inherit this event's current tier settings.
CREATE OR REPLACE FUNCTION public.admin_mutate_event_pass(
  p_actor_user_id uuid,
  p_event_id text,
  p_action text,
  p_user_id uuid DEFAULT NULL,
  p_pass_id text DEFAULT NULL,
  p_pass_type text DEFAULT NULL,
  p_status text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pass_id text;
  v_current_event text;
  v_tier public.event_pass_tiers%ROWTYPE;
BEGIN
  IF NOT public.has_event_admin_access(p_actor_user_id, p_event_id, false) THEN
    RAISE EXCEPTION 'Event administrator access required' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'create' THEN
    IF p_user_id IS NULL OR p_pass_type NOT IN ('general', 'business', 'vip') THEN
      RAISE EXCEPTION 'A user and valid pass type are required' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_tier FROM public.event_pass_tiers
    WHERE event_id = p_event_id AND pass_type = p_pass_type;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pass tier is not configured for this event' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.passes (
      id, user_id, event_id, pass_type, status, pass_number,
      max_meeting_requests, used_meeting_requests, max_boost_amount, used_boost_amount,
      access_features, special_perks
    ) VALUES (
      gen_random_uuid()::text, p_user_id::text, p_event_id, p_pass_type::public.pass_type,
      'active', 'ADMIN-' || upper(p_pass_type) || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
      v_tier.max_meeting_requests, 0, v_tier.max_boost_amount, 0,
      CASE WHEN p_pass_type = 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
           WHEN p_pass_type = 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
           ELSE ARRAY['general_sessions'] END,
      CASE WHEN p_pass_type = 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
           WHEN p_pass_type = 'business' THEN ARRAY['business_lounge', 'networking_tools']
           ELSE ARRAY['basic_swag'] END
    ) RETURNING id::text INTO v_pass_id;
  ELSIF p_action = 'update' THEN
    IF p_pass_id IS NULL OR (p_pass_type IS NULL AND p_status IS NULL) THEN
      RAISE EXCEPTION 'A pass and at least one change are required' USING ERRCODE = '22023';
    END IF;
    IF p_pass_type IS NOT NULL AND p_pass_type NOT IN ('general', 'business', 'vip') THEN
      RAISE EXCEPTION 'Invalid pass type' USING ERRCODE = '22023';
    END IF;
    IF p_status IS NOT NULL AND p_status NOT IN ('active', 'used', 'expired', 'cancelled', 'suspended') THEN
      RAISE EXCEPTION 'Invalid pass status' USING ERRCODE = '22023';
    END IF;
    SELECT event_id INTO v_current_event FROM public.passes WHERE id::text = p_pass_id FOR UPDATE;
    IF v_current_event IS DISTINCT FROM p_event_id THEN
      RAISE EXCEPTION 'Pass does not belong to the requested event' USING ERRCODE = '42501';
    END IF;
    IF p_pass_type IS NOT NULL THEN
      SELECT * INTO v_tier FROM public.event_pass_tiers
      WHERE event_id = p_event_id AND pass_type = p_pass_type;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Pass tier is not configured for this event' USING ERRCODE = '22023';
      END IF;
    END IF;

    UPDATE public.passes SET
      pass_type = COALESCE(p_pass_type::public.pass_type, pass_type),
      status = COALESCE(p_status, status),
      max_meeting_requests = CASE WHEN p_pass_type IS NOT NULL THEN v_tier.max_meeting_requests ELSE max_meeting_requests END,
      max_boost_amount = CASE WHEN p_pass_type IS NOT NULL THEN v_tier.max_boost_amount ELSE max_boost_amount END,
      access_features = CASE WHEN p_pass_type IS NULL THEN access_features
        WHEN p_pass_type = 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
        WHEN p_pass_type = 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
        ELSE ARRAY['general_sessions'] END,
      special_perks = CASE WHEN p_pass_type IS NULL THEN special_perks
        WHEN p_pass_type = 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
        WHEN p_pass_type = 'business' THEN ARRAY['business_lounge', 'networking_tools']
        ELSE ARRAY['basic_swag'] END,
      updated_at = now()
    WHERE id::text = p_pass_id
    RETURNING id::text INTO v_pass_id;
  ELSE
    RAISE EXCEPTION 'Unsupported pass action' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_action_log (actor_user_id, event_id, action, target_type, target_id, metadata)
  VALUES (p_actor_user_id, p_event_id, 'pass.' || p_action, 'pass', v_pass_id,
    jsonb_strip_nulls(jsonb_build_object('user_id', p_user_id, 'pass_type', p_pass_type, 'status', p_status)));
  RETURN jsonb_build_object('id', v_pass_id);
END;
$$;

-- Pass-code claims use the same current configuration as administrator
-- allocations, so a tier edit cannot leave courtesy passes with stale limits.
CREATE OR REPLACE FUNCTION public.claim_event_pass_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_code public.pass_claim_codes%ROWTYPE;
  v_code_hash text;
  v_pass_id text;
  v_existing_pass_id text;
  v_tier public.event_pass_tiers%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to claim a pass' USING ERRCODE = '42501';
  END IF;
  IF p_code IS NULL OR length(btrim(p_code)) < 6 OR length(btrim(p_code)) > 128 THEN
    RAISE EXCEPTION 'Invalid pass claim code' USING ERRCODE = '22023';
  END IF;

  v_code_hash := encode(digest(upper(btrim(p_code)), 'sha256'), 'hex');
  SELECT * INTO v_code FROM public.pass_claim_codes
  WHERE code_hash = v_code_hash AND is_active = true FOR UPDATE;
  IF NOT FOUND OR (v_code.expires_at IS NOT NULL AND v_code.expires_at <= now()) THEN
    RAISE EXCEPTION 'Invalid or expired pass claim code' USING ERRCODE = '22023';
  END IF;

  SELECT pass_id INTO v_existing_pass_id FROM public.pass_code_claims
  WHERE code_id = v_code.id AND user_id = v_user_id;
  IF v_existing_pass_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_claimed', 'pass_id', v_existing_pass_id, 'event_id', v_code.event_id);
  END IF;
  IF v_code.max_claims IS NOT NULL AND v_code.claimed_count >= v_code.max_claims THEN
    RAISE EXCEPTION 'This pass claim code has reached its limit' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_tier FROM public.event_pass_tiers
  WHERE event_id = v_code.event_id AND pass_type = v_code.pass_type::text;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pass tier is not configured for this event' USING ERRCODE = '22023';
  END IF;

  v_pass_id := gen_random_uuid()::text;
  INSERT INTO public.passes (
    id, user_id, event_id, pass_type, status, pass_number,
    max_meeting_requests, used_meeting_requests, max_boost_amount, used_boost_amount,
    access_features, special_perks
  ) VALUES (
    v_pass_id, v_user_id::text, v_code.event_id, v_code.pass_type, 'active',
    'CODE-' || upper(v_code.pass_type::text) || '-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    v_tier.max_meeting_requests, 0, v_tier.max_boost_amount, 0,
    CASE v_code.pass_type
      WHEN 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
      WHEN 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
      ELSE ARRAY['general_sessions']
    END,
    CASE v_code.pass_type
      WHEN 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
      WHEN 'business' THEN ARRAY['business_lounge', 'networking_tools']
      ELSE ARRAY['basic_swag']
    END
  );
  INSERT INTO public.pass_code_claims (code_id, user_id, pass_id) VALUES (v_code.id, v_user_id, v_pass_id);
  UPDATE public.pass_claim_codes SET claimed_count = claimed_count + 1 WHERE id = v_code.id;

  RETURN jsonb_build_object('status', 'claimed', 'pass_id', v_pass_id, 'event_id', v_code.event_id);
END;
$$;

COMMIT;
