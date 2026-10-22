export type SpeakerClaimMode = 'current_email' | 'other_email';

export type SpeakerClaimSubmission = { mode: SpeakerClaimMode; email: string; note: string };

export type SpeakerClaimStep = 'choose' | 'current_email' | 'other_email' | 'sent';

export interface SpeakerClaimModalProps {
  visible: boolean;
  speakerName: string;
  /** Email of the signed-in account. */
  currentEmail?: string | null;
  isDark?: boolean;
  /** Resolves when the claim was accepted; throws a readable error otherwise. */
  onSubmit: (submission: SpeakerClaimSubmission) => Promise<void>;
  onClose: () => void;
}

/** Shape returned by the claim RPCs (submit / verify). */
export type SpeakerClaimResult = {
  claim_id?: string;
  speaker_name?: string;
  claim_email?: string | null;
  request_note?: string | null;
  verification_status?: string;
  created?: boolean;
  reviewer_ids?: string[];
};
