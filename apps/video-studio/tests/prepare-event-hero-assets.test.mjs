import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const studio = path.resolve(import.meta.dirname, '..');
const preparer = path.join(studio, 'scripts', 'prepare-event-hero-assets.mjs');

test('prepares a reviewed event logo inside the Remotion public directory', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'hashpass-event-hero-assets-'));
  await mkdir(path.join(fixture, 'src', 'content'), {recursive: true});
  await mkdir(path.join(fixture, 'assets'), {recursive: true});
  await writeFile(path.join(fixture, 'assets', 'logo.webp'), 'approved-logo');
  await writeFile(
    path.join(fixture, 'src', 'content', 'event-hero-specs.json'),
    JSON.stringify({
      version: 1,
      heroes: [{
        id: 'cbweek2026',
        compositionId: 'EventHeroCbweek2026',
        title: 'Colombia Blockchain Week 2026',
        city: 'Medellín',
        country: 'Colombia',
        venue: 'Hotel InterContinental Medellín',
        accentColor: '#FCD116',
        eventLogo: {
          source: 'assets/logo.webp',
          target: 'event-heroes/cbweek2026/event-logo.webp',
        },
      }],
    }),
  );

  const result = spawnSync(process.execPath, [preparer, '--studio', fixture], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    await readFile(path.join(fixture, 'public', 'event-heroes', 'cbweek2026', 'event-logo.webp'), 'utf8'),
    'approved-logo',
  );
});
