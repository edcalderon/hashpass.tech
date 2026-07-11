/* eslint-disable @typescript-eslint/no-require-imports */

// React Native's own global gets bound via a lazy getter/setter
// (Libraries/Utilities/PolyfillFunctions -> defineLazyObjectProperty). Anything that
// re-touches global.URLSearchParams after boot (Fast Refresh, a lazily-loaded module
// re-running polyfillGlobal, etc.) can re-arm that lazy binding and hand back RN's raw
// Libraries/Blob/URLSearchParams stub, whose has/get/getAll/delete/set/sort all throw
// "X is not implemented". expo-router calls has/get/getAll on every route computation,
// so patching only "whatever is currently global" at boot isn't enough — the raw stub
// class itself must be fixed, since RN always hands back that exact singleton instance.
export const patchReactNativeURLSearchParamsStub = (): boolean => {
  try {
    const { URLSearchParams: RNStub } = require('react-native/Libraries/Blob/URLSearchParams');
    return applyRNStubFullPolyfill(RNStub);
  } catch {
    // Stub module not present on this RN version/layout — nothing to harden.
    return false;
  }
};

// RN's stub keeps entries in a private `_searchParams: Array<[string, string]>` field,
// populated correctly by the one method it does implement (`append`). Everything else
// (has/get/getAll/delete/set) just throws "X is not implemented". expo-router calls all
// of these while computing route info, so all of them need a real implementation — not
// just `.has` — or the app crashes on whichever one it happens to call first.
const applyRNStubFullPolyfill = (RNStub: any): boolean => {
  const prototype = RNStub?.prototype;
  if (!prototype) {
    return false;
  }

  try {
    const probe = new RNStub('hashpass=1');
    if (probe.has('hashpass') === true && probe.has('missing') === false) {
      return false;
    }
  } catch {
    // Expected: the raw stub throws on `.has`. Fall through and patch it.
  }

  const getEntries = (instance: any): [string, string][] =>
    Array.isArray(instance._searchParams) ? instance._searchParams : [];

  Object.defineProperty(prototype, 'has', {
    configurable: true,
    writable: true,
    value: function has(this: any, name: string, value?: string) {
      const expectsValue = arguments.length > 1;
      return getEntries(this).some(
        ([n, v]) => n === String(name) && (!expectsValue || v === String(value))
      );
    },
  });

  Object.defineProperty(prototype, 'get', {
    configurable: true,
    writable: true,
    value: function get(this: any, name: string) {
      const match = getEntries(this).find(([n]) => n === String(name));
      return match ? match[1] : null;
    },
  });

  Object.defineProperty(prototype, 'getAll', {
    configurable: true,
    writable: true,
    value: function getAll(this: any, name: string) {
      return getEntries(this)
        .filter(([n]) => n === String(name))
        .map(([, v]) => v);
    },
  });

  Object.defineProperty(prototype, 'delete', {
    configurable: true,
    writable: true,
    value: function del(this: any, name: string) {
      this._searchParams = getEntries(this).filter(([n]) => n !== String(name));
    },
  });

  Object.defineProperty(prototype, 'set', {
    configurable: true,
    writable: true,
    value: function set(this: any, name: string, value: string) {
      const rest = getEntries(this).filter(([n]) => n !== String(name));
      rest.push([String(name), String(value)]);
      this._searchParams = rest;
    },
  });

  Object.defineProperty(prototype, 'forEach', {
    configurable: true,
    writable: true,
    value: function forEach(this: any, callback: (value: string, name: string) => void) {
      getEntries(this).forEach(([n, v]) => callback(v, n));
    },
  });

  Object.defineProperty(prototype, 'keys', {
    configurable: true,
    writable: true,
    value: function keys(this: any) {
      return getEntries(this)
        .map(([n]) => n)
        [Symbol.iterator]();
    },
  });

  Object.defineProperty(prototype, 'entries', {
    configurable: true,
    writable: true,
    value: function entries(this: any) {
      return getEntries(this)[Symbol.iterator]();
    },
  });

  return true;
};

export const installURLSearchParamsHasPolyfill = (): boolean => {
  const URLSearchParamsCtor = globalThis.URLSearchParams;
  return applyURLSearchParamsHasPolyfill(URLSearchParamsCtor);
};

const applyURLSearchParamsHasPolyfill = (URLSearchParamsCtor: unknown): boolean => {
  const prototype = (URLSearchParamsCtor as { prototype?: any })?.prototype;

  if (typeof URLSearchParamsCtor !== 'function' || !prototype) {
    return false;
  }

  const Ctor = URLSearchParamsCtor as new (init?: string) => URLSearchParams;

  let needsPatch = typeof prototype.has !== 'function';
  if (!needsPatch) {
    try {
      const probe = new Ctor('hashpass=1');
      needsPatch = probe.has('hashpass') !== true || probe.has('missing') !== false;
    } catch {
      needsPatch = true;
    }
  }

  if (!needsPatch) {
    return false;
  }

  Object.defineProperty(prototype, 'has', {
    configurable: true,
    writable: true,
    value: function has(this: URLSearchParams, name: string, value?: string) {
      const expectedName = String(name);
      const expectsValue = arguments.length > 1;
      const expectedValue = expectsValue ? String(value) : undefined;

      if (typeof this.getAll === 'function') {
        try {
          const values = this.getAll(expectedName);
          return expectsValue ? values.some((item: string) => String(item) === expectedValue) : values.length > 0;
        } catch {
          // Some stubs (React Native's own Blob/URLSearchParams) declare getAll but
          // throw "not implemented" when called — fall through to the next strategy.
        }
      }

      if (typeof this.forEach === 'function') {
        let found = false;
        this.forEach((currentValue: string, currentName: string) => {
          if (found || String(currentName) !== expectedName) return;
          found = !expectsValue || String(currentValue) === expectedValue;
        });
        return found;
      }

      const query = typeof this.toString === 'function' ? this.toString() : '';
      return query.split('&').some((part) => {
        if (!part) return false;

        const [rawName, rawValue = ''] = part.split('=');
        const decodedName = decodeURIComponent(rawName.replace(/\+/g, ' '));
        if (decodedName !== expectedName) return false;
        if (!expectsValue) return true;

        const decodedValue = decodeURIComponent(rawValue.replace(/\+/g, ' '));
        return decodedValue === expectedValue;
      });
    },
  });

  return true;
};

export const installURLSearchParamsPolyfill = (): boolean => {
  try {
    require('react-native-url-polyfill/auto');
  } catch {
    // Keep the targeted fallback below. Some Jest and SSR contexts do not need
    // the full React Native URL polyfill package.
  }

  // Harden RN's raw stub class directly, in addition to whatever ends up bound to
  // globalThis.URLSearchParams right now — see patchReactNativeURLSearchParamsStub
  // for why the global alone isn't a reliable enough target.
  const patchedStub = patchReactNativeURLSearchParamsStub();
  const patchedGlobal = installURLSearchParamsHasPolyfill();
  return patchedStub || patchedGlobal;
};
