import { createHash } from 'node:crypto';
import type {
  PassportCapsuleDraft, PassportCorrectionField, PassportField,
  PassportImportCandidate, PassportVenue,
} from './types';

const MAX_TEXT = 500;

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= MAX_TEXT && !/[\u0000-\u001f\u007f]/.test(trimmed) ? trimmed : null;
}

function instant(value: unknown): string | null {
  // Never interpret an offset-free input using the server's local timezone.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return null;
  const day = value.slice(0, 10);
  const calendarDate = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(calendarDate.getTime()) || calendarDate.toISOString().slice(0, 10) !== day) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function zone(value: unknown): string | null {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    return new Intl.DateTimeFormat('en', { timeZone: candidate }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

function venue(value: unknown): PassportVenue | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as PassportVenue;
  const name = text(candidate.name);
  const address = text(candidate.address);
  return name && address ? { name, address } : null;
}

function publicUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    // Fail closed rather than accidentally publishing ticket credentials.
    // Query-based public event identities need a reviewed provider adapter.
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Normalize a provider adapter's extraction into a private Capsule draft.
 * No network, persistence, issuer confirmation, or attendance claim occurs here.
 * The initial 0.9 threshold is configurable pending pilot accuracy evidence.
 */
export function normalizePassportImport(
  candidate: PassportImportCandidate,
  ownerId: string,
  minimumConfidence = 0.9,
): PassportCapsuleDraft {
  if (!ownerId.trim()) throw new Error('An authenticated owner is required');
  if (!Number.isFinite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 1) {
    throw new Error('Confidence threshold must be between zero and one');
  }
  if (!['email', 'url', 'ics', 'document'].includes(candidate.source.kind)) throw new Error('Unsupported capture source');
  const corrections: PassportCorrectionField[] = [];
  const confidence: PassportCapsuleDraft['confidence'] = {};
  function read<T>(key: PassportCorrectionField, field: PassportField<T> | undefined, parse: (value: T) => T | null, required = true): T | null {
    if (!field) {
      if (required) corrections.push(key);
      return null;
    }
    const score = field.confidence;
    const validScore = Number.isFinite(score) && score >= 0 && score <= 1;
    if (validScore) confidence[key] = score;
    const value = parse(field.value);
    if (!value || !validScore || score < minimumConfidence) corrections.push(key);
    return value;
  }
  const title = read('title', candidate.title, text);
  const startsAt = read('startsAt', candidate.startsAt, instant);
  let endsAt = read('endsAt', candidate.endsAt, instant, false);
  const timeZone = read('timeZone', candidate.timeZone, zone);
  const place = read('venue', candidate.venue, venue);
  const publicEventUrl = read('publicEventUrl', candidate.publicEventUrl, publicUrl, false);
  if (endsAt && startsAt && endsAt <= startsAt) {
    endsAt = null;
    if (!corrections.includes('endsAt')) corrections.push('endsAt');
  }
  // A bare URL or similar title must never collapse different event editions.
  const matchKey = corrections.length === 0 && title && startsAt && timeZone && place && publicEventUrl
    ? createHash('sha256').update(JSON.stringify([publicEventUrl, startsAt, title.toLowerCase(), place.name.toLowerCase(), place.address.toLowerCase()])).digest('hex')
    : null;
  return {
    state: corrections.length ? 'needs-correction' : 'ready',
    corrections,
    confidence,
    event: { title, startsAt, endsAt, timeZone, venue: place, publicEventUrl, matchKey },
    userEvent: {
      ownerId, visibility: 'private', relationship: 'interested',
      trust: 'source-extracted', attendanceVerified: false,
      // Source URLs may contain private ticket tokens: never copy into Event.
      source: { kind: candidate.source.kind, ...(candidate.source.url ? { url: candidate.source.url } : {}) },
    },
  };
}
