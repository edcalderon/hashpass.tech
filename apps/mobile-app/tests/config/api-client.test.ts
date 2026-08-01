/// <reference types="jest" />

jest.mock('expo/virtual/env', () => ({
  __esModule: true,
  env: process.env,
}), { virtual: true });

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

jest.mock('../../lib/event-detector', () => ({
  getCurrentEvent: jest.fn(() => null),
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    },
  },
}));

const mockAuthSession = jest.fn();
const mockApiAccessToken = jest.fn();

jest.mock('@hashpass/auth', () => ({
  authService: {
    getSession: (...args: unknown[]) => mockAuthSession(...args),
    getApiAccessToken: (...args: unknown[]) => mockApiAccessToken(...args),
  },
}));

import { EventApiClient, eventApiPath, getCaptchaApiEndpoint } from '../../lib/api-client';
import { Platform } from 'react-native';

const envBackup: Record<string, string | undefined> = {};
const originalFetch = global.fetch;
const originalPlatformOs = Platform.OS;

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

const setWindow = (value?: any) => {
  if (typeof value === 'undefined') {
    delete (global as typeof globalThis & { window?: any }).window;
    return;
  }

  (global as typeof globalThis & { window?: any }).window = value;
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

beforeEach(() => {
  Platform.OS = 'android';
  setEnv('EXPO_PUBLIC_API_BASE_URL', 'https://api.hashpass.tech/api');
  mockAuthSession.mockClear();
  mockApiAccessToken.mockReset();
  setWindow(undefined);
});

afterEach(() => {
  restoreEnv();
  global.fetch = originalFetch;
  Platform.OS = originalPlatformOs;
  setWindow(undefined);
  jest.useRealTimers();
});

describe('EventApiClient credential handling', () => {
  it('builds an event-scoped API path without inheriting a brand route', () => {
    expect(eventApiPath).toEqual(expect.any(Function));
    expect(eventApiPath('chile2026', 'meetings/requests')).toBe(
      'events/chile2026/meetings/requests'
    );
  });

  it('omits credentials for public requests with skipAuth enabled', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({ status: 'healthy' }),
    }));

    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new EventApiClient();
    const response = await client.request('status', {
      skipEventSegment: true,
      skipAuth: true,
    });

    expect(response.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.hashpass.tech/api/status');
    expect(init).toEqual(expect.objectContaining({
      method: 'GET',
      credentials: 'omit',
    }));
    expect(mockAuthSession).not.toHaveBeenCalled();
  });

  it('falls back to the remote development API on native when the configured base URL is localhost', async () => {
    setEnv('EXPO_PUBLIC_API_BASE_URL', 'http://localhost:8081/api');
    setEnv('EXPO_PUBLIC_EAS_BUILD_PROFILE', 'preview');
    setEnv('EXPO_PUBLIC_SUPABASE_PROFILE', 'core-development');

    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({ status: 'healthy' }),
    }));

    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new EventApiClient();
    const response = await client.request('status', {
      skipEventSegment: true,
      skipAuth: true,
    });

    expect(response.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api-dev.hashpass.tech/api/status');
    expect(init).toEqual(expect.objectContaining({
      method: 'GET',
      credentials: 'omit',
    }));
    expect(mockAuthSession).not.toHaveBeenCalled();
  });

  it('prefers the injected web runtime API base URL over the fallback remote API', async () => {
    Platform.OS = 'web';
    setEnv('EXPO_PUBLIC_API_BASE_URL', undefined);
    setEnv('EXPO_PUBLIC_EAS_BUILD_PROFILE', 'preview');
    setEnv('EXPO_PUBLIC_SUPABASE_PROFILE', 'core-development');
    setWindow({
      location: {
        hostname: 'hashpass.tech',
        origin: 'https://hashpass.tech',
      },
      __API_BASE_URL__: 'https://api.hashpass.tech/api',
    });

    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => (name.toLowerCase() === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({ status: 'healthy' }),
    }));

    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new EventApiClient();
    const response = await client.request('status', {
      skipEventSegment: true,
      skipAuth: true,
    });

    expect(response.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.hashpass.tech/api/status');
    expect(init).toEqual(expect.objectContaining({
      method: 'GET',
      credentials: 'omit',
    }));
    expect(mockAuthSession).not.toHaveBeenCalled();
  });

  it('uses the configured API base for Cap challenges on web instead of the static site origin', () => {
    Platform.OS = 'web';
    setEnv('EXPO_PUBLIC_API_BASE_URL', undefined);
    setWindow({
      location: {
        hostname: 'hashpass.tech',
        origin: 'https://hashpass.tech',
      },
      __API_BASE_URL__: 'https://api.hashpass.tech/api',
    });

    expect(getCaptchaApiEndpoint()).toBe('https://api.hashpass.tech/api/captcha/');
  });

  it('exchanges a cookie-backed Directus session for a bearer token before calling the API', async () => {
    mockAuthSession.mockResolvedValue({
      access_token: 'session_based',
      user: { id: 'directus-user-123', email: 'ada@hashpass.tech' },
    });
    mockApiAccessToken.mockResolvedValue('directus-bearer-token');
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      json: async () => ({ data: {} }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new EventApiClient();
    await expect(client.request('admin/access', { skipEventSegment: true })).resolves.toEqual({
      data: { data: {} },
      success: true,
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(mockApiAccessToken).toHaveBeenCalledTimes(1);
    expect(init.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer directus-bearer-token',
    }));
  });

  it('does not send Better Auth\'s placeholder session marker as a literal bearer token', async () => {
    // Regression: 'better_auth_session' was missing from the non-bearer
    // placeholder exclusion list, so a fresh Better-Auth-only session (no
    // real token yet, no Supabase bridge session landed) sent this fake
    // string as `Authorization: Bearer better_auth_session` instead of
    // falling through to getApiAccessToken -- the server correctly
    // rejected it, surfacing as "No authorization token provided" on
    // admin-access/notifications requests right after a fresh sign-in.
    mockAuthSession.mockResolvedValue({
      access_token: 'better_auth_session',
      user: { id: 'better-auth-user-123', email: 'ada@hashpass.tech' },
    });
    mockApiAccessToken.mockResolvedValue('better-auth-bearer-token');
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: { get: () => 'application/json' },
      json: async () => ({ data: {} }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new EventApiClient();
    await expect(client.request('admin/access', { skipEventSegment: true })).resolves.toEqual({
      data: { data: {} },
      success: true,
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(mockApiAccessToken).toHaveBeenCalledTimes(1);
    expect(init.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer better-auth-bearer-token',
    }));
  });

  it('returns a friendly timeout error and does not retry aborted requests', async () => {
    jest.useFakeTimers();

    const fetchMock = jest.fn((_url: string, init?: RequestInit) => new Promise((_, reject) => {
      const signal = init?.signal as AbortSignal | undefined;
      signal?.addEventListener('abort', () => {
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        reject(error);
      });
    }));

    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new EventApiClient();
    const responsePromise = client.request('status', {
      skipEventSegment: true,
      skipAuth: true,
      timeout: 5,
    });

    await jest.advanceTimersByTimeAsync(5);

    await expect(responsePromise).resolves.toEqual({
      data: null,
      error: 'The request timed out. Please try again.',
      success: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
