import { getDefaultDurationMinutes } from '../types/agenda';

export type AgendaCalendarSource = {
  eventId: string;
  eventName: string;
  eventStartDate: string;
  eventTimezoneOffset: string;
  agendaUrl: string;
  item: {
    id: string;
    title: string;
    time: string;
    day?: string;
    description?: string;
    speakers?: string[];
    location?: string;
    duration_minutes?: number;
    type?: string;
  };
};

export type AgendaCalendarEvent = {
  uid: string;
  title: string;
  description: string;
  location: string;
  url: string;
  start: Date;
  end: Date;
};

const TIME_RANGE = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

const offsetMinutes = (offset: string): number => {
  const match = offset.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
};

const eventDay = (eventStartDate: string, day?: string): { year: number; month: number; date: number } => {
  const match = eventStartDate.match(ISO_DATE);
  if (!match) throw new Error('An event start date is required to add this session to a calendar.');

  const dayNumber = Number(day?.match(/\d+/)?.[0] || '1');
  const base = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + dayNumber - 1));
  return { year: base.getUTCFullYear(), month: base.getUTCMonth(), date: base.getUTCDate() };
};

const atEventTime = (
  date: { year: number; month: number; date: number },
  hour: number,
  minute: number,
  timezoneOffset: string,
) => new Date(Date.UTC(date.year, date.month, date.date, hour, minute) - offsetMinutes(timezoneOffset) * 60_000);

const formatUtc = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

const escapeIcsText = (value: string) => value
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

export const resolveAgendaCalendarSpeakerNames = (
  speakerReferences: string[] | undefined,
  resolveSpeakerName: (reference: string) => string,
): string[] | undefined => speakerReferences?.map(resolveSpeakerName);

export const createAgendaCalendarEvent = (source: AgendaCalendarSource): AgendaCalendarEvent => {
  const isoTime = new Date(source.item.time);
  const range = source.item.time.trim().match(TIME_RANGE);
  let start: Date;
  let end: Date;

  if (!Number.isNaN(isoTime.getTime()) && source.item.time.includes('T')) {
    start = isoTime;
    end = new Date(start.getTime() + (source.item.duration_minutes || getDefaultDurationMinutes(source.item.type)) * 60_000);
  } else if (range) {
    const date = eventDay(source.eventStartDate, source.item.day);
    start = atEventTime(date, Number(range[1]), Number(range[2]), source.eventTimezoneOffset);
    end = atEventTime(date, Number(range[3]), Number(range[4]), source.eventTimezoneOffset);
    if (end <= start) end = new Date(end.getTime() + 24 * 60 * 60_000);
  } else {
    throw new Error('This agenda session does not have a calendar-ready start and end time.');
  }

  const speakers = source.item.speakers?.filter(Boolean).join(', ');
  const description = [
    `Event: ${source.eventName}`,
    source.item.description,
    speakers ? `Speakers: ${speakers}` : '',
    'View this session in the Hashpass app',
    source.agendaUrl,
  ].filter(Boolean).join('\n\n');

  return {
    uid: `agenda-${source.eventId}-${source.item.id}@hashpass.tech`,
    title: source.item.title,
    description,
    location: source.item.location || '',
    url: source.agendaUrl,
    start,
    end,
  };
};

export const buildGoogleCalendarUrl = (event: AgendaCalendarEvent): string => {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${formatUtc(event.start)}/${formatUtc(event.end)}`,
    details: event.description,
    location: event.location,
    sprop: `website:${event.url}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

export const buildICalendarFile = (event: AgendaCalendarEvent, now = new Date()): string => [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//HASHPASS//Agenda//EN',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'BEGIN:VEVENT',
  `UID:${event.uid}`,
  `DTSTAMP:${formatUtc(now)}`,
  `DTSTART:${formatUtc(event.start)}`,
  `DTEND:${formatUtc(event.end)}`,
  `SUMMARY:${escapeIcsText(event.title)}`,
  `DESCRIPTION:${escapeIcsText(event.description)}`,
  event.location ? `LOCATION:${escapeIcsText(event.location)}` : '',
  `URL:${event.url}`,
  'END:VEVENT',
  'END:VCALENDAR',
  '',
].filter(Boolean).join('\r\n');
