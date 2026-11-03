BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS data jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
    'meeting_request', 'meeting_accepted', 'meeting_declined', 'meeting_reminder',
    'meeting_expired', 'meeting_cancelled', 'meeting_slot_conflict', 'boost_received',
    'system_alert', 'chat_message', 'business_invite_pending',
    'business_invite_review_required', 'business_invite_rejected',
    'business_invite_approved', 'speaker_claim_review_required',
    'speaker_claim_approved', 'speaker_claim_rejected',
    'ticket_claim_review_required', 'marketing_campaign_approval_requested',
    'marketing_campaign_approved', 'marketing_campaign_declined',
    'marketing_campaign_cancelled', 'admin_announcement'
  ])) NOT VALID;

CREATE TABLE IF NOT EXISTS public.notification_push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  subscription jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_push_tokens_user_enabled_idx
  ON public.notification_push_tokens (user_id) WHERE enabled = true;

CREATE TABLE IF NOT EXISTS public.admin_notification_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  message text NOT NULL,
  level text NOT NULL CHECK (level IN ('info', 'important')),
  deep_link text,
  push_requested boolean NOT NULL DEFAULT false,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  recipient_ids uuid[] NOT NULL,
  recipient_count integer NOT NULL CHECK (recipient_count >= 0),
  push_token_count integer NOT NULL DEFAULT 0 CHECK (push_token_count >= 0),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_notification_previews_expiry_idx
  ON public.admin_notification_previews (expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.admin_notification_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  message text NOT NULL,
  level text NOT NULL CHECK (level IN ('info', 'important')),
  deep_link text,
  push_requested boolean NOT NULL DEFAULT false,
  is_test boolean NOT NULL DEFAULT false,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'sending'
    CHECK (status IN ('sending', 'sent', 'partial', 'failed')),
  recipient_count integer NOT NULL DEFAULT 0 CHECK (recipient_count >= 0),
  in_app_sent_count integer NOT NULL DEFAULT 0 CHECK (in_app_sent_count >= 0),
  push_sent_count integer NOT NULL DEFAULT 0 CHECK (push_sent_count >= 0),
  push_failed_count integer NOT NULL DEFAULT 0 CHECK (push_failed_count >= 0),
  push_skipped_count integer NOT NULL DEFAULT 0 CHECK (push_skipped_count >= 0),
  push_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS admin_notification_campaigns_created_idx
  ON public.admin_notification_campaigns (created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.admin_notification_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  in_app_status text NOT NULL DEFAULT 'sent' CHECK (in_app_status IN ('sent', 'failed')),
  push_status text NOT NULL DEFAULT 'not_requested'
    CHECK (push_status IN ('not_requested', 'pending', 'sent', 'failed', 'skipped')),
  push_ticket_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  push_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, user_id)
);

CREATE INDEX IF NOT EXISTS admin_notification_deliveries_campaign_status_idx
  ON public.admin_notification_deliveries (campaign_id, push_status);

ALTER TABLE public.notification_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notification_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notification_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notification_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.notification_push_tokens FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admin_notification_previews FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admin_notification_campaigns FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.admin_notification_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.notification_push_tokens TO service_role;
GRANT ALL ON public.admin_notification_previews TO service_role;
GRANT ALL ON public.admin_notification_campaigns TO service_role;
GRANT ALL ON public.admin_notification_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.admin_create_notification_campaign(
  p_actor_id uuid,
  p_title text,
  p_message text,
  p_level text,
  p_deep_link text,
  p_push_requested boolean,
  p_is_test boolean,
  p_audience jsonb,
  p_recipient_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_campaign_id uuid := gen_random_uuid();
  v_recipient_count integer := 0;
  v_deliveries jsonb;
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

  INSERT INTO public.admin_notification_campaigns (
    id, created_by, title, message, level, deep_link, push_requested,
    is_test, audience, status
  ) VALUES (
    v_campaign_id, p_actor_id, btrim(p_title), btrim(p_message), p_level,
    NULLIF(btrim(p_deep_link), ''), COALESCE(p_push_requested, false),
    COALESCE(p_is_test, false), COALESCE(p_audience, '{}'::jsonb), 'sending'
  );

  WITH recipients AS (
    SELECT DISTINCT requested.recipient_id AS user_id
    FROM unnest(p_recipient_ids) AS requested(recipient_id)
  ), inserted_notifications AS (
    INSERT INTO public.notifications (
      user_id, type, title, message, is_read, is_urgent, level, data
    )
    SELECT r.user_id, 'admin_announcement', btrim(p_title), btrim(p_message), false,
      p_level = 'important', p_level,
      jsonb_strip_nulls(jsonb_build_object(
        'deepLink', NULLIF(btrim(p_deep_link), ''),
        'adminNotificationCampaignId', v_campaign_id
      ))
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
  SELECT count(*)::integer,
    COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', user_id, 'notification_id', notification_id
    )), '[]'::jsonb)
  INTO v_recipient_count, v_deliveries
  FROM inserted_deliveries;

  IF v_recipient_count = 0 THEN
    RAISE EXCEPTION 'No active linked users remain in this audience'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.admin_notification_campaigns
  SET recipient_count = v_recipient_count,
      in_app_sent_count = v_recipient_count
  WHERE id = v_campaign_id;

  RETURN jsonb_build_object(
    'campaign_id', v_campaign_id,
    'recipient_count', v_recipient_count,
    'deliveries', v_deliveries
  );
END;
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
    v_preview.recipient_ids
  );

  UPDATE public.admin_notification_previews
  SET consumed_at = now()
  WHERE id = p_preview_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_notification_campaign(uuid,text,text,text,text,boolean,boolean,jsonb,uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_send_notification_preview(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_notification_campaign(uuid,text,text,text,text,boolean,boolean,jsonb,uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_send_notification_preview(uuid,uuid) TO service_role;

COMMIT;
