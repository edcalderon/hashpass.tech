import { createHash } from 'node:crypto';
import { getSupabaseServerForRequest } from '../supabase-server';
import { isResolveIdentityError, resolveNotificationIdentity } from './resolve-notification-identity';
import { isRoleActive } from '../role-summary';
import { marketingSenderReady, sendAdminCampaignEmail } from '../email';
import { renderMarketingEmail, validCampaignCopy, validCampaignDraft, validZonedTime } from '../marketing';
import campaignPack from '../../config/marketing/bsl2026.json';

export const marketingUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const campaignApproverEmail = 'edward@hashpass.app';
export const marketingReply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' } });

export async function authorizeMarketingAdmin(request: Request) {
  const identity = await resolveNotificationIdentity(request);
  if (isResolveIdentityError(identity)) return { response: marketingReply({ error: identity.error }, identity.status) };
  if (!identity.supabaseUserId) return { response: marketingReply({ error: 'Administrative identity required' }, 403) };
  const client = getSupabaseServerForRequest(request);
  const { data, error } = await client.from('user_roles').select('role,expires_at').eq('user_id', identity.supabaseUserId).in('role', ['admin', 'super_admin']);
  if (error) return { response: marketingReply({ error: 'Unable to verify campaign access' }, 503) };
  if (!(data || []).some((row: { role: string; expires_at: string | null }) => ['admin', 'super_admin'].includes(row.role) && isRoleActive(row.expires_at))) return { response: marketingReply({ error: 'Global administrator access required' }, 403) };
  return { client, actor: identity.supabaseUserId };
}

export async function marketingAdminRequest(request: Request, write = false) {
  try {
    const auth = await authorizeMarketingAdmin(request);
    if (auth.response) return auth.response;
    if (!auth.client || !auth.actor) return marketingReply({ error: 'Forbidden' }, 403);
    if (!write) {
      const [campaigns, activity] = await Promise.all([auth.client.rpc('marketing_overview'), auth.client.rpc('marketing_activity_overview')]);
      if (campaigns.error || activity.error) return marketingReply({ error: 'Campaign storage is unavailable. Check the marketing migrations.' }, 503);
      return marketingReply({ data: { ...campaigns.data, ...activity.data } });
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return marketingReply({ error: 'Invalid campaign request' }, 400);
    if (body.action === 'preview') {
      if (!validCampaignCopy(body.copy)) return marketingReply({ error: 'A valid copy and approved HTTPS destination are required' }, 400);
      return marketingReply({ data: renderMarketingEmail(body.copy, 'https://api.hashpass.tech/api/marketing/unsubscribe?token=PREVIEW', body.locale === 'en' ? 'en' : 'es', body.eventId === 'colombia2026' ? 'BSL COLOMBIA 2026 · BOGOTÁ · NOV 4–6' : 'HASHPASS UPDATES') });
    }
    if (body.action === 'snapshot') {
      if (!validZonedTime(body.cutoff) || Date.parse(body.cutoff) > Date.now() - 60_000) return marketingReply({ error: 'Choose a cutoff with timezone, at least one minute in the past' }, 400);
      const preview = await auth.client.rpc('marketing_snapshot_preview', { p_cutoff: body.cutoff });
      if (preview.error) return marketingReply({ error: 'Activity storage is unavailable' }, 503);
      const manifest = (preview.data || []).map((row: { user_id: string; interactions: number; provisional_points: number }) => ({ user_id: row.user_id, interactions: row.interactions, provisional_points: row.provisional_points })).sort((a: { user_id: string }, b: { user_id: string }) => a.user_id.localeCompare(b.user_id));
      const digest = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
      const saved = await auth.client.rpc('marketing_prepare_snapshot', { p_actor: auth.actor, p_cutoff: body.cutoff, p_manifest: manifest, p_digest: digest });
      return saved.error ? marketingReply({ error: 'Snapshot preparation failed; reload activity and retry' }, 409) : marketingReply({ data: saved.data });
    }
    if (body.action === 'save' && !validCampaignDraft(body.draft)) return marketingReply({ error: 'Check the bilingual copy, campaign key, prerequisites and explicit timezone' }, 400);
    if (['schedule', 'pause', 'resume', 'cancel', 'request_approval', 'approve', 'decline'].includes(body.action) && !marketingUuid.test(body.id || '')) return marketingReply({ error: 'A valid campaign is required' }, 400);
    if (!['seed', 'save', 'schedule', 'pause', 'resume', 'cancel', 'request_approval', 'approve', 'decline'].includes(body.action)) return marketingReply({ error: 'Unsupported campaign action' }, 400);
    if (['schedule', 'resume'].includes(body.action) && !await marketingSenderReady()) return marketingReply({ error: 'Configure the marketing sender before activating a campaign' }, 503);

    if (body.action === 'request_approval') {
      if (!await marketingSenderReady()) return marketingReply({ error: 'Configure the campaign sender before requesting approval' }, 503);
      const { data: approver, error: approverError } = await auth.client.from('user')
        .select('email,status,deleted_at,provider_ids').eq('email', campaignApproverEmail).maybeSingle();
      if (approverError || !approver || approver.status !== 'active' || approver.deleted_at || String(approver.email).toLowerCase() !== campaignApproverEmail) {
        return marketingReply({ error: 'The assigned campaign approver is not available in this environment' }, 503);
      }
      const approverId = approver.provider_ids?.supabase;
      if (!marketingUuid.test(approverId || '')) return marketingReply({ error: 'The assigned approver needs a linked administrator identity' }, 409);
      const { data: roles, error: roleError } = await auth.client.from('user_roles')
        .select('role,expires_at').eq('user_id', approverId).in('role', ['admin', 'super_admin']);
      if (roleError || !(roles || []).some((role: { role: string; expires_at: string | null }) => ['admin', 'super_admin'].includes(role.role) && isRoleActive(role.expires_at))) {
        return marketingReply({ error: 'The assigned campaign approver must have active global administrator access' }, 409);
      }
      if (auth.actor === approverId) return marketingReply({ error: 'A different administrator must submit this campaign for approval' }, 409);

      const requested = await auth.client.rpc('marketing_request_approval', {
        p_actor: auth.actor, p_campaign: body.id, p_approver: approverId,
      });
      if (requested.error) return marketingReply({ error: requested.error.code === 'P0001' ? requested.error.message : 'Unable to create the campaign approval request' }, requested.error.code === 'P0001' ? 409 : 503);
      const requestData = requested.data as { already_requested?: boolean; message?: string; campaign_id?: string };
      let emailSent = false;
      if (!requestData.already_requested) {
        const { data: campaign } = await auth.client.from('marketing_campaigns')
          .select('name,event_id').eq('id', body.id).maybeSingle();
        const emailResult = await sendAdminCampaignEmail({
          to: campaignApproverEmail,
          subject: `Approval requested: ${campaign?.name || 'HASHPASS campaign'}`,
          heading: 'Please review this HASHPASS campaign',
          message: `${requestData.message || 'A new marketing campaign is awaiting your approval.'}\n\nOpen Notifications in the HASHPASS dashboard to approve or decline. Approval schedules it for the listed future time; it does not send immediately.`,
          actionUrl: 'https://hashpass.tech/dashboard/notifications',
          actionLabel: 'Review campaign request',
          eventId: campaign?.event_id,
          template: 'branded',
        });
        emailSent = emailResult.success;
      }
      return marketingReply({ data: { ...requestData, notificationSent: true, emailSent } });
    }

    if (body.action === 'approve' || body.action === 'decline') {
      const decision = await auth.client.rpc('marketing_decide_approval', {
        p_actor: auth.actor, p_campaign: body.id,
        p_decision: body.action === 'approve' ? 'approve' : 'decline',
      });
      return decision.error
        ? marketingReply({ error: decision.error.code === 'P0001' ? decision.error.message : 'Unable to record the approval decision' }, decision.error.code === 'P0001' ? 409 : 503)
        : marketingReply({ data: decision.data });
    }

    const payload = body.action === 'seed' ? { campaigns: campaignPack.messages } : body;
    const result = await auth.client.rpc('marketing_campaign_action', { p_actor: auth.actor, p_action: body.action, p_payload: payload });
    return result.error ? marketingReply({ error: result.error.code === 'P0001' ? 'The campaign is locked, its prerequisites are incomplete, or its schedule needs a future date.' : 'Unable to save campaign changes' }, result.error.code === 'P0001' ? 409 : 503) : marketingReply({ data: result.data });
  } catch { return marketingReply({ error: 'Campaign service is temporarily unavailable' }, 503); }
}
