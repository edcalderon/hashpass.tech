import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const scriptPath = resolve(import.meta.dirname, 'build-static-site.sh');

test('builds Storybook before packaging the public static site', () => {
  const script = readFileSync(scriptPath, 'utf8');
  const storybookBuild = script.indexOf('corepack pnpm build:storybook');
  const staticPackaging = script.indexOf('npm run postbuild:web');

  assert.ok(storybookBuild >= 0, 'the CI build must generate storybook-static');
  assert.ok(staticPackaging > storybookBuild, 'Storybook must exist before postbuild:web copies it into dist/client');
});

test('clears the mobile workspace links before reinstalling dependencies', () => {
  const script = readFileSync(scriptPath, 'utf8');
  const cleanup = script.indexOf('rm -rf node_modules apps/mobile-app/node_modules');
  const install = script.indexOf('corepack pnpm install --frozen-lockfile --prefer-offline');

  assert.ok(cleanup >= 0, 'the root and mobile node_modules trees must be cleared');
  assert.ok(install > cleanup, 'dependency install must happen after stale workspace links are removed');
});
