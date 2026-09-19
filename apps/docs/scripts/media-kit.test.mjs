import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';

const docs = fileURLToPath(new URL('../', import.meta.url));
const root = path.resolve(docs, '../..');
const output = path.join(docs, 'static/media-kit');
const assets = JSON.parse(await readFile(path.join(docs, 'media-kit-assets.json'), 'utf8'));
const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));

test('every logo has a unique, public-safe name and an export entry', () => {
  assert.equal(new Set(assets.map(({ id }) => id)).size, assets.length);
  assert.deepEqual(manifest.map(({ id }) => id), assets.map(({ id }) => id));
  for (const { id } of assets) assert.match(id, /^hashpass-[a-z-]+$/);
});

for (const asset of assets) {
  test(`${asset.id}: original SVG and nonblank transparent PNG`, async () => {
    const source = await readFile(path.join(root, asset.source));
    const svg = await readFile(path.join(output, `${asset.id}.svg`));
    assert.deepEqual(svg, source);
    const entry = manifest.find(({ id }) => id === asset.id);
    assert.equal(entry.sourceSha256, createHash('sha256').update(source).digest('hex'));
    const png = sharp(path.join(output, entry.png));
    const metadata = await png.metadata();
    const sourceMetadata = await sharp(source).metadata();
    assert.equal(metadata.format, 'png');
    assert.equal(metadata.width, asset.kind === 'symbol' ? 1024 : 2400);
    assert.equal(metadata.width, entry.pngWidth);
    assert.equal(metadata.height, entry.pngHeight);
    assert.equal(metadata.hasAlpha, true);
    assert.ok(Math.abs(metadata.height - metadata.width * sourceMetadata.height / sourceMetadata.width) <= 1);
    const { channels } = await png.stats();
    assert.equal(channels[3].min, 0);
    assert.equal(channels[3].max, 255);
  });
}

test('ZIP contains only the complete public kit, with identical file contents', async () => {
  const zip = path.join(output, 'hashpass-media-kit.zip');
  execFileSync('unzip', ['-t', zip]);
  const entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).trim().split('\n');
  const expected = [...assets.flatMap(({ id }) => [`${id}.svg`, `${id}.png`]), 'manifest.json', 'BRAND-GUIDELINES.md'].sort();
  assert.deepEqual(entries, expected);
  for (const entry of entries) {
    assert.deepEqual(execFileSync('unzip', ['-p', zip, entry]), await readFile(path.join(output, entry)));
  }
  assert.deepEqual(await readFile(path.join(output, 'BRAND-GUIDELINES.md')), await readFile(path.join(docs, 'docs/brand/brand-guidelines.md')));
});
