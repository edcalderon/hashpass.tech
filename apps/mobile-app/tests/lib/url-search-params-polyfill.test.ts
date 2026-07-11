/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

describe('URLSearchParams native polyfill', () => {
  const originalURLSearchParams = globalThis.URLSearchParams;
  const originalURL = globalThis.URL;

  afterEach(() => {
    globalThis.URLSearchParams = originalURLSearchParams;
    globalThis.URL = originalURL;
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
    // Both the whatwg polyfill and RN's raw stub module are unavailable, so the
    // orchestrator must fall back to patching the current global stub in place.
    jest.doMock('react-native-url-polyfill', () => {
      throw new Error('polyfill load failed');
    });
    jest.doMock('react-native/Libraries/Blob/URLSearchParams', () => {
      throw new Error('stub module unavailable');
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

  it('installs the working whatwg URL + URLSearchParams onto the globals', () => {
    // Start from RN's broken stub as the global, like a real device boot.
    class BrokenGlobalStub {
      has() {
        throw new Error('URLSearchParams.has is not implemented');
      }
    }
    globalThis.URLSearchParams = BrokenGlobalStub as any;

    // react-native-url-polyfill ships ESM that Jest can't transform, so stand in
    // with Node's fully-spec-compliant URL/URLSearchParams (same whatwg contract
    // the real dependency provides at runtime through Metro).
    jest.doMock('react-native-url-polyfill', () => ({
      URL: globalThis.URL,
      URLSearchParams: originalURLSearchParams,
    }));

    const { installURLSearchParamsPolyfill } = require('../../lib/polyfills/url-search-params');
    expect(installURLSearchParamsPolyfill()).toBe(true);

    // The global must now be a fully working implementation, and both expo-router
    // code paths must work: bare `new URLSearchParams()` and `new URL().searchParams`.
    const direct = new URLSearchParams('provider=google&provider=github&returnTo=%2Fdashboard');
    expect(direct.has('provider')).toBe(true);
    expect(direct.getAll('provider')).toEqual(['google', 'github']);
    expect(direct.get('returnTo')).toBe('/dashboard');
    expect([...direct.keys()]).toContain('provider');

    // This is the getStateFromPath-forks.js path — it MUST parse the query string
    // (RN's stub URL.searchParams always returns an empty set, dropping OAuth params).
    const fromUrl = new URL('https://phony.example/auth/callback?code=abc123&state=xyz').searchParams;
    expect(fromUrl.get('code')).toBe('abc123');
    expect(fromUrl.get('state')).toBe('xyz');
  });

  it('fully patches a stub-backed global (all methods) when the whatwg polyfill is unavailable', () => {
    // No whatwg polyfill and no RN stub module: the orchestrator must still leave
    // the current global safe for every method expo-router calls — not just `.has`.
    class RNRawURLSearchParamsStub {
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

    globalThis.URLSearchParams = RNRawURLSearchParamsStub as any;
    jest.doMock('react-native-url-polyfill', () => {
      throw new Error('polyfill load failed');
    });
    jest.doMock('react-native/Libraries/Blob/URLSearchParams', () => {
      throw new Error('stub module unavailable');
    });

    const { installURLSearchParamsPolyfill } = require('../../lib/polyfills/url-search-params');
    expect(installURLSearchParamsPolyfill()).toBe(true);

    const params: any = new (globalThis.URLSearchParams as any)();
    params.append('#', 'frag');
    params.append('code', 'abc');
    // Every method expo-router's getRouteInfoFromState touches must be safe now.
    expect(() => params.has('#')).not.toThrow();
    expect(() => params.get('#')).not.toThrow();
    expect(() => params.delete('#')).not.toThrow();
    expect(() => [...params.keys()]).not.toThrow();
    expect(() => params.getAll('code')).not.toThrow();
    expect(params.has('code')).toBe(true);
    expect(params.get('code')).toBe('abc');
    params.delete('#');
    expect(params.has('#')).toBe(false);
  });

  it('hardens RN\'s stub prototype via a live instance when the require path does not resolve', () => {
    // Reproduces the v1.8.198 failure mode: the whatwg polyfill and the
    // `react-native/Libraries/Blob/URLSearchParams` require BOTH fail to resolve
    // in the Hermes release bundle, and the global URLSearchParams + URL are RN's
    // raw stubs. The orchestrator must still permanently fix the stub prototype
    // by deriving it from live instances — otherwise expo-router crashes.
    class RNStubURLSearchParams {
      _searchParams: [string, string][] = [];
      append(key: string, value: string): void {
        this._searchParams.push([key, value]);
      }
      has(): never { throw new Error('URLSearchParams.has is not implemented'); }
      get(): never { throw new Error('URLSearchParams.get is not implemented'); }
      getAll(): never { throw new Error('URLSearchParams.getAll is not implemented'); }
      delete(): never { throw new Error('URLSearchParams.delete is not implemented'); }
    }

    // RN's URL stub: .searchParams returns a fresh (empty) RN URLSearchParams
    // stub instance — same class, so patching the prototype fixes it too.
    class RNStubURL {
      private _sp: RNStubURLSearchParams | null = null;
      get searchParams(): RNStubURLSearchParams {
        if (!this._sp) this._sp = new RNStubURLSearchParams();
        return this._sp;
      }
    }

    globalThis.URLSearchParams = RNStubURLSearchParams as any;
    globalThis.URL = RNStubURL as any;
    jest.doMock('react-native-url-polyfill', () => {
      throw new Error('polyfill load failed');
    });
    jest.doMock('react-native/Libraries/Blob/URLSearchParams', () => {
      throw new Error('stub module unavailable');
    });

    const { installURLSearchParamsPolyfill } = require('../../lib/polyfills/url-search-params');
    expect(installURLSearchParamsPolyfill()).toBe(true);

    // Both expo-router code paths must now be crash-free on the SAME stub classes.
    const direct: any = new (globalThis.URLSearchParams as any)();
    direct.append('#', 'frag');
    direct.append('provider', 'google');
    expect(() => direct.has('#')).not.toThrow();
    expect(direct.has('provider')).toBe(true);
    expect(direct.get('provider')).toBe('google');

    const fromUrl: any = new (globalThis.URL as any)('https://x/?a=1').searchParams;
    fromUrl.append('code', 'abc');
    expect(() => fromUrl.has('code')).not.toThrow();
    expect(fromUrl.getAll('code')).toEqual(['abc']);
  });

  it('does not replace an already-working global (web / native browser URLSearchParams)', () => {
    // On web the global is the browser's spec-compliant URLSearchParams; the
    // orchestrator must leave it (and URL) untouched rather than swapping in the
    // RN polyfill. Guard against accidentally requiring/installing the polyfill.
    const workingGlobal = originalURLSearchParams;
    globalThis.URLSearchParams = workingGlobal;
    jest.doMock('react-native-url-polyfill', () => {
      throw new Error('should not be required when the global already works');
    });

    const { installURLSearchParamsPolyfill } = require('../../lib/polyfills/url-search-params');
    // Nothing needed patching, so the orchestrator reports no work done.
    expect(installURLSearchParamsPolyfill()).toBe(false);
    // The global is still the exact same working implementation.
    expect(globalThis.URLSearchParams).toBe(workingGlobal);
    expect(new URLSearchParams('a=1&a=2').getAll('a')).toEqual(['1', '2']);
  });
});
