import React, { forwardRef } from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';

type DemoVideoPlayerProps = {
  src: string;
  poster: string;
  muted?: boolean;
  onTimeUpdate?: () => void;
  onPlayingChange?: (playing: boolean) => void;
  fallbackText: string;
};

/**
 * Renders a real HTML5 <video> element on web (this screen only matters on
 * the web target — hashpass.tech) and a plain fallback message on native,
 * where showing a marketing demo video isn't meaningful anyway. React
 * Native's own type definitions don't include 'video' in
 * JSX.IntrinsicElements, so this uses React.createElement to sidestep that
 * — the underlying Metro web bundle renders through react-dom, so a real
 * <video>/<source> pair works exactly as it would in any other web app.
 */
export const DemoVideoPlayer = forwardRef<HTMLVideoElement, DemoVideoPlayerProps>(
  ({ src, poster, muted, onTimeUpdate, onPlayingChange, fallbackText }, ref) => {
    if (Platform.OS !== 'web') {
      return (
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>{fallbackText}</Text>
        </View>
      );
    }

    return React.createElement('video', {
      ref,
      key: src,
      src,
      poster,
      controls: true,
      playsInline: true,
      muted,
      onTimeUpdate,
      onPlay: () => onPlayingChange?.(true),
      onPause: () => onPlayingChange?.(false),
      style: { width: '100%', height: '100%', display: 'block', background: '#000' },
    });
  }
);

DemoVideoPlayer.displayName = 'DemoVideoPlayer';

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fallbackText: {
    color: '#ffffff',
    fontSize: 15,
    textAlign: 'center',
  },
});
