-- Organizer-configured grants for accounts that have not signed up yet.
-- Email addresses are operational data, never bundled into migrations.
BEGIN;

CREATE TABLE public.event_account_grants (
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  email_normalized text NOT NULL CHECK (email_normalized = lower(btrim(email_normalized))),
  pass_type text NOT NULL CHECK (pass_type IN ('general', 'business', 'vip')),
  speaker_id uuid REFERENCES public.speakers(id) ON DELETE CASCADE,
  event_role public.event_role CHECK (event_role IN ('event_admin', 'moderator')),
  configured_by uuid NOT NULL,
  claimed_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, email_normalized),
  UNIQUE (speaker_id)
);
ALTER TABLE public.event_account_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.event_account_grants FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.event_account_grants TO service_role;

CREATE FUNCTION public.claim_event_account_grants(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
  v_grant public.event_account_grants%ROWTYPE;
  v_pass_id text;
BEGIN
  SELECT lower(email) INTO v_email FROM auth.users
  WHERE id = p_user_id AND email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN RETURN; END IF;

  FOR v_grant IN
    SELECT * FROM public.event_account_grants
    WHERE email_normalized = v_email AND claimed_user_id IS NULL
    FOR UPDATE
  LOOP
    IF v_grant.speaker_id IS NOT NULL THEN
      UPDATE public.speakers SET user_id = p_user_id, updated_at = now()
      WHERE id = v_grant.speaker_id AND event_id = v_grant.event_id
        AND (user_id IS NULL OR user_id = p_user_id);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Speaker grant conflicts with the event or linked account';
      END IF;
    END IF;

    v_pass_id := public.create_default_pass(p_user_id::text, 'general', v_grant.event_id);
    IF NOT EXISTS (SELECT 1 FROM public.passes WHERE id::text = v_pass_id AND status = 'active')
      OR NOT EXISTS (SELECT 1 FROM public.event_pass_tiers WHERE event_id = v_grant.event_id AND pass_type = v_grant.pass_type) THEN
      RAISE EXCEPTION 'Grant requires an active pass and a configured event tier';
    END IF;
    -- Upgrade the existing entitlement in place: this also works on tenant
    -- schemas with UNIQUE(user_id, event_id). Never reset consumed usage.
    UPDATE public.passes AS p
    SET pass_type = v_grant.pass_type::public.pass_type,
        max_meeting_requests = t.max_meeting_requests,
        max_boost_amount = t.max_boost_amount,
        access_features = CASE v_grant.pass_type
          WHEN 'vip' THEN ARRAY['all_sessions', 'networking', 'exclusive_events', 'priority_seating', 'speaker_access']
          WHEN 'business' THEN ARRAY['all_sessions', 'networking', 'business_events']
          ELSE ARRAY['general_sessions'] END,
        special_perks = CASE v_grant.pass_type
          WHEN 'vip' THEN ARRAY['concierge_service', 'exclusive_lounge', 'premium_swag']
          WHEN 'business' THEN ARRAY['business_lounge', 'networking_tools']
          ELSE ARRAY['basic_swag'] END,
        updated_at = now()
    FROM public.event_pass_tiers AS t
    WHERE p.id::text = v_pass_id AND p.status = 'active'
      AND t.event_id = v_grant.event_id AND t.pass_type = v_grant.pass_type
      AND CASE p.pass_type::text WHEN 'vip' THEN 2 WHEN 'business' THEN 1 ELSE 0 END
        <= CASE v_grant.pass_type WHEN 'vip' THEN 2 WHEN 'business' THEN 1 ELSE 0 END;

    IF v_grant.event_role IS NOT NULL THEN
      INSERT INTO public.event_roles(event_id, user_id, role, granted_by, metadata)
      VALUES (v_grant.event_id, p_user_id, v_grant.event_role, v_grant.configured_by,
        jsonb_build_object('source', 'verified_event_account_grant'))
      ON CONFLICT (event_id, user_id, role) DO NOTHING;
    END IF;

    UPDATE public.event_account_grants
    SET claimed_user_id = p_user_id, claimed_at = now()
    WHERE event_id = v_grant.event_id AND email_normalized = v_grant.email_normalized;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_event_account_grants(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_event_account_grants(uuid) TO service_role;

CREATE FUNCTION public.claim_event_account_grants_on_signup()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.claim_event_account_grants(NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_event_account_grants_on_signup() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_claim_event_account_grants
  AFTER INSERT OR UPDATE OF email, email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.claim_event_account_grants_on_signup();

-- The generic speaker table predates auth-user FKs; release only links owned
-- by these grants when an account is removed so a later signup can claim it.
CREATE FUNCTION public.release_event_account_grants()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.speakers AS s SET user_id = NULL, updated_at = now()
  FROM public.event_account_grants AS g
  WHERE g.claimed_user_id = OLD.id AND s.id = g.speaker_id AND s.user_id = OLD.id;
  UPDATE public.event_account_grants SET claimed_user_id = NULL, claimed_at = NULL
  WHERE claimed_user_id = OLD.id;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.release_event_account_grants() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_release_event_account_grants
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.release_event_account_grants();

COMMIT;
