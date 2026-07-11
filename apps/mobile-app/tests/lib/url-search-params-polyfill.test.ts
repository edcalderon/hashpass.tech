/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

describe('URLSearchParams native polyfill', () => {
  const originalURLSearchParams = globalThis.URLSearchParams;

  afterEach(() => {
    globalThis.URLSearchParams = originalURLSearchParams;
    jest.resetModules();
  });

  it('replaces React Native URLSearchParams.has stubs that throw', () => {
    class StubURLSearchParams {
      private readonly values: Map<string, string[]>;

      constructor(query = '') {
        this.values = new Map();
        query.split('&').forEach((part) => {
          if (!part) return;
          const [name, value = ''] = part.split('=');
          const key = decodeURIComponent(name);
          const current = this.values.get(key) ?? [];
          current.push(decodeURIComponent(value));
          this.values.set(key, current);
        });
      }

      getAll(name: string) {
        return this.values.get(name) ?? [];
      }

      has() {
        throw new Error('URLSearchParams.has is not implemented');
      }
    }

    globalThis.URLSearchParams = StubURLSearchParams as any;

    const { installURLSearchParamsHasPolyfill } = require('../../lib/polyfills/url-search-params');
    expect(installURLSearchParamsHasPolyfill()).toBe(true);

    const params = new URLSearchParams('provider=google&provider=github');
    expect(params.has('provider')).toBe(true);
    expect(params.has('provider', 'google')).toBe(true);
    expect(params.has('provider', 'apple')).toBe(false);
    expect(params.has('missing')).toBe(false);
  });

  it('handles runtimes without URLSearchParams', () => {
    (globalThis as any).URLSearchParams = undefined;

    const { installURLSearchParamsHasPolyfill } = require('../../lib/polyfills/url-search-params');
    expect(installURLSearchParamsHasPolyfill()).toBe(false);
  });

  it('supports forEach-only URLSearchParams implementations', () => {
    class ForEachURLSearchParams {
      private readonly entriesList = [['provider', 'google']];

      has() {
        throw new Error('URLSearchParams.has is not implemented');
      }

      forEach(callback: (value: string, name: string) => void) {
        this.entriesList.forEach(([name, value]) => callback(value, name));
      }
    }

    globalThis.URLSearchParams = ForEachURLSearchParams as any;

    const { installURLSearchParamsHasPolyfill } = require('../../lib/polyfills/url-search-params');
    expect(installURLSearchParamsHasPolyfill()).toBe(true);

    const params = new URLSearchParams();
    expect(params.has('provider')).toBe(true);
    expect(params.has('provider', 'google')).toBe(true);
    expect(params.has('provider', 'github')).toBe(false);
  });

  it('falls back to parsing toString output', () => {
    class StringURLSearchParams {
      has() {
        throw new Error('URLSearchParams.has is not implemented');
      }

      toString() {
        return 'provider=google&returnTo=%2Fdashboard%2Fexplore';
      }
    }

    globalThis.URLSearchParams = StringURLSearchParams as any;

    const { installURLSearchParamsHasPolyfill } = require('../../lib/polyfills/url-search-params');
    expect(installURLSearchParamsHasPolyfill()).toBe(true);

    const params = new URLSearchParams();
    expect(params.has('provider')).toBe(true);
    expect(params.has('returnTo', '/dashboard/explore')).toBe(true);
    expect(params.has('provider', 'github')).toBe(false);
  });

  it('uses the targeted fallback when the full URL polyfill cannot load', () => {
    class StubURLSearchParams {
      getAll(name: string) {
        return name === 'provider' ? ['google'] : [];
      }

      has() {
        throw new Error('URLSearchParams.has is not implemented');
      }
    }

    globalThis.URLSearchParams = StubURLSearchParams as any;
    jest.doMock('react-native-url-polyfill/auto', () => {
      throw new Error('polyfill load failed');
    });

    const { installURLSearchParamsPolyfill } = require('../../lib/polyfills/url-search-params');
    expect(installURLSearchParamsPolyfill()).toBe(true);
    expect(new URLSearchParams().has('provider')).toBe(true);
  });

  it('keeps working implementations unchanged', () => {
    const { installURLSearchParamsHasPolyfill } = require('../../lib/polyfills/url-search-params');
    const existingHas = URLSearchParams.prototype.has;

    expect(installURLSearchParamsHasPolyfill()).toBe(false);
    expect(URLSearchParams.prototype.has).toBe(existingHas);
  });

  it('does not crash the has() fallback when a stub declares getAll but getAll also throws', () => {
    // Mirrors React Native's real Libraries/Blob/URLSearchParams: getAll is a
    // declared method, but calling it throws "not implemented". The old fallback
    // only checked `typeof this.getAll === 'function'`, which is true here, so it
    // called through and crashed instead of falling back to forEach/toString.
    class ThrowingGetAllURLSearchParams {
      getAll(): string[] {
        throw new Error('URLSearchParams.getAll is not implemented');
      }

      has() {
        throw new Error('URLSearchParams.has is not implemented');
      }

      toString() {
        return 'provider=google';
      }
    }

    globalThis.URLSearchParams = ThrowingGetAllURLSearchParams as any;

    const { installURLSearchParamsHasPolyfill } = require('../../lib/polyfills/url-search-params');
    expect(installURLSearchParamsHasPolyfill()).toBe(true);

    const params = new URLSearchParams();
    expect(() => params.has('provider')).not.toThrow();
    expect(params.has('provider')).toBe(true);
    expect(params.has('missing')).toBe(false);
  });

  it('hardens React Native\'s raw URLSearchParams stub class directly, not just the current global', () => {
    // Reproduces the real crash: React Native's own Libraries/Blob/URLSearchParams
    // stores entries in `_searchParams` and throws "X is not implemented" for
    // has/get/getAll/delete/set. RN's polyfillGlobal binds globalThis.URLSearchParams
    // to this exact class via a lazy getter/setter that can get re-armed after boot
    // (e.g. by a later module also calling polyfillGlobal), handing the raw,
    // never-patched stub back to callers like expo-router's getRouteInfoFromState.
    // Patching only "whatever is currently global" at install time misses that case;
    // the raw stub class itself must be fixed so it's safe no matter when it's used.
    class RNRawURLSearchParamsStub {
      _searchParams: [string, string][] = [];

      constructor(params?: Record<string, string>) {
        if (typeof params === 'object' && params) {
          Object.keys(params).forEach((key) => this.append(key, params[key]));
        }
      }

      append(key: string, value: string): void {
        this._searchParams.push([key, value]);
      }

      delete(): never {
        throw new Error('URLSearchParams.delete is not implemented');
      }

      get(): never {
        throw new Error('URLSearchParams.get is not implemented');
      }

      getAll(): never {
        throw new Error('URLSearchParams.getAll is not implemented');
      }

      has(): never {
        throw new Error('URLSearchParams.has is not implemented');
      }

      set(): never {
        throw new Error('URLSearchParams.set is not implemented');
      }
    }

    jest.doMock('react-native/Libraries/Blob/URLSearchParams', () => ({
      URLSearchParams: RNRawURLSearchParamsStub,
    }));

    const { patchReactNativeURLSearchParamsStub } = require('../../lib/polyfills/url-search-params');
    expect(patchReactNativeURLSearchParamsStub()).toBe(true);

    // Simulate the raw stub being (re)bound to the global directly, bypassing
    // react-native-url-polyfill entirely — exactly what expo-router would see if
    // the global rebinding happens again after boot. RN's real constructor only
    // accepts a plain object (not a query string), same as here.
    // Cast to `any`: has/get/getAll/delete/set/keys/entries only gain their real
    // (multi-arg / non-throwing) signatures once patchReactNativeURLSearchParamsStub
    // monkey-patches the prototype above — the class's static TS shape mirrors RN's
    // real (parameterless, always-throwing) declarations.
    const params: any = new RNRawURLSearchParamsStub();
    params.append('provider', 'google');
    params.append('provider', 'github');
    expect(() => params.has('provider')).not.toThrow();
    expect(params.has('provider')).toBe(true);
    expect(params.has('provider', 'google')).toBe(true);
    expect(params.has('provider', 'apple')).toBe(false);
    expect(params.get('provider')).toBe('google');
    expect(params.getAll('provider')).toEqual(['google', 'github']);
    expect([...params.keys()]).toEqual(['provider', 'provider']);
    expect([...params.entries()]).toEqual([
      ['provider', 'google'],
      ['provider', 'github'],
    ]);

    params.set('provider', 'apple');
    expect(params.getAll('provider')).toEqual(['apple']);

    params.delete('provider');
    expect(params.has('provider')).toBe(false);
  });
});
