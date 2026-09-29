import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Image,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { resolveEventImageSource } from "../../lib/event-branding";
import EventBannerBackgroundVideo from "../EventBannerBackgroundVideo";

type EventHeroBackgroundProps = {
  fallbackImage?: string;
  /** Web video focal point for compositions with meaningful edge detail. */
  focalPosition?: string;
  loadingLabel: string;
  loadingLogo?: string;
  mediaStyle: StyleProp<ImageStyle>;
  preferBundledSource?: boolean;
  textureStyle: StyleProp<ViewStyle>;
  videoSource?: string;
};

const useReducedMotionPreference = (): boolean => {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReducedMotion(enabled);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);

  return reducedMotion;
};

const MovingStripeFallback = ({
  textureStyle,
}: {
  textureStyle: StyleProp<ViewStyle>;
}) => {
  const reducedMotion = useReducedMotionPreference();
  const textureOffsetRef = useRef<Animated.Value | null>(null);
  // Jest's minimal React Native renderer deliberately omits Animated. The
  // static texture remains the correct visual fallback there and on any
  // constrained platform without the animation implementation.
  if (!textureOffsetRef.current && typeof Animated.Value === "function") {
    textureOffsetRef.current = new Animated.Value(0);
  }
  const textureOffset = textureOffsetRef.current;

  useEffect(() => {
    if (!textureOffset) return;
    textureOffset.stopAnimation();
    if (reducedMotion) {
      textureOffset.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(textureOffset, {
          toValue: -24,
          duration: 12_000,
          useNativeDriver: true,
        }),
        Animated.timing(textureOffset, {
          toValue: 0,
          duration: 12_000,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, textureOffset]);

  const fallbackStyle = [
    textureStyle,
    {
      // Overfill horizontally so the deliberate drift never exposes a seam.
      left: -24,
      right: -24,
      transform: textureOffset ? [{ translateX: textureOffset }] : undefined,
    },
  ];

  if (!textureOffset) {
    return <View testID="event-hero-stripe-fallback" style={fallbackStyle} />;
  }

  return (
    <Animated.View
      testID="event-hero-stripe-fallback"
      style={fallbackStyle}
    />
  );
};

/**
 * Keeps every Explorer hero useful before a film decodes, when autoplay is
 * unavailable, or when the event intentionally ships image-only branding.
 */
export default function EventHeroBackground({
  fallbackImage,
  focalPosition,
  loadingLabel,
  loadingLogo,
  mediaStyle,
  preferBundledSource = false,
  textureStyle,
  videoSource,
}: EventHeroBackgroundProps) {
  const imageSource = resolveEventImageSource(fallbackImage);
  // A still poster has no motion of its own. Keep the Explorer's subtle
  // diagonal texture alive over image-only banners, while video-backed
  // banners remain clean once their film is available. If a video has no
  // poster, retain the texture as the decode/loading fallback.
  const shouldShowAnimatedTexture = !imageSource || !videoSource;

  return (
    <>
      {imageSource ? (
        <Image
          source={imageSource}
          style={mediaStyle}
          resizeMode="cover"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      ) : null}
      {videoSource ? (
        <EventBannerBackgroundVideo
          source={videoSource}
          loadingLogo={loadingLogo}
          preferBundledSource={preferBundledSource}
          showLoadingIndicator={!imageSource}
          loadingLabel={loadingLabel}
          focalPosition={focalPosition}
        />
      ) : null}
      {shouldShowAnimatedTexture ? (
        <MovingStripeFallback textureStyle={textureStyle} />
      ) : null}
    </>
  );
}
