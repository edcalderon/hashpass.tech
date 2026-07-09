/* eslint-disable @typescript-eslint/no-require-imports */

export const installURLSearchParamsHasPolyfill = (): boolean => {
  const URLSearchParamsCtor = globalThis.URLSearchParams;
  const prototype = URLSearchParamsCtor?.prototype;

  if (typeof URLSearchParamsCtor !== 'function' || !prototype) {
    return false;
  }

  let needsPatch = typeof prototype.has !== 'function';
  if (!needsPatch) {
    try {
      const probe = new URLSearchParamsCtor('hashpass=1');
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
        const values = this.getAll(expectedName);
        return expectsValue ? values.some((item: string) => String(item) === expectedValue) : values.length > 0;
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

  return installURLSearchParamsHasPolyfill();
};
