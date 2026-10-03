import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  publicDir: 'public',
  resolve: {
    alias: { 'react-native': 'react-native-web' },
    dedupe: ['react', 'react-dom', 'react-native-web'],
  },
  define: { __DEV__: JSON.stringify(false) },
});
