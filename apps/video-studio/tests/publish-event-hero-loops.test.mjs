import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const studio = path.resolve(import.meta.dirname, '..');
const publisher = path.join(studio, 'scripts', 'publish-event-hero-loops.mjs');

test('prints the reviewed CDN publication plan without invoking AWS', async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), 'hashpass-event-hero-publish-'));
  const output = path.join(fixture, 'out', 'event-heroes');
  await mkdir(path.join(fixture, 'src', 'content'), {recursive: true});
  await mkdir(path.join(output, 'cbweek2026'), {recursive: true});
  await writeFile(path.join(output, 'cbweek2026', 'hashpass-event-hero-v1.mp4'), 'video');
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
        eventLogo: {source: 'assets/logo.webp', target: 'event-heroes/cbweek2026/event-logo.webp'},
      }],
    }),
  );

  const result = spawnSync(process.execPath, [publisher, '--studio', fixture, '--output', output], {
    encoding: 'utf8',
    env: {
      ...process.env,
      EVENT_MEDIA_BUCKET: 'hashpass-production-event-media-952191196420-us-east-2',
      EVENT_MEDIA_REGION: 'us-east-2',
      EVENT_MEDIA_PUBLIC_BASE_URL: 'https://media.example.test/events',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry run only/);
  assert.match(result.stdout, /events\/cbweek2026\/branding\/hashpass-event-hero-v1\.mp4/);
});
