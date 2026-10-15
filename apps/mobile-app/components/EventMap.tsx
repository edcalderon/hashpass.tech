import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ExternalLink, MapPin } from 'lucide-react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import {
  buildMapHtml,
  geocode,
  isEventMapNavigationAllowed,
  openStreetMapSearchUrl,
  openStreetMapUrl,
  type MapCoordinates,
} from '../lib/event-map';

interface EventMapProps {
  address?: string | null;
  venue?: string | null;
  city?: string | null;
  country?: string | null;
  /** Human-readable place name, used for the marker title and fallback link. */
  label: string;
  isDark: boolean;
  /** Fly-in on load; off for reduced-motion users. */
  animated: boolean;
}

type MapState =
  | { status: 'loading' }
  | { status: 'ready'; coordinates: MapCoordinates }
  | { status: 'unavailable' };

const MAP_HEIGHT = 280;

// Live OpenStreetMap view of the venue (Leaflet in an iframe on web / a
// WebView on native; see lib/event-map.ts for the provider rationale). If the
// venue cannot be located we show a plain link instead of an empty box.
export default function EventMap({ address, venue, city, country, label, isDark, animated }: EventMapProps) {
  const palette = uiPalette(isDark);
  const [state, setState] = useState<MapState>({ status: 'loading' });
  const [frameLoaded, setFrameLoaded] = useState(false);
  const fade = useSharedValue(0);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    setFrameLoaded(false);
    geocode({ address, venue, city, country }, controller.signal)
      .then((coordinates) => {
        if (!controller.signal.aborted) {
          setState(coordinates ? { status: 'ready', coordinates } : { status: 'unavailable' });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'unavailable' });
      });
    return () => controller.abort();
  }, [address, venue, city, country]);

  useEffect(() => {
    if (!frameLoaded) return;
    fade.value = withTiming(1, { duration: animated ? 400 : 0 });
  }, [frameLoaded, animated, fade]);

  const html = useMemo(
    () =>
      state.status === 'ready'
        ? buildMapHtml({
            coordinates: state.coordinates,
            label,
            accent: palette.accent,
            isDark,
            surface: palette.surface,
            animated,
          })
        : null,
    [state, label, palette.accent, palette.surface, isDark, animated],
  );

  const styles = getStyles(palette);
  const externalUrl =
    state.status === 'ready'
      ? openStreetMapUrl(state.coordinates)
      : openStreetMapSearchUrl([address, venue, city, country].filter(Boolean).join(', '));

  const renderFrame = () => {
    if (!html) return null;
    if (Platform.OS === 'web') {
      return React.createElement('iframe', {
        title: `Map of ${label}`,
        srcDoc: html,
        loading: 'lazy',
        referrerPolicy: 'strict-origin-when-cross-origin',
        sandbox: 'allow-scripts',
        onLoad: () => setFrameLoaded(true),
        style: { border: 0, width: '100%', height: '100%', display: 'block' },
      });
    }
    // Loaded lazily so web bundles and tests never touch the native module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { WebView } = require('react-native-webview');
    return (
      <WebView
        source={{ html, baseUrl: 'https://hashpass.tech' }}
        originWhitelist={['*']}
        onLoadEnd={() => setFrameLoaded(true)}
        onShouldStartLoadWithRequest={(request: { url: string }) => {
          // Keep the map in place; attribution links open in the browser.
          if (isEventMapNavigationAllowed(request.url)) return true;
          void Linking.openURL(request.url).catch(() => undefined);
          return false;
        }}
        scrollEnabled={false}
        style={styles.webview}
      />
    );
  };

  return (
    <View testID="event-info-map" style={styles.container}>
      <View style={styles.mapBox}>
        {state.status === 'unavailable' ? (
          <View style={styles.placeholder}>
            <MapPin size={22} color={palette.muted} />
            <Text style={styles.placeholderText}>We couldn&apos;t locate this venue on the map.</Text>
          </View>
        ) : (
          <>
            {!frameLoaded && (
              <View style={styles.placeholder} pointerEvents="none">
                <ActivityIndicator size="small" color={palette.accent} />
              </View>
            )}
            <Animated.View style={[StyleSheet.absoluteFill, fadeStyle]}>{renderFrame()}</Animated.View>
          </>
        )}
      </View>
      <TouchableOpacity
        style={styles.mapLink}
        onPress={() => void Linking.openURL(externalUrl).catch(() => undefined)}
        accessibilityRole="link"
        accessibilityLabel={`Open ${label} in OpenStreetMap`}
        activeOpacity={0.6}
      >
        <Text style={styles.mapLinkText}>Open in OpenStreetMap</Text>
        <ExternalLink size={13} color={palette.accent} />
      </TouchableOpacity>
    </View>
  );
}

const getStyles = (palette: ReturnType<typeof uiPalette>) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: uiTokens.space.xl,
      paddingBottom: uiTokens.space.lg,
      gap: uiTokens.space.sm,
    },
    mapBox: {
      height: MAP_HEIGHT,
      borderRadius: uiTokens.radius.card,
      overflow: 'hidden',
      backgroundColor: palette.accentSoft,
      borderWidth: 1,
      borderColor: palette.border,
    },
    webview: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    placeholder: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      gap: uiTokens.space.sm,
      padding: uiTokens.space.lg,
    },
    placeholderText: {
      color: palette.muted,
      fontSize: uiTokens.type.caption,
      textAlign: 'center',
    },
    mapLink: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-end',
      gap: 4,
      paddingVertical: 2,
    },
    mapLinkText: {
      color: palette.accent,
      fontSize: uiTokens.type.caption,
      fontWeight: '600',
    },
  });
