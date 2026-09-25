-- Make the public 9899 campaign grant Business access for the HashPass BSL
-- event and Colombia Blockchain Week. The code remains an entry code, not a
-- credential: only its SHA-256 hash is stored and every claim requires a
-- verified HashPass account.
--
-- V099/V100 issued a single Colombia BSL entitlement. This migration replaces
-- that scope before the invite hostname is published and safely backfills any
-- historical claim without changing a VIP pass or its usage counters.

BEGIN;

-- CBWeek was already canonical in the development bootstrap, but the public
-- invitation also runs against production profiles. Keep its verified event
-- and Business tier available in every profile that accepts this campaign.
INSERT INTO public.events (
  id, name, slug, status, starts_at, ends_at, timezone,
  venue_name, city, country, description, branding, metadata
)
VALUES (
  'cbweek2026',
  'Colombia Blockchain Week 2026',
  'cbweek2026',
  'published',
  '2026-12-12T08:30:00-05:00'::timestamptz,
  '2026-12-12T18:00:00-05:00'::timestamptz,
  'America/Bogota',
  'Hotel InterContinental Medellín',
  'Medellín',
  'Colombia',
  'Colombia Blockchain Week, focused on blockchain, crypto, digital assets, tokenization, DeFi, regulation, AI, security, and compliance.',
  '{"primaryColor":"#FCD116","secondaryColor":"#050507","favicon":"/favicon.ico"}'::jsonb,
  '{"domain":"cbweek2026.hashpass.tech","website":"https://colombiablockchainweek.com/","organizer":"LATAM Blockchain Events LLC","venueAddress":"Calle 16, Variante #28-51, Las Palmas, El Poblado, Medellín","welcomeDrink":{"date":"2026-12-11","access":"private"},"mainDay":{"date":"2026-12-12","startsAt":"08:30","endsAt":"18:00"},"sourceFactsVerifiedAt":"2026-09-02","speakerStatus":"not_announced","agendaStatus":"not_announced","features":["speakers","agenda"]}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  slug = EXCLUDED.slug,
  status = EXCLUDED.status,
  starts_at = EXCLUDED.starts_at,
  ends_at = EXCLUDED.ends_at,
  timezone = EXCLUDED.timezone,
  venue_name = EXCLUDED.venue_name,
  city = EXCLUDED.city,
  country = EXCLUDED.country,
  description = EXCLUDED.description,
  branding = public.events.branding || EXCLUDED.branding,
  metadata = public.events.metadata || EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.event_pass_tiers (
  event_id, pass_type, max_meeting_requests, max_boost_amount, price_cents, currency, price_label
)
VALUES
  ('cbweek2026', 'general', 10, 100, 0, 'USD', 'Free entry — order of arrival'),
  ('cbweek2026', 'business', 20, 300, 2900, 'USD', 'Official General ticket'),
  ('cbweek2026', 'vip', 50, 500, 24900, 'USD', 'Official VIP ticket')
ON CONFLICT (event_id, pass_type) DO UPDATE SET
  max_meeting_requests = EXCLUDED.max_meeting_requests,
  max_boost_amount = EXCLUDED.max_boost_amount,
  price_cents = EXCLUDED.price_cents,
  currency = EXCLUDED.currency,
  price_label = EXCLUDED.price_label,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.business_invite_campaign_events (
  campaign_id uuid NOT NULL REFERENCES public.business_invite_campaigns(id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_business_invite_campaign_events_event
  ON public.business_invite_campaign_events(event_id, campaign_id);

ALTER TABLE public.business_invite_campaign_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_invite_campaign_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.business_invite_campaign_events TO service_role;

-- Retain campaign.event_id as the primary/legacy response field, but make the
-- campaign scope explicit and limited to the two Business entitlements.
UPDATE public.business_invite_campaigns
SET event_id = 'colombia2026',
    label = 'BSL and Colombia Blockchain Week 2026 Business invitation',
    max_claims = NULL,
    expires_at = NULL,
    is_active = true,
    updated_at = now()
WHERE code_hash = encode(digest('9899', 'sha256'), 'hex');

DELETE FROM public.business_invite_campaign_events AS target
USING public.business_invite_campaigns AS campaign
WHERE target.campaign_id = campaign.id
  AND campaign.code_hash = encode(digest('9899', 'sha256'), 'hex')
  AND target.event_id NOT IN ('colombia2026', 'cbweek2026');

INSERT INTO public.business_invite_campaign_events (campaign_id, event_id)
SELECT campaign.id, targets.event_id
FROM public.business_invite_campaigns AS campaign
CROSS JOIN (VALUES ('colombia2026'::text), ('cbweek2026'::text)) AS targets(event_id)
WHERE campaign.code_hash = encode(digest('9899', 'sha256'), 'hex')
  AND EXISTS (
    SELECT 1 FROM public.events AS event
    WHERE event.id = targets.event_id AND event.status = 'published'
  )
ON CONFLICT (campaign_id, event_id) DO NOTHING;

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
  v_event record;
  v_pass_id text;
  v_primary_pass_id text;
  v_max_requests integer;
  v_max_boost numeric;
  v_pass_ids jsonb := '{}'::jsonb;
  v_already_claimed boolean := false;
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
  v_already_claimed := v_existing_pass_id IS NOT NULL;

  IF NOT v_already_claimed
    AND v_campaign.max_claims IS NOT NULL
    AND v_campaign.claimed_count >= v_campaign.max_claims THEN
    RAISE EXCEPTION 'This business invitation has reached its limit' USING ERRCODE = '22023';
  END IF;

  FOR v_event IN
    SELECT targets.event_id
    FROM public.business_invite_campaign_events AS targets
    JOIN public.events AS event ON event.id = targets.event_id
    JOIN public.event_pass_tiers AS tier
      ON tier.event_id = targets.event_id AND tier.pass_type = 'business'
    WHERE targets.campaign_id = v_campaign.id
      AND event.status = 'published'
    ORDER BY CASE targets.event_id WHEN 'colombia2026' THEN 0 WHEN 'cbweek2026' THEN 1 ELSE 2 END
  LOOP
    SELECT max_meeting_requests, max_boost_amount
    INTO v_max_requests, v_max_boost
    FROM public.event_pass_tiers
    WHERE event_id = v_event.event_id AND pass_type = 'business';

    SELECT pass.id::text INTO v_pass_id
    FROM public.passes AS pass
    WHERE pass.user_id = v_user_id
      AND pass.event_id = v_event.event_id
      AND pass.status = 'active'
    ORDER BY CASE pass.pass_type::text WHEN 'vip' THEN 2 WHEN 'business' THEN 1 ELSE 0 END DESC,
             pass.created_at DESC
    LIMIT 1;
    IF v_pass_id IS NULL THEN
      v_pass_id := public.create_default_pass(v_user_id::text, 'general', v_event.event_id);
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.passes
      WHERE id::text = v_pass_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'An active event pass is required for this invitation' USING ERRCODE = '22023';
    END IF;

    -- Upgrade in place only. VIP stays VIP and consumed counters stay intact.
    UPDATE public.passes AS pass
    SET pass_type = 'business'::public.pass_type,
        max_meeting_requests = v_max_requests,
        max_boost_amount = v_max_boost,
        access_features = ARRAY['all_sessions', 'networking', 'business_events'],
        special_perks = ARRAY['business_lounge', 'networking_tools'],
        updated_at = now()
    WHERE pass.id::text = v_pass_id
      AND pass.status = 'active'
      AND CASE pass.pass_type::text WHEN 'vip' THEN 2 WHEN 'business' THEN 1 ELSE 0 END <= 1;

    v_primary_pass_id := COALESCE(v_primary_pass_id, v_pass_id);
    v_pass_ids := v_pass_ids || jsonb_build_object(v_event.event_id, v_pass_id);
  END LOOP;

  IF v_primary_pass_id IS NULL THEN
    RAISE EXCEPTION 'Business access is not configured for this invitation' USING ERRCODE = '22023';
  END IF;

  IF NOT v_already_claimed THEN
    INSERT INTO public.business_invite_claims (campaign_id, user_id, pass_id)
    VALUES (v_campaign.id, v_user_id, v_primary_pass_id);
    UPDATE public.business_invite_campaigns
    SET claimed_count = claimed_count + 1, updated_at = now()
    WHERE id = v_campaign.id;
  END IF;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_already_claimed THEN 'already_claimed' ELSE 'claimed' END,
    'pass_id', COALESCE(v_existing_pass_id, v_primary_pass_id),
    'pass_ids', v_pass_ids,
    'event_id', v_campaign.event_id
  );
END;
$$;

-- Backfill a historical verified claim into the expanded campaign scope. This
-- runs under the migration owner, but only for users who had already claimed
-- the hashed campaign before the scope changed.
DO $$
DECLARE
  v_claim record;
  v_event record;
  v_pass_id text;
  v_max_requests integer;
  v_max_boost numeric;
BEGIN
  FOR v_claim IN
    SELECT claim.user_id, campaign.id AS campaign_id
    FROM public.business_invite_claims AS claim
    JOIN public.business_invite_campaigns AS campaign ON campaign.id = claim.campaign_id
    WHERE campaign.code_hash = encode(digest('9899', 'sha256'), 'hex')
  LOOP
    FOR v_event IN
      SELECT targets.event_id
      FROM public.business_invite_campaign_events AS targets
      JOIN public.events AS event ON event.id = targets.event_id
      JOIN public.event_pass_tiers AS tier
        ON tier.event_id = targets.event_id AND tier.pass_type = 'business'
      WHERE targets.campaign_id = v_claim.campaign_id
        AND event.status = 'published'
    LOOP
      SELECT max_meeting_requests, max_boost_amount
      INTO v_max_requests, v_max_boost
      FROM public.event_pass_tiers
      WHERE event_id = v_event.event_id AND pass_type = 'business';

      SELECT pass.id::text INTO v_pass_id
      FROM public.passes AS pass
      WHERE pass.user_id = v_claim.user_id
        AND pass.event_id = v_event.event_id
        AND pass.status = 'active'
      ORDER BY CASE pass.pass_type::text WHEN 'vip' THEN 2 WHEN 'business' THEN 1 ELSE 0 END DESC,
               pass.created_at DESC
      LIMIT 1;
      IF v_pass_id IS NULL THEN
        v_pass_id := public.create_default_pass(v_claim.user_id::text, 'general', v_event.event_id);
      END IF;
      UPDATE public.passes AS pass
      SET pass_type = 'business'::public.pass_type,
          max_meeting_requests = v_max_requests,
          max_boost_amount = v_max_boost,
          access_features = ARRAY['all_sessions', 'networking', 'business_events'],
          special_perks = ARRAY['business_lounge', 'networking_tools'],
          updated_at = now()
      WHERE pass.id::text = v_pass_id
        AND pass.status = 'active'
        AND CASE pass.pass_type::text WHEN 'vip' THEN 2 WHEN 'business' THEN 1 ELSE 0 END <= 1;
    END LOOP;
  END LOOP;
END;
$$;

-- The following migration replaces the previous automatic claim with a
-- human-review workflow. Remove browser access now as well so a deployment
-- can never expose a short window in which a caller reaches the legacy RPC.
REVOKE ALL ON FUNCTION public.claim_business_invite(text) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
