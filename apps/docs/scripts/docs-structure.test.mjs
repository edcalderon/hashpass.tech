import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const guideUrl = new URL('../docs/guides/install-hashpass.mdx', import.meta.url);
const guideSource = existsSync(guideUrl) ? readFileSync(guideUrl, 'utf8') : '';
const sidebarSource = readFileSync(new URL('../sidebars.ts', import.meta.url), 'utf8');

test('publishes the Install HASHPASS guide at the canonical Docusaurus route', () => {
  assert.match(guideSource, /^---[\s\S]*title:\s*Install HASHPASS[\s\S]*---/);
  assert.match(guideSource, /Progressive Web App|\bPWA\b/i);
  assert.match(guideSource, /Safari|iPhone|iOS/i);
  assert.match(guideSource, /Chrome|Android/i);
  assert.match(sidebarSource, /['"]guides\/install-hashpass['"]/);
});
