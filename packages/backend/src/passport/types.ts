/** Provider adapters supply event metadata only; ticket/email contents stay private. */
export interface PassportField<T> {
  value: T;
  confidence: number;
}

export interface PassportVenue {
  name: string;
  address: string;
}

export interface PassportImportCandidate {
  source: { kind: 'email' | 'url' | 'ics' | 'document'; url?: string };
  title?: PassportField<string>;
  startsAt?: PassportField<string>;
  endsAt?: PassportField<string>;
  timeZone?: PassportField<string>;
  venue?: PassportField<PassportVenue>;
  /** Only a provider's public event page, never a ticket or registration URL. */
  publicEventUrl?: PassportField<string>;
}

export type PassportCorrectionField = 'title' | 'startsAt' | 'endsAt' | 'timeZone' | 'venue' | 'publicEventUrl';

/** A proposed shared identity. Persist only after the import is accepted. */
export interface PassportEventDraft {
  title: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timeZone: string | null;
  venue: PassportVenue | null;
  publicEventUrl: string | null;
  /** A candidate match, never authority to merge events without conflict checks. */
  matchKey: string | null;
}

export interface PassportCapsuleDraft {
  state: 'ready' | 'needs-correction';
  corrections: PassportCorrectionField[];
  confidence: Partial<Record<PassportCorrectionField, number>>;
  event: PassportEventDraft;
  userEvent: {
    ownerId: string;
    visibility: 'private';
    relationship: 'interested';
    trust: 'source-extracted';
    attendanceVerified: false;
    source: PassportImportCandidate['source'];
  };
}
