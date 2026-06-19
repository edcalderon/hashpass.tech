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

jest.mock('@hashpass/auth', () => ({
  authService: {
    getSession: mockAuthSession,
  },
}));

import { EventApiClient } from '../../lib/api-client';

const envBackup: Record<string, string | undefined> = {};
const originalFetch = global.fetch;

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

beforeEach(() => {
  setEnv('EXPO_PUBLIC_API_BASE_URL', 'https://api.hashpass.tech/api');
  mockAuthSession.mockClear();
});

afterEach(() => {
  restoreEnv();
  global.fetch = originalFetch;
});

describe('EventApiClient credential handling', () => {
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
});
