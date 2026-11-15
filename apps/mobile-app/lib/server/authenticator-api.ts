import { randomBytes } from 'node:crypto';
import { getSupabaseServerEnv, getSupabaseServerForRequest } from '../supabase-server';
import { resolveNotificationIdentity, isResolveIdentityError } from './resolve-notification-identity';
import { verifyStepUpProof } from './pin-auth';
import { AUTHENTICATOR_HEADER, issueAuthenticatorProof, matchAuthenticatorCode, newAuthenticatorSecret,
  openAuthenticatorSecret, recoveryCodeHash, sealAuthenticatorSecret, verifyAuthenticatorProof } from './authenticator';
import { maskAuthenticatorEmail, sendAuthenticatorEmailCode, verifyAuthenticatorEmailCode } from './authenticator-email';
import type { AuthenticatorScope } from '../../types/authenticator.types';

const headers = { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie' };
const reply = (data: unknown, status = 200) => Response.json({ success: status === 200, ...(status === 200 ? { data } : { error: data }) }, { status, headers });

/**
 * Check the authenticator factor only. Callers must still verify the route's
 * PIN or recovery proof independently. Until an authenticator is enrolled, that
 * existing proof remains sufficient; enrolled accounts always require a fresh
 * authenticator proof.
 */
export async function hasAuthenticatorAccess(
  request: Request,
  userId: string,
  scope: AuthenticatorScope | readonly AuthenticatorScope[] = 'access',
): Promise<boolean> {
  const scopes = Array.isArray(scope) ? scope : [scope];
  const proof = request.headers.get(AUTHENTICATOR_HEADER);
  if (scopes.some((candidate) => verifyAuthenticatorProof(proof, userId, candidate))) return true;

  try {
    const status = await getSupabaseServerForRequest(request).rpc('get_user_authenticator', { p_user_id: userId });
    if (status.error) return false;
    // A missing row means the user has not enrolled. Treat unexpected row
    // shapes as unavailable so a database/schema issue cannot bypass 2FA.
    return status.data === null || status.data?.enabled === false;
  } catch {
    return false;
  }
}

export async function authenticatorRequest(request: Request, write = false): Promise<Response> {
  try {
    if (write && !/^Bearer\s+\S+$/i.test(request.headers.get('Authorization') ?? '')) return reply('bearer_required', 401);
    const authHeaders = new Headers(request.headers);
    if (write) authHeaders.delete('Cookie');
    const identity = await resolveNotificationIdentity(write ? new Request(request.url, { headers: authHeaders }) : request);
    if (isResolveIdentityError(identity)) return reply(identity.error, identity.status);
    if (!identity.registryUserId) return reply('linked_account_required', 403);
    const userId = identity.registryUserId;
    const db = getSupabaseServerForRequest(request);
    if (!write) {
      const row = await db.rpc('get_user_authenticator', { p_user_id: userId });
      if (row.error) return reply('unavailable', 503);
      return reply({ enabled: row.data?.enabled === true });
    }
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return reply('invalid_request', 400);
    const text = await request.text();
    if (text.length > 2048) return reply('invalid_request', 400);
    let body: Record<string, unknown>;
    try { body = JSON.parse(text); } catch { return reply('invalid_request', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(key => !['action', 'scope', 'code', 'emailCode'].includes(key)) ||
      !['begin', 'send-setup-code', 'confirm', 'verify'].includes(String(body.action))) return reply('invalid_request', 400);
    // Enrollment is a security change; a session alone cannot enroll an attacker's device.
    if (body.action === 'begin' || body.action === 'send-setup-code' || body.action === 'confirm') {
      const pin = request.headers.get('X-Hashpass-Step-Up');
      if (!verifyStepUpProof(pin, { userId, scope: 'wallet:unlock' }) && !verifyStepUpProof(pin, { userId, scope: 'wallet:sign' })) return reply('pin_required', 403);
    }
    if (body.action === 'begin') {
      const existing = await db.rpc('get_user_authenticator', { p_user_id: userId });
      if (existing.error) return reply('unavailable', 503);
      if (existing.data?.enabled) return reply('already_enrolled', 409);
      // Resume the same pending factor after a lost response, without resetting lockout.
      let secret: string;
      if (existing.data && Date.parse(existing.data.pendingUntil) > Date.now()) {
        secret = openAuthenticatorSecret(existing.data.secret, userId);
      } else {
        secret = newAuthenticatorSecret();
        const result = await db.rpc('begin_user_authenticator', { p_user_id: userId, p_secret: sealAuthenticatorSecret(secret, userId) });
        if (result.error) return reply('unavailable', 503);
        if (result.data !== true) return reply('enrollment_conflict', 409);
      }
      const label = encodeURIComponent(['HASHPASS', userId].join(':'));
      const serviceKey = getSupabaseServerEnv(request).supabaseServiceKey;
      if (!serviceKey) return reply('unavailable', 503);
      try {
        const sent = await sendAuthenticatorEmailCode(db, identity.email, serviceKey);
        if (sent === 'rate_limited') return reply('rate_limited', 429);
      } catch { return reply('unavailable', 503); }
      return reply({ secret, uri: `otpauth://totp/${label}?secret=${secret}&issuer=HASHPASS&algorithm=SHA1&digits=6&period=30`,
        emailHint: maskAuthenticatorEmail(identity.email) });
    }
    if (body.action === 'send-setup-code') {
      const stored = await db.rpc('get_user_authenticator', { p_user_id: userId });
      if (stored.error) return reply('unavailable', 503);
      if (!stored.data || stored.data.enabled) return reply('enrollment_required', 403);
      if (!stored.data.pendingUntil || Date.parse(stored.data.pendingUntil) <= Date.now()) return reply('enrollment_expired', 403);
      const serviceKey = getSupabaseServerEnv(request).supabaseServiceKey;
      if (!serviceKey) return reply('unavailable', 503);
      try {
        const sent = await sendAuthenticatorEmailCode(db, identity.email, serviceKey);
        if (sent === 'rate_limited') return reply('rate_limited', 429);
      } catch { return reply('unavailable', 503); }
      return reply({ emailHint: maskAuthenticatorEmail(identity.email) });
    }
    if (body.scope !== 'access' && body.scope !== 'critical') return reply('invalid_request', 400);
    if (typeof body.code !== 'string' || !/^(\d{6}|[a-f0-9]{16})$/.test(body.code) ||
      (body.action === 'confirm' && (!/^\d{6}$/.test(body.code) || typeof body.emailCode !== 'string' || !/^\d{6}$/.test(body.emailCode))) ||
      (body.action === 'verify' && body.emailCode !== undefined)) return reply('invalid_request', 400);
    if (body.action === 'confirm') {
      const serviceKey = getSupabaseServerEnv(request).supabaseServiceKey;
      if (!serviceKey) return reply('unavailable', 503);
      let accepted = false;
      try { accepted = await verifyAuthenticatorEmailCode(db, identity.email, serviceKey, body.emailCode as string); }
      catch { return reply('unavailable', 503); }
      if (!accepted) return reply('invalid_email_setup_code', 403);
    }
    const stored = await db.rpc('get_user_authenticator', { p_user_id: userId });
    if (stored.error) return reply('unavailable', 503);
    if (!stored.data || (body.action === 'verify' && !stored.data.enabled)) return reply('enrollment_required', 403);
    const secret = openAuthenticatorSecret(stored.data.secret, userId);
    const recoveryCodes = body.action === 'confirm' ? Array.from({ length: 8 }, () => randomBytes(8).toString('hex')) : undefined;
    const consumed = await db.rpc('consume_user_authenticator', {
      p_user_id: userId, p_secret: stored.data.secret,
      p_counter: matchAuthenticatorCode(secret, body.code), p_enroll: body.action === 'confirm',
      p_recovery_hash: body.code.length === 16 ? recoveryCodeHash(userId, body.code) : null,
      p_recovery_hashes: recoveryCodes?.map(code => recoveryCodeHash(userId, code)) ?? [],
    });
    if (consumed.error) return reply('unavailable', 503);
    if (consumed.data !== true) return reply('invalid_expired_or_used_code', 403);
    return reply({ proof: issueAuthenticatorProof(userId, body.scope), ...(recoveryCodes ? { recoveryCodes } : {}) });
  } catch { return reply('unavailable', 503); }
}
