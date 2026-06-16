const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// 🔄 Auto-propagate environment from root Source of Truth
try {
  const profile = process.env.NODE_ENV === 'production' ? 'production' : 'local';
  console.log(`📡 [Metro] Auto-propagating environment: ${profile}`);
  execSync(`node ${path.resolve(__dirname, '../../packages/tools/scripts/propagate-env.js')} ${profile}`, { stdio: 'inherit' });
} catch (error) {
  console.error('⚠️ [Metro] Environment propagation failed:', error.message);
}

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const { wrapWithReanimatedMetroConfig } = require('react-native-reanimated/metro-config');
const { resolve } = require('metro-resolver');

const config = getDefaultConfig(__dirname);
const originalResolveRequest = config.resolver?.resolveRequest;
const pnpmStoreDir = path.resolve(__dirname, '../../node_modules/.pnpm');
let zustandPackageDir;

const getZustandPackageDir = () => {
  if (zustandPackageDir !== undefined) {
    return zustandPackageDir;
  }

  zustandPackageDir = null;

  try {
    const candidates = fs
      .readdirSync(pnpmStoreDir)
      .filter((name) => name.startsWith('zustand@'))
      .sort();

    for (const candidate of candidates) {
      const packageDir = path.join(pnpmStoreDir, candidate, 'node_modules', 'zustand');
      if (fs.existsSync(packageDir)) {
        zustandPackageDir = packageDir;
        break;
      }
    }
  } catch (error) {
    // Ignore lookup failures and fall back to Metro's default resolver.
  }

  return zustandPackageDir;
};

const resolveZustandCommonJs = (moduleName) => {
  const packageDir = getZustandPackageDir();
  if (!packageDir) {
    return null;
  }

  if (moduleName === 'zustand') {
    const entryPath = path.join(packageDir, 'index.js');
    return fs.existsSync(entryPath) ? entryPath : null;
  }

  if (!moduleName.startsWith('zustand/')) {
    return null;
  }

  const subPath = moduleName
    .slice('zustand/'.length)
    .replace(/\.(mjs|js)$/i, '');

  const candidatePath = path.join(packageDir, `${subPath}.js`);
  return fs.existsSync(candidatePath) ? candidatePath : null;
};

config.watchFolders = [
  path.resolve(__dirname, '../../packages'),
  path.resolve(__dirname, '../../node_modules'),
];

const metroResolveRequest = (context, moduleName, platform) => {
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
    moduleName === 'cosmiconfig' ||
    moduleName.startsWith('cosmiconfig/') ||
    moduleName.endsWith('/cosmiconfig/dist/loaders.js') ||
    moduleName.endsWith('/cosmiconfig/dist/index.js')
  ) {
    return { type: 'empty' };
  }

  const zustandCommonJs = resolveZustandCommonJs(moduleName);
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

config.resolver = {
  ...config.resolver,
  extraNodeModules: {
    ...(config.resolver?.extraNodeModules || {}),
    '@lingui/macro': path.resolve(__dirname, 'lib/lingui-macro-shim.ts'),
  },
  resolveRequest: metroResolveRequest,
};

const withNativeWindConfig = withNativeWind(config, {
  input: './app/global.css',
});

module.exports = wrapWithReanimatedMetroConfig(withNativeWindConfig);
