import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { uiTokens } from '@hashpass/ui/tokens';

export const getAvatarInitials = (name?: string | null): string =>
  (name || '')
    .replace(/^@/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'H';

interface ProfileAvatarProps {
  /** Remote photo; when missing or it fails to load, the striped initials show. */
  uri?: string | null;
  name?: string | null;
  isDark: boolean;
  /** Fills its parent; the parent owns size, ring and clipping. */
  style?: StyleProp<ViewStyle>;
  initialsSize?: number;
}

/**
 * Profile photo with the shared striped capital-letter fallback. Also covers
 * a photo URL that exists but cannot be loaded (blocked, 4xx/5xx, offline),
 * which would otherwise leave an empty circle.
 */
export default function ProfileAvatar({ uri, name, isDark, style, initialsSize = 22 }: ProfileAvatarProps) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  useEffect(() => setFailedUri(null), [uri]);

  if (uri && uri !== failedUri) {
    return (
      <Image
        source={{ uri }}
        style={styles.fill}
        resizeMode="cover"
        onError={() => setFailedUri(uri)}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return (
    <View
      style={[styles.fill, styles.fallback, { backgroundColor: isDark ? '#2a2220' : '#f1dcd9' }, style]}
      accessibilityLabel={name || undefined}
    >
      {Array.from({ length: 12 }, (_, index) => (
        <View
          key={index}
          style={[
            styles.stripe,
            {
              top: index * 12 - 24,
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.62)',
            },
          ]}
        />
      ))}
      <Text
        style={{
          fontSize: initialsSize,
          fontWeight: '800',
          letterSpacing: 0.5,
          color: isDark ? uiTokens.colors.dark.text : uiTokens.colors.light.accent,
        }}
      >
        {getAvatarInitials(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  fallback: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  stripe: {
    position: 'absolute',
    left: -40,
    width: 220,
    height: 8,
    transform: [{ rotate: '-45deg' }],
  },
});
