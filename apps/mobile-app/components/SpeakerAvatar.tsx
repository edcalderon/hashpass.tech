import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface SpeakerAvatarProps {
  name?: string;
  imageUrl?: string | null;
  size?: number;
  style?: any;
  showBorder?: boolean;
  isOnline?: boolean; // Accepted for compatibility, intentionally unused.
}

const AVATAR_COLORS = [
  '#D6E4FF',
  '#DDF7E3',
  '#FDE7C9',
  '#F8D7E5',
  '#E7DFFF',
  '#D8F1F5',
  '#FCE0D6',
  '#E3E8EF',
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getInitials(name?: string): string {
  if (!name || typeof name !== 'string') return '??';

  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '??';
  if (parts.length === 1) {
    const word = parts[0];
    return (word.slice(0, 2) || word.slice(0, 1) || '?').toUpperCase();
  }

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase() || '??';
}

function getBackgroundColor(name?: string): string {
  const normalized = name?.trim();
  if (!normalized) return '#E2E8F0';
  return AVATAR_COLORS[hashString(normalized) % AVATAR_COLORS.length];
}

export default function SpeakerAvatar({
  name,
  size = 50,
  style,
  showBorder = false,
}: SpeakerAvatarProps) {
  // Intentionally render a lightweight placeholder only.
  // Speaker photos are no longer fetched from local bundles or remote CDNs.
  const initials = getInitials(name);
  const backgroundColor = getBackgroundColor(name);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name ? `${name} avatar placeholder` : 'Speaker avatar placeholder'}
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
        },
        showBorder ? styles.border : null,
        style,
      ]}
    >
      <Text style={[styles.initialsText, { fontSize: Math.max(12, size * 0.38) }]}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  border: {
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.12)',
  },
  initialsText: {
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});
