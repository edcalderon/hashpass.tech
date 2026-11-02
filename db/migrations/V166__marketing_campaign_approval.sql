BEGIN;

ALTER TABLE public.marketing_campaigns
  ADD COLUMN approval_status text NOT NULL DEFAULT 'not_requested'
    CHECK (approval_status IN ('not_requested', 'pending', 'approved', 'declined')),
  ADD COLUMN approval_requested_to uuid,
  ADD COLUMN approval_requested_at timestamptz,
  ADD COLUMN approval_decided_by uuid,
  ADD COLUMN approval_decided_at timestamptz,
  ADD COLUMN approval_snapshot jsonb,
  ADD COLUMN approval_estimated_recipients integer;

ALTER TABLE public.notifications
  ADD COLUMN campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL;

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
    'marketing_campaign_approved', 'marketing_campaign_declined'
  ])) NOT VALID;

CREATE INDEX notifications_campaign_id ON public.notifications(campaign_id)
  WHERE campaign_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_marketing_campaign_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.approval_status = 'pending'
    AND (NEW.name, NEW.event_id, NEW.content, NEW.scheduled_at, NEW.audience,
         NEW.requirements, NEW.readiness)
      IS DISTINCT FROM
        (OLD.name, OLD.event_id, OLD.content, OLD.scheduled_at, OLD.audience,
         OLD.requirements, OLD.readiness) THEN
    RAISE EXCEPTION 'Campaign review is pending; wait for the assigned administrator decision';
  END IF;

  IF (NEW.name, NEW.event_id, NEW.content, NEW.scheduled_at, NEW.audience,
      NEW.requirements, NEW.readiness)
    IS DISTINCT FROM
      (OLD.name, OLD.event_id, OLD.content, OLD.scheduled_at, OLD.audience,
       OLD.requirements, OLD.readiness) THEN
    NEW.approval_status := 'not_requested';
    NEW.approval_requested_to := NULL;
    NEW.approval_requested_at := NULL;
    NEW.approval_decided_by := NULL;
    NEW.approval_decided_at := NULL;
    NEW.approval_snapshot := NULL;
    NEW.approval_estimated_recipients := NULL;
  END IF;

  IF NEW.status = 'scheduled' AND OLD.status IS DISTINCT FROM 'scheduled'
    AND NEW.approval_status <> 'approved' THEN
    RAISE EXCEPTION 'Campaign requires approval from its assigned administrator before scheduling';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER marketing_campaign_approval_guard
BEFORE UPDATE ON public.marketing_campaigns
FOR EACH ROW EXECUTE FUNCTION public.guard_marketing_campaign_approval();

-- Keep the specifically requested BSL Business offer at the future send time;
-- convert an unqueued legacy schedule back to a draft so it cannot bypass the
-- new approval gate or start sending during deployment.
UPDATE public.marketing_campaigns
SET status = 'draft',
    scheduled_at = TIMESTAMPTZ '2026-11-03 12:35:00+00',
    requirements = CASE
      WHEN 'reward_terms_verified' = ANY(requirements) THEN requirements
      ELSE array_append(requirements, 'reward_terms_verified')
    END,
    updated_at = now()
WHERE key = 'bsl2026-business-offer'
  AND status IN ('draft', 'scheduled')
  AND approval_status = 'not_requested'
  AND audience_queued_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.marketing_deliveries
    WHERE marketing_deliveries.campaign_id = marketing_campaigns.id
  );

CREATE OR REPLACE FUNCTION public.marketing_request_approval(
  p_actor uuid,
  p_campaign uuid,
  p_approver uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.marketing_campaigns;
  estimated_count integer;
  notification_id uuid;
  request_message text;
  snapshot jsonb;
BEGIN
  SELECT * INTO c FROM public.marketing_campaigns WHERE id = p_campaign FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;
  IF c.approval_status = 'pending' AND c.approval_requested_to = p_approver THEN
    RETURN jsonb_build_object(
      'campaign_id', c.id, 'approval_status', c.approval_status,
      'estimated_recipients', c.approval_estimated_recipients, 'already_requested', true
    );
  END IF;
  IF c.approval_status = 'declined' THEN
    RAISE EXCEPTION 'Revise and save the declined campaign before requesting approval again';
  END IF;
  IF c.approval_status = 'approved' THEN
    RAISE EXCEPTION 'This campaign has already been approved';
  END IF;
  IF c.status NOT IN ('draft', 'paused')
    OR EXISTS (SELECT 1 FROM public.marketing_deliveries WHERE campaign_id = c.id) THEN
    RAISE EXCEPTION 'Only an unqueued draft or paused campaign can be submitted for approval';
  END IF;
  IF c.scheduled_at IS NULL OR c.scheduled_at <= now() THEN
    RAISE EXCEPTION 'Choose a future send time before requesting approval';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(c.requirements) requirement
    WHERE coalesce(c.readiness->>requirement, 'false') <> 'true'
  ) THEN
    RAISE EXCEPTION 'Campaign prerequisites are incomplete';
  END IF;
  IF p_approver IS NULL OR p_actor IS NULL OR p_actor = p_approver THEN
    RAISE EXCEPTION 'A separate assigned administrator is required to approve this campaign';
  END IF;

  SELECT count(DISTINCT u.id)::integer INTO estimated_count
  FROM public."user" u
  JOIN public.newsletter_subscribers n
    ON lower(btrim(n.email)) = lower(btrim(u.email))
  WHERE u.email IS NOT NULL AND btrim(u.email) <> ''
    AND u.deleted_at IS NULL AND u.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.marketing_suppressions s
      WHERE s.email = lower(btrim(u.email))
    );

  snapshot := jsonb_build_object(
    'name', c.name, 'event_id', c.event_id, 'content', c.content,
    'scheduled_at', c.scheduled_at, 'time_zone', c.time_zone,
    'audience', c.audience, 'requirements', c.requirements,
    'readiness', c.readiness, 'estimated_recipients', estimated_count
  );
  request_message := format(
    E'Campaign: %s\nHeadline: %s\nCampaign details (English): %s\nCampaign details (Spanish): %s\nDiscount code: %s\nEvent: %s · %s · %s\nOfficial destination: %s\nPublished artwork: %s\nRequested send: %s (America/Bogota, UTC−5)\nAudience: active registered accounts with a current HASHPASS email-update opt-in. Unsubscribed, suppressed, inactive and deleted accounts are excluded. Estimated eligible recipients now: %s; eligibility is checked again at send time.\nReview the English and Spanish copy, official destination, terms, published artwork and sender in Dashboard → Admin → Emails. Approve or decline below. Approval schedules the campaign for this future time; it does not send immediately.',
    c.name,
    coalesce(c.content->'en'->>'heading', c.name),
    coalesce(c.content->'en'->>'message', 'Review the English campaign copy in Admin → Emails.'),
    coalesce(c.content->'es'->>'message', 'Review the Spanish campaign copy in Admin → Emails.'),
    coalesce(c.content->'en'->>'promoCode', 'See campaign copy'),
    coalesce(c.content->'en'->'eventDetails'->>'date', 'Event date in campaign copy'),
    coalesce(c.content->'en'->'eventDetails'->>'venue', 'Venue in campaign copy'),
    coalesce(c.content->'en'->'eventDetails'->>'location', 'Location in campaign copy'),
    coalesce(c.content->'en'->>'actionUrl', 'Review the campaign destination in Admin → Emails'),
    coalesce(c.content->'en'->>'imageUrl', 'No artwork image is configured'),
    to_char(c.scheduled_at AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD HH24:MI'),
    estimated_count
  );

  UPDATE public.marketing_campaigns
  SET approval_status = 'pending', approval_requested_to = p_approver,
      approval_requested_at = now(), approval_decided_by = NULL,
      approval_decided_at = NULL, approval_snapshot = snapshot,
      approval_estimated_recipients = estimated_count, updated_at = now()
  WHERE id = c.id;

  INSERT INTO public.notifications(
    user_id, type, title, message, is_read, is_urgent, campaign_id
  ) VALUES (
    p_approver, 'marketing_campaign_approval_requested',
    'Campaign approval requested', request_message, false, true, c.id
  ) RETURNING id INTO notification_id;

  INSERT INTO public.marketing_audit(campaign_id, actor_id, action)
  VALUES (c.id, p_actor, 'approval_requested');

  RETURN jsonb_build_object(
    'campaign_id', c.id, 'notification_id', notification_id,
    'approval_status', 'pending', 'estimated_recipients', estimated_count,
    'message', request_message, 'already_requested', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.marketing_decide_approval(
  p_actor uuid,
  p_campaign uuid,
  p_decision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c public.marketing_campaigns;
  next_type text;
  next_title text;
  decision_action text;
BEGIN
  IF p_decision NOT IN ('approve', 'decline') THEN
    RAISE EXCEPTION 'Choose approve or decline';
  END IF;
  SELECT * INTO c FROM public.marketing_campaigns WHERE id = p_campaign FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campaign not found'; END IF;
  IF c.approval_status <> 'pending' OR c.approval_requested_to IS DISTINCT FROM p_actor THEN
    RAISE EXCEPTION 'This campaign approval is no longer pending or is assigned to another administrator';
  END IF;
  IF c.approval_snapshot IS DISTINCT FROM jsonb_build_object(
    'name', c.name, 'event_id', c.event_id, 'content', c.content,
    'scheduled_at', c.scheduled_at, 'time_zone', c.time_zone,
    'audience', c.audience, 'requirements', c.requirements,
    'readiness', c.readiness,
    'estimated_recipients', c.approval_estimated_recipients
  ) THEN
    RAISE EXCEPTION 'Campaign changed after review was requested; submit it again';
  END IF;

  IF p_decision = 'approve' THEN
    IF c.scheduled_at IS NULL OR c.scheduled_at <= now() THEN
      RAISE EXCEPTION 'The requested send time has passed; decline, revise the schedule, and submit again';
    END IF;
    UPDATE public.marketing_campaigns
    SET approval_status = 'approved', status = 'scheduled', approval_decided_by = p_actor,
        approval_decided_at = now(), updated_at = now()
    WHERE id = c.id;
    next_type := 'marketing_campaign_approved';
    next_title := 'Campaign approved';
    decision_action := 'approval_approved';
  ELSE
    UPDATE public.marketing_campaigns
    SET approval_status = 'declined', approval_decided_by = p_actor,
        approval_decided_at = now(), updated_at = now()
    WHERE id = c.id;
    next_type := 'marketing_campaign_declined';
    next_title := 'Campaign declined';
    decision_action := 'approval_declined';
  END IF;

  UPDATE public.notifications
  SET type = next_type, title = next_title,
      message = message || E'\n\nDecision recorded. No email was sent by this action.',
      is_read = true, read_at = now()
  WHERE campaign_id = c.id AND user_id = p_actor
    AND type = 'marketing_campaign_approval_requested';

  INSERT INTO public.marketing_audit(campaign_id, actor_id, action)
  VALUES (c.id, p_actor, decision_action);

  RETURN jsonb_build_object(
    'campaign_id', c.id, 'approval_status',
    CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'declined' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.guard_marketing_campaign_approval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_request_approval(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marketing_decide_approval(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_request_approval(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.marketing_decide_approval(uuid, uuid, text) TO service_role;

COMMIT;
