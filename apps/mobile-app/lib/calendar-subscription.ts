export type CalendarProvider = 'google' | 'apple' | 'notion';

const GOOGLE_CALENDAR_SUBSCRIBE_URL =
  'https://calendar.google.com/calendar/render';
export const NOTION_CALENDAR_URL = 'https://calendar.notion.so/';

export const buildCalendarFeedUrl = (webOrigin: string): string => {
  const origin = webOrigin.replace(/\/+$/, '').replace(/\/api$/, '');
  return `${origin}/api/calendar`;
};

export const buildGoogleCalendarSubscriptionUrl = (feedUrl: string): string => {
  const url = new URL(GOOGLE_CALENDAR_SUBSCRIBE_URL);
  url.searchParams.set('cid', feedUrl);
  return url.toString();
};

export const buildAppleCalendarSubscriptionUrl = (feedUrl: string): string => {
  const url = new URL(feedUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Calendar feed must use HTTP or HTTPS');
  }
  return url.toString().replace(/^https?:/, 'webcal:');
};

export const buildCalendarProviderUrl = (
  provider: CalendarProvider,
  feedUrl: string,
): string => {
  switch (provider) {
    case 'google':
      return buildGoogleCalendarSubscriptionUrl(feedUrl);
    case 'apple':
      return buildAppleCalendarSubscriptionUrl(feedUrl);
    case 'notion':
      return NOTION_CALENDAR_URL;
  }
};

const escapeIcsText = (value: string): string =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

const foldIcsLine = (line: string): string => {
  const chunks: string[] = [];
  let remaining = line;
  while (new TextEncoder().encode(remaining).length > 73) {
    let splitAt = Math.min(73, remaining.length);
    while (
      splitAt > 1 &&
      new TextEncoder().encode(remaining.slice(0, splitAt)).length > 73
    ) {
      splitAt -= 1;
    }
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  chunks.push(remaining);
  return chunks.join('\r\n ');
};

const toIcsUtc = (date: Date): string =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');

export interface CalendarFeedItem {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  url?: string;
  updatedAt?: Date;
}

export const serializeCalendarFeed = (
  items: CalendarFeedItem[],
  generatedAt = new Date(),
): string => {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HASHPASS//Event Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:HASHPASS Events',
    'X-WR-CALDESC:Public schedules for HASHPASS events',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const item of items) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcsText(item.uid)}`,
      `DTSTAMP:${toIcsUtc(item.updatedAt ?? generatedAt)}`,
      `DTSTART:${toIcsUtc(item.start)}`,
      `DTEND:${toIcsUtc(item.end)}`,
      `SUMMARY:${escapeIcsText(item.title)}`,
    );
    if (item.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(item.description)}`);
    }
    if (item.location) lines.push(`LOCATION:${escapeIcsText(item.location)}`);
    if (item.url) lines.push(`URL:${item.url}`);
    lines.push('STATUS:CONFIRMED', 'END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
};
