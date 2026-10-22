/**
 * Public speaker states:
 * - active: confirmed (claimed) account that is receiving meeting requests.
 * - idle: imported profile whose speaker has not claimed an account yet. It
 *   still receives requests, which expire if the speaker never claims it.
 * - dnd: confirmed account in do-not-disturb mode. Requests are accepted but
 *   archived instead of surfacing directly, like phone notifications.
 * The profile id remains the stable meeting-request target; requests are
 * relinked to the account when the speaker claims it.
 */
export interface SpeakerActivationRecord {
  directory_visible?: boolean | null;
  is_active?: boolean | null;
  isActive?: boolean | null;
  is_accepting_meetings?: boolean | null;
  user_id?: string | null;
  do_not_disturb?: boolean | null;
  doNotDisturb?: boolean | null;
}

export function isClaimedActiveSpeaker(speaker: SpeakerActivationRecord): boolean {
  const isClaimed = typeof speaker.user_id === 'string' && speaker.user_id.trim().length > 0;
  return isClaimed && (speaker.is_active === true || speaker.isActive === true);
}

export type SpeakerDirectoryStatus = 'private' | 'inactive' | 'idle' | 'active' | 'dnd';

export interface SpeakerDirectoryState {
  isPublished: boolean;
  isClaimed: boolean;
  isNetworkingActive: boolean;
  isAcceptingMeetings: boolean;
  /** Requests are accepted but archived rather than shown to the speaker. */
  archivesRequests: boolean;
  status: SpeakerDirectoryStatus;
}

export function getSpeakerDirectoryState(speaker: SpeakerActivationRecord): SpeakerDirectoryState {
  const isPublished = speaker.directory_visible === true;
  const isClaimed = typeof speaker.user_id === 'string' && speaker.user_id.trim().length > 0;
  const isNetworkingActive = isClaimedActiveSpeaker(speaker);
  // Imported profiles remain requestable while waiting for their owner to
  // claim them. This also handles legacy rows backfilled with
  // is_accepting_meetings=false before idle was defined.
  const isIdle = isPublished && !isClaimed;
  const isDoNotDisturb = isNetworkingActive && (speaker.do_not_disturb === true || speaker.doNotDisturb === true);
  const isAcceptingMeetings = isIdle || (isNetworkingActive && speaker.is_accepting_meetings !== false);

  return {
    isPublished,
    isClaimed,
    isNetworkingActive,
    isAcceptingMeetings,
    archivesRequests: isDoNotDisturb && isAcceptingMeetings,
    status: !isPublished
      ? 'private'
      : isIdle
        ? 'idle'
        : isNetworkingActive
          ? (isDoNotDisturb ? 'dnd' : 'active')
          : 'inactive',
  };
}
