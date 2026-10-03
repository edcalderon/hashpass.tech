import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('./Footer.tsx', import.meta.url), 'utf8');

test('routes club product links to the main site and its status page', () => {
  assert.match(source, /\{ label: t\('features'\), href: 'https:\/\/hashpass\.tech' \}/);
  assert.match(source, /\{ label: t\('status'\), href: 'https:\/\/hashpass\.tech\/status' \}/);
  assert.match(source, /link\.href\.startsWith\('http'\)[\s\S]*target: '_blank'[\s\S]*rel: 'noopener noreferrer'/);
});
