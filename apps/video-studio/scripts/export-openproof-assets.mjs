import {mkdir, copyFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(studio, '../..');
const artifacts = path.join(root, 'artifacts/openproof');
const publicDir = path.join(root, 'apps/web-app/public/openproof');
const svg = path.join(artifacts, 'openproof-architecture.svg');
const diagram = path.join(artifacts, 'openproof-architecture.png');
const thumbnail = path.join(artifacts, 'openproof-thumbnail.png');
const video = path.join(artifacts, 'openproof-walkthrough.mp4');

await Promise.all([mkdir(artifacts, {recursive: true}), mkdir(publicDir, {recursive: true})]);
await sharp(svg).png().toFile(diagram);
await sharp(svg).resize(1200, 630, {fit: 'cover'}).png().toFile(thumbnail);

if (!process.argv.includes('--images-only')) {
  const result = spawnSync(
    'pnpm',
    ['exec', 'remotion', 'render', 'OpenProof', video, '--codec=h264', '--crf=18'],
    {cwd: studio, stdio: 'inherit'},
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}

await Promise.all([
  copyFile(diagram, path.join(publicDir, 'openproof-architecture.png')),
  copyFile(thumbnail, path.join(publicDir, 'openproof-thumbnail.png')),
  ...(process.argv.includes('--images-only') ? [] : [copyFile(video, path.join(publicDir, 'openproof-walkthrough.mp4'))]),
]);
console.log(`OpenProof exports written to ${artifacts} and ${publicDir}`);
