import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// The Companion signs in with `credentials: 'include'`, which browsers only honour when the API answers with the
// exact origin (never "*"). The Lambda CORS list and Better Auth's trusted origins must therefore both name it.
const ORIGINS = [
  'https://companion.hashpass.tech',
  'https://companion-dev.hashpass.tech',
  'https://cbweek.hashpass.tech',
  'http://localhost:5173',
];
const read = (path) => readFile(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('the API Lambda allows the Companion origins with credentials', async () => {
  const lambda = await read('packages/infra/lambda/index.js');
  for (const origin of ORIGINS) assert.ok(lambda.includes(`"${origin}"`), `Lambda CORS list is missing ${origin}`);
});

test('Better Auth trusts the Companion origins in both SSO configs', async () => {
  for (const path of ['packages/config/src/sso-config.ts', 'apps/mobile-app/config/sso-config.ts']) {
    const source = await read(path);
    for (const origin of ORIGINS) assert.ok(source.includes(`'${origin}'`), `${path} is missing ${origin}`);
  }
});
