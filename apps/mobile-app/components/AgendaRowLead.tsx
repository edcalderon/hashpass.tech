import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { uiTokens } from '@hashpass/ui/tokens';
import type { AgendaRowLeadProps } from '../types/agenda-row-lead.types';

const SIZE = 40;
const NATIVE_HOLD_MS = 2200;

/**
 * Leading tile of a compact agenda row. It shows the session photo first and swaps to the
 * session-type icon while hovered or focused (web) or after a tap (native, where there is no
 * hover; it reverts by itself). Sessions without a photo simply show the icon.
 */
export default function AgendaRowLead({ image, icon, color, label, testID, children }: AgendaRowLeadProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tapped, setTapped] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showIcon = !image || hovered || focused || tapped;

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onPress = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setTapped(true);
    timer.current = setTimeout(() => setTapped(false), NATIVE_HOLD_MS);
  }, []);

  return (
    <View testID={testID} style={styles.lead}>
      <Pressable
        accessibilityRole={image ? 'button' : undefined}
        accessibilityLabel={label}
        accessible={Boolean(image)}
        disabled={!image}
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.tile, { backgroundColor: `${color}22`, borderColor: `${color}66` }]}
      >
        {showIcon ? (
          icon
        ) : (
          <Image
            testID={testID ? `${testID}-photo` : undefined}
            accessible={false}
            resizeMode="cover"
            source={image as NonNullable<typeof image>}
            style={styles.photo}
          />
        )}
      </Pressable>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { position: 'relative' },
  tile: {
    alignItems: 'center',
    borderRadius: uiTokens.radius.input,
    borderWidth: 1,
    height: SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    width: SIZE,
  },
  photo: { height: '100%', width: '100%' },
});
