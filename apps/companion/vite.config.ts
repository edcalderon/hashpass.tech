import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const ui = (path: string) => fileURLToPath(new URL(`../../packages/ui/src/${path}`, import.meta.url));

// The shared settings live in packages/ui and are compiled from source, like Club does with transpilePackages.
export default defineConfig({
  plugins: [react()],
  define: { __DEV__: JSON.stringify(false) },
  resolve: {
    dedupe: ['react', 'react-dom', 'react-native-web'],
    alias: [
      // Shared primitives are React Native components; the web build renders them through react-native-web, as LocalPass does.
      { find: /^react-native$/, replacement: 'react-native-web' },
      { find: '@hashpass/ui/primitives', replacement: ui('system/primitives.tsx') },
      { find: '@hashpass/ui/tokens', replacement: ui('system/tokens.ts') },
      { find: '@hashpass/ui/settings-menu', replacement: ui('settings/SettingsMenu.tsx') },
      { find: '@hashpass/ui/settings', replacement: ui('settings/index.ts') },
    ],
  },
});
