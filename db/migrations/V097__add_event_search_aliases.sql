-- Canonical discovery aliases are structured event metadata, not display copy.
-- They support abbreviations, unaccented city searches, and organizer hashtags
-- without conflating BSL Colombia and Colombia Blockchain Week.
BEGIN;

ALTER TABLE IF EXISTS public.events
  ADD COLUMN IF NOT EXISTS search_aliases text[] NOT NULL DEFAULT ARRAY[]::text[];

UPDATE public.events
SET
  search_aliases = ARRAY[
    'bsl',
    'bsl 2026',
    'bsl on tour',
    'blockchain summit',
    'blockchain summit latam',
    'blockchain summit latam on tour',
    '#bsl',
    '#bsl2026'
  ]::text[],
  updated_at = now()
WHERE id = 'bsl';

UPDATE public.events
SET
  search_aliases = ARRAY[
    'bsl colombia',
    'bsl colombia 2026',
    'bsl bogota',
    'bsl bogotá',
    'blockchain summit colombia',
    'blockchain summit bogota',
    'blockchain summit bogotá',
    'blockchain summit latam colombia',
    'blockchain summit latam colombia 2026',
    '#bsl2026',
    '#bslcolombia2026'
  ]::text[],
  updated_at = now()
WHERE id = 'colombia2026';

UPDATE public.events
SET
  search_aliases = ARRAY[
    'cbw',
    'cbweek',
    'cbw2026',
    'cbweek2026',
    'cb week',
    'cb week 2026',
    'colombia blockchain week',
    'colombia blockchain week 2026',
    'medellin cbweek',
    'medellín cbweek',
    'medellin blockchain week',
    'medellín blockchain week',
    'blockchain week medellin',
    'blockchain week medellín',
    '#cbw2026',
    '#cbweek2026'
  ]::text[],
  updated_at = now()
WHERE id = 'cbweek2026';

CREATE INDEX IF NOT EXISTS events_search_aliases_gin
  ON public.events USING gin (search_aliases);

COMMENT ON COLUMN public.events.search_aliases IS
  'Canonical alternative names and hashtag-style discovery terms for event search.';

COMMIT;
