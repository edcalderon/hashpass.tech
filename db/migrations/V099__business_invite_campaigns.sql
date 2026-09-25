-- Event-scoped Business invitations for public campaign links.
--
-- The public code is intentionally treated as an entry code, not as a
-- credential: only its SHA-256 hash is stored and a verified HashPass account
-- can claim it once. A claim upgrades the existing event pass in place so a
-- campaign can never create a duplicate entitlement or downgrade a VIP pass.

BEGIN;

CREATE TABLE IF NOT EXISTS public.business_invite_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 160),
  max_claims integer CHECK (max_claims IS NULL OR max_claims > 0),
  claimed_count integer NOT NULL DEFAULT 0 CHECK (claimed_count >= 0),
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (max_claims IS NULL OR claimed_count <= max_claims)
);

CREATE TABLE IF NOT EXISTS public.business_invite_claims (
  campaign_id uuid NOT NULL REFERENCES public.business_invite_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pass_id text NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_business_invite_campaigns_event_active
  ON public.business_invite_campaigns(event_id, is_active, created_at DESC);

ALTER TABLE public.business_invite_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_invite_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_invite_campaigns FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.business_invite_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.business_invite_campaigns TO service_role;
GRANT ALL ON public.business_invite_claims TO service_role;

-- Development profiles can share a database while their profile-specific
-- bootstrap runs later. Keep the seed correct in either order by creating the
-- campaign whenever the live Colombia event becomes published.
CREATE OR REPLACE FUNCTION public.provision_bsl_colombia_business_invite_campaign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.id = 'colombia2026' AND NEW.status = 'published' THEN
    INSERT INTO public.business_invite_campaigns (
      event_id, code_hash, label, max_claims, is_active
    ) VALUES (
      'colombia2026',
      encode(digest('9899', 'sha256'), 'hex'),
      'Blockchain Summit Latam Colombia 2026 Business invitation',
      NULL,
      true
    )
    ON CONFLICT (code_hash) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.provision_bsl_colombia_business_invite_campaign()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_provision_bsl_colombia_business_invite_campaign ON public.events;
CREATE TRIGGER trg_provision_bsl_colombia_business_invite_campaign
  AFTER INSERT OR UPDATE OF id, status ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.provision_bsl_colombia_business_invite_campaign();

-- The campaign is unlimited by product decision, but a user can only claim it
-- once. Do not store the raw code in a database column.
INSERT INTO public.business_invite_campaigns (
  event_id, code_hash, label, max_claims, is_active
)
SELECT
  'colombia2026',
  encode(digest('9899', 'sha256'), 'hex'),
  'Blockchain Summit Latam Colombia 2026 Business invitation',
  NULL,
  true
WHERE EXISTS (
  SELECT 1 FROM public.events
  WHERE id = 'colombia2026' AND status = 'published'
)
ON CONFLICT (code_hash) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_business_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_campaign public.business_invite_campaigns%ROWTYPE;
  v_existing_pass_id text;
  v_pass_id text;
  v_max_requests integer;
  v_max_boost numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to claim a business invitation' USING ERRCODE = '42501';
  END IF;

  SELECT lower(email) INTO v_email
  FROM auth.users WHERE id = v_user_id AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Verify your email before claiming this business invitation' USING ERRCODE = '42501';
  END IF;

  IF p_code IS NULL
    OR length(btrim(p_code)) < 4
    OR length(btrim(p_code)) > 64
    OR upper(btrim(p_code)) !~ '^[A-Z0-9][A-Z0-9_-]{3,63}$' THEN
    RAISE EXCEPTION 'Invalid business invitation code' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_campaign
  FROM public.business_invite_campaigns
  WHERE code_hash = encode(digest(upper(btrim(p_code)), 'sha256'), 'hex')
    AND is_active = true
  FOR UPDATE;

  IF NOT FOUND OR (v_campaign.expires_at IS NOT NULL AND v_campaign.expires_at <= now()) THEN
    RAISE EXCEPTION 'Invalid or expired business invitation code' USING ERRCODE = '22023';
  END IF;

  SELECT pass_id INTO v_existing_pass_id
  FROM public.business_invite_claims
  WHERE campaign_id = v_campaign.id AND user_id = v_user_id;
  IF v_existing_pass_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_claimed',
      'pass_id', v_existing_pass_id,
      'event_id', v_campaign.event_id
    );
  END IF;

  IF v_campaign.max_claims IS NOT NULL AND v_campaign.claimed_count >= v_campaign.max_claims THEN
    RAISE EXCEPTION 'This business invitation has reached its limit' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.events
    WHERE id = v_campaign.event_id AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'This business invitation is not available for the current event' USING ERRCODE = '22023';
  END IF;

  SELECT max_meeting_requests, max_boost_amount
  INTO v_max_requests, v_max_boost
  FROM public.event_pass_tiers
  WHERE event_id = v_campaign.event_id AND pass_type = 'business';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Business access is not configured for this event' USING ERRCODE = '22023';
  END IF;

  v_pass_id := public.create_default_pass(v_user_id::text, 'general', v_campaign.event_id);
  IF NOT EXISTS (
    SELECT 1 FROM public.passes
    WHERE id::text = v_pass_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'An active event pass is required for this invitation' USING ERRCODE = '22023';
  END IF;

  -- Upgrade in place only. A previously-issued VIP pass remains a VIP pass
  -- and its consumed counters are never reset.
  UPDATE public.passes AS p
  SET pass_type = 'business'::public.pass_type,
      max_meeting_requests = v_max_requests,
      max_boost_amount = v_max_boost,
      access_features = ARRAY['all_sessions', 'networking', 'business_events'],
      special_perks = ARRAY['business_lounge', 'networking_tools'],
      updated_at = now()
  WHERE p.id::text = v_pass_id
    AND p.status = 'active'
    AND CASE p.pass_type::text WHEN 'vip' THEN 2 WHEN 'business' THEN 1 ELSE 0 END <= 1;

  INSERT INTO public.business_invite_claims (campaign_id, user_id, pass_id)
  VALUES (v_campaign.id, v_user_id, v_pass_id);
  UPDATE public.business_invite_campaigns
  SET claimed_count = claimed_count + 1, updated_at = now()
  WHERE id = v_campaign.id;

  RETURN jsonb_build_object(
    'status', 'claimed',
    'pass_id', v_pass_id,
    'event_id', v_campaign.event_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_business_invite(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.claim_business_invite(text) TO authenticated;

COMMIT;
