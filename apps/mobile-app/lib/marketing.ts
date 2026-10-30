import type { CampaignCopy, MarketingCampaignDraft } from '../types/marketing';

export const MARKETING_TIME_ZONE = 'America/Bogota';
export const MARKETING_REQUIREMENTS = ['product_verified', 'assets_published', 'reward_terms_verified'];
export const MARKETING_STATUS_LABELS = {
  queued: 'Queued', sending: 'In flight', accepted: 'Provider accepted', failed: 'Rejected', unknown: 'Needs reconciliation', suppressed: 'Suppressed',
};
const allowedHosts = new Set(['hashpass.tech', 'hashpass.club', 'lukas.lat', 'blockchainsummit.la']);
export function safeCampaignUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 1500) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const approvedHost = allowedHosts.has(host) || host.endsWith('.hashpass.tech');
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && approvedHost;
  } catch { return false; }
}
export function validCampaignCopy(value: unknown): value is CampaignCopy {
  if (!value || typeof value !== 'object') return false;
  const copy = value as Record<string, unknown>;
  const brand = copy.brand && typeof copy.brand === 'object' && !Array.isArray(copy.brand) ? copy.brand as Record<string, unknown> : null;
  const eventDetails = copy.eventDetails && typeof copy.eventDetails === 'object' && !Array.isArray(copy.eventDetails) ? copy.eventDetails as Record<string, unknown> : null;
  const validBrand = !copy.brand || (!!brand && typeof brand.name === 'string' && brand.name.trim().length > 0 && brand.name.length <= 60 &&
    (!brand.logoUrl || safeCampaignUrl(brand.logoUrl)) && (!brand.privacyUrl || safeCampaignUrl(brand.privacyUrl)) &&
    (!brand.eventLogoUrl || safeCampaignUrl(brand.eventLogoUrl)) &&
    (!brand.eventLogoAlt || (typeof brand.eventLogoAlt === 'string' && brand.eventLogoAlt.trim().length > 0 && brand.eventLogoAlt.length <= 120 && !/[\r\n]/.test(brand.eventLogoAlt))) &&
    (!brand.accentColor || (typeof brand.accentColor === 'string' && /^#[0-9a-f]{6}$/i.test(brand.accentColor))) &&
    (!brand.eventLabel || (typeof brand.eventLabel === 'string' && brand.eventLabel.trim().length > 0 && brand.eventLabel.length <= 120 && !/[\r\n]/.test(brand.eventLabel))));
  const validEventDetails = !copy.eventDetails || (!!eventDetails && ['date', 'location', 'venue'].every(key => typeof eventDetails[key] === 'string' && (eventDetails[key] as string).trim().length > 0 && (eventDetails[key] as string).length <= 180));
  const validHashtags = !copy.hashtags || (Array.isArray(copy.hashtags) && copy.hashtags.length <= 8 && copy.hashtags.every(tag => typeof tag === 'string' && /^#[\p{L}\p{N}_]{2,50}$/u.test(tag)));
  return ['subject', 'preheader', 'heading', 'message', 'actionLabel'].every(key => typeof copy[key] === 'string' && (copy[key] as string).trim().length > 0 && (copy[key] as string).length <= (key === 'message' ? 8000 : 180)) &&
    !/[\r\n]/.test(String(copy.subject)) && safeCampaignUrl(copy.actionUrl) && validBrand && validEventDetails && validHashtags &&
    (!copy.guideLabel || (typeof copy.guideLabel === 'string' && copy.guideLabel.trim().length > 0 && copy.guideLabel.length <= 120 && !/[\r\n]/.test(copy.guideLabel))) &&
    (!copy.disclaimer || (typeof copy.disclaimer === 'string' && copy.disclaimer.trim().length > 0 && copy.disclaimer.length <= 500)) &&
    (!copy.imageUrl || (safeCampaignUrl(copy.imageUrl) && typeof copy.imageAlt === 'string' && copy.imageAlt.trim().length > 0 && copy.imageAlt.length <= 180)) &&
    (!copy.imageCaption || (typeof copy.imageCaption === 'string' && copy.imageCaption.trim().length > 0 && copy.imageCaption.length <= 180)) &&
    (!copy.guideUrl || safeCampaignUrl(copy.guideUrl));
}
export function validCampaignDraft(value: unknown): value is MarketingCampaignDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as MarketingCampaignDraft;
  return typeof draft.key === 'string' && /^[a-z0-9][a-z0-9-]{2,79}$/.test(draft.key) && typeof draft.name === 'string' && draft.name.trim().length > 0 && draft.name.length <= 160 &&
    typeof draft.eventId === 'string' && /^[a-z0-9-]{1,64}$/.test(draft.eventId) && draft.timeZone === MARKETING_TIME_ZONE && validZonedTime(draft.scheduledAt) &&
    validCampaignCopy(draft.content?.es) && validCampaignCopy(draft.content?.en) && Array.isArray(draft.requirements) &&
    draft.requirements.length <= MARKETING_REQUIREMENTS.length && draft.requirements.every(key => MARKETING_REQUIREMENTS.includes(key)) && !!draft.readiness && typeof draft.readiness === 'object' && !Array.isArray(draft.readiness) &&
    Object.entries(draft.readiness).every(([key, val]) => MARKETING_REQUIREMENTS.includes(key) && typeof val === 'boolean');
}
export function validZonedTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{3})?)?(Z|[+-](\d{2}):(\d{2}))$/);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return Number(year) >= 1000 && Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= days && Number(hour) < 24 && Number(minute) < 60 && Number(second || 0) < 60 && Number(offsetHour || 0) <= 14 && Number(offsetMinute || 0) < 60 && (offsetHour !== '14' || offsetMinute === '00') && Number.isFinite(Date.parse(value));
}
export function formatCampaignTime(value: string | null, locale = 'en') {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale, { timeZone: MARKETING_TIME_ZONE, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}
export function activityRoute(path: string): string | null {
  const clean = path.replace(/^\/\(shared\)/, '').split('?')[0];
  if (['/contacts', '/home', '/demo'].includes(clean)) return clean;
  if (/^\/dashboard\/(explore|contacts|wallet)$/.test(clean)) return clean;
  if (/^\/events\/[a-z0-9-]+\/(agenda|networking)(\/my-requests|\/my-schedule)?$/.test(clean)) return clean.replace(/^\/events\/[^/]+/, '/events/:event');
  return null;
}
export function renderMarketingEmail(copy: CampaignCopy, unsubscribeUrl: string | null, locale = 'es', eventLabel = 'HASHPASS UPDATES') {
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
  const es = locale === 'es';
  const brand = copy.brand;
  const brandName = brand?.name || 'HASHPASS';
  const color = brand?.accentColor && /^#[0-9a-f]{6}$/i.test(brand.accentColor) ? brand.accentColor : '#0e7490';
  const logoUrl = brand ? brand.logoUrl : 'https://hashpass.tech/campaigns/bsl-2026/hashpass-logo.png';
  const safeLogoUrl = logoUrl && safeCampaignUrl(logoUrl) ? logoUrl : '';
  const privacyUrl = brand?.privacyUrl && safeCampaignUrl(brand.privacyUrl) ? brand.privacyUrl : 'https://hashpass.tech/privacy';
  const label = brand?.eventLabel || eventLabel;
  const subscribedFooter = es ? `Recibes este correo porque te suscribiste a las novedades de ${brandName}. Puedes dejar de recibir campañas en cualquier momento.` : `You receive this email because you subscribed to updates from ${brandName}. You can stop receiving campaigns at any time.`;
  const optout = es ? 'Cancelar suscripción' : 'Unsubscribe';
  const previewOnly = !unsubscribeUrl || /[?&]token=PREVIEW(?:&|$)/i.test(unsubscribeUrl);
  const footer = previewOnly
    ? (es ? 'Vista previa interna de una campaña HASHPASS. El envío final incluye controles de suscripción personalizados.' : 'Internal preview of a HASHPASS campaign. The final send includes recipient-specific subscription controls.')
    : subscribedFooter;
  const optoutMarkup = previewOnly
    ? `<span style="font-size:12px;color:#565963">${optout} — ${es ? 'el enlace personal se añadirá al enviar la campaña.' : 'the personal link will be added when the campaign is sent.'}</span>`
    : `<a href="${escape(unsubscribeUrl || '')}" style="font-size:12px;color:${color}">${optout}</a>`;
  const logo = safeLogoUrl ? `<img alt="${escape(brandName)}" width="160" src="${escape(safeLogoUrl)}" style="display:block;width:160px;max-width:160px;height:auto;border:0">` : `<span style="display:inline-block;color:#ffffff;font-size:17px;font-weight:700;letter-spacing:3px">${escape(brandName)}</span>`;
  const eventLogoUrl = brand?.eventLogoUrl && safeCampaignUrl(brand.eventLogoUrl) ? brand.eventLogoUrl : '';
  const eventLogo = eventLogoUrl ? `<td align="right" valign="middle" style="padding-left:18px"><img alt="${escape(brand?.eventLogoAlt || label)}" width="118" src="${escape(eventLogoUrl)}" style="display:block;width:118px;max-width:118px;height:auto;border:0"></td>` : '';
  const eventDetails = copy.eventDetails ? `<table role="presentation" width="100%" style="margin:0 0 24px;background:#f3f6f8;border:1px solid #e3e8ed;border-radius:16px"><tr><td style="padding:18px 20px"><p style="margin:0 0 5px;font-size:11px;letter-spacing:1.5px;color:${color};font-weight:700">${es ? 'CUÁNDO' : 'WHEN'}</p><p style="margin:0 0 15px;font-size:15px;color:#17181c">${escape(copy.eventDetails.date)}</p><p style="margin:0 0 5px;font-size:11px;letter-spacing:1.5px;color:${color};font-weight:700">${es ? 'DÓNDE' : 'WHERE'}</p><p style="margin:0 0 5px;font-size:15px;color:#17181c">${escape(copy.eventDetails.venue)}</p><p style="margin:0;font-size:14px;color:#565963">${escape(copy.eventDetails.location)}</p></td></tr></table>` : '';
  const hashtags = copy.hashtags?.length ? `<p style="margin:0 0 24px;font-size:14px;line-height:1.8;color:${color};font-weight:700">${copy.hashtags.map(tag => escape(tag)).join('&nbsp;&nbsp;')}</p>` : '';
  const disclaimer = copy.disclaimer ? `<table role="presentation" width="100%" style="margin:4px 0 24px;background:#f7f9fa;border-radius:12px"><tr><td style="padding:14px 16px;font-size:13px;line-height:1.55;color:#565963">${escape(copy.disclaimer)}</td></tr></table>` : '';
  const image = copy.imageUrl
    ? `<p style="margin:0 0 8px;text-align:center"><img src="${escape(copy.imageUrl)}" alt="${escape(copy.imageAlt || '')}" width="420" style="display:block;width:100%;max-width:420px;height:auto;margin:0 auto;border:1px solid #dfe3e8;border-radius:16px"></p>${copy.imageCaption ? `<p style="margin:0 0 26px;text-align:center;color:#667085;font-size:13px;line-height:19px">${escape(copy.imageCaption)}</p>` : '<div style="height:24px;line-height:24px">&nbsp;</div>'}`
    : '';
  const html = `<!doctype html><html lang="${es ? 'es' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(copy.subject)}</title></head><body style="margin:0;background:#f1f4f6;font-family:Arial,sans-serif;color:#17181c"><div style="display:none;max-height:0;overflow:hidden">${escape(copy.preheader)}</div><table role="presentation" width="100%" style="background:#f1f4f6"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:640px;background:#ffffff;border:1px solid #dfe3e8;border-radius:24px"><tr><td style="padding:30px 32px;background:#111114;border-radius:24px 24px 0 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td valign="middle">${logo}</td>${eventLogo}</tr></table><p style="color:#b0b0bc;font-size:12px;letter-spacing:2px;margin:18px 0 0">${escape(label)}</p></td></tr><tr><td style="padding:32px"><h1 style="font-size:32px;line-height:1.15;letter-spacing:-1px;margin:0 0 24px">${escape(copy.heading)}</h1>${image}${eventDetails}${copy.message.split('\n\n').map(paragraph => `<p style="font-size:16px;line-height:1.65;color:#424a52;margin:0 0 20px">${escape(paragraph).replace(/\n/g, '<br>')}</p>`).join('')}<p style="margin:28px 0"><a href="${escape(copy.actionUrl)}" style="display:inline-block;padding:16px 24px;border-radius:999px;background:${color};color:#ffffff;text-decoration:none;font-size:16px;font-weight:700">${escape(copy.actionLabel)}</a></p>${hashtags}${disclaimer}${copy.guideUrl ? `<p style="font-size:14px;line-height:1.5"><a href="${escape(copy.guideUrl)}" style="color:${color};font-weight:700">${escape(copy.guideLabel || (es ? 'Ver video y guía paso a paso' : 'Watch the video and step-by-step guide'))}</a></p>` : ''}</td></tr><tr><td style="padding:24px 32px;border-top:1px solid #dfe3e8"><p style="font-size:12px;line-height:1.6;color:#565963">${escape(footer)}</p>${optoutMarkup} · <a href="${escape(privacyUrl)}" style="font-size:12px;color:${color}">${es ? 'Privacidad' : 'Privacy'}</a></td></tr></table></td></tr></table></body></html>`;
  const detailsText = copy.eventDetails ? `\n\n${es ? 'Fecha' : 'When'}: ${copy.eventDetails.date}\n${es ? 'Lugar' : 'Where'}: ${copy.eventDetails.venue} · ${copy.eventDetails.location}` : '';
  const hashtagsText = copy.hashtags?.length ? `\n\n${copy.hashtags.join(' ')}` : '';
  const disclaimerText = copy.disclaimer ? `\n\n${copy.disclaimer}` : '';
  const privacyLabel = es ? 'Privacidad' : 'Privacy';
  return { subject: copy.subject, html, text: `${copy.preheader}\n\n${copy.heading}${detailsText}\n\n${copy.message}\n\n${copy.actionLabel}: ${copy.actionUrl}${hashtagsText}${disclaimerText}${copy.guideUrl ? `\n\n${copy.guideLabel || (es ? 'Ver video y guía paso a paso' : 'Watch the video and step-by-step guide')}: ${copy.guideUrl}` : ''}\n\n${footer}\n${previewOnly ? (es ? 'El enlace personal para cancelar la suscripción se añadirá al enviar la campaña.' : 'A personal unsubscribe link will be added when the campaign is sent.') : `${optout}: ${unsubscribeUrl}`}\n${privacyLabel}: ${privacyUrl}` };
}
