import type { SpeakerDirectoryStatus } from './speaker-status.types';

export type SpeakerBadgeStatus = Exclude<SpeakerDirectoryStatus, 'private'> | 'past';

export interface SpeakerStatusBadgeProps {
  status: SpeakerBadgeStatus;
  /** Replaces the default label, e.g. "Online" on the detail screen. */
  label?: string;
  isDark?: boolean;
}
