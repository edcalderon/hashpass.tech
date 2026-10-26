import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type {
  DoorReadyEventCapsule, DoorReadyFactEvidence, DoorReadyFactField,
  DoorReadyExtractionPayload, DoorReadyFactStatus, DoorReadySourceDocument,
} from '@hashpass/types';
import { decodeDoorReadyExtraction } from './extraction';
import { buildDoorReadyBrief, reconcileDoorReadyCapsule } from './reconcile';

const source = (id: string, userId = 'user-1', kind: DoorReadySourceDocument['kind'] = 'pdf'): DoorReadySourceDocument => ({
  id, userId, kind, name: `${id}.pdf`, sha256: createHash('sha256').update(id).digest('hex'),
  storedObjectRef: `${userId}/${id}`, receivedAt: '2026-10-26T12:00:00.000Z',
  mimeType: kind === 'pdf' ? 'application/pdf' : 'text/plain', byteLength: 42,
});
const fact = (field: DoorReadyFactField, value: string, sourceDocumentId: string, status: DoorReadyFactEvidence['status'] = 'supported'): DoorReadyFactEvidence => ({
  field, proposedValue: value, sourceDocumentId, citationText: `Source says ${value}`,
  status, explanation: null,
});
const payload = (facts: DoorReadyExtractionPayload['facts']): DoorReadyExtractionPayload => ({ facts });
const modelFact = (
  field: DoorReadyFactField,
  value: string | null,
  overrides: Partial<DoorReadyExtractionPayload['facts'][number]> = {},
) => ({
  field, value, citationText: value ? `Visible text: ${value}` : null,
  pageOrRegion: null, status: 'supported' as const, explanation: null, ...overrides,
});
const baseEvidence = (sourceId: string) => [
  fact('title', 'HashPass Builder Summit', sourceId),
  fact('startAt', '2026-10-30T14:00:00.000Z', sourceId),
  fact('timezone', 'America/Bogota', sourceId),
  fact('venue', 'Bogotá Convention Center', sourceId),
];
const capsule = (sourceId: string, owner = 'user-1'): DoorReadyEventCapsule => {
  const result = reconcileDoorReadyCapsule({
    userId: owner, capsuleId: 'capsule-1', source: source(sourceId, owner),
    evidence: baseEvidence(sourceId), receivedAt: '2026-10-26T12:00:00.000Z', isOriginalTicket: true,
  });
  assert.equal(result.kind, 'created');
  return result.capsule;
};

test('20 labeled synthetic extraction fixtures are schema checked without a live model call', async (t) => {
  const fixtures: { name: string; payload: unknown; field: DoorReadyFactField; expected: DoorReadyFactStatus }[] = [
    ...Array.from({ length: 5 }, (_, i) => ({
      name: `clean-${i + 1}`, payload: payload([modelFact('title', `Conference ${i + 1}`)]), field: 'title' as const, expected: 'supported' as const,
    })),
    { name: 'offset-free-time', payload: payload([modelFact('startAt', '2026-10-30T14:00:00', { pageOrRegion: 'page 1' })]), field: 'startAt', expected: 'ambiguous' },
    { name: 'impossible-date', payload: payload([modelFact('startAt', '2026-02-30T14:00:00Z', { pageOrRegion: 'page 1' })]), field: 'startAt', expected: 'ambiguous' },
    { name: 'missing-timezone', payload: payload([modelFact('timezone', 'Mars/Olympus', { pageOrRegion: 'page 1' })]), field: 'timezone', expected: 'ambiguous' },
    { name: 'unsupported-with-value', payload: payload([modelFact('venue', 'Hall A', { status: 'unknown' })]), field: 'venue', expected: 'unknown' },
    { name: 'uncited-fact', payload: payload([modelFact('organizer', 'HASHPASS', { citationText: null })]), field: 'organizer', expected: 'ambiguous' },
    ...Array.from({ length: 5 }, (_, i) => ({
      name: `conflicting-times-${i + 1}`,
      payload: payload([modelFact('startAt', `2026-10-${String(26 + i).padStart(2, '0')}T14:00:00Z`), modelFact('startAt', `2026-10-${String(27 + i).padStart(2, '0')}T14:00:00Z`)]),
      field: 'startAt' as const, expected: 'conflicting' as const,
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      name: `venue-update-${i + 1}`,
      payload: payload([modelFact('venue', `Updated hall ${i + 1}`), modelFact('venue', `Original hall ${i + 1}`)]),
      field: 'venue' as const, expected: 'conflicting' as const,
    })),
  ];
  assert.equal(fixtures.length, 20);
  for (const fixture of fixtures) await t.test(fixture.name, () => {
    const decoded = decodeDoorReadyExtraction(fixture.payload, { id: 'source-a' });
    const evidence = decoded.evidence.filter((entry) => entry.field === fixture.field);
    assert.ok(evidence.length > 0);
    if (fixture.expected === 'conflicting') assert.ok(evidence.every((entry) => entry.status === 'conflicting'));
    else if (fixture.expected === 'ambiguous') assert.ok(evidence.some((entry) => entry.status === 'ambiguous'));
    else assert.ok(evidence.some((entry) => entry.status === fixture.expected));
    assert.ok(decoded.evidence.every((entry) => entry.sourceDocumentId === 'source-a'));
  });
});

test('decoder injects the authenticated source ID and downgrades uncited or invalid facts', () => {
  const decoded = decodeDoorReadyExtraction({
    facts: [
      { ...modelFact('title', 'DoorReady Summit'), sourceDocumentId: 'attacker-source', userId: 'attacker' },
      modelFact('startAt', '2026-10-30T14:00:00', { pageOrRegion: 'page 1' }),
      modelFact('timezone', 'America/Bogota', { citationText: null }),
    ],
  }, { id: 'authenticated-source' });
  assert.deepEqual(decoded.evidence.map(({ sourceDocumentId }) => sourceDocumentId), Array(3).fill('authenticated-source'));
  assert.equal(decoded.evidence[0].status, 'supported');
  assert.equal(decoded.evidence[1].status, 'ambiguous');
  assert.equal(decoded.evidence[2].status, 'ambiguous');
  assert.deepEqual(new Set(decoded.unresolved), new Set(['startAt', 'timezone']));
});

test('decoder rejects unknown fields, malformed envelopes, and oversized provider output', () => {
  assert.throws(() => decodeDoorReadyExtraction(null, { id: 'source-a' }), /schema/);
  assert.throws(() => decodeDoorReadyExtraction({ facts: Array(31).fill(modelFact('title', 'x')) }, { id: 'source-a' }), /Too many/);
  assert.throws(() => decodeDoorReadyExtraction({ facts: [modelFact('passNumber' as DoorReadyFactField, '123')] }, { id: 'source-a' }), /fact/);
});

test('initial capsule keeps issuer artifact bytes and source provenance unchanged', () => {
  const original = source('source-a');
  const result = reconcileDoorReadyCapsule({
    userId: 'user-1', capsuleId: 'capsule-1', source: original,
    evidence: baseEvidence(original.id), receivedAt: '2026-10-26T12:00:00.000Z', isOriginalTicket: true,
  });
  assert.equal(result.kind, 'created');
  assert.equal(result.capsule.schemaVersion, 1);
  assert.equal(result.capsule.trustState, 'source_extracted');
  assert.equal(result.capsule.originalTicketArtifactId, original.id);
  assert.equal(result.capsule.startsAt, '2026-10-30T14:00:00.000Z');
  assert.deepEqual(result.capsule.sourceDocumentIds, [original.id]);
  assert.equal(original.sha256, source('source-a').sha256);
});

test('new capsule marks required missing fields unresolved and never fabricates timezone', () => {
  const result = reconcileDoorReadyCapsule({
    userId: 'user-1', capsuleId: 'capsule-empty', source: source('source-empty'),
    evidence: [fact('title', 'Unknown timezone event', 'source-empty')], receivedAt: '2026-10-26T12:00:00.000Z',
  });
  assert.deepEqual(new Set(result.capsule.unresolved), new Set(['startAt', 'timezone', 'venue']));
  assert.equal(result.capsule.timezone, null);
  assert.equal(result.capsule.trustState, 'source_extracted');
});

test('same-name events are not merged unless the user explicitly selects a capsule', () => {
  const original = capsule('source-a');
  const independent = reconcileDoorReadyCapsule({
    userId: 'user-1', capsuleId: 'capsule-2', source: source('source-b'),
    evidence: baseEvidence('source-b'), receivedAt: '2026-10-26T13:00:00.000Z',
  });
  assert.equal(independent.capsule.id, 'capsule-2');
  assert.equal(independent.capsule.sourceDocumentIds.length, 1);
  const explicitlyLinked = reconcileDoorReadyCapsule({
    userId: 'user-1', capsuleId: original.id, source: source('source-b'),
    evidence: baseEvidence('source-b'), receivedAt: '2026-10-26T13:00:00.000Z', previous: original,
  });
  assert.equal(explicitlyLinked.kind, 'updated');
  assert.equal(explicitlyLinked.capsule.sourceDocumentIds.length, 2);
});

test('later venue or time conflicts keep the prior value and require review', () => {
  const original = capsule('source-a');
  const changeNotice = [fact('venue', 'Riverside Hall', 'source-b'), fact('startAt', '2026-10-30T15:00:00.000Z', 'source-b')];
  const result = reconcileDoorReadyCapsule({
    userId: 'user-1', capsuleId: original.id, source: source('source-b', 'user-1', 'email_text'),
    evidence: changeNotice, receivedAt: '2026-10-29T10:00:00.000Z', previous: original,
  });
  assert.equal(result.capsule.venue, 'Bogotá Convention Center');
  assert.equal(result.capsule.startsAt, '2026-10-30T14:00:00.000Z');
  assert.ok(result.capsule.unresolved.includes('venue'));
  assert.ok(result.capsule.unresolved.includes('startAt'));
  assert.ok(result.capsule.evidence.filter((entry) => ['venue', 'startAt'].includes(entry.field)).some((entry) => entry.status === 'conflicting'));
  assert.equal(original.venue, 'Bogotá Convention Center');
  assert.equal(original.revision, 1);
});

test('a later supported source clears fields that were only missing', () => {
  const first = reconcileDoorReadyCapsule({
    userId: 'user-1', capsuleId: 'capsule-fill', source: source('source-a'),
    evidence: [fact('title', 'Partial import', 'source-a')], receivedAt: '2026-10-26T12:00:00.000Z',
  });
  const second = reconcileDoorReadyCapsule({
    userId: 'user-1', capsuleId: 'capsule-fill', source: source('source-b'),
    evidence: [
      fact('startAt', '2026-10-30T14:00:00.000Z', 'source-b'),
      fact('timezone', 'America/Bogota', 'source-b'),
      fact('venue', 'Bogotá Convention Center', 'source-b'),
    ],
    receivedAt: '2026-10-26T13:00:00.000Z', previous: first.capsule,
  });
  assert.deepEqual(second.capsule.unresolved, []);
});

test('evaluating a conflicting update does not mutate the previous capsule evidence', () => {
  const original = capsule('source-a');
  const before = JSON.stringify(original);
  reconcileDoorReadyCapsule({
    userId: 'user-1', capsuleId: original.id, source: source('source-b', 'user-1', 'email_text'),
    evidence: [fact('venue', 'Riverside Hall', 'source-b')],
    receivedAt: '2026-10-29T10:00:00.000Z', previous: original,
  });
  assert.equal(JSON.stringify(original), before);
  assert.ok(original.evidence.every((entry) => entry.status !== 'conflicting'));
});

test('same-value follow-up adds provenance without an unnecessary conflict', () => {
  const original = capsule('source-a');
  const result = reconcileDoorReadyCapsule({
    userId: 'user-1', capsuleId: original.id, source: source('source-b', 'user-1', 'email_text'),
    evidence: [fact('venue', 'Bogotá Convention Center', 'source-b')],
    receivedAt: '2026-10-29T10:00:00.000Z', previous: original,
  });
  assert.equal(result.capsule.venue, original.venue);
  assert.ok(!result.capsule.unresolved.includes('venue'));
  assert.equal(result.capsule.evidence[result.capsule.evidence.length - 1]?.status, 'supported');
  assert.equal(result.capsule.revision, 2);
});

test('ownership, evidence provenance, hashes and timestamps are enforced', () => {
  assert.throws(() => reconcileDoorReadyCapsule({
    userId: 'user-1', capsuleId: 'capsule-1', source: source('source-a', 'user-2'), evidence: [], receivedAt: '2026-10-26T12:00:00.000Z',
  }), /does not belong/);
  assert.throws(() => reconcileDoorReadyCapsule({
    userId: 'user-1', capsuleId: 'capsule-1', source: { ...source('source-a'), sha256: 'bad' }, evidence: [], receivedAt: '2026-10-26T12:00:00.000Z',
  }), /SHA256/);
  assert.throws(() => reconcileDoorReadyCapsule({
    userId: 'user-1', capsuleId: 'capsule-1', source: source('source-a'),
    evidence: [fact('title', 'Event', 'wrong-source')], receivedAt: '2026-10-26T12:00:00.000Z',
  }), /Evidence source/);
  assert.throws(() => reconcileDoorReadyCapsule({
    userId: 'user-1', capsuleId: 'capsule-1', source: source('source-a'), evidence: [], receivedAt: 'yesterday',
  }), /timestamp/);
  assert.throws(() => reconcileDoorReadyCapsule({
    userId: 'user-1', capsuleId: 'capsule-1', source: source('source-a'), evidence: [], receivedAt: '2026-10-26',
  }), /timestamp/);
  assert.throws(() => reconcileDoorReadyCapsule({
    userId: 'user-1', capsuleId: 'capsule-1', source: source('source-a'), evidence: [], receivedAt: '2026-10-26T12:00:00.000Z', previous: capsule('source-private', 'user-2'),
  }), /Capsule does not belong/);
});

test('source IDs are idempotent and immutable original ticket reference is never replaced', () => {
  const original = capsule('source-a');
  const duplicate = reconcileDoorReadyCapsule({
    userId: 'user-1', capsuleId: original.id, source: source('source-a'), evidence: [],
    receivedAt: '2026-10-27T00:00:00.000Z', previous: original,
  });
  assert.equal(duplicate.kind, 'duplicate');
  assert.equal(duplicate.capsule.revision, 1);
  const followUp = reconcileDoorReadyCapsule({
    userId: 'user-1', capsuleId: original.id, source: source('source-c', 'user-1', 'image'),
    evidence: [], receivedAt: '2026-10-28T00:00:00.000Z', isOriginalTicket: true, previous: original,
  });
  assert.equal(followUp.capsule.originalTicketArtifactId, 'source-a');
});

test('readiness brief cites supported fields and refuses missing ticket or conflicts', () => {
  const original = capsule('source-a');
  const brief = buildDoorReadyBrief(original);
  assert.equal(brief.issuerUnverified, true);
  assert.equal(brief.readyForDoor, true);
  assert.ok(brief.facts.every((entry) => entry.sourceDocumentId === 'source-a' && entry.citationText));
  const followUp = reconcileDoorReadyCapsule({
    userId: 'user-1', capsuleId: original.id, source: source('source-b', 'user-1', 'email_text'),
    evidence: [fact('venue', 'Changed Hall', 'source-b')], receivedAt: '2026-10-29T00:00:00.000Z', previous: original,
  });
  assert.equal(buildDoorReadyBrief(followUp.capsule).readyForDoor, false);
  assert.equal(buildDoorReadyBrief({ ...original, originalTicketArtifactId: null }).readyForDoor, false);
});
