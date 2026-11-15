const mockRpc = jest.fn();
const mockVerifyAuthenticatorProof = jest.fn();

jest.mock('../../lib/supabase-server', () => ({
  getSupabaseServerForRequest: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) }),
}));
jest.mock('../../lib/server/resolve-notification-identity', () => ({
  resolveNotificationIdentity: jest.fn(),
  isResolveIdentityError: jest.fn(),
}));
jest.mock('../../lib/server/authenticator', () => ({
  AUTHENTICATOR_HEADER: 'X-Hashpass-Authenticator',
  issueAuthenticatorProof: jest.fn(),
  matchAuthenticatorCode: jest.fn(),
  newAuthenticatorSecret: jest.fn(),
  openAuthenticatorSecret: jest.fn(),
  recoveryCodeHash: jest.fn(),
  sealAuthenticatorSecret: jest.fn(),
  verifyAuthenticatorProof: (...args: unknown[]) => mockVerifyAuthenticatorProof(...args),
}));

import { hasAuthenticatorAccess } from '../../lib/server/authenticator-api';

const request = (proof?: string) => new Request('https://api.example.test/secure', {
  headers: proof ? { 'X-Hashpass-Authenticator': proof } : {},
});

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyAuthenticatorProof.mockReturnValue(false);
});

it('allows PIN-only access when the user has no authenticator row', async () => {
  mockRpc.mockResolvedValue({ data: null, error: null });
  await expect(hasAuthenticatorAccess(request(), 'user-1', ['access', 'critical'])).resolves.toBe(true);
  expect(mockRpc).toHaveBeenCalledWith('get_user_authenticator', { p_user_id: 'user-1' });
});

it('allows PIN-only access when authenticator setup is pending but not enabled', async () => {
  mockRpc.mockResolvedValue({ data: { enabled: false, pendingUntil: '2026-11-15T00:00:00.000Z' }, error: null });
  await expect(hasAuthenticatorAccess(request(), 'user-1', 'critical')).resolves.toBe(true);
});

it('still requires a valid authenticator proof after enrollment', async () => {
  mockRpc.mockResolvedValue({ data: { enabled: true }, error: null });
  await expect(hasAuthenticatorAccess(request(), 'user-1', 'critical')).resolves.toBe(false);
  mockVerifyAuthenticatorProof.mockReturnValue(true);
  await expect(hasAuthenticatorAccess(request('valid'), 'user-1', ['access', 'critical'])).resolves.toBe(true);
  expect(mockRpc).toHaveBeenCalledTimes(1);
});

it('fails closed when enrollment status is unavailable or malformed', async () => {
  mockRpc.mockResolvedValueOnce({ data: null, error: new Error('database unavailable') });
  await expect(hasAuthenticatorAccess(request(), 'user-1')).resolves.toBe(false);
  mockRpc.mockResolvedValueOnce({ data: { pending: true }, error: null });
  await expect(hasAuthenticatorAccess(request(), 'user-1')).resolves.toBe(false);
});
