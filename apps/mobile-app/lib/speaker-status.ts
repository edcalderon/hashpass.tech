/**
 * A speaker is available for attendee networking only after their profile is
 * enabled and an authenticated account has claimed it. `is_active` alone is
 * not sufficient because legacy/imported speaker records default to true.
 */
export interface SpeakerActivationRecord {
  is_active?: boolean | null;
  user_id?: string | null;
}

export function isClaimedActiveSpeaker(speaker: SpeakerActivationRecord): boolean {
  return speaker.is_active === true
    && typeof speaker.user_id === 'string'
    && speaker.user_id.trim().length > 0;
}
