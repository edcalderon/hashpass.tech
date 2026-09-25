import { classifyAgent } from '@hashpass/backend';
import { adminDb } from '../server';

// Printed legacy QR codes must keep working without a client-side redirect.
// Never cache this response: each GET must reach the database.
export async function redirectInvite(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const codes = url.searchParams.getAll('code');
  const code = codes[0];
  const headers = { 'cache-control': 'no-store, max-age=0', 'referrer-policy': 'no-referrer' };
  if (codes.length > 1 || (code !== undefined && !/^[A-Za-z0-9_-]{1,64}$/.test(code))) {
    return Response.json({ message: 'Invalid invite code' }, { status: 400, headers });
  }

  // Invite codes reach registration first. The post-auth return path keeps the
  // code local to HashPass, where the authenticated, verified user can claim
  // the event-scoped entitlement without exposing it to a third-party origin.
  const destination = new URL('https://hashpass.tech/auth');
  if (code) {
    const returnTo = new URL('https://hashpass.tech/dashboard/wallet');
    returnTo.searchParams.set('section', 'passes');
    returnTo.searchParams.set('inviteCode', code);
    destination.searchParams.set('returnTo', `${returnTo.pathname}${returnTo.search}`);
  }

  // HEAD probes and browser prefetches are not visits. A bare-domain visit
  // still redirects, but cannot be attributed to a printed invite.
  const prefetch = /prefetch|prerender/i.test([
    request.headers.get('purpose'), request.headers.get('sec-purpose'),
  ].filter(Boolean).join(' '));
  if (request.method === 'GET' && code && !prefetch) {
    const { bot, device } = classifyAgent(request.headers.get('user-agent') ?? '');
    try {
      // Await the actual database acknowledgement, not a background promise
      // that Lambda can freeze. An outage is visible and retryable rather
      // than silently returning a successful, unrecorded redirect.
      const { error } = await adminDb().from('invite_scan_events').insert({
        invite_code: code,
        scanned_at: new Date().toISOString(),
        device_type: device,
        bot_classification: bot ? 'bot' : 'human',
      }).abortSignal(AbortSignal.timeout(3000));
      if (error) throw new Error('Invite scan insert failed');
    } catch {
      console.error('invite_scan_persistence_failed');
      return Response.json({ message: 'Please retry opening this invite.' }, {
        status: 503, headers: { ...headers, 'retry-after': '5' },
      });
    }
  }

  return new Response(null, { status: 302, headers: { ...headers, location: destination.toString() } });
}
