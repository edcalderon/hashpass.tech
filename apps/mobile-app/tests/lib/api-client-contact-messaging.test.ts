jest.mock('../../lib/authenticator-session', () => ({
  activeAuthenticatorProof: jest.fn(),
  AUTHENTICATOR_HEADER: 'X-Hashpass-Authenticator',
}));
jest.mock('../../lib/step-up-session', () => ({
  activeStepUpProof: jest.fn(),
  STEP_UP_HEADER: 'X-Hashpass-Step-Up',
}));
jest.mock('../../lib/event-detector', () => ({ getCurrentEvent: () => null }));
jest.mock('../../config/supabase-profiles', () => ({ resolvePublicSupabaseConfig: () => ({ environment: 'production' }) }));
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: { access_token: 'session-token' } } })) } },
}));
jest.mock('@hashpass/auth', () => ({ authService: { getSession: jest.fn() } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { extra: {} } } }));

import { activeAuthenticatorProof } from '../../lib/authenticator-session';
import { activeStepUpProof } from '../../lib/step-up-session';
import { EventApiClient } from '../../lib/api-client';

describe('EventApiClient contact messaging security proofs', () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn((..._args: Parameters<typeof fetch>) => Promise.resolve({
    ok: true,
    json: async () => ({ data: {} }),
  } as Response));

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    jest.mocked(activeAuthenticatorProof).mockImplementation((scope: Parameters<typeof activeAuthenticatorProof>[0]) =>
      scope === 'access' ? 'access-proof' : null);
    jest.mocked(activeStepUpProof).mockReturnValue('wallet-unlock-proof');
  });

  afterAll(() => { globalThis.fetch = originalFetch; });

  it('forwards access and PIN proofs to POST-based conversation reads', async () => {
    const client = new EventApiClient();

    await client.post('contact-messages', { action: 'thread', peer: 'peer-id' }, {
      skipEventSegment: true,
      retries: 0,
    });

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.headers).toMatchObject({
      'X-Hashpass-Authenticator': 'access-proof',
      'X-Hashpass-Step-Up': 'wallet-unlock-proof',
    });
    expect(activeAuthenticatorProof).toHaveBeenCalledWith('access');
  });
});
