/// <reference types="jest" />

// Regression coverage for the BSL request-scoped-client bug: detectUserLocale,
// hasEmailBeenSent, and markEmailAsSent used to hard-code the global
// core-production supabaseServer client, so a BSL user's tracking lookup
// would silently miss (wrong Supabase project) and repeatedly re-send the
// welcome email. Each now accepts an optional client and must use it instead
// of the default when one is passed.

jest.mock('../../lib/supabase-server', () => ({
  supabaseServer: { __brand: 'default-core-client' },
}));

function makeFakeClient(overrides: Record<string, unknown> = {}) {
  return {
    __brand: 'request-scoped-bsl-client',
    auth: { admin: { getUserById: jest.fn() } },
    rpc: jest.fn(),
    ...overrides,
  };
}

describe('email.ts client scoping', () => {
  it('detectUserLocale queries the passed client, not the default supabaseServer', async () => {
    const { detectUserLocale } = require('../../lib/email');
    const bslClient = makeFakeClient();
    (bslClient.auth.admin.getUserById as jest.Mock).mockResolvedValue({
      data: { user: { user_metadata: { locale: 'es' } } },
      error: null,
    });

    const locale = await detectUserLocale('bsl-user-id', undefined, bslClient);

    expect(locale).toBe('es');
    expect(bslClient.auth.admin.getUserById).toHaveBeenCalledWith('bsl-user-id');
  });

  it('detectUserLocale defaults to the global supabaseServer when no client is passed', async () => {
    const { detectUserLocale } = require('../../lib/email');
    const { supabaseServer } = require('../../lib/supabase-server');
    supabaseServer.auth = { admin: { getUserById: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) } };

    await detectUserLocale('some-user-id');

    expect(supabaseServer.auth.admin.getUserById).toHaveBeenCalledWith('some-user-id');
  });

  it('hasEmailBeenSent calls rpc on the passed client', async () => {
    const { hasEmailBeenSent } = require('../../lib/email');
    const bslClient = makeFakeClient();
    (bslClient.rpc as jest.Mock).mockResolvedValue({ data: true, error: null });

    const result = await hasEmailBeenSent('bsl-user-id', 'welcome', bslClient);

    expect(result).toBe(true);
    expect(bslClient.rpc).toHaveBeenCalledWith('has_email_been_sent', {
      p_user_id: 'bsl-user-id',
      p_email_type: 'welcome',
    });
  });

  it('markEmailAsSent calls rpc on the passed client', async () => {
    const { markEmailAsSent } = require('../../lib/email');
    const bslClient = makeFakeClient();
    (bslClient.rpc as jest.Mock).mockResolvedValue({ data: 'tracking-id-123', error: null });

    const result = await markEmailAsSent('bsl-user-id', 'welcome', 'es', 'msg-1', bslClient);

    expect(result).toEqual({ success: true, trackingId: 'tracking-id-123' });
    expect(bslClient.rpc).toHaveBeenCalledWith('mark_email_as_sent', {
      p_user_id: 'bsl-user-id',
      p_email_type: 'welcome',
      p_locale: 'es',
      p_message_id: 'msg-1',
    });
  });
});
