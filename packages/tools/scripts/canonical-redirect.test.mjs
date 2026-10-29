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

test('keeps the attending landing path out of legacy event redirects', () => {
  assert.deepEqual(redirectsFor('https://attending.hashpass.tech/attending/'), []);
  assert.deepEqual(redirectsFor('https://attending.hashpass.tech/attending'), []);
});

test('redirects the attending host root to its landing page', () => {
  assert.deepEqual(
    redirectsFor('https://attending.hashpass.tech/?campaign=summer#events'),
    ['https://attending.hashpass.tech/attending/?campaign=summer#events'],
  );
});

test('keeps legacy event links working', () => {
  assert.deepEqual(
    redirectsFor('https://attending.hashpass.tech/colombia2026/?campaign=summer#events'),
    ['https://colombia2026.hashpass.tech/?campaign=summer#events'],
  );
});
