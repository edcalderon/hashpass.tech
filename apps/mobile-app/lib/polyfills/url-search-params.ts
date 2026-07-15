/* eslint-disable @typescript-eslint/no-require-imports */

// Background
// ==========
// React Native ships a deliberately-incomplete URL/URLSearchParams
// (Libraries/Blob/URL.js + Libraries/Blob/URLSearchParams.js):
//   * URLSearchParams.has/get/getAll/delete/set/sort all throw
//     "URLSearchParams.<method> is not implemented".
//   * URL.searchParams returns a fresh, EMPTY URLSearchParams that never parses
//     the URL's query string, and URL.search itself throws.
// These are installed on the globals via RN's polyfillGlobal (a re-armable lazy
// getter/setter). expo-router computes route info on every navigation and calls
// has/get/getAll/delete/keys on `new URLSearchParams(...)` AND on
// `new URL(path).searchParams`, so if either global is RN's stub the app either
// crashes ("... is not implemented") or silently loses query/callback params —
// which is exactly what breaks the native Google OAuth return (blank/crash after
// the account picker, no dashboard).
//
// react-native-url-polyfill re-exports the fully-spec-compliant
// whatwg-url-without-unicode URL + URLSearchParams. Its `/auto` entry assigns
// them to the globals, but behind a `Platform.OS !== 'web'` check and with the
// two assignments in sequence, so a throw in the first leaves the second on RN's
// stub. We therefore assign both globals ourselves, validate them, AND patch RN's
// raw stub class directly as a backstop — belt and suspenders, run before
// expo-router loads (see apps/mobile-app/index.js).

type AnyURLSearchParamsCtor = (new (init?: unknown) => any) & { prototype?: any };

const REQUIRED_METHODS = ['has', 'get', 'getAll', 'delete', 'keys'] as const;

// Probe a candidate constructor to confirm every method expo-router relies on
// actually works (not merely "is a function" — RN's stub declares them all but
// throws when called).
const isFullyWorkingURLSearchParams = (Ctor: unknown): boolean => {
  if (typeof Ctor !== 'function') {
    return false;
  }
  const prototype = (Ctor as AnyURLSearchParamsCtor).prototype;
  if (!prototype || REQUIRED_METHODS.some((m) => typeof prototype[m] !== 'function')) {
    return false;
  }

  try {
    const probe: any = new (Ctor as AnyURLSearchParamsCtor)();
    if (typeof probe.append !== 'function') {
      return false;
    }
    probe.append('a', '1');
    probe.append('a', '2');
    probe.append('b', '3');

    if (probe.has('a') !== true || probe.has('missing') !== false) return false;
    if (probe.get('a') !== '1') return false;
    const all = probe.getAll('a');
    if (!Array.isArray(all) || all.length !== 2 || all[0] !== '1' || all[1] !== '2') return false;
    if ([...probe.keys()].length !== 3) return false;

    probe.delete('a');
    if (probe.has('a') !== false) return false;

    return true;
  } catch {
    return false;
  }
};

// Full, spec-shaped patch for RN's stub class (and any lookalike that stores
// entries in the same private `_searchParams: [name, value][]` field, populated
// by the one method it does implement: `append`). Patches every method
// expo-router needs so it can never throw "not implemented" or return stale data.
const applyFullStubPolyfill = (Ctor: unknown): boolean => {
  if (typeof Ctor !== 'function') {
    return false;
  }
  const prototype = (Ctor as AnyURLSearchParamsCtor).prototype;
  if (!prototype) {
    return false;
  }

  if (isFullyWorkingURLSearchParams(Ctor)) {
    return false;
  }

  // Only safe to drive from `_searchParams` if this stub actually stores its
  // entries there (RN's Blob/URLSearchParams does, populated by `append`). For
  // any other broken shape, bail so the narrower `.has` fallback can handle it.
  let usesSearchParamsField = false;
  try {
    const probe: any = new (Ctor as AnyURLSearchParamsCtor)();
    usesSearchParamsField = instanceUsesSearchParamsField(probe);
  } catch {
    usesSearchParamsField = false;
  }
  if (!usesSearchParamsField) {
    return false;
  }

  return defineSearchParamsMethodsOnPrototype(prototype);
};

// Does this instance store entries in the RN-shaped private `_searchParams`
// field, populated by `append`? (RN's Blob/URLSearchParams does.)
const instanceUsesSearchParamsField = (probe: any): boolean => {
  if (!probe || typeof probe.append !== 'function') {
    return false;
  }
  try {
    probe.append('__hashpass_probe__', 'x');
    return (
      Array.isArray(probe._searchParams) &&
      probe._searchParams.some(
        ([n, v]: [string, string]) => n === '__hashpass_probe__' && v === 'x'
      )
    );
  } catch {
    return false;
  }
};

// Define spec-shaped methods on a `_searchParams`-backed prototype.
const defineSearchParamsMethodsOnPrototype = (prototype: any): boolean => {
  const getEntries = (instance: any): [string, string][] =>
    Array.isArray(instance._searchParams) ? instance._searchParams : [];

  const define = (name: string, value: (this: any, ...args: any[]) => unknown) => {
    Object.defineProperty(prototype, name, { configurable: true, writable: true, value });
  };

  define('has', function has(this: any, name: string, value?: string) {
    const expectsValue = arguments.length > 1;
    return getEntries(this).some(
      ([n, v]) => n === String(name) && (!expectsValue || v === String(value))
    );
  });

  define('get', function get(this: any, name: string) {
    const match = getEntries(this).find(([n]) => n === String(name));
    return match ? match[1] : null;
  });

  define('getAll', function getAll(this: any, name: string) {
    return getEntries(this)
      .filter(([n]) => n === String(name))
      .map(([, v]) => v);
  });

  define('delete', function del(this: any, name: string) {
    this._searchParams = getEntries(this).filter(([n]) => n !== String(name));
  });

  define('set', function set(this: any, name: string, value: string) {
    const rest = getEntries(this).filter(([n]) => n !== String(name));
    rest.push([String(name), String(value)]);
    this._searchParams = rest;
  });

  define('sort', function sort(this: any) {
    this._searchParams = getEntries(this)
      .slice()
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  });

  define('forEach', function forEach(
    this: any,
    callback: (value: string, name: string) => void
  ) {
    getEntries(this).forEach(([n, v]) => callback(v, n));
  });

  define('keys', function keys(this: any) {
    return getEntries(this)
      .map(([n]) => n)
      [Symbol.iterator]();
  });

  define('values', function values(this: any) {
    return getEntries(this)
      .map(([, v]) => v)
      [Symbol.iterator]();
  });

  define('entries', function entries(this: any) {
    return getEntries(this)
      .map(([n, v]) => [n, v] as [string, string])
      [Symbol.iterator]();
  });

  return true;
};

// Patch React Native's raw stub class directly. RN always hands this exact
// singleton class back — as `globalThis.URLSearchParams` after a lazy-getter
// re-arm, and as the instance returned by `new URL(...).searchParams` when URL is
// still RN's stub — so fixing the class once makes every such instance safe.
export const patchReactNativeURLSearchParamsStub = (): boolean => {
  try {
    const { URLSearchParams: RNStub } = require('react-native/Libraries/Blob/URLSearchParams');
    return applyFullStubPolyfill(RNStub);
  } catch {
    // Stub module not present on this RN version/layout — nothing to harden.
    return false;
  }
};

// Force the fully-working whatwg URL + URLSearchParams onto the globals, so BOTH
// expo-router paths (bare `new URLSearchParams()` and `new URL(path).searchParams`)
// use spec-compliant code that parses query strings correctly. Returns true only
// if a validated working URLSearchParams was installed.
const installWorkingGlobalsFromPolyfill = (): boolean => {
  try {
    // If the current global URLSearchParams already works, leave it (and URL)
    // alone. This is the web case — the browser's native implementation is
    // spec-compliant and must not be swapped for the RN polyfill — and also any
    // native runtime where a working impl is already installed.
    if (isFullyWorkingURLSearchParams((globalThis as any).URLSearchParams)) {
      return false;
    }

    const poly = require('react-native-url-polyfill');
    const PolyURLSearchParams = poly?.URLSearchParams;
    if (!isFullyWorkingURLSearchParams(PolyURLSearchParams)) {
      return false;
    }

    (globalThis as any).URLSearchParams = PolyURLSearchParams;
    if (typeof poly?.URL === 'function') {
      (globalThis as any).URL = poly.URL;
    }
    return true;
  } catch {
    return false;
  }
};

// Legacy narrow patch retained for the unit tests and as a last-ditch fallback:
// patches only `.has`, tolerating stubs that declare (but throw from) getAll.
export const installURLSearchParamsHasPolyfill = (): boolean => {
  const URLSearchParamsCtor = (globalThis as any).URLSearchParams;
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

// Harden the prototype of an actual URLSearchParams *instance*. This is the most
// reliable way to reach React Native's raw Blob stub class: v1.8.198 tried to
// reach it via `require('react-native/Libraries/Blob/URLSearchParams')`, but that
// require does not reliably resolve to the exact class RN instantiates in the
// Hermes release bundle, so the patch never landed and the crash survived. An
// instance built from the live globals (`new URLSearchParams()` /
// `new URL(...).searchParams`) always exposes the exact prototype in use, and
// because that prototype is a shared singleton, patching it once fixes every
// instance — even if the global is later reset back to the stub.
const hardenURLSearchParamsInstance = (makeInstance: () => any): boolean => {
  try {
    const instance = makeInstance();
    if (!instance) {
      return false;
    }
    const prototype = Object.getPrototypeOf(instance);
    if (!prototype || isFullyWorkingURLSearchParams(prototype.constructor)) {
      return false;
    }
    if (!instanceUsesSearchParamsField(prototype.constructor ? new prototype.constructor() : instance)) {
      return false;
    }
    return defineSearchParamsMethodsOnPrototype(prototype);
  } catch {
    return false;
  }
};

// Lock a global property to a validated implementation. v1.8.199 proved on-device
// (adb, versionCode 254) that even with the boot global fully working AND RN's
// stub class patched via require, SOMETHING during the native Google sign-in flow
// re-binds `global.URLSearchParams` back to a throwing stub before the post-login
// navigation runs — the crash fired ~70s after boot diagnostics passed, in the
// same PID, with no JS-context restart. Rather than chase every possible
// re-binder, make re-binding harmless: freeze the property as a non-configurable
// accessor whose setter only accepts fully-working implementations (and patches
// broken `_searchParams`-shaped ones so instances made from them stay safe).
// RN's own polyfillGlobal/polyfillObjectProperty checks `configurable` first and
// bails with a console.error instead of throwing, so RN/Expo re-install attempts
// degrade gracefully; plain `=` assignments hit the setter, so strict-mode
// callers don't throw either.
const isReactNativeRuntime = (): boolean =>
  typeof navigator !== 'undefined' && (navigator as any)?.product === 'ReactNative';

// The lock below (`configurable: false`) is only safe under the New Architecture
// (Fabric/Bridgeless), where it was designed and observed to fix the v1.8.199
// mid-session re-bind. Under the OLD bridge (newArchEnabled: false,
// "Bridgeless Mode: false" in logs), React Native's own later polyfill-install
// pass hits this same non-configurable property, and — unlike the Bridgeless
// path — that failure propagates as an uncaught exception during synchronous
// bundle evaluation, before AppRegistry.registerComponent() ever runs. Native
// then calls AppRegistry.runApplication() into a JS context with zero
// registered callable modules, which is a permanent stuck-on-splash crash for
// every user (found 2026-07-14 after v1.8.222 shipped newArchEnabled: false).
// Detecting old-bridge mode and skipping only the lock — while keeping the
// non-configurable-free hardening in steps 1-3 above, which is the actual
// crash fix and doesn't depend on architecture — avoids trading one crash for
// a strictly worse one.
const isNewArchitectureEnabled = (): boolean =>
  typeof (globalThis as any).nativeFabricUIManager !== 'undefined' ||
  (globalThis as any).RN$Bridgeless === true;

const lockGlobalProperty = (
  name: 'URL' | 'URLSearchParams',
  isAcceptable: (candidate: unknown) => boolean,
  onRejected?: (candidate: unknown) => void
): boolean => {
  try {
    const g: any = globalThis as any;
    let current = g[name];
    if (!isAcceptable(current)) {
      return false;
    }

    Object.defineProperty(g, name, {
      configurable: false,
      enumerable: true,
      get: () => current,
      set: (next: unknown) => {
        try {
          if (isAcceptable(next)) {
            current = next;
            return;
          }
          // Keep serving the working implementation; log who tried, so field
          // logcat identifies the re-binder instead of the crash hiding it.
          console.warn(`[HashPass][urlsp] blocked broken global ${name} assignment`, {
            stack: new Error().stack?.split('\n').slice(1, 6).join(' | '),
          });
          onRejected?.(next);
        } catch {
          // A setter must never throw — it would crash the assigning module.
        }
      },
    });
    return true;
  } catch (lockError: any) {
    console.warn(`[HashPass][urlsp] could not lock global ${name}`, {
      message: lockError?.message || String(lockError),
    });
    return false;
  }
};

const isAcceptableURL = (candidate: unknown): boolean => {
  if (typeof candidate !== 'function') {
    return false;
  }
  try {
    const probe: any = new (candidate as new (url: string) => any)('https://hashpass.invalid/?a=1');
    return probe?.searchParams?.get?.('a') === '1';
  } catch {
    return false;
  }
};

export const installURLSearchParamsPolyfill = (): boolean => {
  // 1. FIRST, permanently fix React Native's raw Blob stub prototype using live
  //    instances (before any global override), so that even if `global.URL` /
  //    `global.URLSearchParams` are — or later become — RN's stub, none of the
  //    methods expo-router calls (has/get/getAll/delete/keys) can throw. This is
  //    the crash fix; it must not depend on module resolution.
  let hardenedStubPrototype = false;
  hardenedStubPrototype = hardenURLSearchParamsInstance(
    () => new (globalThis as any).URLSearchParams()
  ) || hardenedStubPrototype;
  hardenedStubPrototype = hardenURLSearchParamsInstance(
    () => new (globalThis as any).URL('https://hashpass.invalid/?a=1').searchParams
  ) || hardenedStubPrototype;
  // Belt: also try the module path (harmless if it fails to resolve).
  const patchedStubViaRequire = patchReactNativeURLSearchParamsStub();

  // 2. Install the validated whatwg globals so both expo-router code paths use
  //    spec-compliant URL/URLSearchParams that actually parse query strings
  //    (RN's URL.searchParams never parses the query, dropping OAuth params).
  const installedWorkingGlobals = installWorkingGlobalsFromPolyfill();

  // 3. Last resort: if the global is somehow still a broken _searchParams stub,
  //    fully patch it in place; otherwise ensure at least `.has` is safe.
  const patchedGlobalFull = applyFullStubPolyfill((globalThis as any).URLSearchParams);
  const patchedGlobalHas = patchedGlobalFull ? false : installURLSearchParamsHasPolyfill();

  // 4. LOCK the globals (native runtimes only — never touch browser globals, and
  //    Jest keeps swapping test doubles freely). After this, no later code can
  //    swap in a broken implementation: setter-validated, non-configurable.
  //    This is what actually stops the v1.8.199 post-account-picker crash, where
  //    a mid-session re-bind restored RN's throwing stub between the boot patch
  //    and the post-login navigation.
  let lockedURLSearchParams = false;
  let lockedURL = false;
  if (isReactNativeRuntime() && isNewArchitectureEnabled()) {
    lockedURLSearchParams = lockGlobalProperty(
      'URLSearchParams',
      isFullyWorkingURLSearchParams,
      (rejected) => {
        // Patch the rejected stub class too: other code may hold a direct
        // reference to it (e.g. RN's URL.searchParams) and construct instances.
        applyFullStubPolyfill(rejected);
      }
    );
    lockedURL = lockGlobalProperty('URL', isAcceptableURL, (rejected) => {
      try {
        const sp = new (rejected as new (url: string) => any)('https://hashpass.invalid/?a=1')
          ?.searchParams;
        if (sp) {
          applyFullStubPolyfill(Object.getPrototypeOf(sp)?.constructor);
        }
      } catch {
        // Nothing else to harden on this candidate.
      }
    });
  }

  const anyChange =
    hardenedStubPrototype ||
    patchedStubViaRequire ||
    installedWorkingGlobals ||
    patchedGlobalFull ||
    patchedGlobalHas ||
    lockedURLSearchParams ||
    lockedURL;

  // Diagnostics: verify the end state actually works, so the release build can be
  // confirmed from logcat instead of assumed. Never throws.
  //
  // Use `.append()` rather than the string constructor: RN's stub constructor
  // ignores string/array query input, so the string form would read empty even
  // when the (crash-preventing) method patch succeeded. `.append()` reflects the
  // thing that actually matters — that has/get/getAll no longer throw. Query-string
  // parsing is a separate correctness signal (only the whatwg global provides it).
  try {
    const g: any = globalThis as any;
    const probe = new g.URLSearchParams();
    probe.append('provider', 'google');
    probe.append('provider', 'github');
    const methodsDoNotThrow =
      probe.has('provider') === true &&
      probe.has('missing') === false &&
      probe.get('provider') === 'google';

    let urlParsesQuery = false;
    try {
      urlParsesQuery =
        new g.URL('https://hashpass.invalid/auth/callback?code=abc').searchParams.get('code') ===
        'abc';
    } catch {
      urlParsesQuery = false;
    }

    console.log('[HashPass][urlsp] install complete', {
      hardenedStubPrototype,
      patchedStubViaRequire,
      installedWorkingGlobals,
      patchedGlobalFull,
      patchedGlobalHas,
      lockedURLSearchParams,
      lockedURL,
      methodsDoNotThrow,
      urlParsesQuery,
    });
  } catch (diagError: any) {
    console.warn('[HashPass][urlsp] post-install verification threw', {
      message: diagError?.message || String(diagError),
    });
  }

  return anyChange;
};
