import React from 'react';
import { Linking, Platform, Text } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import type { NotificationMessageProps } from '../../types/NotificationMessage.types';

export function splitNotificationLinks(value: string) {
  const parts: { text: string; url?: string }[] = [];
  const urlPattern = /https?:\/\/[^\s<>"']+/gi;
  let cursor = 0;

  for (const match of value.matchAll(urlPattern)) {
    const rawUrl = match[0];
    const trailingPunctuation = rawUrl.match(/[.,!?;:)\]}]+$/)?.[0] || '';
    const candidate = rawUrl.slice(0, rawUrl.length - trailingPunctuation.length);
    if (!candidate || match.index === undefined) continue;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(candidate);
    } catch {
      continue;
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) continue;

    if (match.index > cursor) parts.push({ text: value.slice(cursor, match.index) });
    parts.push({ text: candidate, url: parsedUrl.toString() });
    cursor = match.index + candidate.length;
  }

  if (cursor < value.length || parts.length === 0) parts.push({ text: value.slice(cursor) });
  return parts;
}

export function openNotificationExternalUrl(url: string, platform: string = Platform.OS) {
  if (platform === 'web') {
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return;
  }
  void Linking.openURL(url).catch(() => null);
}

export default function NotificationMessage({ message, style, accentColor, onLinkOpen }: NotificationMessageProps) {
  return (
    <Text style={style}>
      {splitNotificationLinks(message).map((segment, segmentIndex) => segment.url ? (
        <Text
          key={`${segmentIndex}-${segment.url}`}
          accessibilityRole="link"
          accessibilityHint={Platform.OS === 'web' ? 'Opens in a new tab' : 'Opens in your browser'}
          style={{ color: accentColor, textDecorationLine: 'underline' }}
          onPress={(event: GestureResponderEvent) => {
            event.stopPropagation();
            openNotificationExternalUrl(segment.url!);
            onLinkOpen(segment.url!);
          }}
        >
          {segment.text}
        </Text>
      ) : (
        <Text key={segmentIndex}>{segment.text}</Text>
      ))}
    </Text>
  );
}
