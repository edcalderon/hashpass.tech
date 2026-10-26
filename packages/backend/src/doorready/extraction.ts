import type {
  DoorReadyArtifactKind, DoorReadyExtractionPayload, DoorReadyFactEvidence,
  DoorReadyFactField, DoorReadyFactStatus, DoorReadySourceDocument,
} from '@hashpass/types';
import type { DoorReadyDecodedExtraction } from './types';

const FIELDS = new Set<DoorReadyFactField>(['title', 'startAt', 'endAt', 'timezone', 'venue', 'organizer']);
const STATUSES = new Set<DoorReadyFactStatus>(['supported', 'ambiguous', 'conflicting', 'unknown']);
const MAX_CITATION = 500;

function boundedString(value: unknown, max = MAX_CITATION): string | null {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    ? value.trim()
    : null;
}

function normalizeDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return null;
  const datePart = value.slice(0, 10);
  const calendarDate = new Date(`${datePart}T00:00:00Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== datePart) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function normalizeValue(field: DoorReadyFactField, value: unknown): string | null {
  if (value === null) return null;
  const string = boundedString(value, field === 'venue' ? 500 : 300);
  if (!string) return null;
  if (field === 'startAt' || field === 'endAt') return normalizeDate(string);
  if (field === 'timezone') {
    try { return new Intl.DateTimeFormat('en', { timeZone: string }).resolvedOptions().timeZone; }
    catch { return null; }
  }
  return string;
}

/**
 * Validate untrusted provider JSON before it enters a capsule. Source ownership
 * and provenance are always assigned from the authenticated request/document,
 * never from model output.
 */
export function decodeDoorReadyExtraction(
  payload: unknown,
  source: Pick<DoorReadySourceDocument, 'id'>,
): DoorReadyDecodedExtraction {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { facts?: unknown }).facts)) {
    throw new Error('Invalid DoorReady extraction schema');
  }
  const facts = (payload as DoorReadyExtractionPayload).facts;
  if (facts.length > 30) throw new Error('Too many extracted facts');
  const evidence: DoorReadyFactEvidence[] = [];
  const unresolved = new Set<DoorReadyFactField>();
  const seen = new Map<DoorReadyFactField, Set<string>>();

  for (const raw of facts) {
    if (!raw || typeof raw !== 'object' || !FIELDS.has(raw.field) || !STATUSES.has(raw.status)) {
      throw new Error('Invalid DoorReady fact');
    }
    let value = normalizeValue(raw.field, raw.value);
    let status = raw.status;
    let explanation = boundedString(raw.explanation, 500);
    const citationText = boundedString(raw.citationText);
    const pageOrRegion = boundedString(raw.pageOrRegion, 100);

    if (raw.status === 'unknown') value = null;
    if (raw.value !== null && value === null && raw.status !== 'unknown') {
      status = 'ambiguous';
      unresolved.add(raw.field);
      explanation ??= 'The extracted value is invalid or incomplete and needs review.';
    }
    if (status === 'supported' && !citationText && !pageOrRegion) {
      status = 'ambiguous';
      unresolved.add(raw.field);
      explanation ??= 'No source citation was provided.';
    }
    if (status !== 'supported') unresolved.add(raw.field);
    if (raw.field === 'startAt' && status === 'supported') {
      const values = seen.get('startAt') ?? new Set<string>();
      values.add(value!);
      seen.set('startAt', values);
    } else if (status === 'supported' && value !== null) {
      const values = seen.get(raw.field) ?? new Set<string>();
      values.add(value);
      seen.set(raw.field, values);
    }
    evidence.push({
      field: raw.field,
      proposedValue: value,
      sourceDocumentId: source.id,
      citationText,
      pageOrRegion,
      status,
      explanation,
    });
  }

  for (const [field, values] of seen) {
    if (values.size > 1) {
      unresolved.add(field);
      for (const fact of evidence) if (fact.field === field && fact.status === 'supported') {
        fact.status = 'conflicting';
        fact.explanation ??= 'The source contains multiple different values for this field.';
      }
    }
  }

  return { evidence, unresolved: [...unresolved] };
}

export function isSupportedDoorReadyArtifact(kind: unknown): kind is DoorReadyArtifactKind {
  return kind === 'email_text' || kind === 'pdf' || kind === 'image';
}
