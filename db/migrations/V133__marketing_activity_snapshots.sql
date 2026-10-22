BEGIN;
CREATE TABLE public.marketing_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  event_key text NOT NULL, kind text NOT NULL, event_id text,
  source text NOT NULL CHECK (source IN ('verified_server','observed_client')),
  provisional_points integer NOT NULL CHECK (provisional_points IN (0,1)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,event_key)
);
CREATE INDEX marketing_activity_cutoff ON public.marketing_activity(created_at,user_id);
CREATE TABLE public.marketing_activity_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), cutoff timestamptz NOT NULL,
  network text NOT NULL DEFAULT 'testnet' CHECK(network='testnet'),
  status text NOT NULL DEFAULT 'unpublished' CHECK(status='unpublished'),
  rules_version text NOT NULL DEFAULT 'pending-announcement-v1',
  manifest jsonb NOT NULL, digest text NOT NULL CHECK(digest ~ '^[0-9a-f]{64}$'),
  user_count integer NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cutoff,digest)
);
ALTER TABLE public.marketing_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_activity_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.marketing_activity,public.marketing_activity_snapshots FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.marketing_activity,public.marketing_activity_snapshots TO service_role;

CREATE FUNCTION public.record_marketing_activity(p_user uuid,p_key text,p_kind text,p_event text DEFAULT NULL,p_source text DEFAULT 'verified_server')
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  INSERT INTO marketing_activity(user_id,event_key,kind,event_id,source,provisional_points)
  SELECT p_user,left(p_key,220),left(p_kind,60),p_event,p_source,CASE WHEN p_source='verified_server' THEN 1 ELSE 0 END
  WHERE EXISTS(SELECT 1 FROM public."user" WHERE id=p_user AND deleted_at IS NULL AND status='active')
  ON CONFLICT(user_id,event_key) DO NOTHING;
$$;

CREATE FUNCTION public.marketing_activity_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE actor uuid; peer uuid; topic text; edge text;
BEGIN
  IF TG_TABLE_NAME='user_agenda_status' THEN
    IF NEW.agenda_id IS NULL THEN RETURN NEW; END IF;
    IF NEW.is_favorite AND (TG_OP='INSERT' OR NOT coalesce(OLD.is_favorite,false)) THEN
      PERFORM record_marketing_activity(NEW.user_id,'agenda:'||NEW.event_id||':'||NEW.agenda_id||':favorite','agenda_favorited',NEW.event_id);
    END IF;
    IF NEW.status='confirmed' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
      PERFORM record_marketing_activity(NEW.user_id,'agenda:'||NEW.event_id||':'||NEW.agenda_id||':confirmed','agenda_confirmed',NEW.event_id);
    END IF;
  ELSIF TG_TABLE_NAME='meeting_requests' THEN
    SELECT id INTO actor FROM public."user" WHERE provider_ids->>'supabase'=NEW.requester_id::text OR id=NEW.requester_id ORDER BY id LIMIT 1;
    IF TG_OP='INSERT' THEN
      PERFORM record_marketing_activity(actor,'meeting:'||NEW.id||':requested','meeting_requested',NEW.event_id);
    ELSIF NEW.status::text IN ('accepted','approved') AND OLD.status::text IS DISTINCT FROM NEW.status::text THEN
      SELECT id INTO peer FROM public."user" WHERE provider_ids->>'supabase'=NEW.speaker_id::text OR id=NEW.speaker_id ORDER BY id LIMIT 1;
      PERFORM record_marketing_activity(actor,'meeting:'||NEW.id||':accepted','meeting_accepted',NEW.event_id);
      PERFORM record_marketing_activity(peer,'meeting:'||NEW.id||':accepted','meeting_accepted',NEW.event_id);
    END IF;
  ELSIF TG_TABLE_NAME='contact_requests' THEN
    edge := 'contact:'||NEW.id;
    IF TG_OP='INSERT' THEN
      PERFORM record_marketing_activity(NEW.sender,edge||':requested','contact_requested');
    ELSIF NEW.status='accepted' AND OLD.status IS DISTINCT FROM NEW.status THEN
      PERFORM record_marketing_activity(NEW.sender,edge||':connected','contact_connected');
      PERFORM record_marketing_activity(NEW.recipient,edge||':connected','contact_connected');
    END IF;
  ELSIF TG_TABLE_NAME='contact_profiles' THEN
    FOR topic IN SELECT unnest(NEW.topics) EXCEPT SELECT unnest(CASE WHEN TG_OP='INSERT' THEN '{}'::text[] ELSE OLD.topics END) LOOP
      PERFORM record_marketing_activity(NEW.id,'interest:'||topic,'interest_selected');
    END LOOP;
  ELSIF TG_TABLE_NAME='user' AND TG_OP='INSERT' THEN
    PERFORM record_marketing_activity(NEW.id,'account:registered','account_registered');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER marketing_agenda_activity AFTER INSERT OR UPDATE ON public.user_agenda_status FOR EACH ROW EXECUTE FUNCTION public.marketing_activity_trigger();
CREATE TRIGGER marketing_meeting_activity AFTER INSERT OR UPDATE ON public.meeting_requests FOR EACH ROW EXECUTE FUNCTION public.marketing_activity_trigger();
CREATE TRIGGER marketing_contact_activity AFTER INSERT OR UPDATE ON public.contact_requests FOR EACH ROW EXECUTE FUNCTION public.marketing_activity_trigger();
CREATE TRIGGER marketing_interest_activity AFTER INSERT OR UPDATE ON public.contact_profiles FOR EACH ROW EXECUTE FUNCTION public.marketing_activity_trigger();
CREATE TRIGGER marketing_account_activity AFTER INSERT ON public."user" FOR EACH ROW EXECUTE FUNCTION public.marketing_activity_trigger();

CREATE FUNCTION public.marketing_snapshot_preview(p_cutoff timestamptz) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.user_id),'[]') FROM (
   SELECT user_id,count(*)::int AS interactions,sum(provisional_points)::int AS provisional_points
   FROM marketing_activity WHERE source='verified_server' AND created_at <= p_cutoff GROUP BY user_id
 ) t;
$$;
CREATE FUNCTION public.marketing_prepare_snapshot(p_actor uuid,p_cutoff timestamptz,p_manifest jsonb,p_digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result marketing_activity_snapshots;
BEGIN
  IF p_cutoff > now()-interval '1 minute' THEN RAISE EXCEPTION 'Choose a cutoff at least one minute in the past'; END IF;
  IF p_manifest IS DISTINCT FROM marketing_snapshot_preview(p_cutoff) THEN RAISE EXCEPTION 'Snapshot changed; reload and prepare again'; END IF;
  INSERT INTO marketing_activity_snapshots(cutoff,manifest,digest,user_count,created_by)
  VALUES(p_cutoff,p_manifest,p_digest,jsonb_array_length(p_manifest),p_actor)
  ON CONFLICT(cutoff,digest) DO UPDATE SET digest=EXCLUDED.digest RETURNING * INTO result;
  RETURN to_jsonb(result)-'manifest';
END;
$$;
-- The conflict path above is an idempotent no-op. No API exposes UPDATE/DELETE.
CREATE FUNCTION public.marketing_activity_overview() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object(
   'activity',jsonb_build_object('verified',(SELECT count(*) FROM marketing_activity WHERE source='verified_server'),'observed',(SELECT count(*) FROM marketing_activity WHERE source='observed_client'),'points',(SELECT coalesce(sum(provisional_points),0) FROM marketing_activity WHERE source='verified_server')),
   'snapshots',coalesce((SELECT jsonb_agg(to_jsonb(s)-'manifest'-'created_by') FROM (SELECT * FROM marketing_activity_snapshots ORDER BY created_at DESC LIMIT 20) s),'[]')
 );
$$;
REVOKE ALL ON FUNCTION public.record_marketing_activity(uuid,text,text,text,text),public.marketing_activity_trigger(),public.marketing_snapshot_preview(timestamptz),public.marketing_prepare_snapshot(uuid,timestamptz,jsonb,text),public.marketing_activity_overview() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_marketing_activity(uuid,text,text,text,text),public.marketing_snapshot_preview(timestamptz),public.marketing_prepare_snapshot(uuid,timestamptz,jsonb,text),public.marketing_activity_overview() TO service_role;
COMMIT;
