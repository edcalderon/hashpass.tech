import type { CoffeeDuration, MeetingKind } from '../lib/meeting-rules.types';

export type BoostTierId = 'standard' | 'boosted' | 'priority' | 'high' | 'top';

export type MeetingRequestSheetProps = {
  open: boolean;
  onClose: () => void;
  speakerName: string;
  message: string;
  onMessageChange: (value: string) => void;
  intentions: string[];
  onIntentionsChange: (value: string[]) => void;
  boostAmount: number;
  onBoostChange: (value: number) => void;
  remainingBoost: number;
  submitting: boolean;
  onSubmit: () => void;
  /** Quick stand-up (default) or coffee break. */
  meetingType: MeetingKind;
  onMeetingTypeChange: (value: MeetingKind) => void;
  /** Chosen coffee length; only used while `meetingType` is coffee. */
  coffeeMinutes: CoffeeDuration;
  onCoffeeMinutesChange: (value: CoffeeDuration) => void;
  /** Coffee breaks are for business and VIP passes. */
  coffeeAllowed: boolean;
};

export type BoostBarProps = {
  value: number;
  max: number;
  onChange: (value: number) => void;
  label: string;
  valueText: string;
};
