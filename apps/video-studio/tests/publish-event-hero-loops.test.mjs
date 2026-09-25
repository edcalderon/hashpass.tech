import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

import {
  PRODUCTION_AWS_PROFILE,
  createImmutableHeroUploadArgs,
  verifyProductionAwsIdentity,
} from '../scripts/lib/event-hero-publisher.mjs';

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

test('pins hero uploads to the verified production AWS profile', () => {
  const invocations = [];
  verifyProductionAwsIdentity(
    (args) => {
      invocations.push(args);
      return {status: 0, stdout: 'expected-production-account\n'};
    },
    'expected-production-account',
  );

  assert.deepEqual(invocations, [[
    '--profile', PRODUCTION_AWS_PROFILE,
    'sts', 'get-caller-identity', '--query', 'Account', '--output', 'text',
  ]]);
});

test('uses an atomic non-overwrite request for immutable hero objects', () => {
  const args = createImmutableHeroUploadArgs({
    localPath: '/tmp/cbweek.mp4',
    objectKey: 'events/cbweek2026/branding/hashpass-event-hero-v1.mp4',
  }, 'hashpass-production-event-media-952191196420-us-east-2', 'us-east-2');

  assert.deepEqual(args, [
    '--profile', PRODUCTION_AWS_PROFILE,
    's3api', 'put-object',
    '--bucket', 'hashpass-production-event-media-952191196420-us-east-2',
    '--key', 'events/cbweek2026/branding/hashpass-event-hero-v1.mp4',
    '--body', '/tmp/cbweek.mp4',
    '--region', 'us-east-2',
    '--content-type', 'video/mp4',
    '--cache-control', 'public,max-age=31536000,immutable',
    '--if-none-match', '*',
    '--only-show-errors',
  ]);
});
