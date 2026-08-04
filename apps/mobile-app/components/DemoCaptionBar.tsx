import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import type { ThemeColors } from '../lib/theme';

type DemoCaptionBarProps = {
  text: string | null;
  visible: boolean;
  colors: ThemeColors;
};

// Brand accent red used elsewhere for the HASHPASS wordmark (e.g. the auth
// screen) so translated captions read as deliberate on-brand styling.
const CAPTION_TEXT_COLOR = '#af0d01';

/**
 * Real captions rendered below the video (not the browser's native overlay
 * track) so they stay legible over any frame and work identically whether
 * or not the viewer has sound on — see lib/demo-captions.ts for how the
 * cue timing is generated from the actual narration audio.
 */
export function DemoCaptionBar({ text, visible, colors }: DemoCaptionBarProps) {
  if (!visible) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.surface || colors.background.paper, borderColor: colors.divider }]}>
      {text ? (
        <Animated.Text
          key={text}
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={[styles.text, { color: colors.text.primary }]}
        >
          {text}
        </Animated.Text>
      ) : (
        <Text style={[styles.text, styles.placeholder, { color: colors.text.disabled }]}>{' '}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    fontWeight: '500',
  },
  placeholder: {
    opacity: 0,
  },
});
