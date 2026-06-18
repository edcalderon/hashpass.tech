module.exports = function (api) {
  api.cache(true);

  // Recreate nativewind/babel as a function preset so all plugins are resolved
  // via require() from this file's location (apps/mobile-app/), not from
  // nativewind's directory in pnpm's virtual store.
  //
  // As a string preset ("nativewind/babel"), Babel string-resolves its plugin list
  // which includes "react-native-worklets/plugin". pnpm's virtual store does NOT
  // symlink react-native-worklets into nativewind's isolated node_modules, causing
  // the mergeChainOpts CI failure.
  //
  // As a function preset, all require() calls resolve from apps/mobile-app/ where
  // react-native-worklets IS a declared devDependency.
  //
  // Ordering matters: react-native-reanimated/plugin MUST be a top-level plugin
  // (runs before presets) so it processes worklet functions before
  // react-native-worklets/plugin (inside this preset) sees them.
  function nativewindPreset() {
    const plugins = [
      require('react-native-css-interop/dist/babel-plugin').default,
      [
        require('@babel/plugin-transform-react-jsx').default,
        { runtime: 'automatic', importSource: 'react-native-css-interop' },
      ],
    ];
    try {
      plugins.push(require('react-native-worklets/plugin'));
    } catch {
      // Not resolvable in some web CI envs (pnpm transitive-dep isolation); skip.
    }
    return { plugins };
  }

  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      nativewindPreset,
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
            '@expo/vector-icons': './lib/vector-icons',
          },
        },
      ],
      'react-native-reanimated/plugin',
      'babel-plugin-transform-import-meta',
    ],
  };
};
