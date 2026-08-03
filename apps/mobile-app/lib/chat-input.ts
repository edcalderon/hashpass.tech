import { Platform } from 'react-native';

type ChatInputKeyEvent = {
  nativeEvent: { key?: string; shiftKey?: boolean; isComposing?: boolean };
};

/**
 * A multiline React Native Web input inserts a newline for Enter by default.
 * Keep that behaviour for Shift+Enter (and IME composition), but use plain
 * Enter as the familiar web-chat send shortcut.
 */
export const shouldSendMessageOnWebEnter = (event: ChatInputKeyEvent) => (
  Platform.OS === 'web'
  && event.nativeEvent.key === 'Enter'
  && !event.nativeEvent.shiftKey
  && !event.nativeEvent.isComposing
);
