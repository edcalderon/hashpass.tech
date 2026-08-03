import { Platform } from 'react-native';

type ChatInputKeyEvent = {
  key?: string;
  shiftKey?: boolean;
  isComposing?: boolean;
  nativeEvent?: { key?: string; shiftKey?: boolean; isComposing?: boolean };
};

/**
 * A multiline React Native Web input inserts a newline for Enter by default.
 * Keep that behaviour for Shift+Enter (and IME composition), but use plain
 * Enter as the familiar web-chat send shortcut.
 */
export const shouldSendMessageOnWebEnter = (event: ChatInputKeyEvent) => {
  const key = event.nativeEvent?.key ?? event.key;
  const shiftKey = event.nativeEvent?.shiftKey ?? event.shiftKey;
  const isComposing = event.nativeEvent?.isComposing ?? event.isComposing;

  return Platform.OS === 'web' && key === 'Enter' && !shiftKey && !isComposing;
};
