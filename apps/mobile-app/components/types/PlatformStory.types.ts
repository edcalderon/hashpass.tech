export type PlatformStoryCardId =
  | 'lifecycle'
  | 'membership'
  | 'eventTools'
  | 'sharingTools'
  | 'surfaces'
  | 'languages'
  | 'truthful'
  | 'private'
  | 'open';

export type PlatformStoryCardDefinition = {
  id: PlatformStoryCardId;
  icon:
    | 'people-outline'
    | 'key'
    | 'calendar-days'
    | 'qr-code-outline'
    | 'monitor-smartphone'
    | 'globe-2'
    | 'shield-checkmark';
  accentColor: string;
};

export type PlatformStoryCard = PlatformStoryCardDefinition & {
  metricValue: string;
  metric: string;
  eyebrow: string;
  title: string;
  description: string;
};
