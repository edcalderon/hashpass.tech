import React, { useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

interface SpeakerAvatarProps {
  name?: string;
  imageUrl?: string | null;
  fallbackImageUrl?: string | null;
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
  imageUrl,
  fallbackImageUrl,
  size = 50,
  style,
  showBorder = false,
}: SpeakerAvatarProps) {
  // Try the authoritative profile image once, then the deterministic local
  // asset fallback once. Never retry the same URL, which avoids the loading
  // loops that previously affected mobile web launch.
  const imageSources = [imageUrl, fallbackImageUrl].filter(
    (source, index, sources): source is string => Boolean(source) && sources.indexOf(source) === index,
  );
  const [failedImageSources, setFailedImageSources] = useState<Set<string>>(
    () => new Set(),
  );
  const initials = getInitials(name);
  const backgroundColor = getBackgroundColor(name);
  const imageSource = imageSources.find((source) => !failedImageSources.has(source));
  const showImage = Boolean(imageSource);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={name ? `${name} avatar${showImage ? '' : ' placeholder'}` : 'Speaker avatar placeholder'}
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
      {showImage ? (
        <Image
          source={{ uri: imageSource as string }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={() => {
            if (!imageSource) return;
            setFailedImageSources((current) => {
              if (current.has(imageSource)) return current;
              const next = new Set(current);
              next.add(imageSource);
              return next;
            });
          }}
        />
      ) : (
        <Text style={[styles.initialsText, { fontSize: Math.max(12, size * 0.38) }]}>
          {initials}
        </Text>
      )}
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
