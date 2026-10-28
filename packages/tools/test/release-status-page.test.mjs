import test from 'node:test';
import assert from 'node:assert/strict';
import { bumpVersion, changelogWithRelease } from '../scripts/release-status-page.mjs';

test('status releases support independent semantic patch, minor, and major bumps', () => {
  assert.equal(bumpVersion('1.2.3', 'patch'), '1.2.4');
  assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0');
  assert.throws(() => bumpVersion('v1.2.3'), /Invalid semantic version/);
});

test('status changelog releases are prepended with explicit notes', () => {
  const source = '# Status Page Changelog\n\nAll notable changes to the independently released Mission Control status surface are recorded here.\n\n## [0.1.0] - 2026-01-01\n';
  const next = changelogWithRelease(source, '0.1.1', '2026-01-02', ['Polish the pulse.']);
  assert.match(next, /## \[0\.1\.1\] - 2026-01-02\n\n- Polish the pulse\.\n\n## \[0\.1\.0\]/);
});
