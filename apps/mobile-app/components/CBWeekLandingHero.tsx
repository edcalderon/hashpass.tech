import { ActionButton } from "@hashpass/ui/primitives";
import { uiTokens } from "@hashpass/ui/tokens";
import React, { useEffect } from "react";
import {
  Image,
  ImageBackground,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import type { CBWeekLandingHeroProps } from "../types/CBWeekLandingHero.types";

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    minHeight: 620,
    overflow: "hidden",
    justifyContent: "center",
  },
  glow: {
    position: "absolute",
    width: 560,
    height: 560,
    borderRadius: uiTokens.radius.circle,
    top: -210,
    right: -110,
    opacity: 0.13,
  },
  orbit: {
    position: "absolute",
    borderWidth: 1,
    borderRadius: uiTokens.radius.circle,
  },
  outerOrbit: {
    width: 580,
    height: 580,
    top: "50%",
    right: "6%",
    marginTop: -290,
  },
  innerOrbit: {
    width: 410,
    height: 410,
    top: "50%",
    right: "18%",
    marginTop: -205,
    borderStyle: "dashed",
  },
  composition: {
    width: "100%",
    maxWidth: 1240,
    alignSelf: "center",
    paddingHorizontal: uiTokens.space.xl,
    paddingTop: uiTokens.space.hero,
    paddingBottom: uiTokens.space.xxl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: uiTokens.space.xxl,
  },
  copy: {
    flex: 1,
    maxWidth: 570,
    zIndex: 2,
    alignItems: "flex-start",
  },
  logoPlate: {
    width: 178,
    height: 74,
    borderRadius: uiTokens.radius.media,
    paddingHorizontal: uiTokens.space.md,
    marginBottom: uiTokens.space.xxl,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  logo: {
    width: "88%",
    height: "88%",
  },
  eventFallback: {
    fontFamily: "monospace",
    fontSize: uiTokens.type.label,
    letterSpacing: 2,
  },
  eyebrow: {
    fontFamily: "monospace",
    fontSize: uiTokens.type.caption,
    letterSpacing: 2.6,
    textTransform: "uppercase",
    marginBottom: uiTokens.space.md,
  },
  title: {
    fontSize: 60,
    lineHeight: 64,
    letterSpacing: -2.8,
    fontWeight: "800",
    marginBottom: uiTokens.space.md,
    maxWidth: 650,
  },
  subtitle: {
    fontSize: uiTokens.type.body,
    lineHeight: 25,
    maxWidth: 490,
    marginBottom: uiTokens.space.lg,
  },
  date: {
    fontFamily: "monospace",
    fontSize: uiTokens.type.label,
    letterSpacing: 0.7,
    marginBottom: uiTokens.space.xl,
  },
  action: {
    minWidth: 188,
  },
  scrollPrompt: {
    marginTop: uiTokens.space.xxl,
    minHeight: uiTokens.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTokens.space.sm,
  },
  mobileScrollPrompt: {
    justifyContent: "center",
    marginTop: 0,
    marginBottom: 0,
  },
  mobilePromptWrap: {
    alignSelf: "center",
  },
  scrollLabel: {
    fontFamily: "monospace",
    fontSize: uiTokens.type.caption,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  scrollArrow: {
    fontSize: 22,
    lineHeight: 24,
  },
  stage: {
    flex: 1,
    minWidth: 400,
    height: 490,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
  },
  stageFrame: {
    width: 340,
    height: 420,
    borderRadius: uiTokens.radius.card,
    overflow: "hidden",
    borderWidth: 1,
    shadowColor: uiTokens.colors.dark.canvas,
    shadowOpacity: 0.4,
    shadowRadius: 38,
    shadowOffset: { width: 0, height: 24 },
    elevation: 20,
  },
  browserChrome: {
    height: uiTokens.control.minHeight,
    paddingHorizontal: uiTokens.space.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTokens.space.sm,
    borderBottomWidth: 1,
  },
  mobileBrowserChrome: {
    paddingHorizontal: uiTokens.space.xs,
    gap: uiTokens.space.xs,
  },
  browserDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  browserDot: {
    width: 6,
    height: 6,
    borderRadius: uiTokens.radius.circle,
  },
  browserAddress: {
    flex: 1,
    height: 24,
    paddingHorizontal: uiTokens.space.sm,
    borderRadius: uiTokens.radius.input,
    justifyContent: "center",
    alignItems: "center",
  },
  mobileBrowserAddress: {
    paddingHorizontal: uiTokens.space.xs,
  },
  browserAddressText: {
    color: uiTokens.colors.dark.text,
    fontFamily: "monospace",
    fontSize: 9,
    letterSpacing: 0.35,
  },
  mobileBrowserAddressText: {
    fontSize: 8,
    letterSpacing: 0,
  },
  browserOpen: {
    width: uiTokens.control.minHeight,
    minHeight: uiTokens.control.minHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  browserOpenText: {
    color: uiTokens.colors.dark.text,
    fontSize: 16,
    fontWeight: "700",
  },
  mobileBrowserOpenText: {
    fontSize: 14,
  },
  frameViewport: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    overflow: "hidden",
  },
  stageScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: uiTokens.effects.mediaOverlayStrong,
  },
  frameTopline: {
    position: "absolute",
    top: uiTokens.space.lg,
    left: uiTokens.space.lg,
    right: uiTokens.space.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  frameEyebrow: {
    fontFamily: "monospace",
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  frameMark: {
    width: 8,
    height: 8,
    borderRadius: uiTokens.radius.circle,
  },
  frameBottom: {
    position: "absolute",
    left: uiTokens.space.lg,
    right: uiTokens.space.lg,
    bottom: uiTokens.space.lg,
  },
  frameTitle: {
    fontSize: 27,
    lineHeight: 30,
    letterSpacing: -0.8,
    fontWeight: "800",
  },
  frameCaption: {
    fontFamily: "monospace",
    fontSize: 10,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginTop: uiTokens.space.sm,
  },
  sideCard: {
    position: "absolute",
    right: -6,
    bottom: 25,
    width: 174,
    minHeight: 148,
    borderRadius: uiTokens.radius.media,
    padding: uiTokens.space.lg,
    borderWidth: 1,
    justifyContent: "space-between",
    transform: [
      { perspective: 900 },
      { rotateY: "-12deg" },
      { rotateZ: "5deg" },
    ],
  },
  sideCardKicker: {
    fontFamily: "monospace",
    fontSize: 10,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  sideCardDate: {
    fontSize: 38,
    lineHeight: 40,
    letterSpacing: -1.2,
    fontWeight: "800",
  },
  sideCardCity: {
    fontFamily: "monospace",
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  stamp: {
    position: "absolute",
    left: 0,
    top: 56,
    width: 106,
    height: 106,
    borderRadius: uiTokens.radius.circle,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  stampTop: {
    fontFamily: "monospace",
    fontSize: 9,
    letterSpacing: 1.3,
    textTransform: "uppercase",
  },
  stampYear: {
    fontSize: 21,
    lineHeight: 24,
    fontWeight: "800",
  },
  mobileComposition: {
    paddingHorizontal: uiTokens.space.lg,
    paddingTop: uiTokens.space.xxl,
    paddingBottom: uiTokens.space.xl,
    flexDirection: "column",
    alignItems: "stretch",
    gap: uiTokens.space.lg,
  },
  mobileCopy: {
    maxWidth: 640,
  },
  mobileLogoPlate: {
    width: 144,
    height: 58,
    marginBottom: uiTokens.space.lg,
  },
  mobileTitle: {
    fontSize: 42,
    lineHeight: 45,
    letterSpacing: -1.8,
  },
  mobileStage: {
    width: "100%",
    minWidth: 0,
    height: 330,
  },
  mobileStageFrame: {
    width: 224,
    height: 290,
  },
  mobileSideCard: {
    width: 132,
    minHeight: 120,
    right: 0,
    bottom: 8,
    padding: uiTokens.space.md,
  },
  mobileSideCardDate: {
    fontSize: 30,
    lineHeight: 32,
  },
  mobileStamp: {
    width: 82,
    height: 82,
    borderRadius: uiTokens.radius.circle,
    top: 24,
    left: 0,
  },
  mobileStampYear: {
    fontSize: 16,
    lineHeight: 18,
  },
});

export default function CBWeekLandingHero({
  event,
  isDark,
  locale,
  animationLevel,
  scrollY,
  onExplore,
  onScrollDown,
}: CBWeekLandingHeroProps) {
  const { height, width } = useWindowDimensions();
  const isWide = width >= 1060;
  const reveal = useSharedValue(animationLevel === "full" ? 0 : 1);
  const arrowBounce = useSharedValue(0);
  const glowFloat = useSharedValue(0);
  const outerOrbitFloat = useSharedValue(0);
  const innerOrbitFloat = useSharedValue(0);
  const stampFloat = useSharedValue(0);
  const brandAccent = event.branding?.primaryColor || event.color;
  const accent = isDark ? brandAccent : uiTokens.colors.light.vipFill;
  const darkBrand =
    event.branding?.secondaryColor || uiTokens.colors.dark.canvas;
  const canvas = isDark ? darkBrand : uiTokens.colors.light.canvas;
  const foreground = isDark
    ? uiTokens.colors.dark.text
    : uiTokens.colors.light.text;
  const muted = isDark
    ? uiTokens.colors.dark.muted
    : uiTokens.colors.light.muted;
  const logo = event.branding?.logo;
  const poster = event.heroPoster || event.image;
  const websiteUrl = event.website?.startsWith("https://")
    ? event.website
    : null;
  const websiteHost = websiteUrl
    ? new URL(websiteUrl).hostname.replace(/^www\./, "")
    : "event website";
  const spanish = locale.toLowerCase().startsWith("es");
  const city = [event.tour?.city, event.tour?.country]
    .filter(Boolean)
    .join(" · ");
  const eyebrow = city || "MEDELLÍN · COLOMBIA";

  useEffect(() => {
    if (animationLevel === "full") {
      reveal.value = withTiming(1, {
        duration: uiTokens.motion.entrance,
        easing: Easing.out(Easing.cubic),
      });
      arrowBounce.value = withRepeat(
        withTiming(7, {
          duration: 560,
          easing: Easing.inOut(Easing.quad),
        }),
        -1,
        true,
      );
      glowFloat.value = withDelay(
        900,
        withRepeat(
          withTiming(1, {
            duration: 8200,
            easing: Easing.inOut(Easing.sin),
          }),
          -1,
          true,
        ),
      );
      outerOrbitFloat.value = withRepeat(
        withTiming(1, {
          duration: 6800,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true,
      );
      innerOrbitFloat.value = withDelay(
        1500,
        withRepeat(
          withTiming(1, {
            duration: 5200,
            easing: Easing.inOut(Easing.sin),
          }),
          -1,
          true,
        ),
      );
      stampFloat.value = withDelay(
        500,
        withRepeat(
          withTiming(1, {
            duration: 4600,
            easing: Easing.inOut(Easing.sin),
          }),
          -1,
          true,
        ),
      );
      return () => {
        cancelAnimation(arrowBounce);
        cancelAnimation(glowFloat);
        cancelAnimation(outerOrbitFloat);
        cancelAnimation(innerOrbitFloat);
        cancelAnimation(stampFloat);
      };
    }
    reveal.value = 1;
    arrowBounce.value = 0;
    cancelAnimation(arrowBounce);
    glowFloat.value = 0;
    outerOrbitFloat.value = 0;
    innerOrbitFloat.value = 0;
    stampFloat.value = 0;
    cancelAnimation(glowFloat);
    cancelAnimation(outerOrbitFloat);
    cancelAnimation(innerOrbitFloat);
    cancelAnimation(stampFloat);
  }, [
    animationLevel,
    arrowBounce,
    glowFloat,
    innerOrbitFloat,
    outerOrbitFloat,
    reveal,
    stampFloat,
  ]);

  const glowFloatStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(glowFloat.value, [0, 1], [0, -9]) },
      { translateY: interpolate(glowFloat.value, [0, 1], [0, 13]) },
      { scale: interpolate(glowFloat.value, [0, 1], [1, 1.035]) },
    ],
  }));

  const outerOrbitFloatStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(outerOrbitFloat.value, [0, 1], [0, 12]) },
      { translateY: interpolate(outerOrbitFloat.value, [0, 1], [0, -10]) },
      { scale: interpolate(outerOrbitFloat.value, [0, 1], [1, 1.018]) },
    ],
  }));

  const innerOrbitFloatStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(innerOrbitFloat.value, [0, 1], [0, -11]) },
      { translateY: interpolate(innerOrbitFloat.value, [0, 1], [0, 9]) },
      { scale: interpolate(innerOrbitFloat.value, [0, 1], [1.015, 1]) },
    ],
  }));

  const stampFloatStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(stampFloat.value, [0, 1], [0, 5]) },
      { translateY: interpolate(stampFloat.value, [0, 1], [0, -9]) },
      {
        rotateZ: `${interpolate(stampFloat.value, [0, 1], [-12, -9])}deg`,
      },
    ],
  }));

  const copyEntrance = useAnimatedStyle(() => {
    const entranceEnabled = animationLevel === "full";
    // The mobile hero stacks its copy, prompt, and preview into a much taller
    // layout than the viewport. Keep those items visible until they naturally
    // leave the viewport instead of fading them at a viewport-relative offset.
    const scrollProgress = entranceEnabled && isWide
      ? interpolate(
          scrollY.value,
          [0, Math.max(320, height * 0.62)],
          [0, 1],
          Extrapolation.CLAMP,
        )
      : 0;
    const entranceProgress = entranceEnabled ? reveal.value : 1;

    return {
      opacity: entranceProgress * (1 - scrollProgress),
      transform: [
        {
          translateY:
            (1 - entranceProgress) * 26 - scrollProgress * 54,
        },
        { scale: 0.98 + entranceProgress * 0.02 - scrollProgress * 0.015 },
      ],
    };
  });

  const stageEntrance = useAnimatedStyle(() => {
    const entranceEnabled = animationLevel === "full";
    const scrollProgress = entranceEnabled && isWide
      ? interpolate(
          scrollY.value,
          [0, Math.max(320, height * 0.62)],
          [0, 1],
          Extrapolation.CLAMP,
        )
      : 0;
    const entranceProgress = entranceEnabled ? reveal.value : 1;

    return {
      opacity: entranceProgress * (1 - scrollProgress),
      transform: [
        {
          translateY:
            (1 - entranceProgress) * 26 - scrollProgress * 82,
        },
        { scale: 0.96 + entranceProgress * 0.04 - scrollProgress * 0.045 },
      ],
    };
  });

  const arrowBounceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: arrowBounce.value }],
  }));

  const renderScrollPrompt = (mobile: boolean) => (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={
        spanish
          ? "Desplazarse para descubrir más"
          : "Scroll to discover more"
      }
      onPress={onScrollDown}
      activeOpacity={0.72}
      style={[styles.scrollPrompt, mobile && styles.mobileScrollPrompt]}
    >
      <Text style={[styles.scrollLabel, mutedStyle]}>
        {spanish ? "Desliza para descubrir" : "Scroll to discover"}
      </Text>
      <Animated.Text
        style={[styles.scrollArrow, { color: accent }, arrowBounceStyle]}
        accessibilityElementsHidden
      >
        ↓
      </Animated.Text>
    </TouchableOpacity>
  );

  const backgroundStyle = { backgroundColor: canvas };
  const copyStyle = { color: foreground };
  const mutedStyle = { color: muted };
  const accentFillStyle = { backgroundColor: brandAccent };
  const accentBorderStyle = { borderColor: `${accent}B3` };
  const logoPlateStyle = {
    backgroundColor: darkBrand,
    borderColor: `${brandAccent}70`,
  };

  return (
    <View style={[styles.root, backgroundStyle]}>
      <Animated.View
        style={[styles.glow, accentFillStyle, glowFloatStyle]}
        pointerEvents="none"
      />
      <Animated.View
        style={[
          styles.orbit,
          styles.outerOrbit,
          accentBorderStyle,
          outerOrbitFloatStyle,
        ]}
        pointerEvents="none"
      />
      <Animated.View
        style={[
          styles.orbit,
          styles.innerOrbit,
          { borderColor: `${accent}88` },
          innerOrbitFloatStyle,
        ]}
        pointerEvents="none"
      />

      <View style={[styles.composition, !isWide && styles.mobileComposition]}>
        <Animated.View
          style={[
            styles.copy,
            !isWide && styles.mobileCopy,
            copyEntrance,
          ]}
        >
          <View
            style={[
              styles.logoPlate,
              !isWide && styles.mobileLogoPlate,
              logoPlateStyle,
            ]}
          >
            {logo ? (
              <Image
                source={{ uri: logo }}
                style={styles.logo}
                resizeMode="contain"
                accessible
                accessibilityLabel={`${event.title || event.shortName} logo`}
              />
            ) : (
              <Text style={[styles.eventFallback, { color: brandAccent }]}>
                {event.shortName || "CBW"}
              </Text>
            )}
          </View>

          <Text style={[styles.eyebrow, { color: accent }]}>
            {eyebrow.toLocaleUpperCase()}
          </Text>
          <Text
            accessibilityRole="header"
            style={[styles.title, !isWide && styles.mobileTitle, copyStyle]}
          >
            {event.title || event.shortName}
          </Text>
          {event.subtitle ? (
            <Text style={[styles.subtitle, mutedStyle]}>{event.subtitle}</Text>
          ) : null}
          {event.eventDateString ? (
            <Text style={[styles.date, { color: accent }]}>
              {event.eventDateString}
            </Text>
          ) : null}

          <ActionButton
            mode={isDark ? "dark" : "light"}
            skin={{
              fill: brandAccent,
              onFill: darkBrand,
              accent: darkBrand,
              soft: `${brandAccent}20`,
              border: accent,
            }}
            label={spanish ? "Explorar el evento" : "Explore the event"}
            accessibilityLabel={
              spanish
                ? "Explorar Colombia Blockchain Week"
                : "Explore Colombia Blockchain Week"
            }
            onPress={onExplore}
            style={[styles.action, { borderColor: accent, borderWidth: 1 }]}
          />

          {isWide ? renderScrollPrompt(false) : null}
        </Animated.View>

        <Animated.View
          style={[styles.stage, !isWide && styles.mobileStage, stageEntrance]}
        >
          <View
            style={[
              styles.stageFrame,
              !isWide && styles.mobileStageFrame,
              {
                backgroundColor: darkBrand,
                borderColor: `${brandAccent}55`,
                transform: [
                  { perspective: 1000 },
                  { rotateY: "-11deg" },
                  { rotateZ: "-3deg" },
                ],
              },
            ]}
          >
            <View
              style={[
                styles.browserChrome,
                !isWide && styles.mobileBrowserChrome,
                {
                  backgroundColor: darkBrand,
                  borderBottomColor: `${brandAccent}55`,
                },
              ]}
            >
              <View style={styles.browserDots} pointerEvents="none">
                <View
                  style={[styles.browserDot, { backgroundColor: brandAccent }]}
                />
                <View
                  style={[
                    styles.browserDot,
                    { backgroundColor: uiTokens.colors.dark.muted },
                  ]}
                />
                <View
                  style={[
                    styles.browserDot,
                    { backgroundColor: uiTokens.colors.dark.muted },
                  ]}
                />
              </View>
              <View
                style={[
                  styles.browserAddress,
                  !isWide && styles.mobileBrowserAddress,
                  { backgroundColor: uiTokens.effects.mediaOverlayGlass },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.browserAddressText,
                    !isWide && styles.mobileBrowserAddressText,
                  ]}
                >
                  {websiteHost}
                </Text>
              </View>
              {websiteUrl ? (
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel={
                    spanish
                      ? "Abrir sitio oficial del evento"
                      : "Open official event website"
                  }
                  activeOpacity={0.72}
                  onPress={() => void Linking.openURL(websiteUrl)}
                  style={styles.browserOpen}
                >
                  <Text
                    style={[
                      styles.browserOpenText,
                      !isWide && styles.mobileBrowserOpenText,
                      { color: brandAccent },
                    ]}
                    accessibilityElementsHidden
                  >
                    ↗
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View
              style={[styles.frameViewport, { backgroundColor: darkBrand }]}
            >
              {Platform.OS === "web" && websiteUrl ? (
                React.createElement("iframe", {
                  src: websiteUrl,
                  title: `${event.title || event.shortName} official website preview`,
                  loading: "lazy",
                  referrerPolicy: "strict-origin-when-cross-origin",
                  allow: "autoplay; encrypted-media; picture-in-picture",
                  style: {
                    width: "100%",
                    height: "100%",
                    display: "block",
                    border: 0,
                    backgroundColor: darkBrand,
                  },
                })
              ) : poster ? (
                <ImageBackground
                  source={{ uri: poster }}
                  resizeMode="cover"
                  style={StyleSheet.absoluteFillObject}
                >
                  <View style={styles.stageScrim} />
                  <View style={styles.frameTopline}>
                    <Text style={[styles.frameEyebrow, { color: brandAccent }]}>
                      {event.shortName || "EVENT"}
                    </Text>
                    <View style={[styles.frameMark, accentFillStyle]} />
                  </View>
                  <View style={styles.frameBottom}>
                    <Text
                      numberOfLines={3}
                      style={[
                        styles.frameTitle,
                        { color: uiTokens.colors.dark.text },
                      ]}
                    >
                      {event.title || event.shortName}
                    </Text>
                    <Text style={[styles.frameCaption, { color: brandAccent }]}>
                      {spanish
                        ? "SITIO OFICIAL DEL EVENTO"
                        : "OFFICIAL EVENT SITE"}
                    </Text>
                  </View>
                </ImageBackground>
              ) : (
                <View
                  style={[
                    StyleSheet.absoluteFillObject,
                    { alignItems: "center", justifyContent: "center" },
                  ]}
                >
                  <Text style={[styles.eventFallback, { color: brandAccent }]}>
                    {event.shortName || "EVENT"}
                  </Text>
                </View>
              )}
            </View>
          </View>

          <View
            style={[
              styles.sideCard,
              !isWide && styles.mobileSideCard,
              { backgroundColor: brandAccent, borderColor: accent },
            ]}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={[styles.sideCardKicker, { color: darkBrand }]}>
              {spanish ? "NOS VEMOS EN" : "MEET US IN"}
            </Text>
            <Text
              style={[
                styles.sideCardDate,
                !isWide && styles.mobileSideCardDate,
                { color: darkBrand },
              ]}
            >
              2026
            </Text>
            <Text style={[styles.sideCardCity, { color: darkBrand }]}>
              {city || "COLOMBIA"}
            </Text>
          </View>

          <Animated.View
            style={[
              styles.stamp,
              !isWide && styles.mobileStamp,
              { backgroundColor: canvas, borderColor: accent },
              stampFloatStyle,
            ]}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text style={[styles.stampTop, { color: accent }]}>
              {spanish ? "EDICIÓN" : "EDITION"}
            </Text>
            <Text
              style={[
                styles.stampYear,
                !isWide && styles.mobileStampYear,
                copyStyle,
              ]}
            >
              01
            </Text>
          </Animated.View>

        </Animated.View>

        {!isWide ? (
          <Animated.View
            testID="cbweek-mobile-scroll-prompt"
            style={[styles.mobilePromptWrap, copyEntrance]}
          >
            {renderScrollPrompt(true)}
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}
