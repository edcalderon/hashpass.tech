import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const ui = (path: string) => fileURLToPath(new URL(`../../packages/ui/src/${path}`, import.meta.url));
const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};
const versionsJson = JSON.parse(readFileSync(new URL('./src/config/versions.json', import.meta.url), 'utf8')) as {
  currentVersion?: { buildNumber?: number; releaseDate?: string; releaseType?: string };
};

function companionVersionManifest() {
  return {
    name: 'hashpass-companion',
    version: packageJson.version,
    buildNumber: versionsJson.currentVersion?.buildNumber || 0,
    releaseDate: versionsJson.currentVersion?.releaseDate || '',
    releaseType: versionsJson.currentVersion?.releaseType || 'stable',
    sourceCommit: process.env.GITHUB_SHA || 'local',
    sourceRef: process.env.GITHUB_REF_NAME || 'local',
    generatedAt: new Date().toISOString(),
  };
}

const deploymentManifestPlugin: Plugin = {
  name: 'hashpass-companion-deployment-manifest',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'companion-version.json',
      source: `${JSON.stringify(companionVersionManifest(), null, 2)}\n`,
    });
  },
};

// The shared settings live in packages/ui and are compiled from source, like Club does with transpilePackages.
export default defineConfig({
  plugins: [react(), deploymentManifestPlugin],
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
