export type NotificationType =
  | 'meeting_request'
  | 'meeting_accepted'
  | 'meeting_declined'
  | 'meeting_reminder'
  | 'meeting_expired'
  | 'meeting_cancelled'
  | 'meeting_slot_conflict'
  | 'boost_received'
  | 'system_alert'
  | 'chat_message'
  | 'business_invite_pending'
  | 'business_invite_review_required'
  | 'business_invite_approved'
  | 'business_invite_rejected'
  | 'ticket_claim_review_required'
  | 'marketing_campaign_approval_requested'
  | 'marketing_campaign_approved'
  | 'marketing_campaign_declined'
  | 'marketing_campaign_cancelled'
  | 'admin_announcement';

export type NotificationData = {
  dismissOnRead?: boolean;
  deepLink?: string;
  adminNotificationCampaignId?: string;
  [key: string]: unknown;
};
