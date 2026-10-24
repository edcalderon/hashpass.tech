import { getSupabaseServerEnv, getSupabaseServerForRequest } from '../../../lib/supabase-server';
import { isResolveIdentityError, resolveNotificationIdentity } from '../../../lib/server/resolve-notification-identity';
import { derivePinVerifier, issueStepUpProof, PIN_PATTERN, verifyStepUpProof } from '../../../lib/server/pin-auth';
import {
  RECOVERY_CODE_PATTERN, RECOVERY_PURPOSE, RESEND_COOLDOWN_MS, createRecoveryCode, recoveryCodeHash, recoveryExpiry, sendRecoveryEmail,
} from '../../../lib/server/wallet-pin-recovery';
import { STEP_UP_HEADER } from '../../../lib/step-up-session';

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (error: string, status: number) => reply({ error }, status);

/**
 * POST { action: 'send' }                 email a six-digit code to the signed-in account
 * POST { action: 'verify', code }         consume it and mint a `wallet:recover` proof
 * POST { action: 'set-pin', newPin }      replace the PIN verifier (needs that proof)
 *
 * The proof is the only way to reach `reset_user_pin`, and it can be minted nowhere else.
 * It is stateless and lives ten minutes, so the client replaces its vault envelope first
 * (using the recovery phrase) and sets the PIN second: a failure between the two can be
 * retried with the same proof, and the old PIN still works until the very last step.
 * Messages are generic; codes and PINs are never logged.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    if (!/^Bearer\s+\S+$/i.test(request.headers.get('Authorization') ?? '')) return failure('wallet_bearer_required', 401);
    const headers = new Headers(request.headers);
    headers.delete('Cookie');
    const auth = await resolveNotificationIdentity(new Request(request.url, { headers }));
    if (isResolveIdentityError(auth)) return failure('wallet_auth_required', auth.status);
    if (!auth.registryUserId || !auth.email) return failure('wallet_identity_unavailable', 403);
    const env = getSupabaseServerEnv(request);
    // Internal testnet rollout only; mainnet needs the reviewed release.
    if (env.environment !== 'development' || process.env.HASHPASS_WALLET_SETUP_ENABLED !== 'true') return failure('wallet_setup_disabled', 503);
    if (!env.supabaseServiceKey) return failure('wallet_recovery_unavailable', 503);

    let body: Record<string, unknown>;
    try {
      if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new Error();
      const text = await request.text();
      if (text.length > 1024) throw new Error();
      body = JSON.parse(text);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    } catch { return failure('invalid_wallet_request', 400); }
    const only = (...keys: string[]) => Object.keys(body).every(key => keys.includes(key));
    const db = getSupabaseServerForRequest(request);
    const email = auth.email.trim().toLowerCase();

    if (body.action === 'send' && only('action')) {
      const latest = await db.from('otp_codes').select('created_at').eq('email', email).eq('purpose', RECOVERY_PURPOSE)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (latest.error) return failure('wallet_recovery_unavailable', 503);
      if (latest.data?.created_at && Date.now() - Date.parse(latest.data.created_at) < RESEND_COOLDOWN_MS) {
        return failure('wallet_recovery_rate_limited', 429);
      }
      const code = createRecoveryCode();
      await db.from('otp_codes').update({ used: true }).eq('email', email).eq('purpose', RECOVERY_PURPOSE).eq('used', false);
      const stored = await db.from('otp_codes').insert({
        email, purpose: RECOVERY_PURPOSE, token_hash: 'wallet_pin_reset', used: false,
        code_hmac: recoveryCodeHash(env.supabaseServiceKey, email, code), expires_at: recoveryExpiry(),
      });
      if (stored.error) return failure('wallet_recovery_unavailable', 503);
      try { await sendRecoveryEmail(email, code); } catch { return failure('wallet_recovery_unavailable', 503); }
      return reply({ sent: true });
    }

    if (body.action === 'verify' && only('action', 'code')) {
      if (typeof body.code !== 'string' || !RECOVERY_CODE_PATTERN.test(body.code)) return failure('invalid_wallet_request', 400);
      const result = await db.rpc('consume_email_otp', {
        p_email: email, p_code_hmac: recoveryCodeHash(env.supabaseServiceKey, email, body.code), p_purpose: RECOVERY_PURPOSE,
      });
      if (result.error) return failure('wallet_recovery_unavailable', 503);
      const outcome = result.data as { ok?: boolean; reason?: string } | null;
      if (outcome?.ok !== true) return failure(outcome?.reason === 'locked' ? 'wallet_recovery_locked' : 'wallet_recovery_invalid', outcome?.reason === 'locked' ? 429 : 403);
      return reply({ proof: { ...issueStepUpProof(auth.registryUserId, 'wallet:recover'), scope: 'wallet:recover' } });
    }

    if (body.action === 'set-pin' && only('action', 'newPin')) {
      if (typeof body.newPin !== 'string' || !PIN_PATTERN.test(body.newPin)) return failure('invalid_wallet_request', 400);
      if (!verifyStepUpProof(request.headers.get(STEP_UP_HEADER), { userId: auth.registryUserId, scope: 'wallet:recover' })) {
        return failure('step_up_required', 403);
      }
      const reset = await db.rpc('reset_user_pin', { p_user_id: auth.registryUserId, p_verifier: derivePinVerifier(auth.registryUserId, body.newPin) });
      if (reset.error) return failure('wallet_recovery_unavailable', 503);
      return reply({ ok: true });
    }
    return failure('invalid_wallet_request', 400);
  } catch { return failure('wallet_recovery_unavailable', 503); }
}
