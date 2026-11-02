BEGIN;

CREATE FUNCTION public.set_marketing_email_preference(
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
     OR p_consent_version IS DISTINCT FROM 'signup-marketing-v1'
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
    request_id, user_id, email, action, consent_version, source
  ) VALUES (
    p_request_id, active_user_id, normalized_email, target_action, p_consent_version, p_source
  ) ON CONFLICT (request_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 0 THEN
    SELECT e.action INTO prior_action
    FROM public.marketing_consent_events e
    WHERE e.request_id = p_request_id;

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

CREATE FUNCTION public.get_marketing_email_preference(
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

CREATE OR REPLACE FUNCTION public.record_signup_marketing_opt_in(
  p_user_id uuid,
  p_email text,
  p_consent_version text,
  p_request_id text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE preference_result text;
BEGIN
  preference_result := public.set_marketing_email_preference(
    p_user_id,
    p_email,
    true,
    p_consent_version,
    p_request_id,
    'signup_auth'
  );

  RETURN preference_result IN ('updated', 'unchanged');
END;
$$;

REVOKE ALL ON FUNCTION public.set_marketing_email_preference(uuid, text, boolean, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_marketing_email_preference(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_signup_marketing_opt_in(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_marketing_email_preference(uuid, text, boolean, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_marketing_email_preference(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_signup_marketing_opt_in(uuid, text, text, text) TO service_role;

COMMIT;
