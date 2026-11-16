import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type DashboardNoticeCardProps = {
  mode?: 'light' | 'dark';
  children: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};
