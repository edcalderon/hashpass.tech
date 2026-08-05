import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { eventIdFromRequest } from '@/lib/server/event-api';
import { parseAgendaTime } from '@/lib/event-time';
import { EVENTS } from '@/config/events';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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

const DAY_ACCENTS: Record<string, string[]> = {
  chile2026: ['#D11A2A', '#F59E0B', '#2563EB'],
  peru2026: ['#E85D2A', '#14B8A6', '#7C3AED'],
  colombia2026: ['#F5C542', '#0EA5E9', '#EF4444'],
  bsl: ['#34D399', '#60A5FA', '#A78BFA'],
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
    const imageDayNumber = Math.max(1, Number.parseInt(requestedDay || '1', 10) || 1);
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

    let { data: profile } = await supabase
      .from('user_profiles')
      .select('full_name')
      .eq('user_id', share.user_id)
      .maybeSingle();
    if (!profile) {
      const { data: registry } = await (supabase as any)
        .from('user')
        .select('provider_ids')
        .eq('id', share.user_id)
        .maybeSingle();
      const supabaseUserId = registry?.provider_ids?.supabase;
      if (supabaseUserId) {
        const result = await supabase.from('user_profiles').select('full_name').eq('user_id', supabaseUserId).maybeSingle();
        profile = result.data;
      }
    }
    const ownerName = typeof profile?.full_name === 'string' ? profile.full_name.trim() : '';
    const ownerHandle = ownerName
      ? `@${ownerName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 32)}`
      : '@hashpass.attendee';

    const { data: statuses, error: statusError } = await supabase
      .from('user_agenda_status')
      .select('agenda_id, is_favorite')
      .eq('user_id', share.user_id)
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .not('agenda_id', 'is', null);
    if (statusError) throw statusError;

    const confirmedIds = (statuses || []).map((s: { agenda_id: string | null }) => s.agenda_id).filter(Boolean);
    const favoriteAgendaIds = new Set(
      (statuses || [])
        .filter((s: { agenda_id: string | null; is_favorite?: boolean }) => s.is_favorite && s.agenda_id)
        .map((s: { agenda_id: string | null }) => s.agenda_id as string),
    );

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

    const event = (EVENTS as any)[eventId];
    const day = requestedDay || items[0]?.day || '1';
    const excludePast = url.searchParams.get('excludePast') === '1';
    const dayItems = items.filter((item) =>
      (item.day || '1') === day &&
      (!excludePast || parseAgendaTime(item.time, event?.eventStartDate, item.day, event?.eventStartDate?.match(/([+-]\d{2}:?\d{2})$/)?.[1] || '-05:00').getTime() >= Date.now())
    );
    const dayName = dayItems[0]?.day_name || '';

    const eventName = event?.name || eventId;
    const eventBrandColor = BRAND_COLORS[eventId] || '#8b3ee8';
    const dayNumber = Math.max(1, Number.parseInt(day, 10) || 1);
    const brandColor = DAY_ACCENTS[eventId]?.[(dayNumber - 1) % DAY_ACCENTS[eventId].length] || eventBrandColor;
    const startDateMatch = event?.eventStartDate?.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const startDate = startDateMatch
      ? new Date(Date.UTC(Number(startDateMatch[1]), Number(startDateMatch[2]) - 1, Number(startDateMatch[3]) + dayNumber - 1))
      : null;
    const formattedDate = startDate
      ? new Intl.DateTimeFormat(url.searchParams.get('locale') || 'en', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
        }).format(startDate)
      : '';
    const eventHashtag = ({
      chile2026: '#bsl2026chile',
      peru2026: '#bsl2026peru',
      colombia2026: '#bsl2026colombia',
      bsl: '#bsl2026',
    } as Record<string, string>)[eventId] || '#hashpass';
    // Expo's static export fingerprints assets (for example
    // `/assets/assets/logos/bsl/bsl-chile-pro.<hash>.webp`). The API runs in a
    // separate server bundle, so the source paths in EVENTS are not publicly
    // addressable and produce broken-image icons in generated snapshots.
    // Keep the known fingerprints here as a stable runtime fallback; the
    // un-fingerprinted path remains a fallback for local/dev servers.
    const fingerprintedAssets: Record<string, string> = {
      hashpass: '/assets/assets/logos/hashpass/logo-full-hashpass-white-cyan.9be139d428aa2da59a319380a009159e.svg',
      bsl: '/assets/assets/logos/bsl/bsl-ontour-pro.8fc2f93c785298ed1a7ed070649b093e.webp',
      peru2026: '/assets/assets/logos/bsl/bsl-peru-pro.c7755041c0886c98664bcdabccc558bc.webp',
      chile2026: '/assets/assets/logos/bsl/bsl-chile-pro.0cc613e9f73290ffe4ca404a67f11062.webp',
      colombia2026: '/assets/assets/logos/bsl/bsl-colombia-pro.7a8022818a351b52c1450d19983bdfde.webp',
    };
    const requestHostname = url.hostname.toLowerCase();
    const configuredSiteOrigin = process.env.EXPO_PUBLIC_BSL_SITE_URL || process.env.BSL_FRONTEND_URL;
    const staticSiteOrigin = requestHostname === 'localhost' || requestHostname === '127.0.0.1'
      ? url.origin
      : requestHostname === 'api-dev.hashpass.tech'
        ? 'https://bsl-dev.hashpass.tech'
        : configuredSiteOrigin || (event?.domain ? `https://${event.domain}` : url.origin);
    const publicAssetUrl = (assetPath: string, assetKey?: string) => {
      try {
        const resolvedPath = assetKey && fingerprintedAssets[assetKey]
          ? fingerprintedAssets[assetKey]
          : assetPath;
        return new URL(resolvedPath, staticSiteOrigin).toString();
      } catch {
        return assetPath;
      }
    };
    const hashpassLogoUrl = publicAssetUrl('/assets/logos/hashpass/logo-full-hashpass-white-cyan.svg', 'hashpass');
    const eventLogoUrl = publicAssetUrl(
      event?.brandingLogo || event?.image || '/assets/logos/bsl/bsl-ontour-pro.svg',
      eventId,
    );
    const inlineSvgAsset = async (assetUrl: string, kind: 'hashpass' | 'event') => {
      try {
        const assetRelativePath = kind === 'hashpass'
          ? 'apps/mobile-app/assets/logos/hashpass/logo-full-hashpass-white-cyan.svg'
          : eventId === 'chile2026'
            ? 'apps/mobile-app/assets/logos/bsl/bsl-chile-pro.svg'
            : eventId === 'peru2026'
              ? 'apps/mobile-app/assets/logos/bsl/bsl-peru-pro.svg'
              : eventId === 'colombia2026'
                ? 'apps/mobile-app/assets/logos/bsl/bsl-colombia-pro.svg'
                : 'apps/mobile-app/assets/logos/bsl/bsl-ontour-pro.svg';
        let assetSvg: string;
        try {
          const assetCandidates = [
            path.resolve(process.cwd(), assetRelativePath),
            path.resolve(process.cwd(), assetRelativePath.replace(/^apps\/mobile-app\//, '')),
            path.resolve(process.cwd(), 'server', assetRelativePath.replace(/^apps\/mobile-app\//, '')),
          ];
          let loaded: string | null = null;
          for (const candidate of assetCandidates) {
            try {
              loaded = await readFile(candidate, 'utf8');
              break;
            } catch {
              // Try the next packaging layout.
            }
          }
          if (!loaded) throw new Error('Branded SVG is not present in the server bundle');
          assetSvg = loaded;
        } catch {
          const assetResponse = await fetch(assetUrl);
          if (!assetResponse.ok) {
            // Try the source path when a newly-exported fingerprint is not in
            // the current deployment yet; the final fallback below still
            // keeps the snapshot branded instead of showing a broken icon.
            const sourcePath = kind === 'hashpass'
              ? '/assets/logos/hashpass/logo-full-hashpass-white-cyan.svg'
              : `/assets/logos/bsl/${eventId === 'chile2026' ? 'bsl-chile-pro' : eventId === 'peru2026' ? 'bsl-peru-pro' : eventId === 'colombia2026' ? 'bsl-colombia-pro' : 'bsl-ontour-pro'}.svg`;
            const sourceResponse = await fetch(publicAssetUrl(sourcePath));
            if (!sourceResponse.ok) {
              const fallbackSvg = kind === 'hashpass'
                ? '<svg xmlns="http://www.w3.org/2000/svg" width="190" height="42"><text x="0" y="30" fill="#fff" font-family="Arial" font-size="28" font-weight="800">HASHPASS</text></svg>'
                : '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="82"><circle cx="34" cy="41" r="27" fill="none" stroke="#fff" stroke-width="5"/><text x="72" y="47" fill="#fff" font-family="Arial" font-size="17" font-weight="700">BLOCKCHAIN SUMMIT LATAM</text></svg>';
              return `data:image/svg+xml;base64,${Buffer.from(fallbackSvg, 'utf8').toString('base64')}`;
            }
            assetSvg = await sourceResponse.text();
          } else {
            const contentType = assetResponse.headers.get('content-type') || '';
            if (!contentType.includes('svg')) {
              const bytes = Buffer.from(await assetResponse.arrayBuffer());
              return `data:${contentType || 'image/webp'};base64,${bytes.toString('base64')}`;
            }
            assetSvg = await assetResponse.text();
          }
        }
        return `data:image/svg+xml;base64,${Buffer.from(assetSvg, 'utf8').toString('base64')}`;
      } catch {
        return assetUrl;
      }
    };
    const [hashpassLogoHref, eventLogoHref] = await Promise.all([
      inlineSvgAsset(hashpassLogoUrl, 'hashpass'),
      inlineSvgAsset(eventLogoUrl, 'event'),
    ]);
    const ownerLine = url.searchParams.get('locale')?.toLowerCase().startsWith('es')
      ? `${ownerHandle} generó esta agenda de seguimiento automáticamente con HASHPASS`
      : url.searchParams.get('locale')?.toLowerCase().startsWith('ko')
        ? `${ownerHandle}님이 HASHPASS로 이 추적 일정을 자동 생성했습니다`
        : `${ownerHandle} generated this tracking agenda automatically using HASHPASS`;
    const tzOffsetMatch = event?.eventStartDate?.match(/([+-]\d{2}:?\d{2})$/);
    const tzOffsetMinutes = tzOffsetMatch
      ? (Number(tzOffsetMatch[1].slice(1, 3)) * 60 + Number(tzOffsetMatch[1].slice(-2))) * (tzOffsetMatch[1][0] === '-' ? -1 : 1)
      : -240;

    const formatClock = (time: string, itemDay?: string | null) => {
      const date = parseAgendaTime(time, event?.eventStartDate, itemDay, tzOffsetMatch?.[1] || '-05:00');
      if (Number.isNaN(date.getTime())) return '—';
      const shifted = new Date(date.getTime() + tzOffsetMinutes * 60_000);
      let hours = shifted.getUTCHours();
      const minutes = shifted.getUTCMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `${hours}:${String(minutes).padStart(2, '0')} ${ampm}`;
    };

    const cardWidth = 1080;
    const cardHeight = 1350;
    const rowHeight = 110;
    const titleLines = wrapText(eventName, 28);
    const titleY = 160;
    const dayY = titleY + titleLines.length * 52 + 16;
    const labelY = dayY + (formattedDate ? 80 : 48);
    const listTop = labelY + 70;
    const maxRows = Math.min(dayItems.length, 7);

    const rows = dayItems.slice(0, maxRows).map((item, index) => {
      const y = listTop + index * rowHeight;
      const titleLines = wrapText(item.title, 38);
      const titleTspans = titleLines
        .map((line, i) => `<tspan x="190" dy="${i === 0 ? 0 : 28}">${escapeXml(line)}</tspan>`)
        .join('');
      return `
        <line x1="60" y1="${y - 20}" x2="${cardWidth - 60}" y2="${y - 20}" stroke="rgba(255,255,255,0.12)" stroke-width="1" />
        <text x="60" y="${y + 10}" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="${brandColor}">${escapeXml(formatClock(item.time, item.day))}</text>
        <text y="${y + 8}" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="600" fill="#FFFFFF">${titleTspans}</text>
        ${favoriteAgendaIds.has(item.id) ? `<text x="${cardWidth - 80}" y="${y + 8}" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#FACC15">★</text>` : ''}
        ${item.location ? `<text x="190" y="${y + (titleLines.length > 1 ? 78 : 52)}" font-family="Helvetica, Arial, sans-serif" font-size="15" fill="rgba(255,255,255,0.6)">${escapeXml(item.location)}</text>` : ''}
      `;
    }).join('');

    const overflowNote = dayItems.length > maxRows
      ? `<text x="60" y="${listTop + maxRows * rowHeight + 20}" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="rgba(255,255,255,0.5)">+${dayItems.length - maxRows} more sessions</text>`
      : '';

    const svg = `
<svg width="${cardWidth}" height="${cardHeight}" viewBox="0 0 ${cardWidth} ${cardHeight}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
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

  <image href="${escapeXml(hashpassLogoHref)}" xlink:href="${escapeXml(hashpassLogoHref)}" x="60" y="38" width="190" height="42" preserveAspectRatio="xMinYMid meet" />
  <image href="${escapeXml(eventLogoHref)}" xlink:href="${escapeXml(eventLogoHref)}" x="760" y="30" width="260" height="82" preserveAspectRatio="xMaxYMid meet" />
  <text x="60" y="${titleY}" font-family="Helvetica, Arial, sans-serif" font-size="46" font-weight="800" fill="#FFFFFF">
    ${titleLines.map((line, i) => `<tspan x="60" dy="${i === 0 ? 0 : 52}">${escapeXml(line)}</tspan>`).join('')}
  </text>
  <text x="60" y="${dayY}" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="700" fill="rgba(255,255,255,0.9)">${escapeXml(`DAY ${dayNumber} · ${dayName || copy.fallbackDay}`)}</text>
  ${formattedDate ? `<text x="60" y="${dayY + 34}" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="500" fill="rgba(255,255,255,0.62)">${escapeXml(formattedDate)}</text>` : ''}

  <g>
    <rect x="60" y="${labelY - 12}" width="14" height="14" rx="7" fill="${brandColor}" />
    <text x="86" y="${labelY}" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="700" fill="rgba(255,255,255,0.85)">${escapeXml(copy.label)}</text>
  </g>

  ${rows}
  ${overflowNote}

  <text x="${cardWidth - 64}" y="${Math.min(cardHeight - 230, listTop + 420)}" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="116" font-weight="900" letter-spacing="5" fill="#FFFFFF" fill-opacity="0.045">#BSL2026</text>

  <rect x="0" y="${cardHeight - 180}" width="${cardWidth}" height="180" fill="${brandColor}" fill-opacity="0.14" />
  <text x="${cardWidth / 2}" y="${cardHeight - 151}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="16" font-weight="700" fill="rgba(255,255,255,0.72)">${escapeXml(ownerLine)}</text>
  <text x="${cardWidth / 2}" y="${cardHeight - 112}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="24" font-weight="800" fill="#FFFFFF">
    ${wrapText(copy.cta, 44).map((line, i) => `<tspan x="${cardWidth / 2}" dy="${i === 0 ? 0 : 30}">${escapeXml(line)}</tspan>`).join('')}
  </text>
  <text x="${cardWidth / 2}" y="${cardHeight - 60}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="17" font-weight="800" fill="${brandColor}">${eventHashtag}</text>
  <text x="${cardWidth / 2}" y="${cardHeight - 32}" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="15" font-weight="700" fill="rgba(255,255,255,0.68)">@hashpass.tech  •  x.com/BlockSummitLA</text>
</svg>`.trim();

    return new Response(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Content-Disposition': `inline; filename="${eventId}-my-agenda-day${imageDayNumber}.svg"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[schedule-share-image] error:', error);
    return new Response('Failed to generate image', { status: 500 });
  }
}
