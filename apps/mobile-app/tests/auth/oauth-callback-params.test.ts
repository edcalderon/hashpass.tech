/// <reference types="jest" />

import { mergeOAuthFragmentParams } from '../../lib/auth/oauth/callback-params';

describe('mergeOAuthFragmentParams', () => {
  it('preserves Directus fragment payloads when building the OAuth callback params', () => {
    const hashParams = new URLSearchParams(
      `access_token=access123&refresh_token=refresh456&directus_user=${encodeURIComponent(
        JSON.stringify({
          id: 'directus-user-123',
          email: 'ada@hashpass.tech',
          first_name: 'Ada',
          last_name: 'Lovelace',
          status: 'active',
        })
      )}&sb_token_hash=bridge-token-123`
    );

    const result = mergeOAuthFragmentParams(hashParams, {
      access_token: 'access123',
      email: 'ada@hashpass.tech',
      oauth_success: 'true',
    });

    expect(result.access_token).toBe('access123');
    expect(result.refresh_token).toBe('refresh456');
    expect(result.directus_user).toContain('"email":"ada@hashpass.tech"');
    expect(result.sb_token_hash).toBe('bridge-token-123');
    expect(result.oauth_success).toBe('true');
  });
});
