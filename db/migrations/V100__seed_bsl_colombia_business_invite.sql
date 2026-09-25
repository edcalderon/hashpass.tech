-- Correct existing V099 installations that were initially seeded against a
-- development-only CBWeek event. The code has not been issued before this
-- migration; if a database somehow already has claims, keep their historical
-- event binding intact rather than silently reassigning an entitlement.

BEGIN;

DROP TRIGGER IF EXISTS trg_provision_cbweek_business_invite_campaign ON public.events;
DROP FUNCTION IF EXISTS public.provision_cbweek_business_invite_campaign();

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
    ON CONFLICT (code_hash) DO UPDATE
    SET event_id = EXCLUDED.event_id,
        label = EXCLUDED.label,
        max_claims = EXCLUDED.max_claims,
        expires_at = NULL,
        is_active = true,
        updated_at = now()
    WHERE public.business_invite_campaigns.claimed_count = 0;
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
ON CONFLICT (code_hash) DO UPDATE
SET event_id = EXCLUDED.event_id,
    label = EXCLUDED.label,
    max_claims = EXCLUDED.max_claims,
    expires_at = NULL,
    is_active = true,
    updated_at = now()
WHERE public.business_invite_campaigns.claimed_count = 0;

COMMIT;
