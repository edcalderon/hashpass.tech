import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  createHeroPublishPlan,
  createHeroPosterPublishPlan,
  validateEventHeroManifest,
} from '../scripts/lib/event-hero-pipeline.mjs';

const studio = path.resolve(import.meta.dirname, '..');

test('creates immutable, event-scoped CDN destinations for every approved hero loop', () => {
  const heroes = validateEventHeroManifest({
    version: 1,
    heroes: [
      {
        id: 'cbweek2026',
        compositionId: 'EventHeroCbweek2026',
        eventLogo: {target: 'event-heroes/cbweek2026/event-logo.webp'},
        title: 'Colombia Blockchain Week 2026',
        city: 'Medellín',
        country: 'Colombia',
        venue: 'Hotel InterContinental Medellín',
        accentColor: '#FCD116',
      },
    ],
  });

  assert.deepEqual(
    createHeroPublishPlan(heroes, {
      mediaBaseUrl: 'https://media.example.test/events',
      outputDirectory: '/tmp/event-hero-output',
    }),
    [
      {
        eventId: 'cbweek2026',
        localPath: '/tmp/event-hero-output/cbweek2026/hashpass-event-hero-v1.mp4',
        objectKey: 'events/cbweek2026/branding/hashpass-event-hero-v1.mp4',
        publicUrl: 'https://media.example.test/events/cbweek2026/branding/hashpass-event-hero-v1.mp4',
      },
    ],
  );
});

test('creates an event-scoped poster beside every hero loop', () => {
  const heroes = validateEventHeroManifest({
    version: 1,
    heroes: [{
      id: 'colombia2026',
      compositionId: 'EventHeroColombia2026',
      eventLogo: {target: 'event-heroes/colombia2026/event-logo.webp'},
      title: 'Blockchain Summit Latam Colombia 2026',
      city: 'Bogotá',
      country: 'Colombia',
      venue: 'Bogotá',
      accentColor: '#F5C542',
    }],
  });

  assert.deepEqual(createHeroPosterPublishPlan(heroes, {
    mediaBaseUrl: 'https://media.example.test/events',
    outputDirectory: '/tmp/event-hero-output',
  }), [
    {
      eventId: 'colombia2026',
      localPath: '/tmp/event-hero-output/colombia2026/hashpass-event-hero-v1.jpg',
      objectKey: 'events/colombia2026/branding/hashpass-event-hero-v1.jpg',
      publicUrl: 'https://media.example.test/events/colombia2026/branding/hashpass-event-hero-v1.jpg',
      contentType: 'image/jpeg',
    },
  ]);
});

test('rejects a hero manifest that would publish an event without its verified venue', () => {
  assert.throws(
    () => validateEventHeroManifest({
      version: 1,
      heroes: [{
        id: 'peru2026',
        compositionId: 'EventHeroPeru2026',
        eventLogo: {target: 'event-heroes/peru2026/event-logo.webp'},
        title: 'Blockchain Summit Latam Perú 2026',
        city: 'Lima',
        country: 'Peru',
        accentColor: '#D11A2A',
      }],
    }),
    /venue/,
  );
});

test('keeps one reviewed hero specification for every public discovery event', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(studio, 'src', 'content', 'event-hero-specs.json'), 'utf8'),
  );

  const heroes = validateEventHeroManifest(manifest);
  assert.deepEqual(
    heroes.map((hero) => hero.id).sort(),
    ['bsl', 'bsl2025', 'cbweek2026', 'chile2026', 'colombia2026', 'hash-poker', 'peru2026'],
  );
  assert.ok(heroes.every((hero) => typeof hero.eventLogo.source === 'string'));
});
