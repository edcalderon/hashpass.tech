import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePassportImport } from './normalize';
import type { PassportImportCandidate } from './types';

const field = <T>(value: T, confidence = 0.99) => ({ value, confidence });
function extraction(): PassportImportCandidate {
  return {
    source: { kind: 'email', url: 'https://tickets.example/secret?token=private-ticket' },
    title: field('  Developer Gathering  '),
    startsAt: field('2026-11-05T09:00:00-05:00'),
    endsAt: field('2026-11-05T18:00:00-05:00'),
    timeZone: field('America/Bogota'),
    venue: field({ name: 'Community Hall', address: 'Bogotá, Colombia' }),
    publicEventUrl: field('https://events.example/gathering'),
  };
}

test('produces a private source-extracted Capsule without claiming attendance or registration', () => {
  const result = normalizePassportImport(extraction(), 'user-a');
  assert.equal(result.state, 'ready');
  assert.equal(result.event.startsAt, '2026-11-05T14:00:00.000Z');
  assert.equal(result.event.title, 'Developer Gathering');
  assert.equal(result.userEvent.ownerId, 'user-a');
  assert.equal(result.userEvent.visibility, 'private');
  assert.equal(result.userEvent.relationship, 'interested');
  assert.equal(result.userEvent.trust, 'source-extracted');
  assert.equal(result.userEvent.attendanceVerified, false);
  assert.ok(result.userEvent.source.url?.includes('private-ticket'));
  assert.ok(!JSON.stringify(result.event).includes('private-ticket'));
});

test('reports only ambiguous fields, preserving their extracted values and confidence', () => {
  const input = extraction();
  input.venue!.confidence = 0.4;
  const result = normalizePassportImport(input, 'user-a');
  assert.equal(result.state, 'needs-correction');
  assert.deepEqual(result.corrections, ['venue']);
  assert.equal(result.confidence.venue, 0.4);
  assert.equal(result.event.venue?.name, 'Community Hall');
  assert.equal(result.event.matchKey, null);
});

test('missing data cannot silently invent a date, timezone, or venue', () => {
  const result = normalizePassportImport({ source: { kind: 'url' } }, 'user-a');
  assert.deepEqual(result.corrections, ['title', 'startsAt', 'timeZone', 'venue']);
  assert.equal(result.event.startsAt, null);
  assert.equal(result.event.matchKey, null);
});

test('rejects offset-free dates, impossible dates, invalid zones and inverted end times', () => {
  for (const startsAt of ['2026-11-05T09:00:00', '2026-02-30T09:00:00Z', '2026-11-05T24:00:00Z', 'garbage']) {
    const result = normalizePassportImport({ ...extraction(), startsAt: field(startsAt) }, 'user-a');
    assert.ok(result.corrections.includes('startsAt'));
    assert.equal(result.event.startsAt, null);
  }
  const result = normalizePassportImport({ ...extraction(), timeZone: field('Nowhere/Missing'), endsAt: field('2026-11-04T09:00:00Z') }, 'user-a');
  assert.ok(result.corrections.includes('timeZone'));
  assert.ok(result.corrections.includes('endsAt'));
  assert.equal(result.event.endsAt, null);
});

test('query, fragment and credential URLs cannot become shared event URLs', () => {
  for (const url of ['https://events.example/e?ticket=secret', 'https://events.example/e#secret', 'https://user:secret@events.example/e', 'javascript:alert(1)']) {
    const result = normalizePassportImport({ ...extraction(), publicEventUrl: field(url) }, 'user-a');
    assert.equal(result.event.publicEventUrl, null);
    assert.ok(result.corrections.includes('publicEventUrl'));
  }
});

test('matching is stable across users and equivalent offsets, but separates editions and venues', () => {
  const first = normalizePassportImport(extraction(), 'user-a');
  const same = normalizePassportImport({ ...extraction(), startsAt: field('2026-11-05T14:00:00Z') }, 'user-b');
  assert.ok(first.event.matchKey);
  assert.equal(first.event.matchKey, same.event.matchKey);
  const other = normalizePassportImport({ ...extraction(), startsAt: field('2026-11-06T09:00:00-05:00'), endsAt: undefined }, 'user-a');
  assert.notEqual(first.event.matchKey, other.event.matchKey);
  const venueChange = normalizePassportImport({ ...extraction(), venue: field({ name: 'Other Hall', address: 'Other city' }) }, 'user-a');
  assert.notEqual(first.event.matchKey, venueChange.event.matchKey);
});

test('an absent public event URL is allowed but cannot authorize a canonical match', () => {
  const result = normalizePassportImport({ ...extraction(), publicEventUrl: undefined }, 'user-a');
  assert.equal(result.state, 'ready');
  assert.equal(result.event.matchKey, null);
});

test('invalid confidence scores cannot bypass correction', () => {
  for (const confidence of [NaN, Infinity, -1, 1.1]) {
    const result = normalizePassportImport({ ...extraction(), title: field('Event', confidence) }, 'user-a');
    assert.ok(result.corrections.includes('title'));
    assert.equal(result.confidence.title, undefined);
  }
});

test('requires an owner and a bounded threshold, and does not mutate adapter input', () => {
  assert.throws(() => normalizePassportImport(extraction(), ' '));
  assert.throws(() => normalizePassportImport(extraction(), 'user-a', NaN));
  const input = extraction();
  const before = JSON.stringify(input);
  const result = normalizePassportImport(input, 'user-a');
  result.userEvent.source.url = 'changed';
  assert.equal(JSON.stringify(input), before);
});
