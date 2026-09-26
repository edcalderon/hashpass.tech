import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(
  new URL('./download-options-section.tsx', import.meta.url),
  'utf8',
);

test('links the download choices to the contextual PWA installation guide', () => {
  assert.match(
    source,
    /<(?:a|Link)\b[^>]*href=["']\/documentation\/guides\/install-hashpass\/["'][^>]*>/s,
  );
  assert.match(source, /(?:Progressive Web App|\bPWA\b|t\(['"]pwaGuide['"]\))/);
});
