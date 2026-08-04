import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { eventIdFromRequest } from '@/lib/server/event-api';
import { EVENTS } from '@/config/events';

// GET /api/events/:eventId/schedule/public/:shareToken/image?day=1 — a
// branded, shareable image of one day of the user's confirmed schedule,
// rendered server-side as SVG (Content-Type: image/svg+xml). Deliberately
// NOT using a native/WASM raster renderer (sharp, resvg, etc.): this route
// runs in the same Lambda as every other app/api/**/+api.ts route, and a
// native binary dependency there is exactly the class of risk the on-device
// image-capture alternative (react-native-view-shot) was rejected for --
// this keeps that same "no unverifiable native/binary risk" property,
// server-side. SVG is a real, directly shareable/downloadable image format
// on every modern platform.
const BRAND_COLORS: Record<string, string> = {
  chile2026: '#D11A2A',
  peru2026: '#E85D2A',
  colombia2026: '#F5C542',
  bsl: '#34D399',
};

const COPY: Record<string, { label: string; fallbackDay: string; cta: string }> = {
  en: { label: 'MY SCHEDULE', fallbackDay: 'My Agenda', cta: 'Join me — this is my agenda, see you at the event!' },
  es: { label: 'MI AGENDA', fallbackDay: 'Mi Agenda', cta: '¡Únete a mí — esta es mi agenda, nos vemos en el evento!' },
  ko: { label: '내 일정', fallbackDay: '내 일정', cta: '함께해요 — 이게 제 일정이에요, 행사에서 만나요!' },
};

function resolveCopy(locale: string | null) {
  const lc = (locale || 'en').toLowerCase();
  return COPY[lc] || COPY.en;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

export async function GET(request: Request) {
  const eventId = eventIdFromRequest(request);
  if (!eventId) {
    return new Response('A valid event id is required', { status: 400 });
  }

  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  const shareToken = pathParts[pathParts.length - 2]; // .../public/:shareToken/image
  const requestedDay = url.searchParams.get('day');
  const copy = resolveCopy(url.searchParams.get('locale'));

  if (!shareToken) {
    return new Response('A share token is required', { status: 400 });
  }

  const supabase = getSupabaseServerForRequest(request);
  try {
    const { data: share, error: shareError } = await supabase
      .from('user_schedule_shares')
      .select('user_id')
      .eq('share_token', shareToken)
      .eq('event_id', eventId)
      .maybeSingle();
    if (shareError) throw shareError;
    if (!share) {
      return new Response('This share link is invalid or has expired', { status: 404 });
    }

    const { data: statuses, error: statusError } = await supabase
      .from('user_agenda_status')
      .select('agenda_id')
      .eq('user_id', share.user_id)
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .not('agenda_id', 'is', null);
    if (statusError) throw statusError;

    const confirmedIds = (statuses || []).map((s: { agenda_id: string | null }) => s.agenda_id).filter(Boolean);

    let items: Array<{ id: string; time: string; title: string; location: string | null; day: string | null; day_name: string | null }> = [];
    if (confirmedIds.length > 0) {
      const { data, error } = await supabase
        .from('event_agenda')
        .select('id, time, title, location, day, day_name')
        .eq('event_id', eventId)
        .in('id', confirmedIds)
        .order('time', { ascending: true });
      if (error) throw error;
      items = data || [];
    }

    const day = requestedDay || items[0]?.day || '1';
    const dayItems = items.filter((item) => (item.day || '1') === day);
    const dayName = dayItems[0]?.day_name || '';

    const event = (EVENTS as any)[eventId];
    const eventName = event?.name || eventId;
    const brandColor = BRAND_COLORS[eventId] || '#8b3ee8';
    const tzOffsetMatch = event?.eventStartDate?.match(/([+-]\d{2}:?\d{2})$/);
    const tzOffsetMinutes = tzOffsetMatch
      ? (Number(tzOffsetMatch[1].slice(1, 3)) * 60 + Number(tzOffsetMatch[1].slice(-2))) * (tzOffsetMatch[1][0] === '-' ? -1 : 1)
      : -240;

    const formatClock = (iso: string) => {
      const date = new Date(new Date(iso).getTime() + tzOffsetMinutes * 60_000);
      let hours = date.getUTCHours();
      const minutes = date.getUTCMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `${hours}:${String(minutes).padStart(2, '0')} ${ampm}`;
    };

    const cardWidth = 1080;
    const cardHeight = 1350;
    const rowHeight = 96;
    const listTop = 340;
    const maxRows = Math.min(dayItems.length, 7);

    const rows = dayItems.slice(0, maxRows).map((item, index) => {
      const y = listTop + index * rowHeight;
      const titleLines = wrapText(item.title, 42);
      const titleTspans = titleLines
        .map((line, i) => `<tspan x="120" dy="${i === 0 ? 0 : 26}">${escapeXml(line)}</tspan>`)
        .join('');
      return `
        <line x1="60" y1="${y - 20}" x2="${cardWidth - 60}" y2="${y - 20}" stroke="rgba(255,255,255,0.12)" stroke-width="1" />
        <text x="60" y="${y + 10}" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="${brandColor}">${escapeXml(formatClock(item.time))}</text>
        <text y="${y + 10}" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="600" fill="#FFFFFF">${titleTspans}</text>
        ${item.location ? `<text x="120" y="${y + 44}" font-family="Helvetica, Arial, sans-serif" font-size="16" fill="rgba(255,255,255,0.6)">${escapeXml(item.location)}</text>` : ''}
      `;
    }).join('');

    const overflowNote = dayItems.length > maxRows
      ? `<text x="60" y="${listTop + maxRows * rowHeight + 20}" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="rgba(255,255,255,0.5)">+${dayItems.length - maxRows} more sessions</text>`
      : '';

    const svg = `
<svg width="${cardWidth}" height="${cardHeight}" viewBox="0 0 ${cardWidth} ${cardHeight}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#06111F" />
      <stop offset="100%" stop-color="#0B0620" />
    </linearGradient>
    <linearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${brandColor}" stop-opacity="0.35" />
      <stop offset="100%" stop-color="${brandColor}" stop-opacity="0" />
    </linearGradient>
  </defs>
  <rect width="${cardWidth}" height="${cardHeight}" fill="url(#bg)" />
  <rect width="${cardWidth}" height="420" fill="url(#heroFade)" />

  <text x="60" y="90" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="800" letter-spacing="4" fill="${brandColor}">HASHPASS</text>
  <text x="60" y="170" font-family="Helvetica, Arial, sans-serif" font-size="46" font-weight="800" fill="#FFFFFF">${escapeXml(eventName)}</text>
  <text x="60" y="210" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="600" fill="rgba(255,255,255,0.75)">${escapeXml(dayName || copy.fallbackDay)}</text>

  <g>
    <rect x="60" y="250" width="14" height="14" rx="7" fill="${brandColor}" />
    <text x="86" y="262" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="700" fill="rgba(255,255,255,0.85)">${escapeXml(copy.label)}</text>
  </g>

  ${rows}
  ${overflowNote}

  <rect x="0" y="${cardHeight - 150}" width="${cardWidth}" height="150" fill="${brandColor}" fill-opacity="0.14" />
  <text x="${cardWidth / 2}" y="${cardHeight - 96}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="800" fill="#FFFFFF">
    ${wrapText(copy.cta, 44).map((line, i) => `<tspan x="${cardWidth / 2}" dy="${i === 0 ? 0 : 30}">${escapeXml(line)}</tspan>`).join('')}
  </text>
  <text x="${cardWidth / 2}" y="${cardHeight - 30}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="700" letter-spacing="2" fill="rgba(255,255,255,0.6)">HASHPASS.TECH</text>
</svg>`.trim();

    return new Response(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[schedule-share-image] error:', error);
    return new Response('Failed to generate image', { status: 500 });
  }
}
