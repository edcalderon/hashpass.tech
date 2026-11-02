BEGIN;

ALTER TABLE public.marketing_campaigns
  DROP CONSTRAINT IF EXISTS marketing_campaigns_approval_status_check;
ALTER TABLE public.marketing_campaigns
  ADD CONSTRAINT marketing_campaigns_approval_status_check
    CHECK (approval_status IN ('not_requested', 'pending', 'approved', 'declined', 'cancelled'));

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
    'marketing_campaign_cancelled'
  ])) NOT VALID;

WITH cancelled_pending AS (
  UPDATE public.marketing_campaigns
  SET approval_status = 'cancelled', approval_decided_at = coalesce(approval_decided_at, now()), updated_at = now()
  WHERE status = 'cancelled' AND approval_status = 'pending'
  RETURNING id, approval_requested_to
)
UPDATE public.notifications n
SET type = 'marketing_campaign_cancelled',
    title = 'Campaign approval cancelled',
    message = n.message || E'\n\nThis campaign was cancelled. The approval request is closed; no email was sent.',
    is_read = true,
    read_at = now(),
    is_urgent = false
FROM cancelled_pending c
WHERE n.campaign_id = c.id
  AND n.user_id = c.approval_requested_to
  AND n.type = 'marketing_campaign_approval_requested';

CREATE OR REPLACE FUNCTION public.close_cancelled_marketing_campaign_approval()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.marketing_campaigns
  SET approval_status = 'cancelled', approval_decided_at = now(), updated_at = now()
  WHERE id = NEW.id AND approval_status = 'pending';

  UPDATE public.notifications
  SET type = 'marketing_campaign_cancelled',
      title = 'Campaign approval cancelled',
      message = message || E'\n\nThis campaign was cancelled. The approval request is closed; no email was sent.',
      is_read = true,
      read_at = now(),
      is_urgent = false
  WHERE campaign_id = NEW.id
    AND user_id = NEW.approval_requested_to
    AND type = 'marketing_campaign_approval_requested';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marketing_campaign_cancel_closes_approval ON public.marketing_campaigns;
CREATE TRIGGER marketing_campaign_cancel_closes_approval
AFTER UPDATE OF status ON public.marketing_campaigns
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM 'cancelled'
  AND NEW.status = 'cancelled'
  AND OLD.approval_status = 'pending'
)
EXECUTE FUNCTION public.close_cancelled_marketing_campaign_approval();

REVOKE ALL ON FUNCTION public.close_cancelled_marketing_campaign_approval() FROM PUBLIC, anon, authenticated;

COMMIT;
