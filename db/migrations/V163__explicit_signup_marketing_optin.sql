BEGIN;

CREATE TABLE public.marketing_consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL UNIQUE,
  user_id uuid REFERENCES public."user"(id) ON DELETE SET NULL,
  email text NOT NULL CHECK (email = lower(btrim(email))),
  action text NOT NULL CHECK (action IN ('opt_in', 'opt_out')),
  consent_version text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marketing_consent_events_email_created_idx
  ON public.marketing_consent_events (email, created_at DESC);

ALTER TABLE public.marketing_consent_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_consent_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.marketing_consent_events TO service_role;

CREATE FUNCTION public.record_signup_marketing_opt_in(
  p_user_id uuid,
  p_email text,
  p_consent_version text,
  p_request_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  active_user_id uuid;
BEGIN
  IF normalized_email = '' OR p_consent_version IS DISTINCT FROM 'signup-marketing-v1'
     OR p_request_id IS NULL OR length(p_request_id) < 3 OR length(p_request_id) > 100 THEN
    RETURN false;
  END IF;

  SELECT u.id INTO active_user_id
  FROM public."user" u
  WHERE u.id = p_user_id
    AND lower(btrim(u.email)) = normalized_email
    AND u.deleted_at IS NULL
    AND u.status = 'active'
  LIMIT 1;

  IF active_user_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.marketing_consent_events (
    request_id, user_id, email, action, consent_version, source
  ) VALUES (
    p_request_id, active_user_id, normalized_email, 'opt_in', p_consent_version, 'signup_auth'
  ) ON CONFLICT (request_id) DO NOTHING;

  DELETE FROM public.marketing_suppressions WHERE email = normalized_email;

  INSERT INTO public.newsletter_subscribers (email, subscribed_at, created_at, updated_at, email_sent)
  VALUES (normalized_email, now(), now(), now(), false)
  ON CONFLICT (email) DO NOTHING;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_unsubscribe(p_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  address text;
  recipient_id uuid;
BEGIN
  SELECT email INTO address FROM marketing_deliveries WHERE unsubscribe_token = p_token;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT id INTO recipient_id FROM public."user"
  WHERE lower(btrim(email)) = address AND deleted_at IS NULL
  LIMIT 1;

  INSERT INTO marketing_consent_events (request_id, user_id, email, action, consent_version, source)
  VALUES (gen_random_uuid()::text, recipient_id, address, 'opt_out', 'marketing-unsubscribe-v1', 'email_unsubscribe');

  INSERT INTO marketing_suppressions(email, reason)
  VALUES(address, 'recipient_unsubscribe') ON CONFLICT DO NOTHING;
  DELETE FROM newsletter_subscribers WHERE lower(btrim(email)) = address;
  UPDATE marketing_deliveries SET status = 'suppressed', error_code = 'recipient_unsubscribe'
    WHERE email = address AND status = 'queued';
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_signup_marketing_opt_in(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_signup_marketing_opt_in(uuid, text, text, text) TO service_role;

COMMIT;
