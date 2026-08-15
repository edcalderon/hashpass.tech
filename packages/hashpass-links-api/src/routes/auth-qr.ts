import {
  challengeHash,
  issueSessionForUser,
  opaqueToken,
  QR_AUTH_TTL_SECONDS,
  verifyCodeVerifier,
} from '@hashpass/backend';
import { adminDb, apiError, authenticatedUser, createVerifyClient } from '../server';

const RELYING_PARTY = 'HashPass Club';
// Carried as an explicit header, not a cookie: hashpass.club (browser) and
// hashpass.link (this API) are different registrable domains, making this a
// third-party cookie in every browser's eyes. SameSite=None does not opt a
// cookie back into being sent once a browser (Safari's ITP by default,
// increasingly Chrome/Firefox too) is blocking third-party cookies outright
// -- that blocking happens beneath SameSite entirely, so the cookie-based
// design was silently broken for a large and growing share of real users.
// An explicit header carries the same opaque secret without depending on
// any browser cookie policy. It's no less safe than the cookie was in
// practice: this whole flow is already driven by client-side JS holding
// `state`/`codeVerifier` in memory, so a page compromised badly enough to
// read this header could just as easily drive the SDK calls directly --
// the cookie's HttpOnly protection was not doing meaningful work here.
const BINDING_HEADER = 'x-hashpass-binding';

function getBinding(request: Request): string | undefined {
  return request.headers.get(BINDING_HEADER) || undefined;
}

// POST /api/v1/auth/qr/challenges -- browser starts a login attempt.
export async function createChallenge(request: Request): Promise<Response> {
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

  // The QR's origin is derived from the request that's actually serving it,
  // not a fixed env-var default -- hashpass.link's DNS/ACM hasn't been cut
  // over yet (see README.md), so this service is reachable at whatever its
  // real deployed origin currently is (a raw execute-api.amazonaws.com
  // invoke URL pre-cutover, the custom domain after). A fixed default would
  // point the QR at an origin nobody can reach pre-cutover, and would also
  // never match EXPO_PUBLIC_LINKS_API_BASE_URL's origin-matching check in
  // apps/mobile-app/lib/auth-qr.ts.
  const origin = new URL(request.url).origin;

  return Response.json(
    { id, qrUrl: `${origin}/auth/${id}`, expiresAt, state, binding },
    { status: 201, headers: { 'cache-control': 'no-store' } }
  );
}

// GET /api/v1/auth/qr/challenges/:id?state=... -- browser polls for the
// mobile app's decision. Gated on the browser-binding header and the state
// value the browser already holds from the create response, not on any
// bearer token -- the caller here is deliberately anonymous until approval.
export async function pollChallenge(request: Request, id: string): Promise<Response> {
  const binding = getBinding(request);
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

  // .select().single() (not just checking `error`) is required here: two
  // concurrent approve/deny requests can both pass the `select` above while
  // status is still 'pending', but only one of the resulting conditional
  // updates below actually matches a row. Supabase does not return an error
  // for an update that affected zero rows -- it returns error: null with an
  // empty result -- so the losing request would otherwise fall through,
  // log an audit event, and report its own decision as successful even
  // though the browser only ever sees the winning decision. Mirrors the
  // same guard exchangeChallenge already has around its own conditional
  // update below.
  const { data: updated, error } = await db
    .from('qr_auth_challenges')
    .update({
      status,
      approved_by_user_id: user.id,
      authorization_code_hash: code ? challengeHash(code) : null,
      authorization_code_secret: code,
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
    .single();
  if (error || !updated) return apiError('Challenge is expired or already handled', 409);

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
// update and gets the "already consumed" response).
export async function exchangeChallenge(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  const { challengeId, authorizationCode, codeVerifier, state } = body;

  const binding = getBinding(request);
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

  const session = await issueSessionForUser(db, consumed.approved_by_user_id, createVerifyClient);
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
    { headers: { 'cache-control': 'no-store' } }
  );
}
