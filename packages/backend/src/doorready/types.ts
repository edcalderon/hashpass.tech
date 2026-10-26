import type {
  DoorReadyEventCapsule, DoorReadyFactEvidence, DoorReadyFactField, DoorReadySourceDocument,
} from '@hashpass/types';

export interface DoorReadyDecodedExtraction {
  evidence: DoorReadyFactEvidence[];
  unresolved: DoorReadyFactField[];
}

export interface ReconcileDoorReadyInput {
  userId: string;
  capsuleId: string;
  source: DoorReadySourceDocument;
  evidence: DoorReadyFactEvidence[];
  receivedAt: string;
  /** The user explicitly identifies this original issuer artifact. */
  isOriginalTicket?: boolean;
  previous?: DoorReadyEventCapsule;
}

export type ReconcileDoorReadyResult =
  | { kind: 'created' | 'updated'; capsule: DoorReadyEventCapsule }
  | { kind: 'duplicate'; capsule: DoorReadyEventCapsule };
