import { rateLimitOk } from '@/lib/bsl/rateLimit';
import { authorizeGlobalAdmin } from '@/lib/server/global-admin';
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

async function sendPushNotifications(
  supabase: any,
  campaignId: string,
  deliveries: { user_id: string; notification_id: string }[],
  content: { title: string; message: string; deepLink: string | null; level: AdminNotificationLevel },
) {
  const userIds = [...new Set(deliveries.map((delivery) => delivery.user_id))];
  const expoTokens: { user_id: string; token: string }[] = [];
  const webTokens: { user_id: string; token: string; subscription: webPush.PushSubscription }[] = [];
  for (let offset = 0; offset < userIds.length; offset += 500) {
    const { data, error } = await supabase
      .from('notification_push_tokens')
      .select('user_id,token,platform,subscription')
      .in('user_id', userIds.slice(offset, offset + 500))
      .eq('enabled', true);
    if (error) throw new Error('Unable to load registered push devices');
    for (const row of data || []) {
      if (row.platform === 'web' && row.subscription?.endpoint === row.token) {
        webTokens.push({ user_id: row.user_id, token: row.token, subscription: row.subscription as webPush.PushSubscription });
      } else if (EXPO_TOKEN_PATTERN.test(row.token)) {
        expoTokens.push({ user_id: row.user_id, token: row.token });
      }
    }
  }

  const successfulUsers = new Set<string>();
  const failedUsers = new Set<string>();
  const tokenRowsToDisable: string[] = [];
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  for (let offset = 0; offset < expoTokens.length; offset += 100) {
    const batch = expoTokens.slice(offset, offset + 100);
    try {
      // The Expo push gateway is an external provider; apiClient is reserved for HASHPASS API calls.
      // eslint-disable-next-line no-restricted-syntax
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(batch.map(({ token }) => ({
          to: token,
          title: content.title,
          body: content.message,
          sound: 'default',
          priority: content.level === 'important' ? 'high' : 'default',
          data: { deepLink: content.deepLink, adminNotificationCampaignId: campaignId },
        }))),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Push service returned an error');
      const body = await response.json() as { data?: { status?: string; id?: string; message?: string; details?: { error?: string } }[] };
      const tickets = Array.isArray(body.data) ? body.data : [];
      batch.forEach((device, index) => {
        const ticket = tickets[index];
        if (ticket?.status === 'ok') successfulUsers.add(device.user_id);
        else {
          failedUsers.add(device.user_id);
          if (ticket?.details?.error === 'DeviceNotRegistered') tokenRowsToDisable.push(device.token);
        }
      });
    } catch {
      for (const device of batch) failedUsers.add(device.user_id);
    }
  }

  let pushError: string | null = null;
  if (webTokens.length) {
    const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
    const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
    const subject = process.env.WEB_PUSH_VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) {
      for (const device of webTokens) failedUsers.add(device.user_id);
      pushError = 'Browser push is not configured for this environment.';
    } else {
      const vapidDetails = { subject, publicKey, privateKey };
      const payload = JSON.stringify({
        title: content.title,
        body: content.message,
        data: { deepLink: content.deepLink, adminNotificationCampaignId: campaignId },
      });
      for (let offset = 0; offset < webTokens.length; offset += 20) {
        const batch = webTokens.slice(offset, offset + 20);
        await Promise.all(batch.map(async (device) => {
          try {
            await webPush.sendNotification(device.subscription, payload, {
              TTL: 86400,
              urgency: content.level === 'important' ? 'high' : 'normal',
              timeout: 8000,
              vapidDetails,
            });
            successfulUsers.add(device.user_id);
          } catch (error) {
            failedUsers.add(device.user_id);
            const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
              ? Number((error as { statusCode?: unknown }).statusCode)
              : 0;
            if (statusCode === 404 || statusCode === 410) tokenRowsToDisable.push(device.token);
            pushError ||= 'Some browser push deliveries failed. Review delivery history.';
          }
        }));
      }
    }
  }

  if (tokenRowsToDisable.length) {
    await supabase
      .from('notification_push_tokens')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .in('token', tokenRowsToDisable);
  }

  const activeUserIds = [...new Set([...expoTokens, ...webTokens].map((row) => row.user_id))];
  const sentIds = activeUserIds.filter((id) => successfulUsers.has(id));
  const failedIds = activeUserIds.filter((id) => !successfulUsers.has(id) && failedUsers.has(id));
  const skippedIds = userIds.filter((id) => !successfulUsers.has(id) && !failedUsers.has(id));
  const updateStatus = async (ids: string[], status: 'sent' | 'failed' | 'skipped', error?: string) => {
    for (let offset = 0; offset < ids.length; offset += 500) {
      const { error: updateError } = await supabase
        .from('admin_notification_deliveries')
        .update({ push_status: status, push_error: error || null, updated_at: new Date().toISOString() })
        .eq('campaign_id', campaignId)
        .in('user_id', ids.slice(offset, offset + 500));
      if (updateError) throw new Error('Unable to save push delivery results');
    }
  };
  await Promise.all([
    updateStatus(sentIds, 'sent'),
    updateStatus(failedIds, 'failed', 'Push service did not accept any device for this account'),
    updateStatus(skippedIds, 'skipped'),
  ]);

  const failed = failedIds.length;
  const sent = sentIds.length;
  // In-app notifications are already durable for every recipient. A failed
  // push channel therefore marks this multi-channel campaign partial.
  const status = failed > 0 ? 'partial' : 'sent';
  const { error: campaignUpdateError } = await supabase
    .from('admin_notification_campaigns')
    .update({
      status,
      push_sent_count: sent,
      push_failed_count: failed,
      push_skipped_count: skippedIds.length,
      push_error: pushError,
      completed_at: new Date().toISOString(),
    })
    .eq('id', campaignId);
  if (campaignUpdateError) throw new Error('Unable to finalize notification delivery');

  return { pushSent: sent, pushFailed: failed, pushSkipped: skippedIds.length, pushError };
}

async function finishCampaignWithoutPush(supabase: any, campaignId: string) {
  const { error } = await supabase
    .from('admin_notification_campaigns')
    .update({ status: 'sent', completed_at: new Date().toISOString() })
    .eq('id', campaignId);
  if (error) throw new Error('Unable to finalize notification delivery');
}

async function deliverCampaignPush(
  supabase: any,
  campaignId: string,
  deliveries: { user_id: string; notification_id: string }[],
  content: { title: string; message: string; deepLink: string | null; level: AdminNotificationLevel },
  pushRequested: boolean,
) {
  if (!pushRequested) {
    await finishCampaignWithoutPush(supabase, campaignId);
    return { pushSent: 0, pushFailed: 0, pushSkipped: 0, pushError: null };
  }

  try {
    return await sendPushNotifications(supabase, campaignId, deliveries, content);
  } catch (error) {
    console.error('[admin-notifications] push result could not be finalized:', error instanceof Error ? error.message : 'unknown');
    try {
      const { error: updateError } = await supabase
        .from('admin_notification_campaigns')
        .update({
          status: 'partial',
          push_error: 'Push results could not be confirmed. Check provider status before retrying.',
          completed_at: new Date().toISOString(),
        })
        .eq('id', campaignId);
      if (updateError) console.error('[admin-notifications] push failure audit could not be saved:', updateError.message);
    } catch (auditError) {
      console.error('[admin-notifications] push failure audit could not be saved:', auditError instanceof Error ? auditError.message : 'unknown');
    }
    return {
      pushSent: 0,
      pushFailed: 0,
      pushSkipped: 0,
      pushError: 'Push results could not be confirmed. Check delivery history before retrying.',
    };
  }
}

async function persistCampaign(
  supabase: any,
  actorId: string,
  content: { title: string; message: string; level: AdminNotificationLevel; deepLink: string | null },
  audience: Record<string, unknown>,
  recipients: AdminNotificationRecipient[],
  pushRequested: boolean,
  isTest: boolean,
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
  });
  if (error || !data?.campaign_id || !Array.isArray(data.deliveries)) {
    console.error('[admin-notifications] campaign creation failed:', error?.message || 'invalid response');
    throw new Error('Unable to create the notification campaign');
  }

  const pushResult = await deliverCampaignPush(supabase, data.campaign_id, data.deliveries, content, pushRequested);
  return {
    campaignId: data.campaign_id as string,
    recipients: Number(data.recipient_count) || recipients.length,
    inAppSent: Number(data.recipient_count) || recipients.length,
    ...pushResult,
  };
}

/** Global-admin notification history. Email campaigns are stored separately. */
export async function GET(request: Request) {
  const authorization = await authorizeGlobalAdmin(request);
  if ('response' in authorization) return authorization.response;
  const { data, error } = await authorization.supabase
    .from('admin_notification_campaigns')
    .select('id,title,message,level,deep_link,push_requested,is_test,audience,status,recipient_count,in_app_sent_count,push_sent_count,push_failed_count,push_skipped_count,push_error,created_at,completed_at')
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

  const authorization = await authorizeGlobalAdmin(request);
  if ('response' in authorization) return authorization.response;
  const { supabase, userId: actorId } = authorization;
  const action = clean(body.action, 24);

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
    const audience = clean(body.audience, 24) as AdminNotificationAudience;
    const eventId = clean(body.eventId, 64);
    const passTier = clean(body.passTier || 'all', 16) as AdminNotificationPassTier;
    const selectedIds = normalizeIds(body.selectedUserIds, 1000);
    const pushRequested = body.pushRequested === true;
    if (!content || !AUDIENCES.has(audience) || !PASS_TIERS.has(passTier)) {
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
        audience: audienceSnapshot,
        recipient_ids: recipients.map((recipient) => recipient.id),
        recipient_count: recipients.length,
        push_token_count: pushTokenCount,
      })
      .select('id,expires_at')
      .single();
    if (previewError || !preview?.id) {
      console.error('[admin-notifications] preview write failed:', previewError?.message || 'invalid response');
      return Response.json({ error: 'Unable to save this audience preview' }, { status: 500 });
    }

    return Response.json({
      data: {
        previewId: preview.id,
        expiresAt: preview.expires_at,
        recipientCount: recipients.length,
        pushRequested,
        pushTokenCount,
        sample: recipients.slice(0, 5).map(({ email, name }) => ({ email, name })),
      },
    });
  }

  if (action === 'test') {
    const content = normalizeContent(body);
    const selectedIds = normalizeIds(body.selectedUserIds, 5);
    if (!content || !selectedIds) {
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
    if (error || !data?.campaign_id || !Array.isArray(data.deliveries)) {
      const message = error?.message || 'Unable to send this notification';
      const status = /expired|already used|not found/i.test(message) ? 409 : 500;
      if (status === 500) console.error('[admin-notifications] send failed:', message);
      return Response.json({ error: status === 409 ? 'The preview expired or was already used. Preview again.' : 'Unable to send this notification' }, { status });
    }

    try {
      // The stored preview controls channel selection. Reading it back here
      // avoids trusting a client flag to decide whether push should be sent.
      const { data: campaign } = await supabase
        .from('admin_notification_campaigns')
        .select('id,title,message,level,deep_link,push_requested')
        .eq('id', data.campaign_id)
        .maybeSingle();
      if (!campaign) throw new Error('Unable to load the queued notification');
      const pushResult = await deliverCampaignPush(supabase, data.campaign_id, data.deliveries, {
            title: campaign.title,
            message: campaign.message,
            level: campaign.level,
            deepLink: campaign.deep_link,
          }, campaign.push_requested === true);
      return Response.json({
        data: {
          campaignId: data.campaign_id,
          recipients: Number(data.recipient_count) || data.deliveries.length,
          inAppSent: Number(data.recipient_count) || data.deliveries.length,
          ...pushResult,
        },
      });
    } catch (error) {
      console.error('[admin-notifications] campaign finalization failed:', error instanceof Error ? error.message : 'unknown');
      return Response.json({ error: 'In-app notifications were queued, but campaign history could not be finalized' }, { status: 500 });
    }
  }

  return Response.json({ error: 'Unsupported notification action' }, { status: 400 });
}
