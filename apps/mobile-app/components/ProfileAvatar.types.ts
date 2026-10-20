import type { StyleProp, ViewStyle } from 'react-native';

export interface ProfileAvatarProps {
  /** Remote photo; when missing or it fails to load, the striped initials show. */
  uri?: string | null;
  name?: string | null;
  isDark: boolean;
  /** Fills its parent; the parent owns size, ring and clipping. */
  style?: StyleProp<ViewStyle>;
  initialsSize?: number;
}
