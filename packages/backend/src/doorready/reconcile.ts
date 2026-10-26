import type {
  DoorReadyEventCapsule, DoorReadyFactEvidence, DoorReadyFactField,
} from '@hashpass/types';
import type { ReconcileDoorReadyInput, ReconcileDoorReadyResult } from './types';

const FIELD_TO_CAPSULE: Record<DoorReadyFactField, keyof Pick<DoorReadyEventCapsule, 'title' | 'startsAt' | 'endsAt' | 'timezone' | 'venue' | 'organizer'>> = {
  title: 'title', startAt: 'startsAt', endAt: 'endsAt', timezone: 'timezone', venue: 'venue', organizer: 'organizer',
};

function lastMatchingEvidence(
  evidence: DoorReadyFactEvidence[],
  matches: (fact: DoorReadyFactEvidence) => boolean,
): DoorReadyFactEvidence | undefined {
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    if (matches(evidence[index])) return evidence[index];
  }
  return undefined;
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return false;
  const day = value.slice(0, 10);
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(new Date(value).getTime()) && date.toISOString().slice(0, 10) === day;
}

/**
 * Reconcile only within an explicitly selected, already-owned capsule. This
 * function never searches or auto-merges same-name events across a user's list.
 * Conflicting updates keep the prior value and require a user decision.
 */
export function reconcileDoorReadyCapsule(input: ReconcileDoorReadyInput): ReconcileDoorReadyResult {
  const { userId, capsuleId, source, evidence, receivedAt, previous } = input;
  if (!userId || !capsuleId || source.userId !== userId) throw new Error('Source does not belong to the authenticated user');
  if (!/^[a-f\d]{64}$/i.test(source.sha256)) throw new Error('Source SHA256 is invalid');
  if (!isIsoTimestamp(receivedAt) || !isIsoTimestamp(source.receivedAt)) throw new Error('Received timestamp is invalid');
  if (previous && previous.userId !== userId) throw new Error('Capsule does not belong to the authenticated user');
  // Source-ID deduplication is authoritative here. Persisted SHA deduplication
  // is checked by the repository before calling this domain function.
  if (previous?.sourceDocumentIds.includes(source.id)) return { kind: 'duplicate', capsule: previous };
  for (const fact of evidence) {
    if (fact.sourceDocumentId !== source.id) throw new Error('Evidence source does not match the imported document');
  }

  const created = !previous;
  const capsule: DoorReadyEventCapsule = previous
    ? { ...previous, sourceDocumentIds: [...previous.sourceDocumentIds], evidence: [...previous.evidence], unresolved: [...previous.unresolved] }
    : {
      schemaVersion: 1, id: capsuleId, userId, revision: 0,
      title: null, startsAt: null, endsAt: null, timezone: null, venue: null, organizer: null,
      trustState: 'user_imported', sourceDocumentIds: [], evidence: [],
      originalTicketArtifactId: null, unresolved: [], createdAt: receivedAt, updatedAt: receivedAt,
    };

  if (capsule.sourceDocumentIds.includes(source.id)) return { kind: 'duplicate', capsule: previous! };
  capsule.sourceDocumentIds.push(source.id);
  capsule.evidence.push(...evidence.map((fact) => ({ ...fact })));

  const unresolved = new Set(capsule.unresolved);
  for (const fact of evidence) {
    if (fact.status !== 'supported' || fact.proposedValue === null) {
      unresolved.add(fact.field);
      continue;
    }
    const field = FIELD_TO_CAPSULE[fact.field];
    const current = capsule[field];
    if (current === null) {
      (capsule[field] as string | null) = fact.proposedValue;
      continue;
    }
    if (current !== fact.proposedValue) {
      unresolved.add(fact.field);
      for (const prior of capsule.evidence) {
        if (prior.field === fact.field && prior.status === 'supported' && prior.proposedValue !== fact.proposedValue) {
          prior.status = 'conflicting';
          prior.explanation ??= 'A later source proposes a different value; user confirmation is required.';
        }
      }
      const latest = lastMatchingEvidence(capsule.evidence, (candidate) =>
        candidate.sourceDocumentId === source.id && candidate.field === fact.field && candidate.proposedValue === fact.proposedValue);
      if (latest?.status === 'supported') {
        latest.status = 'conflicting';
        latest.explanation ??= 'A later source proposes a different value; user confirmation is required.';
      }
    }
  }

  if (capsule.startsAt && capsule.endsAt && capsule.endsAt <= capsule.startsAt) {
    unresolved.add('endAt');
    const endField = lastMatchingEvidence(capsule.evidence, (fact) => fact.field === 'endAt');
    if (endField) {
      endField.status = 'ambiguous';
      endField.explanation ??= 'End time must follow the event start time.';
    }
    capsule.endsAt = previous?.endsAt ?? null;
  }

  for (const fact of evidence) if (fact.status !== 'supported') unresolved.add(fact.field);
  for (const [field, value] of [
    ['title', capsule.title], ['startAt', capsule.startsAt], ['timezone', capsule.timezone], ['venue', capsule.venue],
  ] as const) if (value === null) unresolved.add(field);
  capsule.unresolved = [...unresolved];
  if (evidence.length > 0) capsule.trustState = 'source_extracted';
  capsule.revision += 1;
  capsule.updatedAt = receivedAt;
  if (input.isOriginalTicket && !capsule.originalTicketArtifactId) capsule.originalTicketArtifactId = source.id;
  return { kind: created ? 'created' : 'updated', capsule };
}

/** A deterministic brief cites only source-backed facts and names every unresolved item. */
export function buildDoorReadyBrief(capsule: DoorReadyEventCapsule) {
  const fields = capsule.evidence
    .filter((fact) => fact.status === 'supported' && fact.proposedValue !== null)
    .map(({ field, proposedValue, sourceDocumentId, citationText, pageOrRegion }) => ({
      field, value: proposedValue!, sourceDocumentId, citationText: citationText ?? null, pageOrRegion: pageOrRegion ?? null,
    }));
  return {
    title: capsule.title,
    issuerUnverified: true as const,
    readyForDoor: capsule.unresolved.length === 0 && Boolean(
      capsule.title && capsule.startsAt && capsule.timezone && capsule.venue && capsule.originalTicketArtifactId,
    ),
    unresolved: [...capsule.unresolved],
    facts: fields,
    originalTicketArtifactId: capsule.originalTicketArtifactId,
  };
}
