import type { StyleProp, TextStyle } from 'react-native';

export type NotificationMessageProps = {
  message: string;
  style: StyleProp<TextStyle>;
  accentColor: string;
  onLinkOpen: (url: string) => void;
};
