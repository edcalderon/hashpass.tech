import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addConfirmed, buildInbox, callConfirmation, confirmationEndpoint, errorKeyFor, isConfirmed, parseConfirmedEmails, takeConfirmToken,
} from '../src/confirm/model.ts';

test('an unconfirmed setup email is a notice, and confirming it clears the notice', () => {
  const base = { ownerEmail: 'Me@Example.com', confirmedEmails: [], linkConfirmedEmail: null, linkFailed: false };
  assert.deepEqual(buildInbox(base), [{ kind: 'unconfirmed-email', email: 'Me@Example.com' }]);
  assert.deepEqual(buildInbox({ ...base, confirmedEmails: ['me@example.com'] }), []);
});

test('there is no notice before a Companion exists', () => {
  assert.deepEqual(buildInbox({ ownerEmail: null, confirmedEmails: [], linkConfirmedEmail: null, linkFailed: false }), []);
});

test('a confirmed link and a failed link each leave their own message', () => {
  const items = buildInbox({ ownerEmail: 'a@b.co', confirmedEmails: [], linkConfirmedEmail: 'c@d.co', linkFailed: true });
  assert.deepEqual(items.map((item) => item.kind), ['link-invalid', 'email-confirmed', 'unconfirmed-email']);
});

test('confirmed emails are normalised, de-duplicated and survive bad storage', () => {
  const once = addConfirmed([], ' Me@Example.com ');
  assert.deepEqual(once, ['me@example.com']);
  assert.equal(addConfirmed(once, 'me@example.com'), once);
  assert.ok(isConfirmed(once, 'ME@example.com'));
  assert.equal(isConfirmed(once, null), false);
  assert.deepEqual(parseConfirmedEmails('not json'), []);
  assert.deepEqual(parseConfirmedEmails('{"a":1}'), []);
  assert.deepEqual(parseConfirmedEmails('["A@b.co", 5]'), ['a@b.co']);
  assert.deepEqual(parseConfirmedEmails(null), []);
});

test('the confirm token is lifted out of the URL so a reload cannot reuse it', () => {
  const taken = takeConfirmToken('https://companion.hashpass.tech/?confirm=abc.def&x=1#top');
  assert.equal(taken.token, 'abc.def');
  assert.equal(taken.cleanHref, '/?x=1#top');
  const none = takeConfirmToken('https://companion.hashpass.tech/?x=1');
  assert.equal(none.token, null);
  assert.equal(none.cleanHref, 'https://companion.hashpass.tech/?x=1');
  assert.equal(takeConfirmToken('https://companion.hashpass.tech/?confirm=').token, null);
});

test('the confirmation endpoint sits beside the auth API, in every environment', () => {
  assert.equal(confirmationEndpoint('https://api.hashpass.tech/api/auth'), 'https://api.hashpass.tech/api/companion/email-confirm');
  assert.equal(confirmationEndpoint('https://api-dev.hashpass.tech/api/auth/'), 'https://api-dev.hashpass.tech/api/companion/email-confirm');
});

test('server codes map to translated messages, unknown ones to the safe fallback', () => {
  assert.equal(errorKeyFor('confirmation_invalid'), 'confirm.error.invalid');
  assert.equal(errorKeyFor('confirmation_locked'), 'confirm.error.locked');
  assert.equal(errorKeyFor('confirmation_rate_limited'), 'confirm.error.rateLimited');
  assert.equal(errorKeyFor('boom'), 'confirm.error.unavailable');
  assert.equal(errorKeyFor(undefined), 'confirm.error.unavailable');
});

const reply = (status, body) => async () => new Response(JSON.stringify(body), { status });

test('callConfirmation posts JSON and returns the proven email', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return new Response(JSON.stringify({ confirmed: true, email: 'me@example.com' })); };
  const result = await callConfirmation('https://x/api/companion/email-confirm', { action: 'verify-code', email: 'me@example.com', code: '123456' }, fetchImpl);
  assert.deepEqual(result, { ok: true, email: 'me@example.com' });
  assert.equal(seen.init.method, 'POST');
  assert.deepEqual(JSON.parse(seen.init.body), { action: 'verify-code', email: 'me@example.com', code: '123456' });
});

test('callConfirmation turns failures, locked codes and network errors into message keys', async () => {
  const payload = { action: 'verify-code', email: 'me@example.com', code: '000000' };
  assert.deepEqual(await callConfirmation('u', payload, reply(403, { error: 'confirmation_invalid' })), { ok: false, errorKey: 'confirm.error.invalid' });
  assert.deepEqual(await callConfirmation('u', payload, reply(429, { error: 'confirmation_locked' })), { ok: false, errorKey: 'confirm.error.locked' });
  assert.deepEqual(await callConfirmation('u', payload, async () => { throw new Error('offline'); }), { ok: false, errorKey: 'confirm.error.unavailable' });
  assert.deepEqual(await callConfirmation('u', payload, async () => new Response('<html>', { status: 502 })), { ok: false, errorKey: 'confirm.error.unavailable' });
});
