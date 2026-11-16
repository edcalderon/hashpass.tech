import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Surface } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { MaterialIcons } from '../../lib/vector-icons';
import type { DashboardNoticeCardProps } from './DashboardNoticeCard.types';

/** Consistent dismissible information card for dashboard guidance and prompts. */
export default function DashboardNoticeCard({
  mode = 'light',
  children,
  onDismiss,
  dismissLabel = 'Dismiss notice',
  style,
  testID,
}: DashboardNoticeCardProps) {
  const palette = uiPalette(mode);
  return (
    <Surface mode={mode} testID={testID} style={[styles.card, style]}>
      <View style={styles.content}>{children}</View>
      {onDismiss ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={dismissLabel}
          onPress={onDismiss}
          hitSlop={8}
          style={styles.dismissButton}
        >
          <MaterialIcons name="close" size={18} color={palette.muted} />
        </Pressable>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: uiTokens.space.md,
    padding: uiTokens.space.md + uiTokens.space.xs,
    borderRadius: uiTokens.radius.media,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  dismissButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: uiTokens.radius.circle,
  },
});
