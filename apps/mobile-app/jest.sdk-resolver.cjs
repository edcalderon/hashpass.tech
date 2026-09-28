// Jest, like Metro (see metro.config.js), can't resolve @hashpass-tech/sdk out of
// the box: it's the one workspace package with a real published dist/
// build ("type": "module", built via tsc) rather than pointing main/exports
// straight at raw .ts source like every sibling @hashpass/* package. Worse
// for CI specifically: that dist/ output isn't committed and nothing builds
// it before this test job runs, so even an exports-map fix would resolve to
// a file that doesn't exist on a fresh checkout. Redirect straight to
// source instead -- same fix Metro uses, for the same reason.
const path = require('path');
const fs = require('fs');

const SDK_SRC = path.resolve(__dirname, '../../packages/sdk/src');
const SDK_ENTRY_POINTS = {
  '@hashpass-tech/sdk': 'index.ts',
  '@hashpass-tech/sdk/auth': 'auth/index.ts',
  '@hashpass-tech/sdk/auth-qr': 'auth-qr/index.ts',
  '@hashpass-tech/sdk/support': 'support/index.ts',
};
const BETTER_AUTH_CLIENT_MOCK = path.resolve(__dirname, 'tests/mocks/better-auth-client.cjs');
const BETTER_AUTH_OAUTH_CLIENT_MOCK = path.resolve(__dirname, 'tests/mocks/better-auth-oauth-client.cjs');

module.exports = (request, options) => {
  // Better Auth 1.7 publishes the client as ESM-only. Unit tests replace this
  // module with per-test factories; resolving through a tiny CJS seam lets
  // Jest register those mocks without parsing the production ESM graph first.
  if (request === 'better-auth/client') return BETTER_AUTH_CLIENT_MOCK;
  if (request === '@better-auth/oauth-provider/client') return BETTER_AUTH_OAUTH_CLIENT_MOCK;

  const entryFile = SDK_ENTRY_POINTS[request];
  if (entryFile) {
    return path.resolve(SDK_SRC, entryFile);
  }

  // packages/sdk's source uses "module": "NodeNext", which requires
  // .js-suffixed relative imports even between .ts files (e.g. client.ts
  // imports "./errors.js"). TypeScript maps that back to the compiled .js
  // at build time; resolving the raw .ts source directly has no such
  // mapping. Only applies to relative imports originating from inside
  // packages/sdk/src, so it can't affect resolution anywhere else.
  if (
    request.endsWith('.js') &&
    (request.startsWith('./') || request.startsWith('../')) &&
    options.basedir &&
    (options.basedir === SDK_SRC || options.basedir.startsWith(SDK_SRC + path.sep))
  ) {
    const withoutExt = request.slice(0, -'.js'.length);
    for (const ext of ['.ts', '.tsx']) {
      const candidate = path.resolve(options.basedir, `${withoutExt}${ext}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return options.defaultResolver(request, options);
};
