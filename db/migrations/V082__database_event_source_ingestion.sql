-- Database-first public event-source ingestion. The checked-in JSON snapshot is
-- retained only as an explicitly controlled legacy fallback.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.event_sources (
  id text PRIMARY KEY,
  name text NOT NULL,
  base_url text NOT NULL,
  adapter text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  poll_interval_minutes integer NOT NULL DEFAULT 360 CHECK (poll_interval_minutes BETWEEN 15 AND 10080),
  last_success_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.event_sources (id, name, base_url, adapter, poll_interval_minutes)
VALUES ('pkrr-hash-poker', 'PKRR / Hash Poker Room', 'https://pkrr.io/c/hash-poker', 'pkrr-next-html', 360)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, base_url = EXCLUDED.base_url, adapter = EXCLUDED.adapter,
  poll_interval_minutes = EXCLUDED.poll_interval_minutes, updated_at = now();

CREATE TABLE IF NOT EXISTS public.event_source_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES public.event_sources(id) ON DELETE CASCADE,
  attempted_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('healthy', 'degraded', 'failed')),
  event_count integer NOT NULL DEFAULT 0,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_source_sync_runs_source_attempt_idx
  ON public.event_source_sync_runs(source_id, attempted_at DESC);

CREATE TABLE IF NOT EXISTS public.external_events (
  source_id text NOT NULL REFERENCES public.event_sources(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  source_status text NOT NULL CHECK (source_status IN ('upcoming', 'live', 'past', 'stale', 'cancelled')),
  publication_status text NOT NULL DEFAULT 'pending' CHECK (publication_status IN ('pending', 'published', 'needs_review', 'rejected')),
  normalized_payload jsonb NOT NULL,
  candidate_payload jsonb,
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_reason text,
  last_reviewed_payload_hash text,
  PRIMARY KEY (source_id, external_id)
);
-- Postgres marks both ::timestamptz and ::timestamp text casts STABLE, not
-- IMMUTABLE (parsing can depend on the session TimeZone/DateStyle GUCs), so
-- neither is usable directly in an index expression. The standard fix is an
-- explicit IMMUTABLE wrapper -- safe here specifically because
-- normalized_payload->>'startsAt' is always a normalizer-produced,
-- unambiguous ISO 8601 UTC string, not arbitrary user input.
CREATE OR REPLACE FUNCTION public.parse_iso8601_immutable(value text)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT value::timestamptz
$$;

CREATE INDEX IF NOT EXISTS external_events_publication_start_idx
  ON public.external_events(publication_status, (public.parse_iso8601_immutable(normalized_payload->>'startsAt')));

CREATE TABLE IF NOT EXISTS public.external_event_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id uuid NOT NULL REFERENCES public.event_source_sync_runs(id) ON DELETE CASCADE,
  source_id text NOT NULL,
  external_id text NOT NULL,
  observed_at timestamptz NOT NULL,
  payload_hash text NOT NULL,
  normalized_payload jsonb NOT NULL,
  confidence numeric(4,3) NOT NULL,
  needs_review boolean NOT NULL,
  UNIQUE (sync_run_id, source_id, external_id)
);
CREATE INDEX IF NOT EXISTS external_event_observations_event_idx
  ON public.external_event_observations(source_id, external_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS public.event_ingestion_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL,
  external_id text NOT NULL,
  observation_id uuid REFERENCES public.external_event_observations(id) ON DELETE SET NULL,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason text,
  reviewed_by uuid NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (source_id, external_id) REFERENCES public.external_events(source_id, external_id) ON DELETE CASCADE
);

CREATE OR REPLACE VIEW public.published_external_events
WITH (security_invoker = true) AS
SELECT source_id, external_id, normalized_payload, confidence, last_seen_at, published_at
FROM public.external_events
WHERE publication_status = 'published' AND source_status IN ('upcoming', 'live');

ALTER TABLE public.event_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_source_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_event_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_ingestion_reviews ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY has no IF NOT EXISTS form, unlike the CREATE TABLE/INDEX
-- statements above -- DROP+CREATE keeps this migration safely re-runnable
-- (confirmed needed live: an earlier attempt committed everything up to
-- this point before a downstream IMMUTABLE/search_path bug was caught,
-- so a bare CREATE POLICY on retry failed with "already exists").
DROP POLICY IF EXISTS published_external_events_are_public ON public.external_events;
CREATE POLICY published_external_events_are_public ON public.external_events
  FOR SELECT TO anon, authenticated
  USING (publication_status = 'published' AND source_status IN ('upcoming', 'live'));

CREATE OR REPLACE FUNCTION public.ingest_event_source_sync(
  p_source_id text,
  p_attempted_at timestamptz,
  p_status text,
  p_error text,
  p_events jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_run_id uuid;
  v_event jsonb;
  v_existing public.external_events%ROWTYPE;
  v_review boolean;
  v_observation_id uuid;
  v_payload_hash text;
BEGIN
  IF p_status NOT IN ('healthy', 'degraded', 'failed') OR jsonb_typeof(p_events) <> 'array' THEN
    RAISE EXCEPTION 'Invalid event ingestion payload' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.event_sources WHERE id = p_source_id AND active) THEN
    RAISE EXCEPTION 'Unknown or inactive event source' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.event_source_sync_runs(source_id, attempted_at, status, event_count, error_summary)
  VALUES (p_source_id, p_attempted_at, p_status, jsonb_array_length(p_events), left(p_error, 1000))
  RETURNING id INTO v_run_id;

  UPDATE public.event_sources SET
    last_success_at = CASE WHEN p_status = 'healthy' THEN p_attempted_at ELSE last_success_at END,
    consecutive_failures = CASE WHEN p_status = 'healthy' THEN 0 ELSE consecutive_failures + 1 END,
    updated_at = now()
  WHERE id = p_source_id;

  -- A degraded/failed fetch records durable health only. Retained rows are not
  -- new source observations and must not advance last_seen_at.
  IF p_status <> 'healthy' THEN
    RETURN;
  END IF;

  FOR v_event IN SELECT value FROM jsonb_array_elements(p_events)
  LOOP
    IF v_event->>'sourceId' IS DISTINCT FROM p_source_id OR coalesce(v_event->>'externalId', '') = '' THEN
      RAISE EXCEPTION 'Event identity does not match source' USING ERRCODE = '22023';
    END IF;

    v_payload_hash := encode(digest(v_event::text, 'sha256'), 'hex');
    INSERT INTO public.external_event_observations(
      sync_run_id, source_id, external_id, observed_at, payload_hash,
      normalized_payload, confidence, needs_review
    ) VALUES (
      v_run_id, p_source_id, v_event->>'externalId', p_attempted_at,
      v_payload_hash, v_event,
      (v_event->>'confidence')::numeric, (v_event->>'needsReview')::boolean
    ) RETURNING id INTO v_observation_id;

    SELECT * INTO v_existing FROM public.external_events
    WHERE source_id = p_source_id AND external_id = v_event->>'externalId' FOR UPDATE;

    v_review := ((v_event->>'needsReview')::boolean
      OR (v_event->>'confidence')::numeric < 0.90
      OR v_event->>'status' IN ('stale', 'cancelled')
      OR (v_existing.source_id IS NOT NULL AND (
        v_existing.normalized_payload->>'startsAt' IS DISTINCT FROM v_event->>'startsAt'
        OR v_existing.normalized_payload->>'title' IS DISTINCT FROM v_event->>'title'
        OR v_existing.normalized_payload->>'venueName' IS DISTINCT FROM v_event->>'venueName'
        OR v_existing.normalized_payload->>'sourceUrl' IS DISTINCT FROM v_event->>'sourceUrl'
      ))) AND (v_existing.source_id IS NULL
        OR v_existing.last_reviewed_payload_hash IS DISTINCT FROM v_payload_hash);

    INSERT INTO public.external_events(
      source_id, external_id, source_status, publication_status, normalized_payload,
      candidate_payload, confidence, first_seen_at, last_seen_at, published_at, review_reason
    ) VALUES (
      p_source_id, v_event->>'externalId', v_event->>'status',
      CASE WHEN v_review THEN 'needs_review' ELSE 'published' END,
      v_event, CASE WHEN v_review THEN v_event ELSE NULL END,
      (v_event->>'confidence')::numeric, p_attempted_at, p_attempted_at,
      CASE WHEN v_review THEN NULL ELSE p_attempted_at END,
      CASE WHEN v_review THEN 'Source marked the event for review or a protected field changed' ELSE NULL END
    ) ON CONFLICT (source_id, external_id) DO UPDATE SET
      source_status = EXCLUDED.source_status,
      publication_status = CASE WHEN v_review THEN 'needs_review' ELSE external_events.publication_status END,
      normalized_payload = CASE WHEN v_review THEN external_events.normalized_payload ELSE EXCLUDED.normalized_payload END,
      candidate_payload = CASE WHEN v_review THEN EXCLUDED.normalized_payload ELSE NULL END,
      confidence = EXCLUDED.confidence,
      last_seen_at = EXCLUDED.last_seen_at,
      published_at = CASE WHEN NOT v_review AND external_events.published_at IS NULL THEN p_attempted_at ELSE external_events.published_at END,
      review_reason = CASE WHEN v_review THEN EXCLUDED.review_reason ELSE NULL END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_external_event_candidate(
  p_source_id text,
  p_external_id text,
  p_decision text,
  p_reviewer uuid,
  p_reason text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_event public.external_events%ROWTYPE;
  v_observation_id uuid;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') OR p_reviewer IS NULL THEN
    RAISE EXCEPTION 'Invalid ingestion review' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_event FROM public.external_events
  WHERE source_id = p_source_id AND external_id = p_external_id FOR UPDATE;
  IF NOT FOUND OR v_event.publication_status <> 'needs_review' OR v_event.candidate_payload IS NULL THEN
    RAISE EXCEPTION 'No reviewable event candidate found' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO v_observation_id FROM public.external_event_observations
  WHERE source_id = p_source_id AND external_id = p_external_id
  ORDER BY observed_at DESC LIMIT 1;

  INSERT INTO public.event_ingestion_reviews(source_id, external_id, observation_id, decision, reason, reviewed_by)
  VALUES (p_source_id, p_external_id, v_observation_id, p_decision, left(p_reason, 1000), p_reviewer);

  UPDATE public.external_events SET
    normalized_payload = CASE WHEN p_decision = 'approved' THEN candidate_payload ELSE normalized_payload END,
    source_status = CASE WHEN p_decision = 'approved' THEN candidate_payload->>'status' ELSE source_status END,
    publication_status = CASE
      WHEN p_decision = 'approved' AND candidate_payload->>'status' IN ('upcoming', 'live') THEN 'published'
      WHEN p_decision = 'approved' THEN 'rejected'
      ELSE 'rejected'
    END,
    candidate_payload = NULL,
    published_at = CASE WHEN p_decision = 'approved' AND candidate_payload->>'status' IN ('upcoming', 'live') THEN now() ELSE published_at END,
    reviewed_at = now(), reviewed_by = p_reviewer,
    review_reason = left(p_reason, 1000),
    last_reviewed_payload_hash = encode(digest(candidate_payload::text, 'sha256'), 'hex')
  WHERE source_id = p_source_id AND external_id = p_external_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_event_source_sync(text, timestamptz, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_event_source_sync(text, timestamptz, text, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.review_external_event_candidate(text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_external_event_candidate(text, text, text, uuid, text) TO service_role;
GRANT SELECT ON public.published_external_events TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.event_sources, public.event_source_sync_runs, public.external_events,
  public.external_event_observations, public.event_ingestion_reviews TO service_role;

COMMIT;
