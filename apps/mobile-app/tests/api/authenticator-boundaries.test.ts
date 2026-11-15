const mockIdentity = jest.fn(), mockRpc = jest.fn(), mockFrom = jest.fn();
jest.mock('../../lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: (...args: unknown[]) => mockIdentity(...args),
  isResolveIdentityError: (v: { status?: number }) => typeof v.status === 'number',
}));
jest.mock('../../lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({ rpc: mockRpc, from: mockFrom }),
  getSupabaseServerEnv: () => ({ environment: 'development', supabaseServiceKey: 'test' }),
}));
jest.mock('@hashpass/wallet/manifest', () => ({ parsePublicWallet: jest.fn() }));
jest.mock('@hashpass/wallet', () => ({ readHybridEnvelope: jest.fn() }));
import { GET as contactsGet, POST as contactsPost } from '../../app/api/contacts+api';
import { GET as walletGet, POST as walletPost } from '../../app/api/wallet/enrollment+api';
import { GET as vaultGet, POST as vaultPost } from '../../app/api/wallet/vault+api';
import { POST as recoveryPost } from '../../app/api/wallet/pin-recovery+api';
import { POST as pinPost } from '../../app/api/setup/pin+api';
import { issueAuthenticatorProof } from '../../lib/server/authenticator';
import { issueStepUpProof } from '../../lib/server/pin-auth';
const user = '00000000-0000-4000-8000-000000000001';
beforeEach(() => {
  jest.clearAllMocks(); process.env.HASHPASS_TOTP_KEY = 'ab'.repeat(32);
  process.env.HASHPASS_PIN_PEPPER = 'p'.repeat(48); process.env.HASHPASS_WALLET_SETUP_ENABLED = 'true';
  mockIdentity.mockResolvedValue({ registryUserId: user, email: 'alice@example.test' });
});
afterAll(() => { delete process.env.HASHPASS_TOTP_KEY; delete process.env.HASHPASS_PIN_PEPPER; delete process.env.HASHPASS_WALLET_SETUP_ENABLED; });
const request = (method: string, auth?: string, body: unknown = {}) => new Request('https://localhost/api/protected', {
  method, headers: { Authorization: 'Bearer session', 'Content-Type': 'application/json',
    'X-Hashpass-Step-Up': issueStepUpProof(user, 'wallet:unlock').token,
    ...(auth ? { 'X-Hashpass-Authenticator': auth } : {}) },
  ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
});
it.each([contactsGet, walletGet, vaultGet])('rejects PIN-only API reads before data access', async handler => {
  expect((await handler(request('GET'))).status).toBe(403);
  expect(mockRpc).not.toHaveBeenCalled(); expect(mockFrom).not.toHaveBeenCalled();
});
it.each([contactsPost, walletPost, vaultPost, recoveryPost])('rejects API writes with an access proof, expired proof, or another actor', async handler => {
  for (const proof of [undefined, issueAuthenticatorProof(user, 'access').token,
    issueAuthenticatorProof(user, 'critical', Date.now() - 60000).token,
    issueAuthenticatorProof('someone-else', 'critical').token]) {
    expect((await handler(request('POST', proof))).status).toBe(403);
  }
  expect(mockRpc).not.toHaveBeenCalled(); expect(mockFrom).not.toHaveBeenCalled();
});
it('requires critical authenticator verification to change a PIN', async () => {
  expect((await pinPost(request('POST', undefined, { action: 'set', pin: '4321', currentPin: '1234' }))).status).toBe(403);
  expect(mockRpc).not.toHaveBeenCalled();
});
