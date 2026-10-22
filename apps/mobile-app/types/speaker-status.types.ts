export interface SpeakerActivationRecord {
  directory_visible?: boolean | null;
  is_active?: boolean | null;
  isActive?: boolean | null;
  is_accepting_meetings?: boolean | null;
  user_id?: string | null;
  do_not_disturb?: boolean | null;
  doNotDisturb?: boolean | null;
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
