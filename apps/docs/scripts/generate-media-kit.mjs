import { readFile, writeFile, mkdir, copyFile, rm, utimes } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const docs = fileURLToPath(new URL('../', import.meta.url));
const root = path.resolve(docs, '../..');
const output = path.join(docs, 'static/media-kit');
const assets = JSON.parse(await readFile(path.join(docs, 'media-kit-assets.json'), 'utf8'));
await mkdir(output, { recursive: true });
const files = [];
const manifest = [];
for (const asset of assets) {
  const source = path.join(root, asset.source);
  const svg = `${asset.id}.svg`;
  const png = `${asset.id}.png`;
  const width = asset.kind === 'symbol' ? 1024 : 2400;
  await copyFile(source, path.join(output, svg));
  const { data, info } = await sharp(source, { density: 300 }).resize({ width }).png().toBuffer({ resolveWithObject: true });
  await writeFile(path.join(output, png), data);
  files.push(svg, png);
  manifest.push({
    id: asset.id, label: asset.label, svg, png,
    pngWidth: info.width, pngHeight: info.height,
    sourceSha256: createHash('sha256').update(await readFile(source)).digest('hex'),
  });
}
await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await copyFile(path.join(docs, 'docs/brand/brand-guidelines.md'), path.join(output, 'BRAND-GUIDELINES.md'));
files.push('manifest.json', 'BRAND-GUIDELINES.md');
// Stable timestamps and entry ordering keep regenerated ZIPs reproducible.
for (const file of files) await utimes(path.join(output, file), new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'));
const zip = path.join(output, 'hashpass-media-kit.zip');
await rm(zip, { force: true });
execFileSync('zip', ['-X', '-q', zip, ...files.sort()], { cwd: output, env: { ...process.env, TZ: 'UTC' } });
console.log(`Generated ${assets.length} logo variants, PNG exports, guide, manifest, and ZIP.`);
