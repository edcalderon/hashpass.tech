module.exports = function (api) {
  api.cache(true);

  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
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
