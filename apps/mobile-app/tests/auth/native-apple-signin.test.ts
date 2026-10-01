/// <reference types="jest" />

let mockIsAvailableAsync: jest.Mock;
let mockSignInAsync: jest.Mock;

describe('signInWithNativeAppleAccount', () => {
  beforeEach(() => {
    jest.resetModules();
    // Re-read the shared native-module mock after resetModules(). Keeping the
    // references current makes this test deterministic in coverage runs.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const appleAuthentication = require('expo-apple-authentication');
    mockIsAvailableAsync = appleAuthentication.isAvailableAsync;
    mockSignInAsync = appleAuthentication.signInAsync;
    mockIsAvailableAsync.mockReset().mockResolvedValue(true);
    mockSignInAsync.mockReset().mockResolvedValue({ identityToken: 'apple-id-token-123' });
  });

  it('requests Apple email and name scopes and returns the identity token', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { signInWithNativeAppleAccount } = require('../../lib/native-apple-signin.ios');

    await expect(signInWithNativeAppleAccount()).resolves.toEqual({ identityToken: 'apple-id-token-123' });
    expect(mockSignInAsync).toHaveBeenCalledWith({
      requestedScopes: ['FULL_NAME', 'EMAIL'],
    });
  });

  it('fails clearly when Apple authentication is unavailable in the installed build', async () => {
    mockIsAvailableAsync.mockResolvedValueOnce(false);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { signInWithNativeAppleAccount } = require('../../lib/native-apple-signin.ios');

    await expect(signInWithNativeAppleAccount()).rejects.toMatchObject({
      code: 'APPLE_SIGN_IN_UNAVAILABLE',
    });
    expect(mockSignInAsync).not.toHaveBeenCalled();
  });

  it('fails clearly when Apple does not return an identity token', async () => {
    mockSignInAsync.mockResolvedValueOnce({ identityToken: null });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { signInWithNativeAppleAccount } = require('../../lib/native-apple-signin.ios');

    await expect(signInWithNativeAppleAccount()).rejects.toMatchObject({
      code: 'APPLE_ID_TOKEN_MISSING',
    });
  });

  it.each([
    ['Android', '../../lib/native-apple-signin.native'],
    ['web', '../../lib/native-apple-signin.web'],
    ['fallback', '../../lib/native-apple-signin.ts'],
  ])('reports Apple as unavailable on %s', async (_platform, modulePath) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { signInWithNativeAppleAccount } = require(modulePath);

    await expect(signInWithNativeAppleAccount()).rejects.toMatchObject({
      code: 'APPLE_SIGN_IN_UNAVAILABLE',
    });
  });
});
