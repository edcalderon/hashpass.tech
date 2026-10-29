-- Public event-artwork pages created by the attending experience. The API
-- stores artwork in a public, unlistable bucket only after a valid Cap token;
-- links expire after 90 days and the scheduled API sweep removes old files.

CREATE TABLE attending_artwork_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  object_path text NOT NULL UNIQUE CHECK (object_path ~ '^[a-f0-9]{64}\.png$'),
  event_slug text NOT NULL CHECK (event_slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  event_name text NOT NULL CHECK (char_length(event_name) BETWEEN 1 AND 180),
  attendee_name text NOT NULL CHECK (char_length(attendee_name) BETWEEN 2 AND 100),
  caption text NOT NULL CHECK (char_length(caption) BETWEEN 1 AND 500),
  event_url text NOT NULL CHECK (
    (event_slug <> 'bsl' AND event_url ~ ('^https://' || event_slug || '\.hashpass\.tech/?$'))
    OR (event_slug = 'bsl' AND event_url ~ '^https://bsl\.hashpass\.tech/attending/bsl/?$')
  ),
  locale text NOT NULL DEFAULT 'en' CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  CHECK (expires_at <= created_at + interval '90 days')
);

CREATE INDEX attending_artwork_shares_expiry_idx ON attending_artwork_shares(expires_at);

ALTER TABLE attending_artwork_shares ENABLE ROW LEVEL SECURITY;
-- There are no client policies. The Links API's service role is the only
-- writer/reader; public access is served through opaque URLs in the API.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('attending-artworks', 'attending-artworks', true, 4194304, ARRAY['image/png'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
