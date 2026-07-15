/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

// The lock makes globalThis.URLSearchParams / URL non-configurable, which is
// irreversible within a JS realm — so these tests live in their own file (own
// Jest global) instead of tests/lib/url-search-params-polyfill.test.ts, whose
// other cases need to keep swapping the global freely.
describe('URLSearchParams global lock (native runtimes)', () => {
  const originalNavigator = (globalThis as any).navigator;

  beforeEach(() => {
    // Simulate a React Native runtime on the New Architecture (Fabric/Bridgeless)
    // so the lock engages — this is the only mode it's safe in. See the
    // isNewArchitectureEnabled() comment in url-search-params.ts for why: under
    // the old bridge, this same lock caused a stuck-on-splash crash for every
    // user in v1.8.222 (newArchEnabled: false), because something in the old
    // bridge's later polyfill pass throws uncaught against a locked property
    // instead of degrading gracefully like RN's own guarded polyfillGlobal does.
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { product: 'ReactNative' },
    });
    (globalThis as any).nativeFabricUIManager = {};
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
    delete (globalThis as any).nativeFabricUIManager;
    jest.resetModules();
  });

  it('locks the globals and neutralizes a mid-session re-bind to RN\'s throwing stub', () => {
    // Reproduces the v1.8.199 on-device failure: boot-time global works, then
    // something during the Google sign-in flow re-binds the global back to RN's
    // stub, and the next expo-router navigation calls .has() on it and crashes.
    class RNStubURLSearchParams {
      _searchParams: [string, string][] = [];
      append(key: string, value: string): void {
        this._searchParams.push([key, value]);
      }
      has(): never {
        throw new Error('URLSearchParams.has is not implemented');
      }
      get(): never {
        throw new Error('URLSearchParams.get is not implemented');
      }
      getAll(): never {
        throw new Error('URLSearchParams.getAll is not implemented');
      }
      delete(): never {
        throw new Error('URLSearchParams.delete is not implemented');
      }
    }

    const { installURLSearchParamsPolyfill } = require('../../lib/polyfills/url-search-params');
    expect(installURLSearchParamsPolyfill()).toBe(true);

    const workingBeforeRebind = globalThis.URLSearchParams;
    expect(new workingBeforeRebind('a=1').has('a')).toBe(true);

    // Mid-session re-bind attempt (the unknown culprit's move).
    (globalThis as any).URLSearchParams = RNStubURLSearchParams;

    // The lock must keep serving the working implementation…
    expect(globalThis.URLSearchParams).toBe(workingBeforeRebind);
    const params = new (globalThis.URLSearchParams as any)('provider=google');
    expect(() => params.has('provider')).not.toThrow();
    expect(params.has('provider')).toBe(true);

    // …and the rejected stub class itself must have been patched, so code
    // holding a direct reference to it cannot crash either.
    const direct: any = new RNStubURLSearchParams();
    direct.append('code', 'abc');
    expect(() => direct.has('code')).not.toThrow();
    expect(direct.has('code')).toBe(true);
    expect(direct.get('code')).toBe('abc');
  });

  it('still accepts a fully-working replacement through the lock', () => {
    const { installURLSearchParamsPolyfill } = require('../../lib/polyfills/url-search-params');
    installURLSearchParamsPolyfill();

    // Node's own URLSearchParams is spec-compliant — the setter should accept it.
    const Working = globalThis.URLSearchParams;
    (globalThis as any).URLSearchParams = Working;
    expect(globalThis.URLSearchParams).toBe(Working);
  });

  it('RN polyfillGlobal-style re-install attempts degrade gracefully against the lock', () => {
    const { installURLSearchParamsPolyfill } = require('../../lib/polyfills/url-search-params');
    installURLSearchParamsPolyfill();

    // RN's polyfillObjectProperty checks the descriptor's `configurable` first
    // and refuses with console.error instead of throwing. Simulate that exact
    // guard here to document why the lock is safe against RN/Expo re-installs.
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'URLSearchParams');
    expect(descriptor?.configurable).toBe(false);

    // A raw defineProperty on a non-configurable accessor throws at the caller —
    // which is why the lock relies on RN's guard existing (it does; see
    // react-native/Libraries/Utilities/PolyfillFunctions.js).
    expect(() =>
      Object.defineProperty(globalThis, 'URLSearchParams', {
        get: () => undefined,
        configurable: true,
      })
    ).toThrow();
  });
});
