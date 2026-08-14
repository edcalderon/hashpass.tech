-- ============================================================================
-- V076: Demo-mode flag for events + CriptoLatinFest demo tenant registry row
-- ============================================================================
-- Adds a first-class `is_demo` flag to public.events so demo/proof-of-concept
-- events for prospective clients (deal not yet signed) can be flagged and
-- filtered without overloading `status` or reaching into `metadata` jsonb.
-- The actual demo content (speakers/agenda) is served from the static
-- EVENTS config in packages/config/src/events.ts, not this table -- this
-- migration exists to make the schema demo-aware for this and future demo
-- events, and to give Event Control Center visibility into them.
--
-- Applies to bsl-development ONLY (BSL_SUPABASE_DB_URL_DEV). Demo-mode
-- tenants are guarded to the develop DB end-to-end -- see the isDemo guard
-- in apps/mobile-app/config/supabase-profiles.ts's resolveSupabaseProfile()
-- -- so this row intentionally does not exist on bsl-production.

BEGIN;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

INSERT INTO public.events (
  id, name, slug, status, starts_at, ends_at, timezone,
  venue_name, city, country, description, branding, is_demo
)
VALUES (
  'criptolatinfest',
  'Cripto Latin Fest 2026',
  'criptolatinfest',
  'published',
  '2026-08-27T09:00:00-05:00',
  '2026-08-28T18:00:00-05:00',
  'America/Bogota',
  'Maloka',
  'Bogotá',
  'Colombia',
  'Gateway to Latin America''s digital economy -- cryptocurrency, Web3, blockchain and AI in practical business contexts. Demo tenant for a prospective client; deal not yet signed.',
  '{"primaryColor":"#046BD2","secondaryColor":"#06111F"}'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE SET is_demo = true;

COMMIT;
