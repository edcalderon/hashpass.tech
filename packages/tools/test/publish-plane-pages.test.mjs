import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToHtml } from '../scripts/publish-plane-pages.mjs';

test('strips HTML comments completely, including ones that rebuild a comment when split', () => {
  const html = markdownToHtml('before\n\n<!<!-- x -->-- hidden -->\n\nafter');
  assert.doesNotMatch(html, /<!--/);
  assert.doesNotMatch(html, /hidden/);
  assert.match(html, /before/);
  assert.match(html, /after/);
});

test('removes an ordinary comment and keeps surrounding text', () => {
  const html = markdownToHtml('a <!-- note --> b');
  assert.doesNotMatch(html, /note/);
  assert.match(html, /a\s+b/);
});
