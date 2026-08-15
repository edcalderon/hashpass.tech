import test from 'node:test';
import assert from 'node:assert/strict';
import { anonymizeVisitor, classifyAgent } from './privacy';

const SECRET = 'a'.repeat(32);

test('rejects a secret shorter than 32 characters', () => {
  assert.throws(() => anonymizeVisitor('1.2.3.4', 'short'));
});

test('same IP and month produce the same hash (stable within a rotation)', () => {
  const now = new Date('2026-08-14T00:00:00Z');
  assert.equal(anonymizeVisitor('1.2.3.4', SECRET, now), anonymizeVisitor('1.2.3.4', SECRET, now));
});

test('same IP in different months produces a different hash (rotates)', () => {
  const august = new Date('2026-08-14T00:00:00Z');
  const september = new Date('2026-09-14T00:00:00Z');
  assert.notEqual(anonymizeVisitor('1.2.3.4', SECRET, august), anonymizeVisitor('1.2.3.4', SECRET, september));
});

test('different IPs in the same month produce different hashes', () => {
  const now = new Date('2026-08-14T00:00:00Z');
  assert.notEqual(anonymizeVisitor('1.2.3.4', SECRET, now), anonymizeVisitor('5.6.7.8', SECRET, now));
});

test('never returns the raw IP in the anonymized identifier', () => {
  const result = anonymizeVisitor('203.0.113.42', SECRET);
  assert.equal(result.includes('203.0.113.42'), false);
});

test('classifies common crawlers as bots', () => {
  assert.equal(classifyAgent('Mozilla/5.0 (compatible; Googlebot/2.1)').bot, true);
  assert.equal(classifyAgent('facebookexternalhit/1.1').bot, true);
});

test('classifies device categories', () => {
  assert.equal(classifyAgent('Mozilla/5.0 (iPhone; CPU iPhone OS)').device, 'mobile');
  assert.equal(classifyAgent('Mozilla/5.0 (iPad; CPU OS)').device, 'tablet');
  assert.equal(classifyAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)').device, 'desktop');
  assert.equal(classifyAgent('').device, 'unknown');
});
