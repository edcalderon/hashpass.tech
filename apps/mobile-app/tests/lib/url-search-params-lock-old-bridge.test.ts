/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

// Own file for the same reason as url-search-params-lock.test.ts: locking
// globalThis.URLSearchParams/URL is irreversible within a JS realm, so this
// scenario (lock must NOT engage) needs a realm untouched by any prior lock.
describe('URLSearchParams global lock (old bridge)', () => {
  const originalNavigator = (globalThis as any).navigator;

  beforeEach(() => {
    // Simulate a React Native runtime WITHOUT the New Architecture — i.e.
    // newArchEnabled: false / "Bridgeless Mode: false" in logs. No
    // nativeFabricUIManager, no RN$Bridgeless.
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { product: 'ReactNative' },
    });
    delete (globalThis as any).nativeFabricUIManager;
    delete (globalThis as any)['RN$Bridgeless'];
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
    jest.resetModules();
  });

  it('does not lock the globals on the old bridge (newArchEnabled: false)', () => {
    // Regression test for the v1.8.222 outage: the lock (configurable: false)
    // was only ever validated under the New Architecture. Under the old bridge,
    // something in RN's later polyfill-install pass throws uncaught against a
    // locked property during synchronous bundle evaluation — before
    // AppRegistry.registerComponent() runs — leaving every user stuck on the
    // native splash. The fix is to skip the lock entirely when
    // nativeFabricUIManager/RN$Bridgeless aren't present.
    const { installURLSearchParamsPolyfill } = require('../../lib/polyfills/url-search-params');
    installURLSearchParamsPolyfill();

    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'URLSearchParams');
    expect(descriptor?.configurable).not.toBe(false);

    // A later re-polyfill attempt (RN's own, or anything else) must be able to
    // redefine the property without throwing — this is what old-bridge startup
    // needs and what the lock previously broke.
    expect(() =>
      Object.defineProperty(globalThis, 'URLSearchParams', {
        configurable: true,
        value: globalThis.URLSearchParams,
      })
    ).not.toThrow();
  });
});
