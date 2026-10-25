import { createHmac } from 'node:crypto';
import { readHybridEnvelope } from '@hashpass/wallet';
import { getSupabaseServerForRequest, getSupabaseServerEnv } from '../../../lib/supabase-server';
import { resolveNotificationIdentity, isResolveIdentityError } from '../../../lib/server/resolve-notification-identity';
import { verifyStepUpProof } from '../../../lib/server/pin-auth';
import { STEP_UP_HEADER } from '../../../lib/step-up-session';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_VERSION = 1;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (error: string, status: number) => reply({ error }, status);

/**
 * The server's half of the wrap key: a 256-bit value derived from a key that lives only in
 * server configuration. Deterministic, so nothing about it is stored. It is released only
 * after a PIN proof, which is what turns a database dump into a non-event.
 */
export function serverShare(userId: string, walletId: string, keyVersion = KEY_VERSION): string {
  const kek = process.env.HASHPASS_VAULT_KEK;
  if (!kek || kek.length < 32) throw new Error('vault_kek_unavailable');
  return createHmac('sha256', kek).update(`hashpass-vault-share|v${keyVersion}|${userId}|${walletId}`).digest('hex');
}

async function identity(request: Request, bearerOnly: boolean): Promise<{ response: Response } | { ownerId: string }> {
  const headers = new Headers(request.headers);
  if (bearerOnly) headers.delete('Cookie');
  const auth = await resolveNotificationIdentity(bearerOnly ? new Request(request.url, { headers }) : request);
  if (isResolveIdentityError(auth)) return { response: failure('wallet_auth_required', auth.status) };
  if (!auth.registryUserId) return { response: failure('wallet_identity_unavailable', 403) };
  const environment = getSupabaseServerEnv(request).environment;
  // Internal testnet rollout only; mainnet needs the reviewed release.
  if (environment !== 'development' || process.env.HASHPASS_WALLET_SETUP_ENABLED !== 'true') {
    return { response: failure('wallet_setup_disabled', 503) };
  }
  return { ownerId: auth.registryUserId };
}

async function boundedJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new Error();
  const text = await request.text();
  if (text.length > 12_288) throw new Error();
  const body = JSON.parse(text);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  return body;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await identity(request, false);
    if ('response' in auth) return auth.response;
    // Recovery reads the same envelope as a PIN unlock; the client needs the server
    // share to re-wrap its vault under the PIN being set during the recovery flow.
    const proof = request.headers.get(STEP_UP_HEADER);
    const readable = verifyStepUpProof(proof, { userId: auth.ownerId, scope: 'wallet:unlock' }) ||
      verifyStepUpProof(proof, { userId: auth.ownerId, scope: 'wallet:recover' });
    if (!readable) return failure('step_up_required', 403);
    const db = getSupabaseServerForRequest(request);
    const wallet = await db.from('user_wallet').select('id').eq('user_id', auth.ownerId).maybeSingle();
    if (wallet.error || !wallet.data) return failure('wallet_vault_unavailable', 503);
    const vault = await db.rpc('get_user_wallet_vault', { p_user_id: auth.ownerId });
    if (vault.error) return failure('wallet_vault_unavailable', 503);
    const stored = vault.data as { walletId: string; envelope: string; version: number; keyVersion: number } | null;
    const walletId: string = stored?.walletId ?? wallet.data.id;
    return reply({
      walletId, version: stored?.version ?? 0, envelope: stored?.envelope ?? null,
      serverShare: serverShare(auth.ownerId, walletId, stored?.keyVersion ?? KEY_VERSION),
    });
  } catch { return failure('wallet_vault_unavailable', 503); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await identity(request, true);
    if ('response' in auth) return auth.response;
    if (!/^Bearer\s+\S+$/i.test(request.headers.get('Authorization') ?? '')) return failure('wallet_bearer_required', 401);
    let body: Record<string, unknown>;
    try { body = await boundedJson(request); } catch { return failure('invalid_wallet_request', 400); }
    if (Object.keys(body).sort().join(',') !== 'envelope,expectedVersion,walletId' ||
        typeof body.walletId !== 'string' || !UUID.test(body.walletId) ||
        !Number.isInteger(body.expectedVersion) || (body.expectedVersion as number) < 0 || (body.expectedVersion as number) > 1_000_000) {
      return failure('invalid_wallet_request', 400);
    }
    let envelope: string;
    try { readHybridEnvelope(body.envelope); envelope = typeof body.envelope === 'string' ? body.envelope : JSON.stringify(body.envelope); }
    catch { return failure('invalid_wallet_vault', 400); }
    // Creating the vault follows the PIN that just unlocked the wallet; replacing it
    // (PIN change) is a signing-grade operation and needs the fresher, narrower proof.
    // Recovery re-wraps under the emailed-code proof instead, since the old PIN is unknown.
    const proof = request.headers.get(STEP_UP_HEADER);
    const scope = body.expectedVersion === 0 ? 'wallet:unlock' : 'wallet:sign';
    const writable = body.expectedVersion === 0
      ? verifyStepUpProof(proof, { userId: auth.ownerId, scope })
      : verifyStepUpProof(proof, { userId: auth.ownerId, scope }) ||
        verifyStepUpProof(proof, { userId: auth.ownerId, scope: 'wallet:recover' });
    if (!writable) return failure('step_up_required', 403);
    const result = await getSupabaseServerForRequest(request).rpc('save_user_wallet_vault', {
      p_user_id: auth.ownerId, p_wallet_id: body.walletId, p_envelope: envelope,
      p_expected_version: body.expectedVersion, p_key_version: KEY_VERSION,
    });
    if (result.error) {
      const conflict = result.error.code === '23514';
      return failure(conflict ? 'wallet_vault_conflict' : 'wallet_vault_unavailable', conflict ? 409 : 503);
    }
    return reply(result.data);
  } catch { return failure('wallet_vault_unavailable', 503); }
}
