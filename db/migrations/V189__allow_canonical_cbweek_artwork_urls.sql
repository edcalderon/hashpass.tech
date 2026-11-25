BEGIN;

ALTER TABLE public.attending_artwork_shares
  DROP CONSTRAINT IF EXISTS attending_artwork_shares_event_url_check;

ALTER TABLE public.attending_artwork_shares
  ADD CONSTRAINT attending_artwork_shares_event_url_check CHECK (
    (event_slug = 'community' AND event_url ~ '^https://hashpass\.club/attendings/?$')
    OR (event_slug = 'cbweek' AND event_url ~ '^https://cbweek2026\.hashpass\.tech/attending/cbweek/?$')
    OR (event_slug NOT IN ('bsl', 'community') AND event_url ~ ('^https://' || event_slug || '\.hashpass\.tech/?$'))
    OR (event_slug = 'bsl' AND event_url ~ '^https://bsl\.hashpass\.tech/attending/bsl/?$')
  );

COMMIT;
