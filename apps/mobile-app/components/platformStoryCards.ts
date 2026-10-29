import { uiTokens } from '@hashpass/ui/tokens';
import type { PlatformStoryCardDefinition } from './types/PlatformStory.types';

export const platformStoryCards = [
  { id: 'lifecycle', icon: 'people-outline', accentColor: uiTokens.feature.cyan },
  { id: 'membership', icon: 'key', accentColor: uiTokens.feature.green },
  { id: 'eventTools', icon: 'calendar-days', accentColor: uiTokens.feature.amber },
  { id: 'sharingTools', icon: 'qr-code-outline', accentColor: uiTokens.feature.violet },
  { id: 'surfaces', icon: 'monitor-smartphone', accentColor: uiTokens.feature.cyan },
  { id: 'languages', icon: 'globe-2', accentColor: uiTokens.feature.green },
  { id: 'truthful', icon: 'shield-checkmark', accentColor: uiTokens.feature.green },
  { id: 'private', icon: 'key', accentColor: uiTokens.feature.violet },
  { id: 'open', icon: 'people-outline', accentColor: uiTokens.feature.cyan },
] as const satisfies readonly PlatformStoryCardDefinition[];
