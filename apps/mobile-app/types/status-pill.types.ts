import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export interface StatusPillProps {
  label: string;
  /** Colour of the leading status dot. */
  color: string;
  isDark?: boolean;
  /** The dot emits a soft ping ring (unless motion is reduced). */
  live?: boolean;
  /** Trailing affordance, e.g. a check or an info glyph. */
  trailingIcon?: ReactNode;
  /** Makes the pill a button. */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** Applied to the rendered pill only, so lookups by testID match once. */
  pillTestID?: string;
  style?: StyleProp<ViewStyle>;
}
