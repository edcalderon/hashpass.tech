import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const ui = (path: string) => fileURLToPath(new URL(`../../packages/ui/src/${path}`, import.meta.url));

// The shared settings live in packages/ui and are compiled from source, like Club does with transpilePackages.
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: '@hashpass/ui/settings-menu', replacement: ui('settings/SettingsMenu.tsx') },
      { find: '@hashpass/ui/settings', replacement: ui('settings/index.ts') },
    ],
  },
});
