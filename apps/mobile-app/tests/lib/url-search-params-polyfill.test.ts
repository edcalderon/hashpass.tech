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
});
