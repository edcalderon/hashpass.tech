export type CampaignLocale = 'es' | 'en';
export type CampaignStatus = 'draft' | 'scheduled' | 'paused' | 'sending' | 'completed' | 'cancelled';
export type DeliveryStatus = 'queued' | 'sending' | 'accepted' | 'failed' | 'unknown' | 'suppressed';
export interface CampaignCopy {
  subject: string;
  preheader: string;
  heading: string;
  message: string;
  actionUrl: string;
  actionLabel: string;
  imageUrl?: string;
  imageAlt?: string;
  guideUrl?: string;
}
export interface MarketingCampaign {
  id: string;
  key: string;
  name: string;
  event_id: string;
  status: CampaignStatus;
  scheduled_at: string | null;
  time_zone: string;
  content: Record<CampaignLocale, CampaignCopy>;
  requirements: string[];
  readiness: Record<string, boolean>;
  counts: Partial<Record<DeliveryStatus, number>>;
}
export interface MarketingDelivery {
  id: string;
  campaign_id: string;
  user_id: string;
  status: DeliveryStatus;
  error_code: string | null;
  accepted_at: string | null;
  created_at: string;
}
export interface MarketingAudit {
  id: string;
  campaign_id: string;
  action: string;
  created_at: string;
}
export interface ActivitySnapshot {
  id: string;
  cutoff: string;
  network: 'testnet';
  status: 'unpublished';
  digest: string;
  user_count: number;
  created_at: string;
}
export interface MarketingOverview {
  campaigns: MarketingCampaign[];
  deliveries: MarketingDelivery[];
  audit: MarketingAudit[];
  snapshots: ActivitySnapshot[];
  activity: { verified: number; observed: number; points: number };
}
export interface ClaimedMarketingDelivery {
  id: string;
  campaign_id: string;
  event_id: string;
  claim_token: string;
  email: string;
  locale: CampaignLocale;
  unsubscribe_token: string;
  content: Record<CampaignLocale, CampaignCopy>;
}
export interface MarketingCampaignDraft {
  key: string;
  name: string;
  eventId: string;
  scheduledAt: string;
  timeZone: 'America/Bogota';
  content: Record<CampaignLocale, CampaignCopy>;
  requirements: string[];
  readiness: Record<string, boolean>;
}
export interface MarketingPanelProps {
  overview: MarketingOverview | null;
  mode: 'light' | 'dark';
  loading?: boolean;
  busy?: boolean;
  error?: string | null;
  onRefresh: () => void;
  onAction: (body: Record<string, unknown>) => Promise<boolean>;
  onPreview: (copy: CampaignCopy, locale: CampaignLocale, eventId: string) => Promise<string | null>;
}
export type MarketingView = 'calendar' | 'history' | 'activity';
export type MarketingOverviewResult = { success: true; data: { data: MarketingOverview } } | { success: false; error: string };
export interface MarketingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  unsubscribeUrl: string;
  deliveryId: string;
}
