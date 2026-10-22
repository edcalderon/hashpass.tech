import type { CampaignCopy, MarketingCampaignDraft } from '../types/marketing';

export const MARKETING_TIME_ZONE = 'America/Bogota';
export const MARKETING_REQUIREMENTS = ['product_verified', 'assets_published', 'reward_terms_verified'];
export const MARKETING_STATUS_LABELS = {
  queued: 'Queued', sending: 'In flight', accepted: 'Provider accepted', failed: 'Rejected', unknown: 'Needs reconciliation', suppressed: 'Suppressed',
};
const allowedHosts = new Set(['hashpass.tech', 'bsl.hashpass.tech', 'hashpass.club', 'lukas.lat']);
export function safeCampaignUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 1500) return false;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && allowedHosts.has(url.hostname); } catch { return false; }
}
export function validCampaignCopy(value: unknown): value is CampaignCopy {
  if (!value || typeof value !== 'object') return false;
  const copy = value as Record<string, unknown>;
  return ['subject', 'preheader', 'heading', 'message', 'actionLabel'].every(key => typeof copy[key] === 'string' && (copy[key] as string).trim().length > 0 && (copy[key] as string).length <= (key === 'message' ? 8000 : 180)) &&
    !/[\r\n]/.test(String(copy.subject)) && safeCampaignUrl(copy.actionUrl) &&
    (!copy.imageUrl || (safeCampaignUrl(copy.imageUrl) && typeof copy.imageAlt === 'string' && copy.imageAlt.trim().length > 0 && copy.imageAlt.length <= 180)) &&
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
export function renderMarketingEmail(copy: CampaignCopy, unsubscribeUrl: string, locale = 'es', eventLabel = 'HASHPASS UPDATES') {
  const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
  const es = locale === 'es';
  const footer = es ? 'Recibes este correo por tu suscripción a las novedades de HASHPASS. Puedes dejar de recibir campañas en cualquier momento.' : 'You receive this email because you subscribed to HASHPASS updates. You can stop receiving campaigns at any time.';
  const optout = es ? 'Cancelar suscripción' : 'Unsubscribe';
  const html = `<!doctype html><html lang="${es ? 'es' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(copy.subject)}</title></head><body style="margin:0;background:#f7f9fa;font-family:Arial,sans-serif;color:#17181c"><div style="display:none;max-height:0;overflow:hidden">${escape(copy.preheader)}</div><table role="presentation" width="100%"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" style="max-width:640px;background:#ffffff;border:1px solid #dfe3e8;border-radius:24px"><tr><td style="padding:32px;background:#111114;border-radius:24px 24px 0 0"><img alt="HASHPASS" width="160" src="https://hashpass.tech/campaigns/bsl-2026/hashpass-logo.png"><p style="color:#b0b0bc;font-size:12px;letter-spacing:2px;margin:20px 0 0">${escape(eventLabel)}</p></td></tr><tr><td style="padding:32px"><h1 style="font-size:32px;line-height:1.15;letter-spacing:-1px;margin:0 0 24px">${escape(copy.heading)}</h1>${copy.imageUrl ? `<p style="margin:0 0 24px"><img src="${escape(copy.imageUrl)}" alt="${escape(copy.imageAlt || '')}" width="260" style="display:block;width:100%;max-width:260px;height:auto;border:0"></p>` : ''}${copy.message.split('\n\n').map(paragraph => `<p style="font-size:16px;line-height:1.65;color:#565963;margin:0 0 20px">${escape(paragraph).replace(/\n/g, '<br>')}</p>`).join('')}<p style="margin:32px 0"><a href="${escape(copy.actionUrl)}" style="display:inline-block;padding:16px 24px;border-radius:999px;background:#0e7490;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700">${escape(copy.actionLabel)}</a></p>${copy.guideUrl ? `<p style="font-size:14px;line-height:1.5"><a href="${escape(copy.guideUrl)}" style="color:#0e7490">${es ? 'Ver video y guía paso a paso' : 'Watch the video and step-by-step guide'}</a></p>` : ''}</td></tr><tr><td style="padding:24px 32px;border-top:1px solid #dfe3e8"><p style="font-size:12px;line-height:1.6;color:#565963">${footer}</p><a href="${escape(unsubscribeUrl)}" style="font-size:12px;color:#0e7490">${optout}</a> · <a href="https://hashpass.tech/privacy" style="font-size:12px;color:#0e7490">${es ? 'Privacidad' : 'Privacy'}</a></td></tr></table></td></tr></table></body></html>`;
  return { subject: copy.subject, html, text: `${copy.preheader}\n\n${copy.heading}\n\n${copy.message}\n\n${copy.actionLabel}: ${copy.actionUrl}${copy.guideUrl ? `\n${es ? 'Video y guía' : 'Video and guide'}: ${copy.guideUrl}` : ''}\n\n${footer}\n${optout}: ${unsubscribeUrl}` };
}
