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

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const { wrapWithReanimatedMetroConfig } = require('react-native-reanimated/metro-config');
const { FileStore } = require('metro-cache');
const { resolve } = require('metro-resolver');
const { createRequire } = require('module');
const { resolveDreiCommonJs } = require('./lib/metro/drei-resolver');
const { resolveZustandCommonJs } = require('./lib/metro/zustand-resolver');

const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, '../..');
const workspaceRequire = createRequire(path.join(workspaceRoot, 'package.json'));
const dreiPackageDir = path.dirname(workspaceRequire.resolve('@react-three/drei/package.json'));

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
  } catch (error) {
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
  } catch (error) {
    return null;
  }
};

config.watchFolders = [
  path.resolve(__dirname, '../../packages'),
  path.resolve(__dirname, '../../node_modules'),
];

const metroResolveRequest = (context, moduleName, platform) => {
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
  // Nested node_modules inside any package — resolved from root by hoisting
  /.*\/node_modules\/.*\/node_modules\/.*/,
  // Build artefacts inside workspace packages
  /.*\/packages\/.*\/dist\/.*/,
  /.*\/packages\/.*\/build\/.*/,
  /.*\/packages\/.*\/\.turbo\/.*/,
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
