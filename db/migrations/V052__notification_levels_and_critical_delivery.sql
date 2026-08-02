-- Notifications have explicit severity so clients and delivery workers can make
-- a durable decision about escalation instead of inferring it from presentation.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'info';

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_level_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_level_check
  CHECK (level IN ('info', 'important', 'critical'));

-- Preserve the historical urgent flag, while making all existing urgent rows
-- explicit critical notifications. New writes should use level directly.
UPDATE public.notifications
SET level = 'critical'
WHERE is_urgent = true
  AND level = 'info';

CREATE INDEX IF NOT EXISTS notifications_user_level_created_at_idx
  ON public.notifications (user_id, level, created_at DESC);

-- Extend the canonical notification API without breaking the eight-argument
-- calls made by existing meeting lifecycle functions. A legacy urgent call is
-- escalated to critical unless the caller intentionally supplies another level.
DROP FUNCTION IF EXISTS public.create_notification(uuid, text, text, text, uuid, uuid, boolean, uuid);
DROP FUNCTION IF EXISTS public.create_notification(uuid, text, text, text, uuid, text, boolean, uuid);

CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_meeting_request_id uuid DEFAULT NULL,
  p_speaker_id text DEFAULT NULL,
  p_is_urgent boolean DEFAULT false,
  p_meeting_id uuid DEFAULT NULL,
  p_level text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_level text := COALESCE(p_level, CASE WHEN p_is_urgent THEN 'critical' ELSE 'info' END);
BEGIN
  IF v_level NOT IN ('info', 'important', 'critical') THEN
    RAISE EXCEPTION 'Invalid notification level: %', v_level
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    meeting_request_id,
    speaker_id,
    is_urgent,
    meeting_id,
    level
  ) VALUES (
    p_user_id,
    p_type,
    p_title,
    p_message,
    p_meeting_request_id,
    p_speaker_id,
    p_is_urgent OR v_level = 'critical',
    p_meeting_id,
    v_level
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON COLUMN public.notifications.level IS
  'Delivery severity: info stays in-app; important may use push; critical also requires transactional email delivery.';

GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, uuid, text, boolean, uuid, text) TO authenticated;

-- Compatibility overload for callers that use a UUID speaker record.
CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_meeting_request_id uuid,
  p_speaker_id uuid,
  p_is_urgent boolean,
  p_meeting_id uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.create_notification(
    p_user_id, p_type, p_title, p_message, p_meeting_request_id,
    p_speaker_id::text, p_is_urgent, p_meeting_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, uuid, uuid, boolean, uuid) TO authenticated;
