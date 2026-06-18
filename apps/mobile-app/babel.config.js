module.exports = function (api) {
  // Cache per-platform so web and native get different configs.
  const platform = api.caller(
    (caller) => caller?.customTransformOptions?.platform ?? caller?.platform,
  );
  api.cache(() => platform ?? 'unknown');

  // On native, include nativewind/babel as a PRESET (not a plugin) so its
  // react-native-worklets/plugin runs AFTER the top-level reanimated plugin —
  // which is the required ordering.  On web, className is handled by real CSS
  // so we skip the preset entirely and just inline the css-interop plugin to
  // avoid pnpm CI string-resolution failures with react-native-worklets.
  const isNative = platform === 'android' || platform === 'ios';

  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      // Only on native: provides CSS-to-style transform + worklets plugin
      // (loaded AFTER the top-level reanimated plugin, as required).
      ...(isNative ? ['nativewind/babel'] : []),
    ],
    plugins: [
      // On web CI: inline the css-interop babel plugin via require() to avoid
      // pnpm virtual-store failures when Babel tries to string-resolve
      // "react-native-worklets/plugin" from inside nativewind's directory.
      ...(!isNative
        ? [require('react-native-css-interop/dist/babel-plugin').default]
        : []),
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
            '@expo/vector-icons': './lib/vector-icons',
          },
        },
      ],
      'react-native-reanimated/plugin',
      'babel-plugin-transform-import-meta',
    ],
  };
};
