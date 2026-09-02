-- Correct the canonical Colombia Blockchain Week 2026 identifier before the
-- public tenant opens. V085 used cbw2026 provisionally; the organizer's
-- official tenant name is cbweek2026.
BEGIN;

-- Create the correctly named parent first so every existing foreign-key row
-- can move without dropping referential integrity.
INSERT INTO public.events (
  id, name, slug, status, starts_at, ends_at, timezone,
  venue_name, city, country, description, branding, metadata, is_demo
)
SELECT
  'cbweek2026',
  name,
  'cbweek2026',
  status,
  starts_at,
  ends_at,
  timezone,
  venue_name,
  city,
  country,
  description,
  branding || '{"primaryColor":"#FCD116","secondaryColor":"#050507","logo":"https://hashpass-production-event-media-952191196420-us-east-2.s3.us-east-2.amazonaws.com/events/cbweek2026/branding/cbweek2026-logo.webp"}'::jsonb,
  jsonb_set(metadata, '{domain}', '"cbweek2026.hashpass.tech"'::jsonb, true),
  false
FROM public.events
WHERE id = 'cbw2026'
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
  metadata = EXCLUDED.metadata,
  is_demo = false,
  updated_at = now();

-- Move every direct event-id reference, including any future table added by
-- another migration, rather than maintaining a fragile handwritten table list.
DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT
      ns.nspname AS schema_name,
      rel.relname AS table_name,
      attr.attname AS column_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    JOIN pg_attribute attr ON attr.attrelid = con.conrelid AND attr.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND con.confrelid = 'public.events'::regclass
      AND array_length(con.conkey, 1) = 1
  LOOP
    EXECUTE format(
      'UPDATE %I.%I SET %I = $1 WHERE %I = $2',
      fk.schema_name,
      fk.table_name,
      fk.column_name,
      fk.column_name
    ) USING 'cbweek2026', 'cbw2026';
  END LOOP;
END $$;

DELETE FROM public.events WHERE id = 'cbw2026';

DO $$
BEGIN
  IF to_regclass('public.event_auth_allies') IS NOT NULL THEN
    INSERT INTO public.event_auth_allies (event_id, allowed_ally_ids)
    VALUES ('cbweek2026', ARRAY['hash-poker-room']::text[])
    ON CONFLICT (event_id) DO UPDATE
    SET allowed_ally_ids = ARRAY['hash-poker-room']::text[],
        updated_at = now();
  END IF;
END $$;

COMMIT;
