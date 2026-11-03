BEGIN;

ALTER TABLE public.admin_notification_previews
  ADD COLUMN IF NOT EXISTS notification_expiry_mode text NOT NULL DEFAULT 'never'
    CHECK (notification_expiry_mode IN ('never', 'at_time', 'after_delivery', 'after_read')),
  ADD COLUMN IF NOT EXISTS notification_expires_after_seconds integer
    CHECK (notification_expires_after_seconds BETWEEN 60 AND 2419200);

ALTER TABLE public.admin_notification_campaigns
  ADD COLUMN IF NOT EXISTS expiry_mode text NOT NULL DEFAULT 'never'
    CHECK (expiry_mode IN ('never', 'at_time', 'after_delivery', 'after_read')),
  ADD COLUMN IF NOT EXISTS expires_after_seconds integer
    CHECK (expires_after_seconds BETWEEN 60 AND 2419200);

UPDATE public.admin_notification_previews
SET notification_expiry_mode = 'at_time'
WHERE notification_expires_at IS NOT NULL;

UPDATE public.admin_notification_campaigns
SET expiry_mode = 'at_time'
WHERE expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.archive_one_time_admin_notification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.is_read IS DISTINCT FROM true
     AND NEW.is_read IS TRUE
     AND NEW.type = 'admin_announcement'
     AND NEW.data->>'dismissOnRead' = 'true' THEN
    NEW.is_archived := true;
    NEW.archived_at := COALESCE(NEW.archived_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_archive_one_time_admin ON public.notifications;
CREATE TRIGGER notifications_archive_one_time_admin
  BEFORE UPDATE OF is_read ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_one_time_admin_notification();

DROP FUNCTION IF EXISTS public.admin_create_notification_campaign(uuid, text, text, text, text, boolean, boolean, jsonb, uuid[], timestamptz, timestamptz);

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
  p_expires_at timestamptz,
  p_expiry_mode text,
  p_expires_after_seconds integer
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
  v_effective_expires_at timestamptz;
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
  IF p_expiry_mode IS NULL OR p_expiry_mode NOT IN ('never', 'at_time', 'after_delivery', 'after_read') THEN
    RAISE EXCEPTION 'Invalid notification expiry mode' USING ERRCODE = '22023';
  END IF;
  IF p_expiry_mode = 'at_time' AND p_expires_at IS NULL THEN
    RAISE EXCEPTION 'An expiry timestamp is required for at-time notifications' USING ERRCODE = '22023';
  END IF;
  IF p_expiry_mode <> 'at_time' AND p_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'Expiry timestamp is only valid for at-time notifications' USING ERRCODE = '22023';
  END IF;
  IF p_expiry_mode = 'after_delivery'
     AND (p_expires_after_seconds IS NULL OR p_expires_after_seconds NOT BETWEEN 60 AND 2419200) THEN
    RAISE EXCEPTION 'Delivery expiry must be between 1 minute and 28 days' USING ERRCODE = '22023';
  END IF;
  IF p_expiry_mode <> 'after_delivery' AND p_expires_after_seconds IS NOT NULL THEN
    RAISE EXCEPTION 'Expiry duration is only valid for delivery-based expiry' USING ERRCODE = '22023';
  END IF;
  IF p_expiry_mode = 'at_time' AND p_expires_at <= COALESCE(p_scheduled_at, now()) THEN
    RAISE EXCEPTION 'Notification expiry must be later than its send time' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_is_test, false) AND p_scheduled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Test notifications cannot be scheduled' USING ERRCODE = '22023';
  END IF;

  v_effective_expires_at := CASE p_expiry_mode
    WHEN 'at_time' THEN p_expires_at
    WHEN 'after_delivery' THEN CASE
      WHEN v_is_scheduled THEN NULL
      ELSE now() + make_interval(secs => p_expires_after_seconds)
    END
    ELSE NULL
  END;

  INSERT INTO public.admin_notification_campaigns (
    id, created_by, title, message, level, deep_link, push_requested,
    is_test, audience, status, scheduled_at, expires_at, recipient_ids,
    recipient_count, expiry_mode, expires_after_seconds
  ) VALUES (
    v_campaign_id, p_actor_id, btrim(p_title), btrim(p_message), p_level,
    NULLIF(btrim(p_deep_link), ''), COALESCE(p_push_requested, false),
    COALESCE(p_is_test, false), COALESCE(p_audience, '{}'::jsonb),
    CASE WHEN v_is_scheduled THEN 'scheduled' ELSE 'sending' END,
    p_scheduled_at, v_effective_expires_at,
    ARRAY(SELECT DISTINCT requested.recipient_id FROM unnest(p_recipient_ids) AS requested(recipient_id)),
    cardinality(p_recipient_ids), p_expiry_mode, p_expires_after_seconds
  );

  IF v_is_scheduled THEN
    RETURN jsonb_build_object(
      'campaign_id', v_campaign_id,
      'recipient_count', cardinality(p_recipient_ids),
      'scheduled', true,
      'scheduled_at', p_scheduled_at,
      'expires_at', v_effective_expires_at,
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
        'adminNotificationCampaignId', v_campaign_id,
        'dismissOnRead', CASE WHEN p_expiry_mode = 'after_read' THEN true ELSE NULL END
      )), v_effective_expires_at
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
    'expires_at', v_effective_expires_at,
    'push_requested', COALESCE(p_push_requested, false),
    'push_device_count', v_push_device_count
  );
END;
$$;

-- Preserve the original RPC contract for older app clients during rollout.
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT public.admin_create_notification_campaign(
    p_actor_id, p_title, p_message, p_level, p_deep_link, p_push_requested,
    p_is_test, p_audience, p_recipient_ids, p_scheduled_at, p_expires_at,
    CASE WHEN p_expires_at IS NULL THEN 'never' ELSE 'at_time' END::text,
    NULL::integer
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_send_notification_preview(
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
    v_preview.notification_expires_at,
    CASE
      WHEN v_preview.notification_expiry_mode = 'never'
        AND v_preview.notification_expires_at IS NOT NULL THEN 'at_time'
      ELSE v_preview.notification_expiry_mode
    END,
    v_preview.notification_expires_after_seconds
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

  IF v_campaign.expiry_mode = 'after_delivery' THEN
    v_campaign.expires_at := now() + make_interval(secs => v_campaign.expires_after_seconds);
  END IF;

  UPDATE public.admin_notification_campaigns
  SET status = 'sending',
      expires_at = v_campaign.expires_at
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
        'adminNotificationCampaignId', v_campaign.id,
        'dismissOnRead', CASE WHEN v_campaign.expiry_mode = 'after_read' THEN true ELSE NULL END
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
    'expiry_mode', v_campaign.expiry_mode,
    'expires_after_seconds', v_campaign.expires_after_seconds,
    'recipient_count', v_recipient_count,
    'push_device_count', v_push_device_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_notification_campaign(uuid,text,text,text,text,boolean,boolean,jsonb,uuid[],timestamptz,timestamptz, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_create_notification_campaign(uuid,text,text,text,text,boolean,boolean,jsonb,uuid[],timestamptz,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_send_notification_preview(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_claim_due_notification_campaign() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_create_notification_campaign(uuid,text,text,text,text,boolean,boolean,jsonb,uuid[],timestamptz,timestamptz, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_create_notification_campaign(uuid,text,text,text,text,boolean,boolean,jsonb,uuid[],timestamptz,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_send_notification_preview(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_claim_due_notification_campaign() TO service_role;

COMMIT;
