import pack from '../../config/marketing/bsl2026.json';
import { activityRoute, renderMarketingEmail, safeCampaignUrl, validCampaignCopy, validCampaignDraft, validZonedTime, formatCampaignTime } from '../../lib/marketing';

describe('campaign validation and rendering', () => {
  it('validates all seven bilingual scheduled campaign drafts', () => {
    expect(pack.messages).toHaveLength(7);
    for (const m of pack.messages) expect(validCampaignDraft({ ...m, readiness: {} })).toBe(true);
    expect(new Date(pack.messages[0].scheduledAt).toISOString()).toBe('2026-10-26T14:00:00.000Z');
    expect(formatCampaignTime(pack.messages[0].scheduledAt)).toContain('09:00');
  });
  it.each(['http://hashpass.tech', 'https://hashpass.tech.evil.com', 'https://evil.com', 'javascript:alert(1)', 'https://u:p@hashpass.tech', 'https://hashpass.tech:444/'])('rejects unsafe CTA %s', url => expect(safeCampaignUrl(url)).toBe(false));
  it('rejects invalid copy and local timestamps', () => {
    const copy = pack.messages[0].content.en;
    expect(validCampaignCopy({ ...copy, subject: 'Hello\r\nBcc: other' })).toBe(false);
    expect(validCampaignCopy({ ...copy, message: '' })).toBe(false);
    expect(validCampaignCopy(null)).toBe(false);
    expect(validZonedTime('2026-10-26T09:00')).toBe(false);
    expect(validZonedTime('2026-02-30T09:00:00-05:00')).toBe(false);
    expect(validZonedTime('2026-10-26T24:00:00-05:00')).toBe(false);
    expect(validCampaignCopy({ ...copy, imageUrl: 'https://evil.com/x.png', imageAlt: 'Preview' })).toBe(false);
    expect(validCampaignCopy({ ...copy, guideUrl: 'javascript:alert(1)' })).toBe(false);
    expect(validCampaignDraft({ ...pack.messages[0], readiness: { hidden: true } })).toBe(false);
    expect(validCampaignDraft({ ...pack.messages[0], readiness: {}, requirements: ['fake'] })).toBe(false);
  });
  it('escapes user-authored HTML, renders locale footer and preserves readable plain text', () => {
    const copy = { ...pack.messages[0].content.en, heading: '<script>alert(1)</script>', message: 'First & second\n\nNext paragraph' };
    const en = renderMarketingEmail(copy, 'https://api.hashpass.tech/unsubscribe?token=sample', 'en');
    expect(en.html).not.toContain('<script>'); expect(en.html).toContain('&lt;script&gt;'); expect(en.html).toContain('Unsubscribe');
    expect(en.text).toContain('First & second\n\nNext paragraph'); expect(en.html).not.toContain('BSL COLOMBIA');
    expect(renderMarketingEmail(copy, 'https://api.hashpass.tech/', 'es').html).toContain('Cancelar suscripción');
  });
  it('renders the bilingual attendance artwork with published brand assets and its preview caption', () => {
    const invitation = pack.messages.find((message: (typeof pack.messages)[number]) => message.key === 'bsl2026-attendance-invitation');
    expect(invitation).toBeDefined();
    for (const locale of ['es', 'en'] as const) {
      const copy = invitation!.content[locale];
      expect(validCampaignCopy(copy)).toBe(true);
      const rendered = renderMarketingEmail(copy, null, locale);
      expect(rendered.html).toContain(copy.brand!.logoUrl!);
      expect(rendered.html).toContain(copy.brand!.eventLogoUrl!);
      expect(rendered.html).toContain(copy.imageUrl!);
      expect(rendered.html).toContain(copy.imageCaption!);
    }
  });
  it('allowlists normalized navigation and excludes sensitive routes and query strings', () => {
    expect(activityRoute('/contacts?card=private')).toBe('/contacts');
    expect(activityRoute('/(shared)/dashboard/contacts')).toBe('/dashboard/contacts');
    expect(activityRoute('/events/colombia2026/networking/my-requests')).toBe('/events/:event/networking/my-requests');
    for (const route of ['/auth/login', '/profile/private', '/dashboard/admin', '/wallet/seed', '/events/evil/../auth']) expect(activityRoute(route)).toBeNull();
  });
});
