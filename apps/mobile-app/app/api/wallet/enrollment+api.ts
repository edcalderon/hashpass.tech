import { getSupabaseServerForRequest, getSupabaseServerEnv } from '../../../lib/supabase-server';
import { resolveNotificationIdentity, isResolveIdentityError } from '../../../lib/server/resolve-notification-identity';
import { parsePublicWallet } from '@hashpass/wallet/manifest';
import type { WalletEnrollment } from '../../../lib/wallet/enrollment-types';

const FIELDS = 'id,user_id,state,operation_id,network,ethereum_address,bitcoin_address,solana_address';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const failure = (error: string, status: number) => reply({ error }, status);

async function identity(request: Request, bearerOnly = false): Promise<
  { response: Response } | { ownerId: string; environment: 'development' | 'production'; enabled: boolean }
> {
  const headers = new Headers(request.headers);
  if (bearerOnly) headers.delete('Cookie');
  // The shared resolver can fall back to Better Auth cookies after an invalid
  // bearer. Remove ambient cookies for mutations so a dummy bearer cannot opt
  // a cross-site request into that fallback.
  const auth = await resolveNotificationIdentity(bearerOnly ? new Request(request.url, { headers }) : request);
  if (isResolveIdentityError(auth)) return { response: failure('wallet_auth_required', auth.status) };
  if (!auth.registryUserId) return { response: failure('wallet_identity_unavailable', 403) };
  const environment = getSupabaseServerEnv(request).environment;
  // Internal testnet rollout only. Mainnet requires the task's security/recovery gates.
  return { ownerId: auth.registryUserId, environment,
    enabled: environment === 'development' && process.env.HASHPASS_WALLET_SETUP_ENABLED === 'true' };
}

function present(row: any, environment: 'development' | 'production', enabled: boolean): WalletEnrollment {
  if (!row || !UUID.test(row.id) || !UUID.test(row.user_id) || !['enrolled', 'provisioning', 'registered'].includes(row.state)) {
    throw new Error('invalid_wallet_metadata');
  }
  const wallet = row.state === 'registered' ? parsePublicWallet({
    version: 1, accountIndex: 0, network: row.network,
    ethereum: { path: "m/44'/60'/0'/0/0", address: row.ethereum_address },
    bitcoin: { path: `m/84'/${row.network === 'mainnet' ? 0 : 1}'/0'/0/0`, address: row.bitcoin_address },
    solana: { path: "m/44'/501'/0'/0'", address: row.solana_address },
  }) : null;
  return { scope: { environment, ownerId: row.user_id, walletId: row.id }, state: row.state,
    operationId: row.operation_id, network: row.network, wallet, setupEnabled: enabled };
}

async function boundedJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new Error();
  const reader = request.body?.getReader();
  if (!reader) throw new Error();
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new Error(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const body = JSON.parse(new TextDecoder().decode(bytes));
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
  return body;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await identity(request);
    if ('response' in auth) return auth.response;
    const { data, error } = await getSupabaseServerForRequest(request).from('user_wallet')
      .select(FIELDS).eq('user_id', auth.ownerId).maybeSingle();
    if (error || !data) return failure('wallet_enrollment_unavailable', 503);
    return reply(present(data, auth.environment, auth.enabled));
  } catch { return failure('wallet_enrollment_unavailable', 503); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await identity(request, true);
    if ('response' in auth) return auth.response;
    // Mutations require an authenticated bearer session, not ambient cookies.
    // The shared resolver validates the token. This avoids cross-site cookie CSRF.
    if (!/^Bearer\s+\S+$/i.test(request.headers.get('Authorization') ?? '')) return failure('wallet_bearer_required', 401);
    if (!auth.enabled) return failure('wallet_setup_disabled', 503);
    let body: Record<string, unknown>;
    try { body = await boundedJson(request); } catch { return failure('invalid_wallet_request', 400); }
    const keys = Object.keys(body).sort().join(',');
    if (typeof body.operationId !== 'string' || !UUID.test(body.operationId) || typeof body.walletId !== 'string' || !UUID.test(body.walletId)) return failure('invalid_wallet_request', 400);
    const db = getSupabaseServerForRequest(request);
    const owned = await db.from('user_wallet').select('id').eq('user_id', auth.ownerId).maybeSingle();
    if (owned.error) return failure('wallet_enrollment_unavailable', 503);
    if (!owned.data || owned.data.id !== body.walletId) return failure('wallet_identity_changed', 409);
    let result;
    if (body.action === 'reserve' && keys === 'action,operationId,walletId') {
      result = await db.rpc('reserve_user_wallet', { p_user_id: auth.ownerId, p_operation_id: body.operationId, p_network: 'testnet' });
    } else if (body.action === 'register' && keys === 'action,operationId,wallet,walletId') {
      let wallet;
      try { wallet = parsePublicWallet(body.wallet); } catch { return failure('invalid_public_wallet', 400); }
      if (wallet.network !== 'testnet') return failure('invalid_wallet_network', 400);
      result = await db.rpc('register_user_wallet', { p_user_id: auth.ownerId, p_operation_id: body.operationId,
        p_network: wallet.network, p_ethereum_address: wallet.ethereum.address,
        p_bitcoin_address: wallet.bitcoin.address, p_solana_address: wallet.solana.address });
    } else return failure('invalid_wallet_request', 400);
    if (result.error) return failure(result.error.code === '23514' ? 'wallet_setup_conflict' : 'wallet_enrollment_unavailable', result.error.code === '23514' ? 409 : 503);
    return reply(present(result.data, auth.environment, auth.enabled));
  } catch { return failure('wallet_enrollment_unavailable', 503); }
}
