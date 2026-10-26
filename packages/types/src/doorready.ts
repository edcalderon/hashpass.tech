/** DoorReady v1 data contract. All records and artifact references are private to one user. */
export type DoorReadyArtifactKind = 'email_text' | 'pdf' | 'image';
export type DoorReadyFactStatus = 'supported' | 'ambiguous' | 'conflicting' | 'unknown';
export type DoorReadyTrustState = 'user_imported' | 'source_extracted' | 'issuer_confirmed' | 'attendance_verified';
export type DoorReadyFactField = 'title' | 'startAt' | 'endAt' | 'timezone' | 'venue' | 'organizer';

export interface DoorReadySourceDocument {
  id: string;
  userId: string;
  kind: DoorReadyArtifactKind;
  name: string;
  sha256: string;
  storedObjectRef: string;
  receivedAt: string;
  sourceIssuedAt?: string | null;
  mimeType: string;
  byteLength: number;
}

export interface DoorReadyFactEvidence {
  field: DoorReadyFactField;
  proposedValue: string | null;
  sourceDocumentId: string;
  citationText?: string | null;
  pageOrRegion?: string | null;
  status: DoorReadyFactStatus;
  explanation?: string | null;
}

export interface DoorReadyEventCapsule {
  schemaVersion: 1;
  id: string;
  userId: string;
  revision: number;
  title: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;
  venue: string | null;
  organizer: string | null;
  trustState: DoorReadyTrustState;
  sourceDocumentIds: string[];
  evidence: DoorReadyFactEvidence[];
  originalTicketArtifactId: string | null;
  unresolved: DoorReadyFactField[];
  createdAt: string;
  updatedAt: string;
}

/** Raw model output. The server assigns sourceDocumentId after validation. */
export interface DoorReadyExtractionPayload {
  facts: {
    field: DoorReadyFactField;
    value: string | null;
    citationText: string | null;
    pageOrRegion: string | null;
    status: DoorReadyFactStatus;
    explanation: string | null;
  }[];
}
