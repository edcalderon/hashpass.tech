-- The original notifications constraint predates the guarded Business-invite
-- workflow. Keep its established types and explicitly admit the four states
-- emitted by V102 so a request and its reviewer notification are atomic.

BEGIN;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
    'meeting_request',
    'meeting_accepted',
    'meeting_declined',
    'meeting_reminder',
    'meeting_expired',
    'meeting_cancelled',
    'boost_received',
    'system_alert',
    'chat_message',
    'business_invite_pending',
    'business_invite_review_required',
    'business_invite_rejected',
    'business_invite_approved'
  ]));

COMMIT;
