/// <reference types="jest" />

import {
  AUTH_REDIRECT_GRACE_WINDOW_MS,
  clearRecentAuthSuccess,
  hasRecentAuthSuccess,
  markRecentAuthSuccess,
} from '../../lib/auth/recent-auth';

describe('recent auth helper', () => {
  const storage = new Map<string, string>();
  let now = 1_700_000_000_000;
  let nowSpy: jest.SpyInstance<number, []>;

  const sessionStorageMock = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
  };

  beforeEach(() => {
    storage.clear();
    now = 1_700_000_000_000;
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    (globalThis as any).window = {
      sessionStorage: sessionStorageMock,
    };
    clearRecentAuthSuccess();
  });

  afterEach(() => {
    nowSpy.mockRestore();
    clearRecentAuthSuccess();
    delete (globalThis as any).window;
    delete (globalThis as any).__HASHPASS_RECENT_AUTH_SUCCESS_AT__;
  });

  it('marks auth success in storage and keeps the redirect grace active', () => {
    markRecentAuthSuccess();

    expect(storage.get('auth_recent_success_at')).toBe(String(now));
    expect(hasRecentAuthSuccess()).toBe(true);
  });

  it('expires auth success after the grace window elapses', () => {
    markRecentAuthSuccess();
    now += AUTH_REDIRECT_GRACE_WINDOW_MS + 1;

    expect(hasRecentAuthSuccess()).toBe(false);
    expect(storage.has('auth_recent_success_at')).toBe(false);
  });
});
