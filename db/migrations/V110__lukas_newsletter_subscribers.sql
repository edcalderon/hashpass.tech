-- ============================================================================
-- V110: Lukas landing newsletter audience
-- ============================================================================
-- Lukas communications are intentionally kept separate from the HashPass
-- newsletter. The optional opt-in on the Lukas landing can still copy an
-- address into newsletter_subscribers for HashPass updates.

BEGIN;

CREATE TABLE IF NOT EXISTS public.lukas_newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (email = lower(btrim(email))),
  source text NOT NULL DEFAULT 'lukas_landing',
  hashpass_opt_in boolean NOT NULL DEFAULT false,
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lukas_newsletter_subscribers_email_key
  ON public.lukas_newsletter_subscribers (email);

CREATE INDEX IF NOT EXISTS lukas_newsletter_subscribers_hashpass_opt_in_idx
  ON public.lukas_newsletter_subscribers (hashpass_opt_in)
  WHERE hashpass_opt_in = true;

ALTER TABLE public.lukas_newsletter_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages Lukas newsletter"
  ON public.lukas_newsletter_subscribers;
CREATE POLICY "Service role manages Lukas newsletter"
  ON public.lukas_newsletter_subscribers
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.lukas_newsletter_subscribers IS
  'Independent Lukas newsletter audience. HashPass opt-ins are copied to newsletter_subscribers by the Lukas API route.';

COMMIT;
