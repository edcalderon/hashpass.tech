import { timingSafeEqual } from 'node:crypto';
import { getSupabaseServerForRequest } from '../supabase-server';
import { marketingSenderReady, sendMarketingMessage } from '../email';
import { renderMarketingEmail } from '../marketing';
import type { ClaimedMarketingDelivery } from '../../types/marketing';

export function marketingRunnerAuthorized(request: Request, expected = process.env.MARKETING_RUNNER_TOKEN || '') {
  const supplied = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  return expected.length >= 32 && Buffer.byteLength(supplied) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function runMarketingBatch(request: Request) {
  if (!marketingRunnerAuthorized(request)) return Response.json({ error: 'Unauthorized scheduler' }, { status: 401 });
  if (!await marketingSenderReady()) return Response.json({ error: 'Marketing sender is unavailable' }, { status: 503 });
  const client = getSupabaseServerForRequest(request);
  const claimed = await client.rpc('marketing_claim', { p_limit: 4 });
  if (claimed.error) return Response.json({ error: 'Campaign queue is unavailable' }, { status: 503 });
  const counts = { claimed: 0, accepted: 0, failed: 0, unknown: 0, skipped: 0 };
  await Promise.all(((claimed.data || []) as ClaimedMarketingDelivery[]).map(async delivery => {
    counts.claimed += 1;
    const check = await client.rpc('marketing_before_send', { p_id: delivery.id, p_claim: delivery.claim_token });
    if (check.error) { counts.unknown += 1; return; }
    if (!check.data) { counts.skipped += 1; return; }
    const origin = new URL(request.url).hostname === 'api-dev.hashpass.tech' ? 'https://api-dev.hashpass.tech' : 'https://api.hashpass.tech';
    const unsubscribeUrl = `${origin}/api/marketing/unsubscribe?token=${delivery.unsubscribe_token}`;
    const copy = delivery.content[delivery.locale] || delivery.content.es;
    const rendered = renderMarketingEmail(copy, unsubscribeUrl, delivery.locale, delivery.event_id === 'colombia2026' ? 'HASHPASS · BSL COLOMBIA 2026' : 'HASHPASS UPDATES');
    let timer: ReturnType<typeof setTimeout> | undefined;
    let outcome;
    try {
      outcome = await Promise.race([
        sendMarketingMessage({ ...rendered, to: delivery.email, unsubscribeUrl, deliveryId: delivery.id }),
        new Promise<{ status: 'unknown'; errorCode: string }>(resolve => { timer = setTimeout(() => resolve({ status: 'unknown', errorCode: 'provider_timeout_reconcile' }), 8000); }),
      ]);
    } catch { outcome = { status: 'unknown' as const, errorCode: 'unexpected_transport_error' }; }
    finally { if (timer) clearTimeout(timer); }
    const acknowledged = await client.rpc('marketing_ack', { p_id: delivery.id, p_claim: delivery.claim_token, p_status: outcome.status, p_message_id: 'messageId' in outcome ? outcome.messageId : null, p_error: 'errorCode' in outcome ? outcome.errorCode : null });
    if (acknowledged.error || !acknowledged.data) counts.unknown += 1;
    else counts[outcome.status] += 1;
  }));
  return Response.json({ data: counts }, { headers: { 'Cache-Control': 'no-store' } });
}
