import {
  challengeHash,
  issueSessionForUser,
  opaqueToken,
  QR_AUTH_TTL_SECONDS,
  verifyCodeVerifier,
} from '@hashpass/backend';
import { adminDb, apiError, authenticatedUser, getCookie } from '../server';

const RELYING_PARTY = 'HashPass Club';
const BINDING_COOKIE = 'hp_qr_binding';
// hashpass.link fronts both the redirect service and this API (see the
// plan's Phase 1 scope) -- the cookie only needs to reach the auth-qr
// surface, not qr-links or the eventual /q/:slug redirect.
const BINDING_COOKIE_PATH = '/api/v1/auth/qr';

// SameSite=None (not Strict/Lax): hashpass.club (browser) and hashpass.link
// (this API) are different registrable domains, so poll/exchange are
// cross-site fetches by definition -- a Strict or Lax cookie would never be
// attached to them at all, silently breaking the binding check every time.
// None+Secure is safe here because the cookie is HttpOnly (unreadable by
// any page's JS, including a malicious one) and the response is only
// exposed cross-origin to the small CORS allow-list in lambda/index.ts
// (which also sets Access-Control-Allow-Credentials for exactly those
// origins) -- an attacker page can trigger the cookie to be sent, but can't
// read the response, and separately doesn't have the `state` value that's
// only ever returned in the JSON body to the legitimate caller.
function bindingCookie(value: string, maxAgeSeconds: number): string {
  return `${BINDING_COOKIE}=${value}; HttpOnly; Secure; SameSite=None; Path=${BINDING_COOKIE_PATH}; Max-Age=${maxAgeSeconds}`;
}

// POST /api/v1/auth/qr/challenges -- browser starts a login attempt.
export async function createChallenge(request: Request, shortOrigin: string): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  if (typeof body.codeChallenge !== 'string' || body.codeChallenge.length < 40) {
    return apiError('A PKCE code challenge is required');
  }

  const id = opaqueToken();
  const binding = opaqueToken();
  const state = opaqueToken(18);
  const expiresAt = new Date(Date.now() + QR_AUTH_TTL_SECONDS * 1000).toISOString();

  const db = adminDb();
  const { error } = await db.from('qr_auth_challenges').insert({
    id,
    browser_binding_hash: challengeHash(binding),
    state_hash: challengeHash(state),
    code_challenge: body.codeChallenge,
    expires_at: expiresAt,
  });
  if (error) return apiError('Unable to create login challenge', 500);

  await db.from('qr_auth_events').insert({
    challenge_id: id,
    type: 'created',
    metadata: { relying_party: RELYING_PARTY },
  });

  return Response.json(
    { id, qrUrl: `${shortOrigin}/auth/${id}`, expiresAt, state },
    {
      status: 201,
      headers: {
        'set-cookie': bindingCookie(binding, QR_AUTH_TTL_SECONDS),
        'cache-control': 'no-store',
      },
    }
  );
}

// GET /api/v1/auth/qr/challenges/:id?state=... -- browser polls for the
// mobile app's decision. Gated on the browser-binding cookie (HttpOnly, so
// only this browser's own requests can present it) and the state value the
// browser already holds from the create response, not on any bearer token
// -- the caller here is deliberately anonymous until approval.
export async function pollChallenge(request: Request, id: string): Promise<Response> {
  const binding = getCookie(request, BINDING_COOKIE);
  const state = new URL(request.url).searchParams.get('state');
  if (!binding || !state) return apiError('Browser binding and state are required', 401);

  const db = adminDb();
  const { data } = await db
    .from('qr_auth_challenges')
    .select('status,expires_at,browser_binding_hash,state_hash,authorization_code_secret')
    .eq('id', id)
    .single();

  if (!data || data.browser_binding_hash !== challengeHash(binding) || data.state_hash !== challengeHash(state)) {
    return apiError('Challenge binding does not match', 403);
  }

  let status = data.status;
  if (status === 'pending' && new Date(data.expires_at) <= new Date()) {
    status = 'expired';
    await db.from('qr_auth_challenges').update({ status }).eq('id', id).eq('status', 'pending');
  }

  return Response.json(
    {
      status,
      expiresAt: data.expires_at,
      authorizationCode: status === 'approved' ? data.authorization_code_secret : undefined,
    },
    { headers: { 'cache-control': 'no-store' } }
  );
}

// POST /api/v1/auth/qr/challenges/:id/approve -- called by the native app
// under the user's own authenticated session, never by the browser.
export async function approveChallenge(request: Request, id: string): Promise<Response> {
  const user = await authenticatedUser(request);
  if (!user) return apiError('Authenticated HashPass app session required', 401);

  const body = await request.json().catch(() => ({}));
  if (!['approve', 'deny'].includes(body.decision)) {
    return apiError('Explicit approve or deny decision required');
  }

  const db = adminDb();
  const { data } = await db.from('qr_auth_challenges').select('*').eq('id', id).single();
  if (!data) return apiError('Challenge not found', 404);
  if (data.status !== 'pending' || new Date(data.expires_at) <= new Date()) {
    return apiError('Challenge is expired or already handled', 409);
  }

  const approved = body.decision === 'approve';
  const code = approved ? opaqueToken() : null;
  const status = approved ? 'approved' : 'denied';

  const { error } = await db
    .from('qr_auth_challenges')
    .update({
      status,
      approved_by_user_id: user.id,
      authorization_code_hash: code ? challengeHash(code) : null,
      authorization_code_secret: code,
    })
    .eq('id', id)
    .eq('status', 'pending');
  if (error) return apiError('Unable to handle challenge', 409);

  await db.from('qr_auth_events').insert({
    challenge_id: id,
    type: status,
    actor_id: user.id,
    metadata: { relying_party: RELYING_PARTY },
  });

  return Response.json({ status }, { headers: { 'cache-control': 'no-store' } });
}

// POST /api/v1/auth/qr/exchange -- browser trades the approved, one-time
// authorization code (plus its PKCE verifier) for a real HashPass session.
// Atomically consumes the challenge (the `.eq('status','approved')` in the
// update below means a second, racing exchange attempt finds nothing to
// update and gets the "already consumed" response) and clears both the
// authorization code and the browser-binding cookie once used.
export async function exchangeChallenge(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  const { challengeId, authorizationCode, codeVerifier, state } = body;

  const binding = getCookie(request, BINDING_COOKIE);
  if (!binding) return apiError('Browser binding required', 401);

  const db = adminDb();
  const { data } = await db.from('qr_auth_challenges').select('*').eq('id', challengeId).single();
  if (!data || data.status !== 'approved' || new Date(data.expires_at) <= new Date()) {
    return apiError('Authorization code is invalid or expired', 400);
  }

  const bindingMatches = data.browser_binding_hash === challengeHash(binding);
  const stateMatches = data.state_hash === challengeHash(state);
  const codeMatches = data.authorization_code_hash === challengeHash(authorizationCode);
  const verifierMatches = verifyCodeVerifier(codeVerifier, data.code_challenge);
  if (!bindingMatches || !stateMatches || !codeMatches || !verifierMatches) {
    return apiError('Authorization code verification failed', 403);
  }

  const { data: consumed } = await db
    .from('qr_auth_challenges')
    .update({
      status: 'consumed',
      consumed_at: new Date().toISOString(),
      authorization_code_hash: null,
      authorization_code_secret: null,
    })
    .eq('id', challengeId)
    .eq('status', 'approved')
    .select('approved_by_user_id')
    .single();
  if (!consumed) return apiError('Authorization code was already consumed', 409);

  await db.from('qr_auth_events').insert({
    challenge_id: challengeId,
    type: 'consumed',
    actor_id: consumed.approved_by_user_id,
    metadata: { relying_party: RELYING_PARTY },
  });

  const session = await issueSessionForUser(db, consumed.approved_by_user_id);
  if (!session) {
    // The challenge is already consumed at this point -- fail closed rather
    // than leaving it re-triable, since a retry would just report "already
    // consumed" and strand the user. Surface this as a clear 500 instead.
    return apiError('Signed in, but could not establish a session. Please try again.', 500);
  }

  return Response.json(
    {
      status: 'consumed',
      userId: consumed.approved_by_user_id,
      session: { accessToken: session.accessToken, refreshToken: session.refreshToken },
    },
    {
      headers: {
        'set-cookie': `${BINDING_COOKIE}=; HttpOnly; Secure; SameSite=None; Path=${BINDING_COOKIE_PATH}; Max-Age=0`,
        'cache-control': 'no-store',
      },
    }
  );
}
