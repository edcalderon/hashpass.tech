export interface CreateAttendingArtworkBody {
  captchaToken?: unknown;
  imageBase64?: unknown;
  eventSlug?: unknown;
  eventName?: unknown;
  attendeeName?: unknown;
  caption?: unknown;
  eventUrl?: unknown;
  locale?: unknown;
  email?: unknown;
}

export interface AttendingArtworkShareRow {
  id: string;
  token_hash: string;
  object_path: string;
  event_slug: string;
  event_name: string;
  attendee_name: string;
  caption: string;
  event_url: string;
  locale: string;
  created_at: string;
  expires_at: string;
}

export type AttendingArtworkEmailStatus = 'sent' | 'unavailable' | 'not_requested';

export interface MailerConfig {
  host: string;
  port: string;
  user: string;
  pass: string;
  from: string;
  suffix: '' | '_UPDATES';
}

export interface ArtworkEmailCopy {
  subject: string;
  heading: string;
  description: string;
  openLabel: string;
  downloadLabel: string;
  attachmentNotice: string;
  textGreeting: string;
}
