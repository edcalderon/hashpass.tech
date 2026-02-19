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
            '@navigation': './navigation'
          },
        },
      ],
      'react-native-reanimated/plugin',
      // Make sure Reanimated is the last plugin
    ],
  };
};
