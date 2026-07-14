/// <reference types="jest" />

import { isDevAuthBypassEnabled } from '../../../lib/auth/dev-bypass';

describe('isDevAuthBypassEnabled', () => {
  const originalDev = (globalThis as any).__DEV__;
  const originalEnv = process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS;

  afterEach(() => {
    (globalThis as any).__DEV__ = originalDev;
    process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS = originalEnv;
  });

  it('is disabled outside __DEV__, even when the env flag is set', () => {
    (globalThis as any).__DEV__ = false;
    process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS = 'true';

    expect(isDevAuthBypassEnabled()).toBe(false);
  });

  it('is disabled in __DEV__ when the env flag is unset', () => {
    (globalThis as any).__DEV__ = true;
    delete process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS;

    expect(isDevAuthBypassEnabled()).toBe(false);
  });

  it('is disabled in __DEV__ when the env flag is not exactly "true"', () => {
    (globalThis as any).__DEV__ = true;
    process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS = '1';

    expect(isDevAuthBypassEnabled()).toBe(false);
  });

  it('is enabled only when both __DEV__ and the explicit env flag are set', () => {
    (globalThis as any).__DEV__ = true;
    process.env.EXPO_PUBLIC_DEV_AUTH_BYPASS = 'true';

    expect(isDevAuthBypassEnabled()).toBe(true);
  });
});
