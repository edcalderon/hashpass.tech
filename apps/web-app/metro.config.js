const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const { wrapWithReanimatedMetroConfig } = require('react-native-reanimated/metro-config');
const { resolve } = require('metro-resolver');

const config = getDefaultConfig(__dirname);
const originalResolveRequest = config.resolver?.resolveRequest;

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
