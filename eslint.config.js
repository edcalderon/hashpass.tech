// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    // Disallow raw fetch/axios in components - must use apiClient
    files: ["**/*.{ts,tsx,js,jsx}"],
    rules: {
      // Disallow axios imports
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'axios',
              message: 'Direct axios calls are not allowed. Use apiClient from "@/lib/api-client" instead.',
            },
          ],
        },
      ],
      // Disallow direct fetch() calls with HTTP URLs
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.name="fetch"]',
          message: 'Direct fetch() calls are not allowed in components. Use apiClient from "@/lib/api-client" instead.',
        },
        {
          selector: 'CallExpression[callee.object.name="axios"]',
          message: 'Direct axios calls are not allowed. Use apiClient from "@/lib/api-client" instead.',
        },
      ],
    },
  },
  {
    // Allow fetch in api-client.ts (the implementation itself)
    files: ['**/api-client.ts', '**/api-client.js'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Allow fetch in service workers and scripts
    files: ['**/sw.js', '**/service-worker*', '**/scripts/**', '**/public/**'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Allow fetch in +html.tsx (runs in HTML head context, needs direct fetch)
    files: ['**/+html.tsx', '**/+html.jsx'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
]);
