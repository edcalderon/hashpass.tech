import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const redirectScript = readFileSync(
  resolve(import.meta.dirname, '../../../apps/web-app/public/canonical-redirect.js'),
  'utf8',
);

function redirectsFor(address) {
  const location = new URL(address);
  const redirects = [];
  const window = {
    location: {
      hostname: location.hostname,
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      href: location.href,
      replace: (target) => redirects.push(target),
    },
  };

  runInNewContext(redirectScript, { window });
  return redirects;
}

test('redirects legacy attending paths to the attending host root', () => {
  assert.deepEqual(
    redirectsFor('https://attending.hashpass.tech/attending/?campaign=summer#events'),
    ['https://attending.hashpass.tech/?campaign=summer#events'],
  );
  assert.deepEqual(
    redirectsFor('https://attending.hashpass.tech/attending'),
    ['https://attending.hashpass.tech/'],
  );
});

test('leaves the attending host root for the edge rewrite', () => {
  assert.deepEqual(redirectsFor('https://attending.hashpass.tech/?campaign=summer#events'), []);
});

test('keeps the Club attending routes accessible and canonicalizes the plural landing', () => {
  assert.deepEqual(redirectsFor('https://hashpass.club/attending/'), []);
  assert.deepEqual(
    redirectsFor('https://hashpass.club/attending?campaign=summer#events'),
    ['https://hashpass.club/attending/?campaign=summer#events'],
  );
  assert.deepEqual(redirectsFor('https://hashpass.club/attendings/'), []);
  assert.deepEqual(
    redirectsFor('https://hashpass.club/attendings?campaign=summer#events'),
    ['https://hashpass.club/attendings/?campaign=summer#events'],
  );
  assert.deepEqual(
    redirectsFor('https://hashpass.club/attendings/index.html?campaign=summer#events'),
    ['https://hashpass.club/attendings/?campaign=summer#events'],
  );
});

test('keeps the dedicated BSL logo route on its own host', () => {
  assert.deepEqual(redirectsFor('https://bsl.hashpass.tech/attending/bsl/'), []);
});

test('keeps legacy event links working', () => {
  assert.deepEqual(
    redirectsFor('https://attending.hashpass.tech/colombia2026/?campaign=summer#events'),
    ['https://colombia2026.hashpass.tech/?campaign=summer#events'],
  );
});
