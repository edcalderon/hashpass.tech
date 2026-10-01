/// <reference types="jest" />

const mockIsAvailableAsync = jest.fn();
const mockSignInAsync = jest.fn();

jest.mock('expo-apple-authentication', () => ({
  AppleAuthenticationScope: {
    FULL_NAME: 'FULL_NAME',
    EMAIL: 'EMAIL',
  },
  isAvailableAsync: (...args: unknown[]) => mockIsAvailableAsync(...args),
  signInAsync: (...args: unknown[]) => mockSignInAsync(...args),
}), { virtual: true });

describe('signInWithNativeAppleAccount', () => {
  beforeEach(() => {
    jest.resetModules();
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
});
