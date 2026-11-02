BEGIN;

ALTER TABLE public.marketing_consent_events
  ADD COLUMN consent_purpose text NOT NULL DEFAULT 'hashpass_updates';

ALTER TABLE public.marketing_consent_events
  DROP CONSTRAINT marketing_consent_events_request_id_key;

ALTER TABLE public.marketing_consent_events
  ADD CONSTRAINT marketing_consent_events_purpose_check
    CHECK (consent_purpose IN ('hashpass_updates', 'partner_promotions')),
  ADD CONSTRAINT marketing_consent_events_request_purpose_key
    UNIQUE (request_id, consent_purpose);

CREATE TABLE public.marketing_partner_subscribers (
  email text PRIMARY KEY CHECK (email = lower(btrim(email))),
  user_id uuid REFERENCES public."user"(id) ON DELETE SET NULL,
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  consent_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_partner_subscribers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_partner_subscribers FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.marketing_partner_subscribers TO service_role;

CREATE OR REPLACE FUNCTION public.set_marketing_email_preference(
  p_user_id uuid,
  p_email text,
  p_subscribed boolean,
  p_consent_version text,
  p_request_id text,
  p_source text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  active_user_id uuid;
  target_action text;
  prior_action text;
  inserted_count integer;
BEGIN
  IF normalized_email = ''
     OR p_subscribed IS NULL
     OR p_consent_version IS DISTINCT FROM 'signup-marketing-v2'
     OR p_request_id IS NULL
     OR length(p_request_id) < 3
     OR length(p_request_id) > 100
     OR p_source IS NULL
     OR p_source NOT IN ('signup_auth', 'settings') THEN
    RETURN 'invalid';
  END IF;

  SELECT u.id INTO active_user_id
  FROM public."user" u
  WHERE u.id = p_user_id
    AND lower(btrim(u.email)) = normalized_email
    AND u.deleted_at IS NULL
    AND u.status = 'active'
  FOR UPDATE;

  IF active_user_id IS NULL THEN
    RETURN 'inactive';
  END IF;

  target_action := CASE WHEN p_subscribed THEN 'opt_in' ELSE 'opt_out' END;

  IF p_subscribed AND EXISTS (
    SELECT 1 FROM public.marketing_suppressions s
    WHERE s.email = normalized_email
      AND s.reason <> 'recipient_unsubscribe'
  ) THEN
    RETURN 'suppressed';
  END IF;

  INSERT INTO public.marketing_consent_events (
    request_id, user_id, email, action, consent_version, source, consent_purpose
  ) VALUES (
    p_request_id, active_user_id, normalized_email, target_action,
    p_consent_version, p_source, 'hashpass_updates'
  ) ON CONFLICT (request_id, consent_purpose) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 0 THEN
    SELECT e.action INTO prior_action
    FROM public.marketing_consent_events e
    WHERE e.request_id = p_request_id
      AND e.consent_purpose = 'hashpass_updates';

    IF prior_action IS DISTINCT FROM target_action THEN
      RETURN 'request_conflict';
    END IF;
    RETURN 'unchanged';
  END IF;

  IF p_subscribed THEN
    DELETE FROM public.marketing_suppressions
    WHERE email = normalized_email AND reason = 'recipient_unsubscribe';

    INSERT INTO public.newsletter_subscribers (
      email, subscribed_at, created_at, updated_at, email_sent
    ) VALUES (
      normalized_email, now(), now(), now(), false
    ) ON CONFLICT (email) DO NOTHING;
  ELSE
    INSERT INTO public.marketing_suppressions (email, reason)
    VALUES (normalized_email, 'recipient_unsubscribe')
    ON CONFLICT (email) DO NOTHING;

    DELETE FROM public.newsletter_subscribers
    WHERE lower(btrim(email)) = normalized_email;

    UPDATE public.marketing_deliveries
    SET status = 'suppressed', error_code = 'recipient_unsubscribe'
    WHERE email = normalized_email AND status = 'queued';
  END IF;

  RETURN 'updated';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_marketing_email_preference(
  p_user_id uuid,
  p_email text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."user" u
    JOIN public.newsletter_subscribers n
      ON lower(btrim(n.email)) = lower(btrim(p_email))
    WHERE u.id = p_user_id
      AND lower(btrim(u.email)) = lower(btrim(p_email))
      AND u.deleted_at IS NULL
      AND u.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.marketing_suppressions s
        WHERE s.email = lower(btrim(p_email))
      )
  );
$$;

CREATE FUNCTION public.set_marketing_partner_preference(
  p_user_id uuid,
  p_email text,
  p_subscribed boolean,
  p_consent_version text,
  p_request_id text,
  p_source text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  active_user_id uuid;
  target_action text;
  prior_action text;
  inserted_count integer;
BEGIN
  IF normalized_email = ''
     OR p_subscribed IS NULL
     OR p_consent_version IS DISTINCT FROM 'signup-marketing-v2'
     OR p_request_id IS NULL
     OR length(p_request_id) < 3
     OR length(p_request_id) > 100
     OR p_source IS NULL
     OR p_source NOT IN ('signup_auth', 'settings') THEN
    RETURN 'invalid';
  END IF;

  SELECT u.id INTO active_user_id
  FROM public."user" u
  WHERE u.id = p_user_id
    AND lower(btrim(u.email)) = normalized_email
    AND u.deleted_at IS NULL
    AND u.status = 'active'
  FOR UPDATE;

  IF active_user_id IS NULL THEN
    RETURN 'inactive';
  END IF;

  target_action := CASE WHEN p_subscribed THEN 'opt_in' ELSE 'opt_out' END;

  IF p_subscribed AND EXISTS (
    SELECT 1 FROM public.marketing_suppressions s
    WHERE s.email = normalized_email
      AND s.reason <> 'recipient_unsubscribe'
  ) THEN
    RETURN 'suppressed';
  END IF;

  INSERT INTO public.marketing_consent_events (
    request_id, user_id, email, action, consent_version, source, consent_purpose
  ) VALUES (
    p_request_id, active_user_id, normalized_email, target_action,
    p_consent_version, p_source, 'partner_promotions'
  ) ON CONFLICT (request_id, consent_purpose) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 0 THEN
    SELECT e.action INTO prior_action
    FROM public.marketing_consent_events e
    WHERE e.request_id = p_request_id
      AND e.consent_purpose = 'partner_promotions';

    IF prior_action IS DISTINCT FROM target_action THEN
      RETURN 'request_conflict';
    END IF;
    RETURN 'unchanged';
  END IF;

  IF p_subscribed THEN
    DELETE FROM public.marketing_suppressions
    WHERE email = normalized_email AND reason = 'recipient_unsubscribe';

    INSERT INTO public.marketing_partner_subscribers (
      email, user_id, subscribed_at, consent_version, created_at, updated_at
    ) VALUES (
      normalized_email, active_user_id, now(), p_consent_version, now(), now()
    ) ON CONFLICT (email) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      subscribed_at = EXCLUDED.subscribed_at,
      consent_version = EXCLUDED.consent_version,
      updated_at = EXCLUDED.updated_at;
  ELSE
    DELETE FROM public.marketing_partner_subscribers
    WHERE email = normalized_email;
  END IF;

  RETURN 'updated';
END;
$$;

CREATE FUNCTION public.get_marketing_partner_preference(
  p_user_id uuid,
  p_email text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public."user" u
    JOIN public.marketing_partner_subscribers p
      ON p.email = lower(btrim(p_email))
      AND p.user_id = u.id
    WHERE u.id = p_user_id
      AND lower(btrim(u.email)) = lower(btrim(p_email))
      AND u.deleted_at IS NULL
      AND u.status = 'active'
      AND NOT EXISTS (
        SELECT 1 FROM public.marketing_suppressions s
        WHERE s.email = lower(btrim(p_email))
      )
  );
$$;

CREATE FUNCTION public.record_signup_marketing_preferences(
  p_user_id uuid,
  p_email text,
  p_hashpass_updates boolean,
  p_partner_promotions boolean,
  p_consent_version text,
  p_request_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE preference_result text;
BEGIN
  IF p_consent_version IS DISTINCT FROM 'signup-marketing-v2'
     OR p_request_id IS NULL
     OR length(p_request_id) < 3
     OR length(p_request_id) > 100
     OR (p_hashpass_updates IS DISTINCT FROM true AND p_partner_promotions IS DISTINCT FROM true) THEN
    RETURN false;
  END IF;

  IF p_hashpass_updates THEN
    preference_result := public.set_marketing_email_preference(
      p_user_id, p_email, true, p_consent_version, p_request_id, 'signup_auth'
    );
    IF preference_result NOT IN ('updated', 'unchanged') THEN
      RAISE EXCEPTION 'Could not save HASHPASS email preference: %', preference_result;
    END IF;
  END IF;

  IF p_partner_promotions THEN
    preference_result := public.set_marketing_partner_preference(
      p_user_id, p_email, true, p_consent_version, p_request_id, 'signup_auth'
    );
    IF preference_result NOT IN ('updated', 'unchanged') THEN
      RAISE EXCEPTION 'Could not save partner email preference: %', preference_result;
    END IF;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_signup_marketing_opt_in(
  p_user_id uuid,
  p_email text,
  p_consent_version text,
  p_request_id text
) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.record_signup_marketing_preferences(
    p_user_id, p_email, true, false, p_consent_version, p_request_id
  );
$$;

REVOKE ALL ON FUNCTION public.set_marketing_email_preference(uuid, text, boolean, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_marketing_email_preference(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_marketing_partner_preference(uuid, text, boolean, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_marketing_partner_preference(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_signup_marketing_preferences(uuid, text, boolean, boolean, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_signup_marketing_opt_in(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.set_marketing_email_preference(uuid, text, boolean, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_marketing_email_preference(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_marketing_partner_preference(uuid, text, boolean, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_marketing_partner_preference(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_signup_marketing_preferences(uuid, text, boolean, boolean, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_signup_marketing_opt_in(uuid, text, text, text) TO service_role;

COMMIT;
