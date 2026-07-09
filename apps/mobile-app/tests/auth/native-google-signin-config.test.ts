/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

const envBackup: Record<string, string | undefined> = {};

const setEnv = (name: string, value?: string) => {
  if (!(name in envBackup)) {
    envBackup[name] = process.env[name];
  }

  if (typeof value === 'string') {
    process.env[name] = value;
  } else {
    delete process.env[name];
  }
};

const restoreEnv = () => {
  for (const [name, value] of Object.entries(envBackup)) {
    if (typeof value === 'string') {
      process.env[name] = value;
    } else {
      delete process.env[name];
    }
  }

  for (const key of Object.keys(envBackup)) {
    delete envBackup[key];
  }
};

const loadHelper = (platformOs: 'android' | 'ios' | 'web') => {
  jest.doMock('react-native', () => ({
    Platform: { OS: platformOs },
  }));

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { shouldUseNativeGoogleSignin } = require('../../lib/native-google-signin-config');
  return shouldUseNativeGoogleSignin as (webClientId?: string | null) => boolean;
};

describe('shouldUseNativeGoogleSignin', () => {
  beforeEach(() => {
    jest.resetModules();
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', undefined);
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', undefined);
    setEnv('GOOGLE_CLIENT_ID', undefined);
    setEnv('BETTER_AUTH_GOOGLE_CLIENT_ID', undefined);
  });

  afterEach(() => {
    restoreEnv();
    jest.dontMock('react-native');
  });

  it('defaults to enabled on native when a web client id exists', () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');

    const shouldUseNativeGoogleSignin = loadHelper('android');
    expect(shouldUseNativeGoogleSignin(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)).toBe(true);
  });

  it('defaults to enabled on native when only the shared GOOGLE_CLIENT_ID exists', () => {
    setEnv('GOOGLE_CLIENT_ID', 'shared-google-client-id');

    const shouldUseNativeGoogleSignin = loadHelper('android');
    expect(shouldUseNativeGoogleSignin(undefined)).toBe(true);
  });

  it('defaults to enabled on native when only the Better Auth Google client id exists', () => {
    setEnv('BETTER_AUTH_GOOGLE_CLIENT_ID', 'better-auth-google-client-id');

    const shouldUseNativeGoogleSignin = loadHelper('android');
    expect(shouldUseNativeGoogleSignin()).toBe(true);
  });

  it('can be disabled explicitly on native builds', () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', 'false');

    const shouldUseNativeGoogleSignin = loadHelper('android');
    expect(shouldUseNativeGoogleSignin(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)).toBe(false);
  });

  it('treats an explicit true flag as an enabled native release', () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', 'true');

    const shouldUseNativeGoogleSignin = loadHelper('android');
    expect(shouldUseNativeGoogleSignin(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)).toBe(true);
  });

  it('treats a blank native flag as unset', () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', '   ');

    const shouldUseNativeGoogleSignin = loadHelper('android');
    expect(shouldUseNativeGoogleSignin(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)).toBe(true);
  });

  it('ignores unrecognized native flag values and keeps native sign-in enabled', () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');
    setEnv('EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN', 'maybe');

    const shouldUseNativeGoogleSignin = loadHelper('android');
    expect(shouldUseNativeGoogleSignin(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)).toBe(true);
  });

  it('returns false when no Google client id can be resolved', () => {
    const shouldUseNativeGoogleSignin = loadHelper('android');
    expect(shouldUseNativeGoogleSignin()).toBe(false);
  });

  it('stays disabled on web', () => {
    setEnv('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'google-web-client-id');

    const shouldUseNativeGoogleSignin = loadHelper('web');
    expect(shouldUseNativeGoogleSignin(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)).toBe(false);
  });
});

describe('signInWithNativeGoogleAccount', () => {
  const mockGoogleSignin = {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(async () => ({ data: { idToken: 'native-id-token' } })),
    signOut: jest.fn(async () => undefined),
  };
  const mockStatusCodes = {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  };

  const loadNativeGoogleSignin = () => {
    jest.doMock('@react-native-google-signin/google-signin', () => ({
      GoogleSignin: mockGoogleSignin,
      statusCodes: mockStatusCodes,
    }));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../../lib/native-google-signin.native');
  };

  beforeEach(() => {
    jest.resetModules();
    mockGoogleSignin.configure.mockClear();
    mockGoogleSignin.hasPlayServices.mockReset().mockResolvedValue(true);
    mockGoogleSignin.signIn.mockReset().mockResolvedValue({ data: { idToken: 'native-id-token' } });
    mockGoogleSignin.signOut.mockClear();
  });

  afterEach(() => {
    jest.dontMock('@react-native-google-signin/google-signin');
  });

  it('returns the SDK ID token when Google Sign-In succeeds', async () => {
    const { signInWithNativeGoogleAccount } = loadNativeGoogleSignin();

    await expect(signInWithNativeGoogleAccount()).resolves.toEqual({ idToken: 'native-id-token' });
  });

  it('configures the SDK immediately before starting native sign-in', async () => {
    const { signInWithNativeGoogleAccount } = loadNativeGoogleSignin();

    await expect(signInWithNativeGoogleAccount('google-web-client-id')).resolves.toEqual({
      idToken: 'native-id-token',
    });
    expect(mockGoogleSignin.configure).toHaveBeenCalledWith({
      webClientId: 'google-web-client-id',
      offlineAccess: false,
    });
    expect(mockGoogleSignin.hasPlayServices).toHaveBeenCalledTimes(1);
  });

  it('normalizes cancelled SDK responses without an ID token', async () => {
    mockGoogleSignin.signIn.mockResolvedValueOnce({ type: 'cancelled' } as never);
    const { signInWithNativeGoogleAccount } = loadNativeGoogleSignin();

    await expect(signInWithNativeGoogleAccount()).rejects.toMatchObject({
      code: mockStatusCodes.SIGN_IN_CANCELLED,
      message: 'Google Sign-In was cancelled.',
    });
  });

  it('normalizes successful SDK responses that are missing an ID token', async () => {
    mockGoogleSignin.signIn.mockResolvedValueOnce({ type: 'success', data: {} } as never);
    const { signInWithNativeGoogleAccount } = loadNativeGoogleSignin();

    await expect(signInWithNativeGoogleAccount()).rejects.toMatchObject({
      code: 'GOOGLE_ID_TOKEN_MISSING',
      message: 'Google Sign-In did not return an ID token (response type: success).',
    });
  });

  it('normalizes Play Services failures before starting account selection', async () => {
    mockGoogleSignin.hasPlayServices.mockRejectedValueOnce(new Error('Play Services unavailable'));
    const { signInWithNativeGoogleAccount } = loadNativeGoogleSignin();

    await expect(signInWithNativeGoogleAccount()).rejects.toMatchObject({
      code: mockStatusCodes.PLAY_SERVICES_NOT_AVAILABLE,
      message: 'Play Services unavailable',
    });
    expect(mockGoogleSignin.signIn).not.toHaveBeenCalled();
  });

  it('does not throw on module import when the native Google module is unavailable', async () => {
    jest.dontMock('@react-native-google-signin/google-signin');
    jest.doMock('@react-native-google-signin/google-signin', () => {
      throw new Error('TurboModuleRegistry.getEnforcing(...): RNGoogleSignin could not be found');
    });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nativeGoogleSignin = require('../../lib/native-google-signin.native');

    await expect(nativeGoogleSignin.signInWithNativeGoogleAccount('google-web-client-id')).rejects.toMatchObject({
      code: 'GOOGLE_SIGN_IN_UNAVAILABLE',
      message: expect.stringContaining('RNGoogleSignin could not be found'),
    });
  });
});
