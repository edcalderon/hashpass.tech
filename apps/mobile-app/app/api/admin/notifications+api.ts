import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { authorizeGlobalAdmin } from '@/lib/server/global-admin';
import { marketingRunnerAuthorized } from '@/lib/server/marketing-runner-auth';
import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { EVENTS } from '@/config/events';
import webPush from 'web-push';
import type {
  AdminNotificationAudience,
  AdminNotificationLevel,
  AdminNotificationPassTier,
  AdminNotificationRecipient,
} from '@/types/AdminNotification.types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EXPO_TOKEN_PATTERN = /^(Expo|Exponent)PushToken\[[^\]\s]+\]$/;
const PASS_TIERS = new Set<AdminNotificationPassTier>([
  'all', 'free', 'general', 'speaker', 'vip', 'platinum', 'enterprise',
]);
const PASS_STORAGE_EVENT_ID_ALIASES: Record<string, string> = {
  bsl: 'colombia2026',
  'bsl-2025': 'bsl2025',
};
const AUDIENCES = new Set<AdminNotificationAudience>([
  'all_active', 'event_attendees', 'speakers', 'selected',
]);
const LEVELS = new Set<AdminNotificationLevel>(['info', 'important']);
const MAX_RECIPIENTS = 10000;
const REGISTRY_PAGE_SIZE = 1000;
const clean = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

function validInternalLink(value: unknown): string | null | undefined {
  const link = clean(value, 512);
  if (!link) return null;
  if (
    !link.startsWith('/') || link.startsWith('//') || link.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(link) ||
    !/^\/(dashboard|events|home|explore|wallet|profile)(\/|[?#]|$)/.test(link)
  ) return undefined;
  return link;
}

function normalizeIds(value: unknown, max: number): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) return null;
  const ids = [...new Set(value.map((id) => clean(id, 64)))];
  return ids.length > 0 && ids.every((id) => UUID_PATTERN.test(id)) ? ids : null;
}

function mapRegistryRecipient(row: any): AdminNotificationRecipient | null {
  const supabaseId = typeof row?.provider_ids?.supabase === 'string'
    ? row.provider_ids.supabase
    : '';
  const email = typeof row?.email === 'string' ? row.email.trim().toLowerCase() : '';
  if (!UUID_PATTERN.test(supabaseId) || !email) return null;
  return {
    id: supabaseId,
    email,
    name: typeof row.full_name === 'string' && row.full_name.trim()
      ? row.full_name.trim()
      : null,
  };
}

async function listActiveRecipients(supabase: any): Promise<AdminNotificationRecipient[]> {
  const recipients = new Map<string, AdminNotificationRecipient>();
  for (let offset = 0; offset <= MAX_RECIPIENTS; offset += REGISTRY_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('user')
      .select('email,full_name,provider_ids,status,deleted_at,id')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(offset, offset + REGISTRY_PAGE_SIZE - 1);
    if (error) throw new Error('Unable to load the active user audience');
    const rows = data || [];
    for (const row of rows) {
      const recipient = mapRegistryRecipient(row);
      if (recipient) recipients.set(recipient.id, recipient);
    }
    if (rows.length < REGISTRY_PAGE_SIZE) break;
    if (offset >= MAX_RECIPIENTS) {
      throw new Error(`The audience exceeds the ${MAX_RECIPIENTS.toLocaleString()} recipient limit`);
    }
  }
  return [...recipients.values()];
}

async function resolveRecipients(
  supabase: any,
  audience: AdminNotificationAudience,
  eventId: string,
  passTier: AdminNotificationPassTier,
  selectedIds: string[] | null,
): Promise<AdminNotificationRecipient[]> {
  const active = await listActiveRecipients(supabase);
  const activeById = new Map(active.map((recipient) => [recipient.id, recipient]));
  if (audience === 'all_active') return active;
  if (audience === 'selected') {
    return (selectedIds || []).map((id) => activeById.get(id)).filter((row): row is AdminNotificationRecipient => !!row);
  }

  const userIds = new Set<string>();
  if (audience === 'speakers') {
    for (let offset = 0; offset <= MAX_RECIPIENTS; offset += REGISTRY_PAGE_SIZE) {
      const { data, error } = await supabase
        .from('bsl_speakers')
        .select('user_id')
        .eq('is_active', true)
        .not('user_id', 'is', null)
        .order('id', { ascending: true })
        .range(offset, offset + REGISTRY_PAGE_SIZE - 1);
      if (error) throw new Error('Unable to load the speaker audience');
      const rows = data || [];
      for (const row of rows) {
        const id = String(row.user_id || '');
        if (UUID_PATTERN.test(id)) userIds.add(id);
      }
      if (rows.length < REGISTRY_PAGE_SIZE) break;
      if (offset >= MAX_RECIPIENTS) {
        throw new Error(`The audience exceeds the ${MAX_RECIPIENTS.toLocaleString()} recipient limit`);
      }
    }
  } else {
    const storageEventId = PASS_STORAGE_EVENT_ID_ALIASES[eventId] || eventId;
    for (let offset = 0; offset <= MAX_RECIPIENTS; offset += REGISTRY_PAGE_SIZE) {
      let query = supabase
        .from('passes')
        .select('user_id,tier,id')
        .eq('event_id', storageEventId)
        .eq('is_active', true)
        .order('id', { ascending: true })
        .range(offset, offset + REGISTRY_PAGE_SIZE - 1);
      if (passTier !== 'all') query = query.eq('tier', passTier);
      const { data, error } = await query;
      if (error) throw new Error('Unable to load the event attendee audience');
      const rows = data || [];
      for (const row of rows) {
        const id = String(row.user_id || '');
        if (UUID_PATTERN.test(id)) userIds.add(id);
      }
      if (rows.length < REGISTRY_PAGE_SIZE) break;
      if (offset >= MAX_RECIPIENTS) {
        throw new Error(`The audience exceeds the ${MAX_RECIPIENTS.toLocaleString()} recipient limit`);
      }
    }
  }
  return [...userIds].map((id) => activeById.get(id)).filter((row): row is AdminNotificationRecipient => !!row);
}

function normalizeContent(body: Record<string, unknown>) {
  const title = clean(body.title, 120);
  const message = clean(body.message, 2000);
  const level = clean(body.level, 16) as AdminNotificationLevel;
  const deepLink = validInternalLink(body.deepLink);
  if (!title || !message || !LEVELS.has(level) || deepLink === undefined) return null;
  return { title, message, level, deepLink };
}

function optionalTimestamp(value: unknown): string | null | undefined {
  const raw = clean(value, 64);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) return undefined;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function normalizeTiming(body: Record<string, unknown>) {
  const scheduledAt = optionalTimestamp(body.scheduledAt);
  const expiresAt = optionalTimestamp(body.expiresAt);
  if (scheduledAt === undefined) return { error: 'Enter a valid scheduled date and time with its timezone.' } as const;
  if (expiresAt === undefined) return { error: 'Enter a valid expiry date and time with its timezone.' } as const;
  const referenceTime = scheduledAt ? Date.parse(scheduledAt) : Date.now();
  if (scheduledAt && referenceTime <= Date.now()) {
    return { error: 'Scheduled send time must be in the future.' } as const;
  }
  if (expiresAt && Date.parse(expiresAt) <= referenceTime) {
    return { error: 'Expiry must be later than the scheduled send time.' } as const;
  }
  return { scheduledAt, expiresAt } as const;
}

async function sendPushNotifications(batch: any) {
  const jobs = Array.isArray(batch?.jobs) ? batch.jobs.slice(0, 20) : [];
  const results = new Map<string, any>(jobs.map((job: any) => [job.id, {
    id: job.id,
    status: 'retry',
    error: 'Push provider response could not be confirmed; delivery will retry.',
  }]));
  const ttlSeconds = batch?.expires_at
    ? Math.max(0, Math.ceil((Date.parse(batch.expires_at) - Date.now()) / 1000))
    : 86400;
  const expoJobs = jobs.filter((job: any) => job.platform !== 'web' && EXPO_TOKEN_PATTERN.test(String(job.token || '')));
  if (expoJobs.length) {
    try {
      // The Expo push gateway is an external provider; apiClient is reserved for HASHPASS API calls.
      // eslint-disable-next-line no-restricted-syntax
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(expoJobs.map((job: any) => ({
          to: job.token,
          title: batch.title,
          body: batch.message,
          sound: 'default',
          priority: batch.level === 'important' ? 'high' : 'default',
          ttl: ttlSeconds,
          data: { deepLink: batch.deep_link, adminNotificationCampaignId: batch.campaign_id },
        }))),
        signal: AbortSignal.timeout(8000),
      });
      if (response.ok) {
        const body = await response.json() as { data?: { status?: string; id?: string; details?: { error?: string } }[] };
        const tickets = Array.isArray(body.data) ? body.data : [];
        expoJobs.forEach((job: any, index: number) => {
          const ticket = tickets[index];
          if (ticket?.status === 'ok') {
            results.set(job.id, { id: job.id, status: 'sent', ticketId: ticket.id });
          } else if (ticket?.status === 'error') {
            const deviceNotRegistered = ticket.details?.error === 'DeviceNotRegistered';
            results.set(job.id, {
              id: job.id,
              status: 'failed',
              error: deviceNotRegistered ? 'Push device is no longer registered.' : 'Push provider rejected this device.',
              disableToken: deviceNotRegistered,
            });
          }
        });
      }
    } catch {
      // Leave the claimed rows retryable when provider acceptance is uncertain.
    }
  }

  const webJobs = jobs.filter((job: any) => job.platform === 'web');
  if (webJobs.length) {
    const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    const subject = process.env.WEB_PUSH_VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) {
      for (const job of webJobs) {
        results.set(job.id, { id: job.id, status: 'failed', error: 'Browser push is not configured for this environment.' });
      }
    } else {
      const payload = JSON.stringify({
        title: batch.title,
        body: batch.message,
        data: { deepLink: batch.deep_link, adminNotificationCampaignId: batch.campaign_id },
      });
      await Promise.all(webJobs.map(async (job: any) => {
        if (!job.subscription || job.subscription.endpoint !== job.token) {
          results.set(job.id, { id: job.id, status: 'failed', error: 'Browser push subscription is invalid.' });
          return;
        }
        try {
          await webPush.sendNotification(job.subscription as webPush.PushSubscription, payload, {
            TTL: ttlSeconds,
            urgency: batch.level === 'important' ? 'high' : 'normal',
            timeout: 8000,
            vapidDetails: { subject, publicKey, privateKey },
          });
          results.set(job.id, { id: job.id, status: 'sent' });
        } catch (error) {
          const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
            ? Number((error as { statusCode?: unknown }).statusCode)
            : 0;
          const deviceNotRegistered = statusCode === 404 || statusCode === 410;
          const retry = !deviceNotRegistered && (statusCode === 0 || statusCode >= 500);
          results.set(job.id, {
            id: job.id,
            status: retry ? 'retry' : 'failed',
            error: deviceNotRegistered ? 'Push device is no longer registered.' : 'Browser push provider did not accept this device.',
            disableToken: deviceNotRegistered,
          });
        }
      }));
    }
  }

  for (const job of jobs) {
    if (!results.has(job.id)) results.set(job.id, { id: job.id, status: 'failed', error: 'Unsupported push device.' });
  }
  return [...results.values()];
}

async function persistCampaign(
  supabase: any,
  actorId: string,
  content: { title: string; message: string; level: AdminNotificationLevel; deepLink: string | null },
  audience: Record<string, unknown>,
  recipients: AdminNotificationRecipient[],
  pushRequested: boolean,
  isTest: boolean,
  expiresAt: string | null,
) {
  const { data, error } = await supabase.rpc('admin_create_notification_campaign', {
    p_actor_id: actorId,
    p_title: content.title,
    p_message: content.message,
    p_level: content.level,
    p_deep_link: content.deepLink,
    p_push_requested: pushRequested,
    p_is_test: isTest,
    p_audience: audience,
    p_recipient_ids: recipients.map((recipient) => recipient.id),
    p_scheduled_at: null,
    p_expires_at: expiresAt,
  });
  if (error || !data?.campaign_id) {
    console.error('[admin-notifications] campaign creation failed:', error?.message || 'invalid response');
    throw new Error('Unable to create the notification campaign');
  }

  return {
    campaignId: data.campaign_id as string,
    recipients: Number(data.recipient_count) || recipients.length,
    inAppSent: Number(data.recipient_count) || recipients.length,
    pushRequested,
    pushQueued: Number(data.push_device_count) || 0,
    pushSent: 0,
    pushFailed: 0,
    pushSkipped: pushRequested && !(Number(data.push_device_count) || 0) ? recipients.length : 0,
  };
}

/** Global-admin notification history. Email campaigns are stored separately. */
export async function GET(request: Request) {
  const authorization = await authorizeGlobalAdmin(request);
  if ('response' in authorization) return authorization.response;
  const { data, error } = await authorization.supabase
    .from('admin_notification_campaigns')
    .select('id,title,message,level,deep_link,push_requested,is_test,audience,status,scheduled_at,expires_at,recipient_count,in_app_sent_count,push_sent_count,push_failed_count,push_skipped_count,push_error,created_at,completed_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error('[admin-notifications] history query failed:', error.message);
    return Response.json({ error: 'Unable to load notification history' }, { status: 500 });
  }
  return Response.json({ data: data || [] });
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimitOk(`admin-notifications:${ip}`)) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return Response.json({ error: 'A JSON body is required' }, { status: 400 });
  }
  if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
    return Response.json({ error: 'A JSON object is required' }, { status: 400 });
  }
  const body = parsedBody as Record<string, unknown>;
  const action = clean(body.action, 24);

  if (action === 'dispatch') {
    if (!marketingRunnerAuthorized(request)) {
      return Response.json({ error: 'Unauthorized scheduler' }, { status: 401 });
    }
    const supabase = getSupabaseServerForRequest(request);
    try {
      const { data: scheduledCampaign, error: scheduledError } = await supabase.rpc('admin_claim_due_notification_campaign');
      if (scheduledError) {
        console.error('[admin-notifications] scheduled campaign claim failed:', scheduledError.message);
        return Response.json({ error: 'Scheduled notification queue is unavailable' }, { status: 503 });
      }
      const { data: pushBatch, error: pushBatchError } = await supabase.rpc('admin_claim_notification_push_batch', { p_limit: 20 });
      if (pushBatchError) {
        console.error('[admin-notifications] push batch claim failed:', pushBatchError.message);
        return Response.json({ error: 'Notification push queue is unavailable' }, { status: 503 });
      }
      if (!pushBatch) {
        return Response.json({ data: {
          claimed: !!scheduledCampaign,
          scheduledCampaignClaimed: !!scheduledCampaign,
          pushDevicesClaimed: 0,
        } }, { headers: { 'Cache-Control': 'no-store' } });
      }
      const results = await sendPushNotifications(pushBatch);
      const { data: acknowledgement, error: acknowledgementError } = await supabase.rpc('admin_ack_notification_push_batch', {
        p_claim_token: pushBatch.claim_token,
        p_results: results,
      });
      if (acknowledgementError || Number(acknowledgement?.acknowledged) !== results.length) {
        console.error('[admin-notifications] push batch acknowledgement failed:', acknowledgementError?.message || 'incomplete acknowledgement');
        return Response.json({ error: 'Notification push results could not be saved' }, { status: 503 });
      }
      return Response.json({ data: {
        claimed: true,
        scheduledCampaignClaimed: !!scheduledCampaign,
        pushDevicesClaimed: results.length,
        pushSent: results.filter((result: any) => result.status === 'sent').length,
        pushFailed: results.filter((result: any) => result.status === 'failed').length,
        pushRetried: results.filter((result: any) => result.status === 'retry').length,
      } }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      console.error('[admin-notifications] scheduled campaign delivery failed:', error instanceof Error ? error.message : 'unknown');
      return Response.json({ error: 'Scheduled notification delivery is temporarily unavailable' }, { status: 503 });
    }
  }

  const authorization = await authorizeGlobalAdmin(request);
  if ('response' in authorization) return authorization.response;
  const { supabase, userId: actorId } = authorization;

  if (action === 'search') {
    const query = clean(body.query, 100).replace(/[%_,]/g, '');
    if (query.length < 2) return Response.json({ data: [] });
    const { data, error } = await supabase
      .from('user')
      .select('email,full_name,provider_ids,status,deleted_at')
      .eq('status', 'active')
      .is('deleted_at', null)
      .ilike('email', `%${query}%`)
      .order('email', { ascending: true })
      .limit(20);
    if (error) {
      console.error('[admin-notifications] recipient search failed:', error.message);
      return Response.json({ error: 'Unable to search active users' }, { status: 500 });
    }
    const recipients: AdminNotificationRecipient[] = [];
    for (const row of data || []) {
      const recipient = mapRegistryRecipient(row);
      if (recipient) recipients.push(recipient);
    }
    return Response.json({ data: recipients });
  }

  if (action === 'preview') {
    const content = normalizeContent(body);
    const timing = normalizeTiming(body);
    const audience = clean(body.audience, 24) as AdminNotificationAudience;
    const eventId = clean(body.eventId, 64);
    const passTier = clean(body.passTier || 'all', 16) as AdminNotificationPassTier;
    const selectedIds = normalizeIds(body.selectedUserIds, 1000);
    const pushRequested = body.pushRequested === true;
    if (!content || 'error' in timing || !AUDIENCES.has(audience) || !PASS_TIERS.has(passTier)) {
      if ('error' in timing) return Response.json({ error: timing.error }, { status: 400 });
      return Response.json({ error: 'Valid notification content and audience are required' }, { status: 400 });
    }
    if (audience === 'event_attendees' && (!EVENT_ID_PATTERN.test(eventId) || !Object.hasOwn(EVENTS, eventId))) {
      return Response.json({ error: 'Choose a valid event for attendee targeting' }, { status: 400 });
    }
    if (audience === 'selected' && !selectedIds) {
      return Response.json({ error: 'Select at least one active user' }, { status: 400 });
    }

    let recipients: AdminNotificationRecipient[];
    try {
      recipients = await resolveRecipients(supabase, audience, eventId, passTier, selectedIds);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to resolve the audience';
      const status = message.includes('recipient limit') ? 413 : 500;
      return Response.json({ error: message }, { status });
    }
    if (recipients.length === 0) return Response.json({ error: 'This audience has no active linked users' }, { status: 400 });
    if (recipients.length > MAX_RECIPIENTS) return Response.json({ error: 'Audience exceeds the 10,000 recipient limit' }, { status: 413 });

    let pushTokenCount = 0;
    if (pushRequested) {
      const ids = recipients.map((recipient) => recipient.id);
      for (let offset = 0; offset < ids.length; offset += 500) {
        const { count, error } = await supabase
          .from('notification_push_tokens')
          .select('id', { count: 'exact', head: true })
          .in('user_id', ids.slice(offset, offset + 500))
          .eq('enabled', true);
        if (error) {
          console.error('[admin-notifications] push preview failed:', error.message);
          return Response.json({ error: 'Unable to preview registered push devices' }, { status: 500 });
        }
        pushTokenCount += count || 0;
      }
    }

    const audienceSnapshot = {
      type: audience,
      ...(audience === 'event_attendees' ? { eventId, passTier } : {}),
      ...(audience === 'selected' ? { selectedCount: recipients.length } : {}),
    };
    const { data: preview, error: previewError } = await supabase
      .from('admin_notification_previews')
      .insert({
        created_by: actorId,
        title: content.title,
        message: content.message,
        level: content.level,
        deep_link: content.deepLink,
        push_requested: pushRequested,
        scheduled_at: timing.scheduledAt,
        notification_expires_at: timing.expiresAt,
        audience: audienceSnapshot,
        recipient_ids: recipients.map((recipient) => recipient.id),
        recipient_count: recipients.length,
        push_token_count: pushTokenCount,
      })
      .select('id,expires_at')
      .single();
    if (previewError || !preview?.id) {
      console.error('[admin-notifications] preview write failed:', previewError?.code || 'unknown code', previewError?.message || 'invalid response');
      const errorText = String(previewError?.message || '');
      const missingSchema = ['42P01', 'PGRST204', 'PGRST205'].includes(String(previewError?.code || ''))
        || errorText.includes('admin_notification_previews');
      return Response.json({
        error: missingSchema
          ? 'Notification database migrations are missing in this environment. Apply the latest core database migrations, then restart the local API.'
          : 'Unable to save this audience preview',
      }, { status: missingSchema ? 503 : 500 });
    }

    return Response.json({
      data: {
        previewId: preview.id,
        expiresAt: preview.expires_at,
        scheduledAt: timing.scheduledAt,
        notificationExpiresAt: timing.expiresAt,
        recipientCount: recipients.length,
        pushRequested,
        pushTokenCount,
        sample: recipients.slice(0, 5).map(({ email, name }) => ({ email, name })),
      },
    });
  }

  if (action === 'test') {
    const content = normalizeContent(body);
    const expiresAt = optionalTimestamp(body.expiresAt);
    const selectedIds = normalizeIds(body.selectedUserIds, 5);
    if (!content || !selectedIds || expiresAt === undefined || (expiresAt && Date.parse(expiresAt) <= Date.now())) {
      return Response.json({ error: 'Valid content and one to five selected test recipients are required' }, { status: 400 });
    }
    try {
      const active = await listActiveRecipients(supabase);
      const activeById = new Map(active.map((recipient) => [recipient.id, recipient]));
      const recipients = selectedIds.map((id) => activeById.get(id)).filter((row): row is AdminNotificationRecipient => !!row);
      if (recipients.length !== selectedIds.length) {
        return Response.json({ error: 'Every test recipient must be an active linked account' }, { status: 400 });
      }
      const result = await persistCampaign(
        supabase,
        actorId,
        content,
        { type: 'selected', selectedCount: recipients.length },
        recipients,
        body.pushRequested === true,
        true,
        expiresAt,
      );
      return Response.json({ data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to send the test notification';
      const status = message.includes('recipient limit') ? 413 : 500;
      return Response.json({ error: message }, { status });
    }
  }

  if (action === 'send') {
    const previewId = clean(body.previewId, 64);
    if (!UUID_PATTERN.test(previewId)) return Response.json({ error: 'Preview the audience before sending' }, { status: 400 });
    const { data, error } = await supabase.rpc('admin_send_notification_preview', {
      p_actor_id: actorId,
      p_preview_id: previewId,
    });
    if (error || !data?.campaign_id) {
      const message = error?.message || 'Unable to send this notification';
      const status = /expired|already used|not found|scheduled time must be in the future/i.test(message) ? 409 : 500;
      if (status === 500) console.error('[admin-notifications] send failed:', message);
      return Response.json({
        error: /scheduled time must be in the future/i.test(message)
          ? 'The scheduled time has passed. Preview again and choose a future time.'
          : status === 409 ? 'The preview expired or was already used. Preview again.' : 'Unable to send this notification',
      }, { status });
    }

    if (data.scheduled === true) {
      return Response.json({ data: {
        campaignId: data.campaign_id,
        recipients: Number(data.recipient_count) || 0,
        inAppSent: 0,
        scheduled: true,
        scheduledAt: data.scheduled_at,
        expiresAt: data.expires_at,
        pushRequested: data.push_requested === true,
        pushQueued: 0,
      } });
    }
    const recipientCount = Number(data.recipient_count) || 0;
    const pushDeviceCount = Number(data.push_device_count) || 0;
    return Response.json({ data: {
      campaignId: data.campaign_id,
      recipients: recipientCount,
      inAppSent: recipientCount,
      pushRequested: data.push_requested === true,
      pushQueued: pushDeviceCount,
      pushSent: 0,
      pushFailed: 0,
      pushSkipped: data.push_requested === true && pushDeviceCount === 0 ? recipientCount : 0,
    } });
  }

  return Response.json({ error: 'Unsupported notification action' }, { status: 400 });
}
