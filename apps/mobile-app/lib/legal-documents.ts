import { useEffect, useState } from 'react';
import { GENERATED_LEGAL_DOCUMENTS } from '../generated/legal-documents';

export type LegalDocumentType = 'privacy' | 'terms';

export type LegalDocumentBlock =
  | { type: 'heading' | 'paragraph' | 'quote'; text: string }
  | { type: 'list'; items: string[] };

export interface LegalDocument {
  id: LegalDocumentType;
  title: string;
  description: string;
  revision: string;
  sourcePath: string;
  sourceUrl: string;
  blocks: LegalDocumentBlock[];
}

const CANONICAL_CONTENT_BASE_URL =
  'https://hashpass.club/documentation/legal-content';

const bundledDocuments = GENERATED_LEGAL_DOCUMENTS as unknown as Record<
  LegalDocumentType,
  LegalDocument
>;

const LEGAL_REVISION_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

function legalRevisionTimestamp(revision: string): number | null {
  const match = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(revision);
  if (!match) return null;

  const month = LEGAL_REVISION_MONTHS.indexOf(
    match[2] as (typeof LEGAL_REVISION_MONTHS)[number],
  );
  if (month < 0) return null;

  const day = Number(match[1]);
  const year = Number(match[3]);
  const timestamp = Date.UTC(year, month, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return timestamp;
}

function isNewerThan(
  candidate: LegalDocument,
  baseline: LegalDocument,
): boolean {
  const candidateRevision = legalRevisionTimestamp(candidate.revision);
  const baselineRevision = legalRevisionTimestamp(baseline.revision);
  return (
    candidateRevision !== null &&
    baselineRevision !== null &&
    candidateRevision > baselineRevision
  );
}

export function isLegalDocument(
  value: unknown,
  expectedType: LegalDocumentType,
): value is LegalDocument {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<LegalDocument>;
  return (
    candidate.id === expectedType &&
    typeof candidate.title === 'string' &&
    typeof candidate.revision === 'string' &&
    typeof candidate.sourceUrl === 'string' &&
    Array.isArray(candidate.blocks) &&
    candidate.blocks.every((block) => {
      if (!block || typeof block !== 'object' || !('type' in block)) return false;
      if (block.type === 'list') {
        return (
          'items' in block &&
          Array.isArray(block.items) &&
          block.items.every((item) => typeof item === 'string')
        );
      }
      return (
        ['heading', 'paragraph', 'quote'].includes(String(block.type)) &&
        'text' in block &&
        typeof block.text === 'string'
      );
    })
  );
}

export function getBundledLegalDocument(type: LegalDocumentType): LegalDocument {
  return bundledDocuments[type];
}

export async function fetchCanonicalLegalDocument(
  type: LegalDocumentType,
  signal?: AbortSignal,
): Promise<LegalDocument> {
  // This is a public, cross-origin static document, not an application API;
  // apiClient would incorrectly prefix it with the tenant API base URL.
  const response = await globalThis.fetch(`${CANONICAL_CONTENT_BASE_URL}/${type}.json`, {
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Canonical legal content returned HTTP ${response.status}`);
  }

  const document: unknown = await response.json();
  if (!isLegalDocument(document, type)) {
    throw new Error('Canonical legal content has an invalid shape');
  }

  return document;
}

export function useCanonicalLegalDocument(
  type: LegalDocumentType,
  active = true,
): LegalDocument {
  const [document, setDocument] = useState(() => getBundledLegalDocument(type));

  useEffect(() => {
    const bundledDocument = getBundledLegalDocument(type);
    setDocument(bundledDocument);
    if (!active) return undefined;

    const controller = new AbortController();
    fetchCanonicalLegalDocument(type, controller.signal)
      .then((canonicalDocument) => {
        if (isNewerThan(canonicalDocument, bundledDocument)) {
          setDocument(canonicalDocument);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        // The generated bundle is deliberately the offline/error fallback.
        // Avoid replacing binding copy with a partial or malformed response.
        console.warn('[Legal] Using bundled canonical document fallback.', error);
      });

    return () => controller.abort();
  }, [active, type]);

  return document;
}
