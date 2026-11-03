export type AdminNotificationAudience =
  | 'all_active'
  | 'event_attendees'
  | 'speakers'
  | 'selected';

export type AdminNotificationLevel = 'info' | 'important';

export type AdminNotificationExpiryMode = 'never' | 'at_time' | 'after_delivery' | 'after_read';

export type AdminNotificationPassTier =
  | 'all'
  | 'free'
  | 'general'
  | 'speaker'
  | 'vip'
  | 'platinum'
  | 'enterprise';

export type AdminNotificationRecipient = {
  id: string;
  email: string;
  name: string | null;
};

export type AdminNotificationPreview = {
  previewId: string;
  expiresAt: string;
  scheduledAt: string | null;
  notificationExpiresAt: string | null;
  notificationExpiryMode: AdminNotificationExpiryMode;
  notificationExpiresAfterSeconds: number | null;
  recipientCount: number;
  pushRequested: boolean;
  pushTokenCount: number;
  sample: { email: string; name: string | null }[];
};

export type AdminNotificationCampaign = {
  id: string;
  title: string;
  message: string;
  level: AdminNotificationLevel;
  deep_link: string | null;
  push_requested: boolean;
  is_test: boolean;
  audience: Record<string, unknown>;
  status: 'scheduled' | 'sending' | 'sent' | 'partial' | 'failed' | 'expired' | 'cancelled';
  scheduled_at: string | null;
  expires_at: string | null;
  expiry_mode: AdminNotificationExpiryMode;
  expires_after_seconds: number | null;
  recipient_count: number;
  in_app_sent_count: number;
  push_sent_count: number;
  push_failed_count: number;
  push_skipped_count: number;
  push_error: string | null;
  created_at: string;
  completed_at: string | null;
};

export type AdminNotificationsManagerProps = {
  mode: 'light' | 'dark';
  initialEventId: string;
};

export type AdminNotificationSection = 'compose' | 'history';

export type AdminNotificationAction = 'preview' | 'test' | 'send' | null;

export type AdminPanelTabType =
  | 'passes'
  | 'pass-settings'
  | 'auth-allies'
  | 'pass-codes'
  | 'qr-scanner'
  | 'meetings'
  | 'emails'
  | 'notifications'
  | 'roles'
  | 'speaker-roles'
  | 'ticket-claims';
