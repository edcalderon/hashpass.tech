import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const studio = path.resolve(import.meta.dirname, '..');
const importer = path.join(studio, 'scripts', 'import-diffusion-project.mjs');

test('imports an approved Diffusion handoff into the canonical Remotion library', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'hashpass-diffusion-import-'));
  const source = path.join(fixture, 'diffusion-project');
  const destination = path.join(fixture, 'video-studio');
  await mkdir(path.join(source, 'exports'), {recursive: true});
  await mkdir(path.join(destination, 'src', 'content'), {recursive: true});
  await writeFile(path.join(source, 'exports', 'hero.mp4'), 'approved-video');
  await writeFile(
    path.join(source, 'hashpass-handoff.json'),
    JSON.stringify({
      version: 1,
      source: 'diffusion-studio',
      imports: [{
        id: 'hero-v1',
        composition: 'AppTutorialEN',
        source: 'exports/hero.mp4',
        title: 'Event discovery',
        caption: 'Find your next event',
      }],
    }),
  );
  await writeFile(path.join(destination, 'src', 'content', 'diffusion-imports.json'), '{"version":1,"imports":[]}');

  const result = spawnSync(
    process.execPath,
    [importer, '--project', source, '--studio', destination],
    {encoding: 'utf8'},
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    await readFile(path.join(destination, 'public', 'recordings', 'diffusion', 'hero-v1.mp4'), 'utf8'),
    'approved-video',
  );
  assert.deepEqual(
    JSON.parse(await readFile(path.join(destination, 'src', 'content', 'diffusion-imports.json'), 'utf8')),
    {
      version: 1,
      imports: [{
        id: 'hero-v1',
        composition: 'AppTutorialEN',
        src: 'diffusion/hero-v1.mp4',
        title: 'Event discovery',
        caption: 'Find your next event',
      }],
    },
  );
});
