-- Colombia Blockchain Week 2026 is a separate organizer and event from the
-- existing BSL Colombia stop. Its public site currently lists no confirmed
-- 2026 speakers or timed agenda, so this migration seeds only verified event,
-- venue, organizer, and ticket-tier facts. Do not import past-edition
-- speakers as CBW 2026 speakers.

BEGIN;

INSERT INTO public.events (
  id, name, slug, status, starts_at, ends_at, timezone,
  venue_name, city, country, description, branding, metadata, is_demo
)
VALUES (
  'cbw2026',
  'Colombia Blockchain Week 2026',
  'cbw2026',
  'published',
  '2026-12-12T08:30:00-05:00'::timestamptz,
  '2026-12-12T18:00:00-05:00'::timestamptz,
  'America/Bogota',
  'Hotel InterContinental Medellín',
  'Medellín',
  'Colombia',
  'First edition of Colombia Blockchain Week, focused on blockchain, crypto, trading, digital assets, tokenization, DeFi, regulation, AI, security, and compliance.',
  '{"primaryColor":"#087C80","secondaryColor":"#06111F","favicon":"/favicon.ico"}'::jsonb,
  '{"domain":"cbw2026.hashpass.tech","website":"https://colombiablockchainweek.com/","organizer":"LATAM Blockchain Events LLC","venueAddress":"Calle 16, Variante #28-51, Las Palmas, El Poblado, Medellín","welcomeDrink":{"date":"2026-12-11","access":"private"},"mainDay":{"date":"2026-12-12","startsAt":"08:30","endsAt":"18:00"},"sourceFactsVerifiedAt":"2026-09-02","speakerStatus":"not_announced","agendaStatus":"not_announced","features":["speakers","agenda"]}'::jsonb,
  false
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
  branding = EXCLUDED.branding,
  metadata = public.events.metadata || EXCLUDED.metadata,
  is_demo = false,
  updated_at = now();

-- Map the official Free, General, and VIP offers onto HashPass's canonical
-- general/business/vip entitlement taxonomy. This is a catalog only: HashPass
-- does not issue a paid ticket or process payment from this public scrape.
INSERT INTO public.event_pass_tiers (
  event_id, pass_type, max_meeting_requests, max_boost_amount, price_cents, currency, price_label
)
VALUES
  ('cbw2026', 'general', 10, 100, 0, 'USD', 'Free entry — order of arrival'),
  ('cbw2026', 'business', 20, 300, 2900, 'USD', 'Official General ticket'),
  ('cbw2026', 'vip', 50, 500, 24900, 'USD', 'Official VIP ticket')
ON CONFLICT (event_id, pass_type) DO UPDATE SET
  max_meeting_requests = EXCLUDED.max_meeting_requests,
  max_boost_amount = EXCLUDED.max_boost_amount,
  price_cents = EXCLUDED.price_cents,
  currency = EXCLUDED.currency,
  price_label = EXCLUDED.price_label,
  updated_at = now();

-- V077 added CriptoLatinFest to this shared verified-signup trigger. Its
-- tenant is being retired, so stop creating new demo passes while retaining
-- existing rows for audit/history. CBW tickets are not auto-issued: the
-- organizer's Free entry still requires its official registration flow.
CREATE OR REPLACE FUNCTION public.provision_upcoming_bsl_general_passes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL AND NEW.confirmed_at IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.create_upcoming_bsl_general_pass_for_user(NEW.id, 'chile2026');
  PERFORM public.create_upcoming_bsl_general_pass_for_user(NEW.id, 'colombia2026');
  RETURN NEW;
END;
$$;

COMMIT;
