module.exports = function (api) {
  api.cache(true);

  // Pre-resolve all nativewind/babel plugins via require() from this file's location.
  // This avoids pnpm's CI virtual-store string-resolver failures when nativewind/babel
  // returns "react-native-worklets/plugin" as a string (which Babel resolves from
  // nativewind's own dirname, where pnpm may not have symlinked the module).
  const nativewindPlugins = [
    require('react-native-css-interop/dist/babel-plugin').default,
    // react-native-worklets is a devDependency; skip gracefully in web-only CI envs
    ...((() => {
      try {
        return [require('react-native-worklets/plugin')];
      } catch {
        return [];
      }
    })()),
  ];

  return {
    presets: [
      // jsxImportSource: "nativewind" already configures @babel/plugin-transform-react-jsx
      // with importSource="nativewind", so we don't need nativewind/babel's JSX plugin.
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
    ],
    plugins: [
      ...nativewindPlugins,
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
            '@expo/vector-icons': './lib/vector-icons'
          },
        },
      ],
      'react-native-reanimated/plugin',
      'babel-plugin-transform-import-meta',
    ],
  };
};
