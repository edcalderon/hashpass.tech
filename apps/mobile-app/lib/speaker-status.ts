import type {
  SpeakerActivationRecord,
  SpeakerDirectoryState,
  SpeakerDirectoryStatus,
} from '../types/speaker-status.types';

export type {
  SpeakerActivationRecord,
  SpeakerDirectoryState,
  SpeakerDirectoryStatus,
} from '../types/speaker-status.types';

/**
 * Public speaker states:
 * - active: confirmed (claimed) account that is receiving meeting requests.
 * - passive: imported profile whose speaker has not claimed an account yet. It
 *   still receives requests, which expire if the speaker never claims it.
 * - dnd: confirmed account in do-not-disturb mode. Requests are accepted but
 *   archived instead of surfacing directly, like phone notifications.
 * The profile id remains the stable meeting-request target; requests are
 * relinked to the account when the speaker claims it.
 */
export function isClaimedActiveSpeaker(speaker: SpeakerActivationRecord): boolean {
  const isClaimed = typeof speaker.user_id === 'string' && speaker.user_id.trim().length > 0;
  return isClaimed && (speaker.is_active === true || speaker.isActive === true);
}

export function getSpeakerDirectoryState(speaker: SpeakerActivationRecord): SpeakerDirectoryState {
  const isPublished = speaker.directory_visible === true;
  const isClaimed = typeof speaker.user_id === 'string' && speaker.user_id.trim().length > 0;
  const isNetworkingActive = isClaimedActiveSpeaker(speaker);
  // Imported profiles remain requestable while waiting for their owner to
  // claim them. This is the passive directory state: the profile is visible
  // and requestable, but no speaker account has claimed it yet.
  const isPassive = isPublished && !isClaimed;
  const isDoNotDisturb = isNetworkingActive && (speaker.do_not_disturb === true || speaker.doNotDisturb === true);
  const isAcceptingMeetings = isPassive || (isNetworkingActive && speaker.is_accepting_meetings !== false);

  return {
    isPublished,
    isClaimed,
    isNetworkingActive,
    isAcceptingMeetings,
    archivesRequests: isDoNotDisturb && isAcceptingMeetings,
    status: !isPublished
      ? 'private'
      : isPassive
        ? 'passive'
        : isNetworkingActive
          ? (isDoNotDisturb ? 'dnd' : 'active')
          : 'inactive',
  };
}
