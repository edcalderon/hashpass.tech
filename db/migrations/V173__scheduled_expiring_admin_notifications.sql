BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS notifications_active_user_created_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE expires_at IS NULL;
CREATE INDEX IF NOT EXISTS notifications_expiring_user_created_idx
  ON public.notifications (user_id, expires_at, created_at DESC)
  WHERE expires_at IS NOT NULL;

ALTER TABLE public.admin_notification_previews
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_expires_at timestamptz;

ALTER TABLE public.admin_notification_campaigns
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS recipient_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[];

ALTER TABLE public.admin_notification_campaigns
  DROP CONSTRAINT IF EXISTS admin_notification_campaigns_status_check;
ALTER TABLE public.admin_notification_campaigns
  ADD CONSTRAINT admin_notification_campaigns_status_check
  CHECK (status IN ('scheduled', 'sending', 'sent', 'partial', 'failed', 'expired', 'cancelled'));

CREATE TABLE IF NOT EXISTS public.admin_notification_push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.admin_notification_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_id uuid NOT NULL REFERENCES public.notification_push_tokens(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  claim_token uuid,
  claimed_at timestamptz,
  provider_ticket_id text,
  push_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, token_id)
);

CREATE INDEX IF NOT EXISTS admin_notification_push_deliveries_pending_idx
  ON public.admin_notification_push_deliveries (available_at, created_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.admin_notification_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_notification_push_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.admin_notification_push_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.admin_finalize_notification_campaign(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign public.admin_notification_campaigns;
  v_sent integer := 0;
  v_failed integer := 0;
  v_skipped integer := 0;
BEGIN
  SELECT * INTO v_campaign
  FROM public.admin_notification_campaigns
  WHERE id = p_campaign_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_campaign.status <> 'sending' THEN
    RETURN jsonb_build_object('finalized', true, 'status', v_campaign.status);
  END IF;
  IF NOT v_campaign.push_requested THEN
    UPDATE public.admin_notification_campaigns
    SET status = 'sent', completed_at = now()
    WHERE id = p_campaign_id;
    RETURN jsonb_build_object('finalized', true, 'status', 'sent');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.admin_notification_push_deliveries
    WHERE campaign_id = p_campaign_id AND status IN ('pending', 'processing')
  ) THEN
    RETURN jsonb_build_object('finalized', false, 'status', 'sending');
  END IF;

  UPDATE public.admin_notification_deliveries d
  SET push_status = CASE
        WHEN EXISTS (
          SELECT 1 FROM public.admin_notification_push_deliveries p
          WHERE p.campaign_id = d.campaign_id AND p.user_id = d.user_id AND p.status = 'sent'
        ) THEN 'sent'
        WHEN EXISTS (
          SELECT 1 FROM public.admin_notification_push_deliveries p
          WHERE p.campaign_id = d.campaign_id AND p.user_id = d.user_id AND p.status = 'failed'
        ) THEN 'failed'
        ELSE 'skipped'
      END,
      push_error = CASE
        WHEN EXISTS (
          SELECT 1 FROM public.admin_notification_push_deliveries p
          WHERE p.campaign_id = d.campaign_id AND p.user_id = d.user_id AND p.status = 'failed'
        ) AND NOT EXISTS (
          SELECT 1 FROM public.admin_notification_push_deliveries p
          WHERE p.campaign_id = d.campaign_id AND p.user_id = d.user_id AND p.status = 'sent'
        ) THEN 'Push service did not accept any registered device for this account'
        ELSE NULL
      END,
      push_ticket_ids = COALESCE((
        SELECT jsonb_agg(p.provider_ticket_id)
        FROM public.admin_notification_push_deliveries p
        WHERE p.campaign_id = d.campaign_id AND p.user_id = d.user_id
          AND p.provider_ticket_id IS NOT NULL
      ), '[]'::jsonb),
      updated_at = now()
  WHERE d.campaign_id = p_campaign_id;

  SELECT
    count(*) FILTER (WHERE push_status = 'sent')::integer,
    count(*) FILTER (WHERE push_status = 'failed')::integer,
    count(*) FILTER (WHERE push_status = 'skipped')::integer
  INTO v_sent, v_failed, v_skipped
  FROM public.admin_notification_deliveries
  WHERE campaign_id = p_campaign_id;

  UPDATE public.admin_notification_campaigns
  SET status = CASE WHEN v_failed > 0 THEN 'partial' ELSE 'sent' END,
      push_sent_count = v_sent,
      push_failed_count = v_failed,
      push_skipped_count = v_skipped,
      push_error = CASE WHEN v_failed > 0 THEN 'Push delivery failed for one or more accounts' ELSE NULL END,
      completed_at = now()
  WHERE id = p_campaign_id;

  RETURN jsonb_build_object(
    'finalized', true,
    'status', CASE WHEN v_failed > 0 THEN 'partial' ELSE 'sent' END,
    'push_sent_count', v_sent,
    'push_failed_count', v_failed,
    'push_skipped_count', v_skipped
  );
END;
$$;

DROP FUNCTION IF EXISTS public.admin_send_notification_preview(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_create_notification_campaign(uuid, text, text, text, text, boolean, boolean, jsonb, uuid[]);

CREATE FUNCTION public.admin_create_notification_campaign(
  p_actor_id uuid,
  p_title text,
  p_message text,
  p_level text,
  p_deep_link text,
  p_push_requested boolean,
  p_is_test boolean,
  p_audience jsonb,
  p_recipient_ids uuid[],
  p_scheduled_at timestamptz,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_campaign_id uuid := gen_random_uuid();
  v_recipient_count integer := 0;
  v_push_device_count integer := 0;
  v_is_scheduled boolean := p_scheduled_at IS NOT NULL;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = p_actor_id
      AND r.role IN ('admin', 'super_admin')
      AND (r.expires_at IS NULL OR r.expires_at > now())
  ) THEN
    RAISE EXCEPTION 'Forbidden: active global administrator required'
      USING ERRCODE = '42501';
  END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 120
     OR p_message IS NULL OR length(btrim(p_message)) NOT BETWEEN 1 AND 2000
     OR p_level IS NULL OR p_level NOT IN ('info', 'important') THEN
    RAISE EXCEPTION 'Invalid notification content' USING ERRCODE = '22023';
  END IF;
  IF cardinality(COALESCE(p_recipient_ids, ARRAY[]::uuid[])) = 0
     OR cardinality(p_recipient_ids) > 10000 THEN
    RAISE EXCEPTION 'Recipient list must contain between 1 and 10000 users'
      USING ERRCODE = '22023';
  END IF;
  IF p_scheduled_at IS NOT NULL AND p_scheduled_at <= now() THEN
    RAISE EXCEPTION 'Scheduled time must be in the future' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at IS NOT NULL AND p_expires_at <= COALESCE(p_scheduled_at, now()) THEN
    RAISE EXCEPTION 'Notification expiry must be later than its send time' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_is_test, false) AND p_scheduled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Test notifications cannot be scheduled' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.admin_notification_campaigns (
    id, created_by, title, message, level, deep_link, push_requested,
    is_test, audience, status, scheduled_at, expires_at, recipient_ids,
    recipient_count
  ) VALUES (
    v_campaign_id, p_actor_id, btrim(p_title), btrim(p_message), p_level,
    NULLIF(btrim(p_deep_link), ''), COALESCE(p_push_requested, false),
    COALESCE(p_is_test, false), COALESCE(p_audience, '{}'::jsonb),
    CASE WHEN v_is_scheduled THEN 'scheduled' ELSE 'sending' END,
    p_scheduled_at, p_expires_at,
    ARRAY(SELECT DISTINCT requested.recipient_id FROM unnest(p_recipient_ids) AS requested(recipient_id)),
    cardinality(p_recipient_ids)
  );

  IF v_is_scheduled THEN
    RETURN jsonb_build_object(
      'campaign_id', v_campaign_id,
      'recipient_count', cardinality(p_recipient_ids),
      'scheduled', true,
      'scheduled_at', p_scheduled_at,
      'expires_at', p_expires_at,
      'push_requested', COALESCE(p_push_requested, false),
      'push_device_count', 0
    );
  END IF;

  WITH recipients AS (
    SELECT DISTINCT requested.recipient_id AS user_id
    FROM unnest(p_recipient_ids) AS requested(recipient_id)
  ), inserted_notifications AS (
    INSERT INTO public.notifications (
      user_id, type, title, message, is_read, is_urgent, level, data, expires_at
    )
    SELECT r.user_id, 'admin_announcement', btrim(p_title), btrim(p_message), false,
      p_level = 'important', p_level,
      jsonb_strip_nulls(jsonb_build_object(
        'deepLink', NULLIF(btrim(p_deep_link), ''),
        'adminNotificationCampaignId', v_campaign_id
      )), p_expires_at
    FROM recipients r
    JOIN auth.users au ON au.id = r.user_id AND au.deleted_at IS NULL
    JOIN public."user" registry
      ON registry.provider_ids->>'supabase' = r.user_id::text
     AND registry.status = 'active'
     AND registry.deleted_at IS NULL
    RETURNING id AS notification_id, user_id
  ), inserted_deliveries AS (
    INSERT INTO public.admin_notification_deliveries (
      campaign_id, user_id, notification_id, push_status
    )
    SELECT v_campaign_id, i.user_id, i.notification_id,
      CASE WHEN COALESCE(p_push_requested, false) THEN 'pending' ELSE 'not_requested' END
    FROM inserted_notifications i
    RETURNING user_id, notification_id
  )
  SELECT count(*)::integer
  INTO v_recipient_count
  FROM inserted_deliveries;

  IF v_recipient_count = 0 THEN
    RAISE EXCEPTION 'No active linked users remain in this audience'
      USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_push_requested, false) THEN
    INSERT INTO public.admin_notification_push_deliveries (campaign_id, user_id, token_id)
    SELECT v_campaign_id, d.user_id, token.id
    FROM public.admin_notification_deliveries d
    JOIN public.notification_push_tokens token
      ON token.user_id = d.user_id AND token.enabled = true
    WHERE d.campaign_id = v_campaign_id
    ON CONFLICT (campaign_id, token_id) DO NOTHING;
    GET DIAGNOSTICS v_push_device_count = ROW_COUNT;
  END IF;

  UPDATE public.admin_notification_campaigns
  SET recipient_count = v_recipient_count,
      in_app_sent_count = v_recipient_count
  WHERE id = v_campaign_id;

  PERFORM public.admin_finalize_notification_campaign(v_campaign_id);

  RETURN jsonb_build_object(
    'campaign_id', v_campaign_id,
    'recipient_count', v_recipient_count,
    'scheduled', false,
    'scheduled_at', NULL,
    'expires_at', p_expires_at,
    'push_requested', COALESCE(p_push_requested, false),
    'push_device_count', v_push_device_count
  );
END;
$$;

CREATE FUNCTION public.admin_send_notification_preview(
  p_actor_id uuid,
  p_preview_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_preview public.admin_notification_previews;
  v_result jsonb;
BEGIN
  SELECT * INTO v_preview
  FROM public.admin_notification_previews
  WHERE id = p_preview_id
  FOR UPDATE;

  IF NOT FOUND OR v_preview.created_by <> p_actor_id THEN
    RAISE EXCEPTION 'Preview not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_preview.consumed_at IS NOT NULL OR v_preview.expires_at <= now() THEN
    RAISE EXCEPTION 'Preview expired or already used' USING ERRCODE = '22023';
  END IF;

  v_result := public.admin_create_notification_campaign(
    p_actor_id,
    v_preview.title,
    v_preview.message,
    v_preview.level,
    v_preview.deep_link,
    v_preview.push_requested,
    false,
    v_preview.audience,
    v_preview.recipient_ids,
    v_preview.scheduled_at,
    v_preview.notification_expires_at
  );

  UPDATE public.admin_notification_previews
  SET consumed_at = now()
  WHERE id = p_preview_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_claim_due_notification_campaign()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_campaign public.admin_notification_campaigns;
  v_recipient_count integer := 0;
  v_push_device_count integer := 0;
BEGIN
  UPDATE public.admin_notification_campaigns
  SET status = 'expired', completed_at = now()
  WHERE status = 'scheduled'
    AND expires_at IS NOT NULL
    AND expires_at <= now();

  SELECT * INTO v_campaign
  FROM public.admin_notification_campaigns
  WHERE status = 'scheduled'
    AND scheduled_at <= now()
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY scheduled_at, id
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.admin_notification_campaigns
  SET status = 'sending'
  WHERE id = v_campaign.id;

  WITH recipients AS (
    SELECT DISTINCT requested.recipient_id AS user_id
    FROM unnest(v_campaign.recipient_ids) AS requested(recipient_id)
  ), inserted_notifications AS (
    INSERT INTO public.notifications (
      user_id, type, title, message, is_read, is_urgent, level, data, expires_at
    )
    SELECT r.user_id, 'admin_announcement', v_campaign.title, v_campaign.message, false,
      v_campaign.level = 'important', v_campaign.level,
      jsonb_strip_nulls(jsonb_build_object(
        'deepLink', v_campaign.deep_link,
        'adminNotificationCampaignId', v_campaign.id
      )), v_campaign.expires_at
    FROM recipients r
    JOIN auth.users au ON au.id = r.user_id AND au.deleted_at IS NULL
    JOIN public."user" registry
      ON registry.provider_ids->>'supabase' = r.user_id::text
     AND registry.status = 'active'
     AND registry.deleted_at IS NULL
    RETURNING id AS notification_id, user_id
  ), inserted_deliveries AS (
    INSERT INTO public.admin_notification_deliveries (
      campaign_id, user_id, notification_id, push_status
    )
    SELECT v_campaign.id, i.user_id, i.notification_id,
      CASE WHEN v_campaign.push_requested THEN 'pending' ELSE 'not_requested' END
    FROM inserted_notifications i
    RETURNING user_id, notification_id
  )
  SELECT count(*)::integer
  INTO v_recipient_count
  FROM inserted_deliveries;

  IF v_recipient_count = 0 THEN
    UPDATE public.admin_notification_campaigns
    SET status = 'failed',
        recipient_count = 0,
        in_app_sent_count = 0,
        push_error = 'No active linked users remained in the saved audience',
        completed_at = now()
    WHERE id = v_campaign.id;
    RETURN jsonb_build_object('campaign_id', v_campaign.id, 'status', 'failed');
  END IF;

  IF v_campaign.push_requested THEN
    INSERT INTO public.admin_notification_push_deliveries (campaign_id, user_id, token_id)
    SELECT v_campaign.id, d.user_id, token.id
    FROM public.admin_notification_deliveries d
    JOIN public.notification_push_tokens token
      ON token.user_id = d.user_id AND token.enabled = true
    WHERE d.campaign_id = v_campaign.id
    ON CONFLICT (campaign_id, token_id) DO NOTHING;
    GET DIAGNOSTICS v_push_device_count = ROW_COUNT;
  END IF;

  UPDATE public.admin_notification_campaigns
  SET recipient_count = v_recipient_count,
      in_app_sent_count = v_recipient_count
  WHERE id = v_campaign.id;

  PERFORM public.admin_finalize_notification_campaign(v_campaign.id);

  RETURN jsonb_build_object(
    'campaign_id', v_campaign.id,
    'title', v_campaign.title,
    'message', v_campaign.message,
    'level', v_campaign.level,
    'deep_link', v_campaign.deep_link,
    'push_requested', v_campaign.push_requested,
    'expires_at', v_campaign.expires_at,
    'recipient_count', v_recipient_count,
    'push_device_count', v_push_device_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_claim_notification_push_batch(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_campaign public.admin_notification_campaigns;
  v_claim_token uuid := gen_random_uuid();
  v_jobs jsonb := '[]'::jsonb;
BEGIN
  UPDATE public.admin_notification_push_deliveries p
  SET status = CASE WHEN p.attempts >= 5 THEN 'failed' ELSE 'pending' END,
      available_at = now() + interval '1 minute',
      claim_token = NULL,
      claimed_at = NULL,
      push_error = COALESCE(p.push_error, 'Push worker claim expired; delivery will be retried'),
      updated_at = now()
  WHERE p.status = 'processing'
    AND p.claimed_at < now() - interval '2 minutes';

  UPDATE public.admin_notification_push_deliveries p
  SET status = 'skipped',
      push_error = CASE WHEN c.expires_at IS NOT NULL AND c.expires_at <= now()
        THEN 'Notification expired before push delivery'
        ELSE 'Push device was disabled before delivery' END,
      updated_at = now()
  FROM public.admin_notification_campaigns c
  WHERE c.id = p.campaign_id
    AND p.status = 'pending'
    AND (
      (c.expires_at IS NOT NULL AND c.expires_at <= now())
      OR NOT EXISTS (
        SELECT 1 FROM public.notification_push_tokens token
        WHERE token.id = p.token_id AND token.enabled = true
      )
    );

  FOR v_campaign IN
    SELECT DISTINCT c.*
    FROM public.admin_notification_campaigns c
    JOIN public.admin_notification_push_deliveries p ON p.campaign_id = c.id
    WHERE c.status = 'sending'
    LOOP
      PERFORM public.admin_finalize_notification_campaign(v_campaign.id);
  END LOOP;

  SELECT c.* INTO v_campaign
  FROM public.admin_notification_campaigns c
  WHERE c.status = 'sending'
    AND (c.expires_at IS NULL OR c.expires_at > now())
    AND EXISTS (
      SELECT 1
      FROM public.admin_notification_push_deliveries p
      WHERE p.campaign_id = c.id
        AND p.status = 'pending'
        AND p.available_at <= now()
    )
  ORDER BY c.created_at, c.id
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  WITH selected_jobs AS (
    SELECT delivery.id
    FROM public.admin_notification_push_deliveries delivery
    WHERE delivery.campaign_id = v_campaign.id
      AND delivery.status = 'pending'
      AND delivery.available_at <= now()
      AND EXISTS (
        SELECT 1 FROM public.notification_push_tokens token
        WHERE token.id = delivery.token_id AND token.enabled = true
      )
    ORDER BY delivery.available_at, delivery.created_at, delivery.id
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 20))
    FOR UPDATE OF delivery SKIP LOCKED
  ), claimed_jobs AS (
    UPDATE public.admin_notification_push_deliveries p
    SET status = 'processing',
        claim_token = v_claim_token,
        claimed_at = now(),
        attempts = attempts + 1,
        updated_at = now()
    FROM selected_jobs s
    WHERE p.id = s.id
    RETURNING p.id, p.user_id, p.token_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', job.id,
    'user_id', job.user_id,
    'token_id', token.id,
    'token', token.token,
    'platform', token.platform,
    'subscription', token.subscription
  )), '[]'::jsonb)
  INTO v_jobs
  FROM claimed_jobs job
  JOIN public.notification_push_tokens token ON token.id = job.token_id AND token.enabled = true;

  IF jsonb_array_length(v_jobs) = 0 THEN
    PERFORM public.admin_finalize_notification_campaign(v_campaign.id);
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'claim_token', v_claim_token,
    'campaign_id', v_campaign.id,
    'title', v_campaign.title,
    'message', v_campaign.message,
    'level', v_campaign.level,
    'deep_link', v_campaign.deep_link,
    'expires_at', v_campaign.expires_at,
    'jobs', v_jobs
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ack_notification_push_batch(p_claim_token uuid, p_results jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item jsonb;
  v_job record;
  v_campaign_id uuid;
  v_campaign_ids uuid[] := ARRAY[]::uuid[];
  v_acknowledged integer := 0;
  v_status text;
BEGIN
  IF p_claim_token IS NULL OR p_results IS NULL OR jsonb_typeof(p_results) <> 'array' THEN
    RAISE EXCEPTION 'Invalid push batch acknowledgement' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_results) > 20 THEN
    RAISE EXCEPTION 'Invalid push batch acknowledgement' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_results)
  LOOP
    v_status := v_item->>'status';
    IF v_status IS NULL OR v_status NOT IN ('sent', 'failed', 'retry') THEN
      RAISE EXCEPTION 'Invalid push delivery status' USING ERRCODE = '22023';
    END IF;
    UPDATE public.admin_notification_push_deliveries p
    SET status = CASE
          WHEN v_status = 'retry' AND p.attempts < 5 THEN 'pending'
          WHEN v_status = 'retry' THEN 'failed'
          ELSE v_status
        END,
        available_at = CASE WHEN v_status = 'retry' AND p.attempts < 5
          THEN now() + interval '1 minute' ELSE p.available_at END,
        provider_ticket_id = NULLIF(left(v_item->>'ticketId', 512), ''),
        push_error = NULLIF(left(v_item->>'error', 300), ''),
        claim_token = NULL,
        claimed_at = NULL,
        updated_at = now()
    WHERE p.id = (v_item->>'id')::uuid
      AND p.claim_token = p_claim_token
      AND p.status = 'processing'
    RETURNING p.campaign_id, p.token_id INTO v_job;

    IF FOUND THEN
      v_acknowledged := v_acknowledged + 1;
      v_campaign_ids := array_append(v_campaign_ids, v_job.campaign_id);
      IF v_item->>'disableToken' = 'true' THEN
        UPDATE public.notification_push_tokens
        SET enabled = false, updated_at = now()
        WHERE id = v_job.token_id;
      END IF;
    END IF;
  END LOOP;

  FOREACH v_campaign_id IN ARRAY v_campaign_ids
  LOOP
    PERFORM public.admin_finalize_notification_campaign(v_campaign_id);
  END LOOP;

  RETURN jsonb_build_object('acknowledged', v_acknowledged);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_notification_campaign(uuid,text,text,text,text,boolean,boolean,jsonb,uuid[],timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_send_notification_preview(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_claim_due_notification_campaign() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_finalize_notification_campaign(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_claim_notification_push_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_ack_notification_push_batch(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_notification_campaign(uuid,text,text,text,text,boolean,boolean,jsonb,uuid[],timestamptz,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_send_notification_preview(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_claim_due_notification_campaign() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_finalize_notification_campaign(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_claim_notification_push_batch(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_ack_notification_push_batch(uuid,jsonb) TO service_role;

COMMIT;
