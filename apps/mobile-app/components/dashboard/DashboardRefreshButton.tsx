import React, { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { uiTokens } from '@hashpass/ui/tokens';
import { useTheme } from '../../hooks/useTheme';
import { MaterialIcons } from '../../lib/vector-icons';
import type { DashboardRefreshButtonProps } from './DashboardRefreshButton.types';

/**
 * Shared dashboard refresh action. Keeping this in one component makes the
 * loading/disabled treatment consistent across dashboard cards and lists.
 */
export default function DashboardRefreshButton({
  onPress,
  loading = false,
  disabled = false,
  compact = false,
  label,
  loadingLabel,
  hint,
  testID,
}: DashboardRefreshButtonProps) {
  const { colors } = useTheme();
  const [interactive, setInteractive] = useState(false);
  const isDisabled = disabled || loading;
  const showLabel = !compact || interactive || loading;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={loading ? loadingLabel : label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onHoverIn={() => setInteractive(true)}
      onHoverOut={() => setInteractive(false)}
      onFocus={() => setInteractive(true)}
      onBlur={() => setInteractive(false)}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        compact && !showLabel ? styles.compactButton : null,
        {
          borderColor: `${colors.primary}55`,
          backgroundColor: `${colors.primary}12`,
          opacity: isDisabled ? 0.55 : pressed ? 0.78 : 1,
        },
      ]}
      onPress={onPress}
    >
      <MaterialIcons name="refresh" size={18} color={colors.primary} />
      {showLabel && <Text style={[styles.label, { color: colors.primary }]}>{loading ? loadingLabel : label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: uiTokens.radius.pill,
    borderWidth: 1,
  },
  compactButton: {
    width: 36,
    paddingHorizontal: 0,
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
});
