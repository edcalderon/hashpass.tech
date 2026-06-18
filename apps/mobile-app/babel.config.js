module.exports = function (api) {
  api.cache(true);

  // Pre-resolve from babel.config.js location to avoid pnpm isolation issues
  // where Babel's string resolver can't find react-native-worklets in CI.
  function nativewindBabel() {
    const config = require('nativewind/babel')();
    config.plugins = (config.plugins || []).map(p =>
      p === 'react-native-worklets/plugin'
        ? require('react-native-worklets/plugin')
        : p
    );
    return config;
  }

  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      nativewindBabel,
    ],
    plugins: [
      'macros',
      [
        'module-resolver',
        {
          root: ['.'],
          alias: {
            '@': '.',
            '@components': './components',
            '@hooks': './hooks',
            '@lib': './lib',
            '@providers': './providers',
            '@contexts': './contexts',
            '@screens': './app/screens',
            '@navigation': './navigation',
            // Web shim avoids the Ionicons font download path on the BSL host.
            '@expo/vector-icons': './lib/vector-icons'
          },
        },
      ],
      'react-native-reanimated/plugin',
      'babel-plugin-transform-import-meta',
    ],
  };
};
