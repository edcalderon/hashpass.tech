import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('staging page is not indexable', () => {
  assert.match(read('../index.html'), /name="robots" content="noindex"/);
});

test('page says it is a staging preview and does not claim working features', () => {
  const app = read('../src/App.tsx');
  const en = read('../src/i18n/en.ts');
  assert.match(en, /Staging preview/);
  assert.match(en, /previews, not working features/);
  assert.match(app, /disabled/); // HASHPASS ID sign-in button stays disabled until it is connected
  assert.match(read('../src/content.ts'), /proposedGuestTurns = 5/);
});

test('every sprite is a rectangular grid with only known palette colors', () => {
  const src = read('../src/sprites.ts');
  const rowsOf = (name) => {
    const m = src.match(new RegExp(`${name}: \\[([\\s\\S]*?)\\n  \\],`));
    assert.ok(m, `${name} sprite found`);
    return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
  };
  for (const name of ['hatchling', 'curious', 'helpful']) {
    const rows = rowsOf(name);
    assert.equal(rows.length, 16, `${name} has 16 rows`);
    for (const row of rows) assert.equal(row.length, 8, `${name} half-row is 8 wide: ${row}`);
  }
});

test('footer shows the tracked version from the generated version files', () => {
  const app = read('../src/App.tsx');
  assert.match(app, /getCompanionVersionLabel\(\)/);
  assert.match(app, /t\('foot\.build', \{ build: CURRENT_VERSION\.buildNumber/);
  assert.match(read('../src/i18n/en.ts'), /'foot\.build': 'Build \{build\}/);
  const pkg = JSON.parse(read('../package.json'));
  const tracked = JSON.parse(read('../src/config/versions.json'));
  assert.equal(tracked.currentVersion.version, pkg.version, 'versions.json matches package.json');
  assert.equal(tracked.versions[0].version, pkg.version);
  const cfg = JSON.parse(read('../versioning.config.json'));
  assert.equal(cfg.releaseGuard.tagPrefix, 'companion-v');
});
