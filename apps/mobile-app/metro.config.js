const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Auto-propagate environment from root .env in local dev only.
// In CI the root .env is absent and propagate-env writes the app-specific env files
// used by the local web/mobile/directus runtime, so skip it there entirely.
if (!process.env.CI) {
  try {
    const profile = process.env.NODE_ENV === 'production' ? 'production' : 'local';
    console.log(`📡 [Metro] Auto-propagating environment: ${profile}`);
    execSync(`node ${path.resolve(__dirname, '../../packages/tools/scripts/propagate-env.js')} ${profile}`, { stdio: 'inherit' });
  } catch (error) {
    console.error('⚠️ [Metro] Environment propagation failed:', error.message);
  }
}

// getSentryExpoConfig wraps expo/metro-config's getDefaultConfig and adds the
// Babel transform + serializer hooks Sentry needs to symbolicate stack traces
// (source-map upload happens at native build time; this just makes Metro emit
// the annotations that upload step needs).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withNativeWind } = require('nativewind/metro');
const { wrapWithReanimatedMetroConfig } = require('react-native-reanimated/metro-config');
const { FileStore } = require('metro-cache');
const { resolve } = require('metro-resolver');
const { createRequire } = require('module');
const { resolveDreiCommonJs } = require('./lib/metro/drei-resolver');
const { resolveZustandCommonJs } = require('./lib/metro/zustand-resolver');

const workspaceRoot = path.resolve(__dirname, '../..');
const workspaceRequire = createRequire(path.join(workspaceRoot, 'package.json'));
const dreiPackageDir = path.dirname(workspaceRequire.resolve('@react-three/drei/package.json'));
const config = getSentryExpoConfig(__dirname);

const runtimeWorkspacePackages = [
  'auth',
  'backend',
  'config',
  'emails',
  'i18n',
  'sdk',
  'types',
  'ui',
  'utils',
];

const runtimeWorkspacePackageFolders = runtimeWorkspacePackages.map((packageName) =>
  path.resolve(workspaceRoot, 'packages', packageName)
);

// Persist Metro's per-file transform cache to a stable directory.
// On the EC2 runner METRO_CACHE_DIR=/home/runner/.metro-cache (set in the workflow),
// so the cache survives between builds on the same EBS volume.
// Locally falls back to the OS temp dir (Metro's default behaviour).
if (process.env.METRO_CACHE_DIR) {
  config.cacheStores = [new FileStore({ root: process.env.METRO_CACHE_DIR })];
}
const originalResolveRequest = config.resolver?.resolveRequest;
let zustandPackageDir;

const getZustandPackageDir = () => {
  if (zustandPackageDir !== undefined) {
    return zustandPackageDir;
  }

  try {
    zustandPackageDir = path.dirname(workspaceRequire.resolve('zustand/package.json'));
  } catch {
    zustandPackageDir = null;
  }

  return zustandPackageDir;
};

const resolveWorkspaceNodeModulesPath = (moduleName) => {
  const normalizedModuleName = moduleName
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');

  if (!normalizedModuleName.startsWith('node_modules/')) {
    return null;
  }

  const requestedPath = path.join(workspaceRoot, normalizedModuleName);
  const candidates = [
    requestedPath,
    `${requestedPath}.js`,
    `${requestedPath}.mjs`,
    `${requestedPath}.cjs`,
    `${requestedPath}.json`,
    `${requestedPath}.ts`,
    `${requestedPath}.tsx`,
  ];

  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
};

const singletonModulePrefixes = [
  'react',
  'react-dom',
  'react-native-web',
  'scheduler',
];

const resolveSingletonModule = (moduleName) => {
  const shouldResolveFromApp = singletonModulePrefixes.some(
    (prefix) => moduleName === prefix || moduleName.startsWith(`${prefix}/`)
  );

  if (!shouldResolveFromApp) {
    return null;
  }

  try {
    return workspaceRequire.resolve(moduleName);
  } catch {
    return null;
  }
};

config.watchFolders = [
  ...runtimeWorkspacePackageFolders,
  path.resolve(workspaceRoot, 'node_modules'),
];

// @hashpass-tech/sdk is the one workspace package meant for real external npm
// publishing (publishConfig.access=public), so unlike every other
// @hashpass/* package -- which points main/exports straight at raw .ts
// source and is never actually published -- it has a real tsc build with
// "type": "module" ESM output under dist/. That's exactly what the
// blockList below excludes (packages/*/dist/* is blocked repo-wide to keep
// Metro's Haste graph small), so resolving it through package.json alone
// would fail here even after adding 'sdk' to runtimeWorkspacePackages.
// Redirect straight to source instead, matching how every sibling
// @hashpass/* package is already consumed at runtime.
const sdkSourceDir = path.resolve(workspaceRoot, 'packages/sdk/src');
const sdkSubpathEntryFiles = {
  '@hashpass-tech/sdk': 'index.ts',
  '@hashpass-tech/sdk/auth': 'auth/index.ts',
  '@hashpass-tech/sdk/auth-qr': 'auth-qr/index.ts',
  '@hashpass-tech/sdk/support': 'support/index.ts',
};

const metroResolveRequest = (context, moduleName, platform) => {
  const sdkEntryFile = sdkSubpathEntryFiles[moduleName];
  if (sdkEntryFile) {
    return { type: 'sourceFile', filePath: path.resolve(sdkSourceDir, sdkEntryFile) };
  }

  // packages/sdk's source uses "module": "NodeNext", which requires
  // .js-suffixed relative imports even between .ts files (e.g. client.ts
  // imports "./errors.js") -- TypeScript maps that back to the compiled
  // .js at build time, but Metro has no such mapping when resolving the
  // raw .ts source directly (the redirect above). Only applies to relative
  // imports originating from inside packages/sdk/src, so it can't affect
  // resolution anywhere else in the app.
  if (
    moduleName.endsWith('.js') &&
    (moduleName.startsWith('./') || moduleName.startsWith('../')) &&
    context.originModulePath?.startsWith(sdkSourceDir + path.sep)
  ) {
    const withoutExt = moduleName.slice(0, -3);
    for (const ext of ['.ts', '.tsx']) {
      const candidate = path.resolve(path.dirname(context.originModulePath), `${withoutExt}${ext}`);
      if (fs.existsSync(candidate)) {
        return { type: 'sourceFile', filePath: candidate };
      }
    }
  }

  const workspaceNodeModulePath = resolveWorkspaceNodeModulesPath(moduleName);
  if (workspaceNodeModulePath) {
    return { type: 'sourceFile', filePath: workspaceNodeModulePath };
  }

  const singletonModule = resolveSingletonModule(moduleName);
  if (singletonModule) {
    return { type: 'sourceFile', filePath: singletonModule };
  }

  if (
    moduleName === '@lingui/macro' ||
    moduleName.startsWith('@lingui/macro/') ||
    moduleName === '@lingui/babel-plugin-lingui-macro' ||
    moduleName.startsWith('@lingui/babel-plugin-lingui-macro/') ||
    moduleName.includes('/@lingui+babel-plugin-lingui-macro@')
  ) {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'lib/lingui-macro-shim.ts'),
    };
  }

  if (platform === 'android' && moduleName === 'expo-blur') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'lib/expo-blur-shim.tsx'),
    };
  }

  if (platform === 'web') {
    const dreiCommonJs = resolveDreiCommonJs(moduleName, dreiPackageDir);
    if (dreiCommonJs) {
      return { type: 'sourceFile', filePath: dreiCommonJs };
    }
  }

  if (
    moduleName === 'jiti' ||
    moduleName === 'jiti/lib/jiti.mjs' ||
    moduleName === 'jiti/lib/jiti.cjs' ||
    moduleName.endsWith('/jiti/lib/jiti.mjs') ||
    moduleName.endsWith('/jiti/lib/jiti.cjs')
  ) {
    return { type: 'empty' };
  }

  if (
    moduleName === 'pg-native' ||
    moduleName.endsWith('/pg-native')
  ) {
    return { type: 'empty' };
  }

  if (
    moduleName === 'cosmiconfig' ||
    moduleName.startsWith('cosmiconfig/') ||
    moduleName.endsWith('/cosmiconfig/dist/loaders.js') ||
    moduleName.endsWith('/cosmiconfig/dist/index.js')
  ) {
    return { type: 'empty' };
  }

  const zustandCommonJs = resolveZustandCommonJs(
    moduleName,
    getZustandPackageDir(),
    context.originModulePath,
  );
  if (zustandCommonJs) {
    return { type: 'sourceFile', filePath: zustandCommonJs };
  }

  const normalizedModuleName =
    moduleName;

  if (typeof context.resolveRequest === 'function' && context.resolveRequest !== metroResolveRequest) {
    return context.resolveRequest(context, normalizedModuleName, platform);
  }

  if (typeof originalResolveRequest === 'function' && originalResolveRequest !== metroResolveRequest) {
    return originalResolveRequest(context, normalizedModuleName, platform);
  }

  return resolve(context, normalizedModuleName, platform);
};

// Exclude paths that Metro should never bundle or watch.
// This reduces the in-memory Haste file graph and cuts peak heap usage.
const blockListPatterns = [
  // Local app outputs and test-only files are not part of the runtime graph.
  /.*\/apps\/mobile-app\/\.expo\/.*/,
  /.*\/apps\/mobile-app\/\.metro\/.*/,
  /.*\/apps\/mobile-app\/coverage\/.*/,
  /.*\/apps\/mobile-app\/dist\/.*/,
  /.*\/apps\/mobile-app\/tests\/.*/,
  /.*\/apps\/mobile-app\/assets\/store\/.*/,
  // Nested node_modules inside most packages are redundant hoisting artifacts
  // resolvable from root, so block them to shrink the Haste file graph. Do not
  // block pnpm's virtual store (Metro still needs to hash files there), and do
  // not block better-auth/better-call/@better-auth's own nested node_modules —
  // pnpm deliberately does NOT hoist their zod@4 dependency (root has zod@3,
  // which lacks the .meta() API better-auth's server code calls), so blocking
  // it here made Metro fall back to the mismatched root zod and crash every
  // /api/auth/* request with "z.coerce.boolean(...).meta is not a function".
  /.*\/node_modules\/(?!\.pnpm\/)(?!better-auth\/)(?!better-call\/)(?!@better-auth\/).*\/node_modules\/.*/,
  // Build artefacts inside workspace packages
  /.*\/packages\/.*\/dist\/.*/,
  /.*\/packages\/.*\/build\/.*/,
  /.*\/packages\/.*\/coverage\/.*/,
  /.*\/packages\/.*\/\.turbo\/.*/,
  // Local infra tooling can be multiple GB and is never needed by the mobile app.
  /.*\/packages\/infra\/\.sst\/.*/,
  /.*\/packages\/infra\/terraform\/.*\/\.terraform\/.*/,
  /.*\/packages\/infra\/terraform\/.*\/\.terragrunt-cache\/.*/,
  /.*\/packages\/infra\/terraform\/.*\/terraform\.tfstate.*/,
  // Docs app — large markdown/mdx tree not needed at runtime
  /.*\/apps\/docs\/.*/,
  // CI/test artefacts in workspace root
  /.*\/\.git\/.*/,
  /.*\/coverage\/.*/,
  /.*\/storybook-static\/.*/,
  /.*\/archive\/.*/,
];

config.resolver = {
  ...config.resolver,
  blockList: blockListPatterns,
  extraNodeModules: {
    ...(config.resolver?.extraNodeModules || {}),
    react: path.dirname(workspaceRequire.resolve('react/package.json')),
    'react-dom': path.dirname(workspaceRequire.resolve('react-dom/package.json')),
    'react-native-web': path.dirname(workspaceRequire.resolve('react-native-web/package.json')),
    scheduler: path.dirname(workspaceRequire.resolve('scheduler/package.json')),
    '@lingui/macro': path.resolve(__dirname, 'lib/lingui-macro-shim.ts'),
  },
  resolveRequest: metroResolveRequest,
};

const withNativeWindConfig = withNativeWind(config, {
  input: './app/global.css',
});

module.exports = wrapWithReanimatedMetroConfig(withNativeWindConfig);
