import React from 'react';
import { Image, Pressable, StyleSheet } from 'react-native';
import { uiTokens } from '@hashpass/ui/tokens';
import { useTheme } from '../hooks/useTheme';
import { getHashpassFullLogo } from '../lib/hashpass-logo';
/** The bundled app mark and theme-aware wordmark, with one accessible name. */
export default function HashpassBrand({ onPress, compact = false }: { onPress: () => void; compact?: boolean }) {
  const { isDark } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel="HASHPASS" onPress={onPress} style={styles.brand}>
    <Image accessible={false} source={require('../assets/images/icon.png')} style={styles.mark} />
    <Image accessible={false} source={getHashpassFullLogo(isDark)} resizeMode="contain" style={{ width: compact ? 78 : 116, height: 32 }} />
  </Pressable>;
}
const styles = StyleSheet.create({
  brand: { minHeight: uiTokens.control.minHeight, flexDirection: 'row', alignItems: 'center', gap: uiTokens.space.sm, flexShrink: 1 },
  mark: { width: 28, height: 28, borderRadius: uiTokens.radius.circle },
});
