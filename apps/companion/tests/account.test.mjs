import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountSummary, initialsFor, inboxOwnerEmail, isConnected } from '../src/account/model.ts';

const archive = (email) => ({ ownerEmail: email, manifest: { archiveId: 'sma:abc' }, soul: {}, records: [{}, {}] });
const authUser = { id: 'u1', email: 'ana@hashpass.tech', name: 'Ana Pérez', image: 'https://example.com/a.png' };

test('nobody connected means no account and no inbox', () => {
  assert.equal(isConnected({ authUser: null, archive: null }), false);
  assert.equal(buildAccountSummary({ authUser: null, archive: null, setupEmailConfirmed: false }), null);
});

test('a setup email alone is an account with an unconfirmed identity until confirmed', () => {
  const pending = buildAccountSummary({ authUser: null, archive: archive('me@example.com'), setupEmailConfirmed: false });
  assert.deepEqual(pending.identities, [{ kind: 'email', email: 'me@example.com', status: 'unconfirmed' }]);
  assert.equal(pending.displayName, 'me');
  assert.equal(pending.initials, 'ME');
  assert.equal(pending.memoryCount, 2);
  const done = buildAccountSummary({ authUser: null, archive: archive('me@example.com'), setupEmailConfirmed: true });
  assert.equal(done.identities[0].status, 'confirmed');
});

test('a HASHPASS ID session shows its name and picture and needs no archive', () => {
  const summary = buildAccountSummary({ authUser, archive: null, setupEmailConfirmed: false });
  assert.equal(summary.displayName, 'Ana Pérez');
  assert.equal(summary.image, 'https://example.com/a.png');
  assert.equal(summary.initials, 'AP');
  assert.equal(summary.archiveId, null);
  assert.deepEqual(summary.identities, [{ kind: 'hashpass-id', email: 'ana@hashpass.tech', status: 'verified' }]);
});

test('the same email under both identities is listed once, as verified', () => {
  const summary = buildAccountSummary({ authUser, archive: archive('ANA@hashpass.tech'), setupEmailConfirmed: false });
  assert.equal(summary.identities.length, 1);
  assert.equal(summary.identities[0].kind, 'hashpass-id');
});

test('a different setup email is listed next to the HASHPASS ID', () => {
  const summary = buildAccountSummary({ authUser, archive: archive('other@example.com'), setupEmailConfirmed: false });
  assert.deepEqual(summary.identities.map((i) => i.kind), ['hashpass-id', 'email']);
});

test('the inbox skips a setup email that the signed-in HASHPASS ID already proves', () => {
  assert.equal(inboxOwnerEmail('Ana@hashpass.tech', 'ana@hashpass.tech'), null);
  assert.equal(inboxOwnerEmail('me@example.com', 'ana@hashpass.tech'), 'me@example.com');
  assert.equal(inboxOwnerEmail('me@example.com', null), 'me@example.com');
  assert.equal(inboxOwnerEmail(null, 'ana@hashpass.tech'), null);
});

test('initials fall back to the email and never come back empty', () => {
  assert.equal(initialsFor(undefined, 'zoe@x.io'), 'ZO');
  assert.equal(initialsFor('Cher', 'c@x.io'), 'CH');
  assert.equal(initialsFor('  ', '+@x.io'), '?');
});
