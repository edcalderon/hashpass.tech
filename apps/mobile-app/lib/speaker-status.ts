/**
 * BSL publishes imported speakers as active networking profiles before they
 * claim an account. The profile id remains the stable meeting-request target;
 * pending requests are relinked to the account when the speaker claims it.
 */
export interface SpeakerActivationRecord {
  directory_visible?: boolean | null;
  is_active?: boolean | null;
  isActive?: boolean | null;
  is_accepting_meetings?: boolean | null;
  user_id?: string | null;
}

export function isClaimedActiveSpeaker(speaker: SpeakerActivationRecord): boolean {
  return speaker.is_active === true || speaker.isActive === true;
}

export type SpeakerDirectoryStatus = 'private' | 'unclaimed' | 'claimed' | 'active';

export interface SpeakerDirectoryState {
  isPublished: boolean;
  isClaimed: boolean;
  isNetworkingActive: boolean;
  isAcceptingMeetings: boolean;
  status: SpeakerDirectoryStatus;
}

export function getSpeakerDirectoryState(speaker: SpeakerActivationRecord): SpeakerDirectoryState {
  const isPublished = speaker.directory_visible === true;
  const isClaimed = typeof speaker.user_id === 'string' && speaker.user_id.trim().length > 0;
  const isNetworkingActive = isClaimedActiveSpeaker(speaker);
  // Imported profiles are deliberately meeting-eligible before claiming.
  // `is_accepting_meetings=false` from V112 is legacy data superseded by V114.
  const isAcceptingMeetings = isNetworkingActive;

  return {
    isPublished,
    isClaimed,
    isNetworkingActive,
    isAcceptingMeetings,
    status: !isPublished
      ? 'private'
      : isNetworkingActive
        ? 'active'
        : isClaimed
          ? 'claimed'
          : 'unclaimed',
  };
}
