import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { renderAdminCampaignEmail, sendAdminCampaignEmail, type AdminCampaignTemplate } from '@/lib/email';
import { authorizeEventAdmin, listEventAttendees } from '@/lib/server/event-admin';

const audiences = new Set(['attendees', 'speakers', 'all', 'selected']);
const templates = new Set<AdminCampaignTemplate>(['branded', 'raw']);
const clean = (value: unknown, max: number) => String(value || '').trim().slice(0, max);

export async function GET(request: Request) {
  const eventId = clean(new URL(request.url).searchParams.get('eventId'), 64);
  const auth = await authorizeEventAdmin(request, eventId);
  if ('response' in auth) return auth.response;
  const { data, error } = await auth.supabase.from('admin_email_deliveries').select('*').eq('event_id', eventId).order('created_at', { ascending: false }).limit(100);
  return error ? Response.json({ error: 'Unable to load email history' }, { status: 500 }) : Response.json({ data: data || [] });
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimitOk(`admin-communications:${ip}`)) return Response.json({ error: 'Too many requests' }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const eventId = clean(body.eventId, 64);
  const auth = await authorizeEventAdmin(request, eventId);
  if ('response' in auth) return auth.response;
  const subject = clean(body.subject, 160), heading = clean(body.heading, 160), message = clean(body.message, 10000);
  const audience = clean(body.audience, 20);
  const template: AdminCampaignTemplate = templates.has(body.template) ? body.template : 'branded';
  if (!subject || !heading || !message || !audiences.has(audience)) return Response.json({ error: 'Subject, heading, message and a valid audience are required' }, { status: 400 });
  const draft = { subject, heading, message, actionUrl: clean(body.actionUrl, 1000), actionLabel: clean(body.actionLabel, 80), eventId, template };
  if (body.preview === true) {
    const rendered = renderAdminCampaignEmail(draft);
    return Response.json({ data: { ...draft, html: rendered.html, text: rendered.text } });
  }

  let recipients: { id: string; email: string }[] = [];
  if (audience === 'speakers' || audience === 'all') {
    const { data } = await auth.supabase.from('bsl_speakers').select('user_id').eq('is_active', true).not('user_id', 'is', null);
    for (const row of data || []) { const u = await auth.supabase.auth.admin.getUserById(row.user_id); if (u.data.user?.email) recipients.push({ id: row.user_id, email: u.data.user.email }); }
  }
  if (audience === 'attendees' || audience === 'all') {
    try {
      const attendees = await listEventAttendees(auth.supabase, auth.userId, eventId);
      recipients.push(...attendees.map(a => ({ id: a.id, email: a.email })));
    } catch (error: any) {
      return Response.json({ error: error?.message || 'Unable to resolve event attendees' }, { status: 500 });
    }
  }
  if (audience === 'selected') {
    for (const id of [...new Set(Array.isArray(body.userIds) ? body.userIds.slice(0, 100) : [])] as string[]) { const u = await auth.supabase.auth.admin.getUserById(id); if (u.data.user?.email) recipients.push({ id, email: u.data.user.email }); }
  }
  recipients = [...new Map(recipients.map(r => [r.id, r])).values()];
  const results = await Promise.all(recipients.map(async recipient => ({ recipient, result: await sendAdminCampaignEmail({ to: recipient.email, ...draft }) })));
  await auth.supabase.from('admin_email_deliveries').insert(results.map(({ recipient, result }) => ({ event_id: eventId, sent_by: auth.userId, recipient_user_id: recipient.id, recipient_email: recipient.email, audience, subject, heading, message, template, status: result.success ? 'sent' : 'failed', provider_message_id: result.messageId || null, error: result.error || null })));
  return Response.json({ data: { sent: results.filter(r => r.result.success).length, failed: results.filter(r => !r.result.success).length, total: results.length } });
}
