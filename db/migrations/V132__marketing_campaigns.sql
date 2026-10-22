BEGIN;
CREATE TABLE public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL UNIQUE,
  name text NOT NULL, event_id text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','paused','sending','completed','cancelled')),
  audience text NOT NULL DEFAULT 'registered_opt_in' CHECK (audience = 'registered_opt_in'),
  content jsonb NOT NULL, requirements text[] NOT NULL DEFAULT '{}', readiness jsonb NOT NULL DEFAULT '{}',
  scheduled_at timestamptz, audience_queued_at timestamptz, time_zone text NOT NULL DEFAULT 'America/Bogota',
  created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.marketing_suppressions (
  email text PRIMARY KEY CHECK (email = lower(btrim(email))),
  reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.marketing_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id),
  user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(btrim(email))), locale text NOT NULL CHECK (locale IN ('es','en')),
  unsubscribe_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','accepted','failed','unknown','suppressed')),
  claim_token uuid, claimed_at timestamptz, accepted_at timestamptz,
  provider_message_id text, error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id,user_id), UNIQUE (campaign_id,email)
);
CREATE INDEX marketing_deliveries_claim ON public.marketing_deliveries(status,created_at);
CREATE TABLE public.marketing_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid REFERENCES public.marketing_campaigns(id),
  actor_id uuid, action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_campaigns, public.marketing_deliveries, public.marketing_suppressions, public.marketing_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.marketing_campaigns, public.marketing_deliveries, public.marketing_suppressions, public.marketing_audit TO service_role;

CREATE FUNCTION public.marketing_overview() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
SELECT jsonb_build_object(
  'campaigns', coalesce((SELECT jsonb_agg(to_jsonb(c) || jsonb_build_object('counts', coalesce((SELECT jsonb_object_agg(status,n) FROM (SELECT status,count(*)::int n FROM marketing_deliveries WHERE campaign_id = c.id GROUP BY status) x),'{}')) ORDER BY c.scheduled_at NULLS LAST,c.created_at) FROM marketing_campaigns c), '[]'),
  'deliveries', coalesce((SELECT jsonb_agg(to_jsonb(d)) FROM (SELECT id,campaign_id,user_id,status,error_code,accepted_at,created_at FROM marketing_deliveries ORDER BY created_at DESC LIMIT 100) d), '[]'),
  'audit', coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM (SELECT id,campaign_id,action,created_at FROM marketing_audit ORDER BY created_at DESC LIMIT 100) a),'[]')
);
$$;

CREATE FUNCTION public.marketing_campaign_action(p_actor uuid, p_action text, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c marketing_campaigns; d jsonb; items jsonb; cid uuid;
BEGIN
  IF p_action = 'seed' THEN
    FOR d IN SELECT * FROM jsonb_array_elements(p_payload->'campaigns') LOOP
      INSERT INTO marketing_campaigns(key,name,event_id,content,requirements,readiness,scheduled_at,time_zone,created_by)
      VALUES(d->>'key',d->>'name',d->>'eventId',d->'content',ARRAY(SELECT jsonb_array_elements_text(d->'requirements')),'{}',(d->>'scheduledAt')::timestamptz,'America/Bogota',p_actor)
      ON CONFLICT (key) DO NOTHING RETURNING id INTO cid;
      IF cid IS NOT NULL THEN INSERT INTO marketing_audit(campaign_id,actor_id,action) VALUES(cid,p_actor,'draft_created'); END IF;
      cid := NULL;
    END LOOP;
  ELSIF p_action = 'save' THEN
    d := p_payload->'draft';
    SELECT * INTO c FROM marketing_campaigns WHERE key = d->>'key' FOR UPDATE;
    IF FOUND AND (c.status NOT IN ('draft','paused') OR EXISTS (SELECT 1 FROM marketing_deliveries WHERE campaign_id = c.id)) THEN RAISE EXCEPTION 'Campaign copy is locked after queueing'; END IF;
    INSERT INTO marketing_campaigns(key,name,event_id,content,requirements,readiness,scheduled_at,time_zone,created_by)
    VALUES(d->>'key',d->>'name',d->>'eventId',d->'content',ARRAY(SELECT jsonb_array_elements_text(d->'requirements')),d->'readiness',(d->>'scheduledAt')::timestamptz,'America/Bogota',p_actor)
    ON CONFLICT(key) DO UPDATE SET name=EXCLUDED.name,content=EXCLUDED.content,readiness=EXCLUDED.readiness,
      requirements=EXCLUDED.requirements,scheduled_at=EXCLUDED.scheduled_at,updated_at=now() RETURNING id INTO cid;
    INSERT INTO marketing_audit(campaign_id,actor_id,action) VALUES(cid,p_actor,'draft_saved');
  ELSE
    SELECT * INTO c FROM marketing_campaigns WHERE id = (p_payload->>'id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;
    IF p_action = 'schedule' THEN
      IF c.status NOT IN ('draft','paused') OR c.scheduled_at <= now() OR c.scheduled_at IS NULL THEN RAISE EXCEPTION 'Choose a future date for a draft or paused campaign'; END IF;
      IF EXISTS (SELECT 1 FROM unnest(c.requirements) r WHERE coalesce(c.readiness->>r,'false') <> 'true') THEN RAISE EXCEPTION 'Campaign prerequisites are incomplete'; END IF;
      UPDATE marketing_campaigns SET status='scheduled',updated_at=now() WHERE id=c.id;
    ELSIF p_action = 'resume' THEN
      IF c.status <> 'paused' THEN RAISE EXCEPTION 'Campaign is not paused'; END IF;
      IF EXISTS (SELECT 1 FROM unnest(c.requirements) r WHERE coalesce(c.readiness->>r,'false') <> 'true') THEN RAISE EXCEPTION 'Campaign prerequisites are incomplete'; END IF;
      UPDATE marketing_campaigns SET status='scheduled',updated_at=now() WHERE id=c.id;
    ELSIF p_action = 'pause' THEN
      IF c.status NOT IN ('scheduled','sending') THEN RAISE EXCEPTION 'Campaign is not active'; END IF;
      UPDATE marketing_campaigns SET status='paused',updated_at=now() WHERE id=c.id;
    ELSIF p_action = 'cancel' THEN
      IF c.status IN ('completed','cancelled') THEN RAISE EXCEPTION 'Campaign is already closed'; END IF;
      UPDATE marketing_campaigns SET status='cancelled',updated_at=now() WHERE id=c.id;
      UPDATE marketing_deliveries SET status='suppressed',error_code='campaign_cancelled' WHERE campaign_id=c.id AND status='queued';
    ELSE RAISE EXCEPTION 'Unknown campaign action'; END IF;
    INSERT INTO marketing_audit(campaign_id,actor_id,action) VALUES(c.id,p_actor,p_action);
  END IF;
  RETURN marketing_overview();
END;
$$;

CREATE FUNCTION public.marketing_claim(p_limit integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pending_campaign marketing_campaigns; result jsonb;
BEGIN
  -- A lost acknowledgement is uncertain, never an automatic resend.
  UPDATE marketing_deliveries SET status='unknown',error_code='lease_expired_reconcile_provider'
    WHERE status='sending' AND claimed_at < now()-interval '15 minutes';
  FOR pending_campaign IN SELECT * FROM marketing_campaigns WHERE status='scheduled' AND scheduled_at <= now() ORDER BY scheduled_at FOR UPDATE SKIP LOCKED LOOP
    IF pending_campaign.audience_queued_at IS NULL THEN
    INSERT INTO marketing_deliveries(campaign_id,user_id,email,locale)
    SELECT pending_campaign.id,u.id,lower(btrim(u.email)),CASE WHEN u.profile_metadata->>'locale'='en' THEN 'en' ELSE 'es' END
    FROM public."user" u JOIN public.newsletter_subscribers n ON lower(btrim(n.email))=lower(btrim(u.email))
    WHERE u.deleted_at IS NULL AND u.status='active'
      AND NOT EXISTS(SELECT 1 FROM marketing_suppressions s WHERE s.email=lower(btrim(u.email)))
    ORDER BY u.id ON CONFLICT DO NOTHING;
    INSERT INTO marketing_audit(campaign_id,action) VALUES(pending_campaign.id,'audience_queued');
    END IF;
    UPDATE marketing_campaigns SET status='sending',audience_queued_at=coalesce(audience_queued_at,now()),updated_at=now() WHERE id=pending_campaign.id;
  END LOOP;
  UPDATE marketing_deliveries d SET status='suppressed',error_code='consent_or_account_removed'
    WHERE d.status='queued' AND (EXISTS(SELECT 1 FROM marketing_suppressions s WHERE s.email=d.email)
      OR NOT EXISTS(SELECT 1 FROM newsletter_subscribers n WHERE lower(btrim(n.email))=d.email)
      OR NOT EXISTS(SELECT 1 FROM public."user" u WHERE u.id=d.user_id AND u.deleted_at IS NULL AND u.status='active' AND lower(btrim(u.email))=d.email));
  WITH picked AS (
    SELECT d.id FROM marketing_deliveries d JOIN marketing_campaigns c ON c.id=d.campaign_id
    WHERE d.status='queued' AND c.status='sending' ORDER BY d.created_at,d.id LIMIT greatest(1,least(p_limit,50)) FOR UPDATE OF d SKIP LOCKED
  ), claimed AS (
    UPDATE marketing_deliveries d SET status='sending',claim_token=gen_random_uuid(),claimed_at=now()
    FROM picked p WHERE d.id=p.id RETURNING d.*
  ) SELECT coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('content',c.content,'event_id',c.event_id)),'[]') INTO result FROM claimed x JOIN marketing_campaigns c ON c.id=x.campaign_id;
  UPDATE marketing_campaigns c SET status='completed',updated_at=now() WHERE status='sending'
    AND NOT EXISTS(SELECT 1 FROM marketing_deliveries d WHERE d.campaign_id=c.id AND d.status IN ('queued','sending'));
  RETURN result;
END;
$$;

CREATE FUNCTION public.marketing_before_send(p_id uuid,p_claim uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE d marketing_deliveries; allowed boolean;
BEGIN
  SELECT * INTO d FROM marketing_deliveries WHERE id=p_id AND claim_token=p_claim AND status='sending' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM marketing_campaigns WHERE id=d.campaign_id AND status='paused') THEN
    UPDATE marketing_deliveries SET status='queued',claim_token=NULL,claimed_at=NULL WHERE id=d.id;
    RETURN false;
  END IF;
  allowed := EXISTS(SELECT 1 FROM marketing_campaigns WHERE id=d.campaign_id AND status='sending')
    AND EXISTS(SELECT 1 FROM newsletter_subscribers n WHERE lower(btrim(n.email))=d.email)
    AND NOT EXISTS(SELECT 1 FROM marketing_suppressions WHERE email=d.email)
    AND EXISTS(SELECT 1 FROM public."user" WHERE id=d.user_id AND deleted_at IS NULL AND status='active' AND lower(btrim(email))=d.email);
  IF NOT allowed THEN UPDATE marketing_deliveries SET status='suppressed',error_code='cancelled_paused_or_opted_out' WHERE id=d.id; END IF;
  RETURN allowed;
END;
$$;

CREATE FUNCTION public.marketing_ack(p_id uuid,p_claim uuid,p_status text,p_message_id text DEFAULT NULL,p_error text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE cid uuid;
BEGIN
  IF p_status NOT IN ('accepted','failed','unknown') THEN RAISE EXCEPTION 'Invalid acknowledgement'; END IF;
  UPDATE marketing_deliveries SET status=p_status,provider_message_id=p_message_id,error_code=p_error,
    accepted_at=CASE WHEN p_status='accepted' THEN now() ELSE NULL END
    WHERE id=p_id AND claim_token=p_claim AND status='sending' RETURNING campaign_id INTO cid;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO marketing_audit(campaign_id,action) VALUES(cid,'delivery_'||p_status);
  UPDATE marketing_campaigns c SET status='completed',updated_at=now() WHERE id=cid AND status='sending'
    AND NOT EXISTS(SELECT 1 FROM marketing_deliveries d WHERE d.campaign_id=cid AND d.status IN ('queued','sending'));
  RETURN true;
END;
$$;

CREATE FUNCTION public.marketing_unsubscribe(p_token uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE address text;
BEGIN
  SELECT email INTO address FROM marketing_deliveries WHERE unsubscribe_token=p_token;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO marketing_suppressions(email,reason) VALUES(address,'recipient_unsubscribe') ON CONFLICT DO NOTHING;
  DELETE FROM newsletter_subscribers WHERE lower(btrim(email))=address;
  UPDATE marketing_deliveries SET status='suppressed',error_code='recipient_unsubscribe' WHERE email=address AND status='queued';
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.marketing_overview(),public.marketing_campaign_action(uuid,text,jsonb),public.marketing_claim(integer),public.marketing_before_send(uuid,uuid),public.marketing_ack(uuid,uuid,text,text,text),public.marketing_unsubscribe(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_overview(),public.marketing_campaign_action(uuid,text,jsonb),public.marketing_claim(integer),public.marketing_before_send(uuid,uuid),public.marketing_ack(uuid,uuid,text,text,text),public.marketing_unsubscribe(uuid) TO service_role;
COMMIT;
