import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendMemory, createLocalArchive, importArchive, serializeArchive } from '../src/sma/runtime.ts';

test('creates one email-bound Companion archive without exporting the email', async () => {
  const archive = await createLocalArchive('  Owner@Example.com ');
  const exported = serializeArchive(archive);

  assert.equal(archive.ownerEmail, 'owner@example.com');
  assert.match(archive.manifest.agent.did, /^did:hashpass:companion:/);
  assert.match(archive.manifest.agent.controller, /^urn:hashpass:email-sha256:/);
  assert.equal(archive.manifest.memory.sequence, 0);
  assert.doesNotMatch(exported, /owner@example\.com/);
});

test('appends user-approved memory and advances the immutable root', async () => {
  const initial = await createLocalArchive('owner@example.com');
  const archive = await appendMemory(initial, {
    type: 'preference',
    content: 'I prefer concise morning plans.',
    epistemicStatus: 'instructed',
    scope: 'user',
    sensitivity: 'private',
    confidence: 1,
    provenanceMethod: 'user-statement',
  });

  assert.equal(archive.records.length, 1);
  assert.equal(archive.records[0].epistemicStatus, 'instructed');
  assert.equal(archive.manifest.memory.sequence, 1);
  assert.notEqual(archive.manifest.memory.root, initial.manifest.memory.root);
});

test('imports only for the matching email and rejects tampered records', async () => {
  const archive = await appendMemory(await createLocalArchive('owner@example.com'), {
    type: 'preference',
    content: 'Keep the answer short.',
    epistemicStatus: 'instructed',
    scope: 'user',
    sensitivity: 'private',
  });
  const exported = serializeArchive(archive);

  await assert.rejects(() => importArchive(exported, 'other@example.com'), /different email/);
  const tampered = JSON.parse(exported);
  tampered.records[0].content = 'Changed without a correction record.';
  await assert.rejects(() => importArchive(JSON.stringify(tampered), 'owner@example.com'), /integrity|root/);
  const restored = await importArchive(exported, 'owner@example.com');
  assert.equal(restored.records[0].content, 'Keep the answer short.');
});
