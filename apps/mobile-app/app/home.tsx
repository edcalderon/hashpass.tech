import React, { useEffect, useState } from "react";
import { useTranslation, getCurrentLocale } from "../i18n/i18n";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../hooks/useAuth";
import { useTheme } from "../hooks/useTheme";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getCurrentEvent } from "../lib/event-detector";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Extrapolation,
  withDelay,
  interpolate,
  useAnimatedReaction,
  withSpring,
  withRepeat,
  withSequence,
  Easing,
} from "react-native-reanimated";

// Import components using relative paths
import Features from "../components/Features";
import QuickSettingsPanel from "../components/QuickSettingsPanel";
import BackToTop from "../components/BackToTop";
import Testimonials from "../components/Testimonials";
import { InteractiveHoverButton } from "../components/InteractiveHoverButton";
import FlipWords from "../components/FlipWords";
import Newsletter from "../components/Newsletter";
import EventBannerCarousel from "../components/EventBannerCarousel";
import VersionStatusIndicator from "../components/VersionStatusIndicator";
import CrystalForgeBackground from "../components/CrystalForgeBackground";
import AnimatedGradientBackground from "../components/AnimatedGradientBackground";
import { Svg, Path } from "react-native-svg";
import {
  getHashpassFullLogo,
  getHashpassFooterLogo,
  getHashpassStaticHeroLogo,
} from "../lib/hashpass-logo";
import { useAnimationLevel } from "../contexts/AnimationLevelContext";
import { resolveHeroTaglineText } from "../lib/home-hero";

// Import git info to check branch
let gitInfo: { gitBranch?: string } = {};
try {
  gitInfo = require("../config/git-info.json");
} catch {
  // Fallback if git-info.json doesn't exist
  gitInfo = {};
}

export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const [userName, setUserName] = useState<string | null>(null);
  const { t } = useTranslation("index");
  const isMobile = useIsMobile();
  const insets = useSafeAreaInsets();

  // Get current event info for dynamic footer
  const currentEvent = getCurrentEvent();

  // Check if we're on main branch (check both git branch and env vars)
  const gitBranch = gitInfo.gitBranch || process.env.GIT_BRANCH || "main";
  const isMainBranch =
    gitBranch === "main" ||
    gitBranch === "master" ||
    (typeof process !== "undefined" &&
      (process.env.AMPLIFY_SHOW_ALL_EVENTS === "true" ||
        process.env.NEXT_PUBLIC_SHOW_ALL_EVENTS === "true"));

  // Determine footer link behavior based on branch
  // On main branch: show "HASHPASS" link to hashpass.tech
  // On event branches (like the BSL On Tour family): show the active event link
  const shouldShowFooterLink = true; // Always show a link
  const footerLinkName = isMainBranch
    ? "HASHPASS"
    : currentEvent?.title || "Blockchain Summit Latam";
  const footerLinkUrl = isMainBranch
    ? "https://hashpass.tech"
    : currentEvent?.website || null;

  const { animationLevel } = useAnimationLevel();
  const isHeroAnimationEnabled = animationLevel === "full";
  const heroForegroundColor =
    Platform.OS === "web" && isHeroAnimationEnabled
      ? "#FFFFFF"
      : colors.text.primary;
  const heroForegroundMutedColor =
    Platform.OS === "web" && isHeroAnimationEnabled
      ? "rgba(255, 255, 255, 0.84)"
      : isDark
        ? "rgba(255, 255, 255, 0.78)"
        : "rgba(26, 26, 26, 0.24)";
  // Encode as a SharedValue so Reanimated worklets can read it on the UI thread.
  // 2 = full, 1 = reduced, 0 = none
  const animLevelNum = useSharedValue(
    animationLevel === "full" ? 2 : animationLevel === "reduced" ? 1 : 0,
  );

  useEffect(() => {
    animLevelNum.value =
      animationLevel === "full" ? 2 : animationLevel === "reduced" ? 1 : 0;
  }, [animationLevel, animLevelNum]);

  // Animation for the scroll down arrow
  const bounceAnim = useSharedValue(0.75);

  useEffect(() => {
    if (animationLevel !== "full") {
      bounceAnim.value = 0.75; // Static — visible but not bouncing
      return;
    }
    bounceAnim.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.5, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [bounceAnim, animationLevel]);

  const arrowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(bounceAnim.value, [0, 1], [0, 6]) }],
    opacity: interpolate(bounceAnim.value, [0, 0.5, 1], [0.45, 1, 0.45]),
  }));
  const wheelAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(bounceAnim.value, [0, 1], [0, 8]) }],
    opacity: interpolate(bounceAnim.value, [0, 0.5, 1], [0.95, 0.25, 0.95]),
  }));
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const isPhoneLayout = Platform.OS === "web" ? isMobile : windowWidth < 700;
  const isTabletLayout = Platform.OS !== "web" && !isPhoneLayout;
  const nativeBottomInset =
    Platform.OS === "web" ? 0 : Math.max(insets.bottom, 24);
  const floatingControlsBottom =
    Platform.OS === "web" ? 50 : nativeBottomInset + (isTabletLayout ? 88 : 76);
  const footerBottomReserve =
    Platform.OS === "web"
      ? 0
      : nativeBottomInset + (isTabletLayout ? 132 : 112);
  const styles = getStyles(
    isDark,
    colors,
    isPhoneLayout,
    isHeroAnimationEnabled,
    heroForegroundColor,
    heroForegroundMutedColor,
    windowWidth,
    windowHeight,
    footerBottomReserve,
  );
  const bgAnimation = useSharedValue(animationLevel === "none" ? 1 : 0);
  const scrollRef = React.useRef<any>(null);
  const feature1Anim = useSharedValue(animationLevel === "none" ? 1 : 0);
  const feature2Anim = useSharedValue(animationLevel === "none" ? 1 : 0);
  const feature3Anim = useSharedValue(animationLevel === "none" ? 1 : 0);

  useEffect(() => {
    if (animationLevel === "none") {
      bgAnimation.value = 1;
      feature1Anim.value = 1;
      feature2Anim.value = 1;
      feature3Anim.value = 1;
    } else {
      bgAnimation.value = withTiming(1, {
        duration: animationLevel === "full" ? 300 : 120,
      });
    }
  }, [
    bgAnimation,
    isDark,
    animationLevel,
    feature1Anim,
    feature2Anim,
    feature3Anim,
  ]);

  const animatedBackground = useAnimatedStyle(() => ({
    opacity: bgAnimation.value,
    // Always use withTiming — duration 0 gives an instant snap for 'none' mode
    // while still keeping a consistent return type for the Reanimated style engine
    backgroundColor: withTiming(isDark ? "#121212" : "#FFFFFF", {
      duration: animLevelNum.value === 0 ? 0 : 300,
    }),
  }));

  const router = useRouter();
  const scrollY = useSharedValue(0);
  const buttonAnimation = useSharedValue(0);

  const featuresRef = React.useRef<View>(null);
  const featuresLayoutRef = React.useRef({ y: 0 });

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  useEffect(() => {
    const resetScrollPosition = () => {
      scrollRef.current?.scrollTo?.({ y: 0, animated: false });
      scrollY.value = 0;
    };

    resetScrollPosition();
    const timer = setTimeout(
      resetScrollPosition,
      Platform.OS === "web" ? 0 : 80,
    );
    return () => clearTimeout(timer);
  }, [scrollY]);

  const handleScrollToFeatures = () => {
    if (!scrollRef.current) return;
    if (Platform.OS === "web") {
      const screenHeight =
        window.innerHeight || document.documentElement.clientHeight;
      scrollRef.current.scrollTo({ y: screenHeight * 0.5, animated: true });
    } else {
      const targetY =
        featuresLayoutRef.current.y > 0
          ? featuresLayoutRef.current.y
          : windowHeight * 0.85;
      const topClearance = isTabletLayout ? 28 : 8;
      scrollRef.current.scrollTo({
        y: Math.max(0, targetY - topClearance),
        animated: true,
      });
    }
  };

  useEffect(() => {
    if (user) {
      setUserName(user.email || user.user_metadata?.full_name || user.id);
    } else {
      setUserName(null);
    }
  }, [user]);

  const headerAnimatedStyle = useAnimatedStyle(() => {
    // none: hero always fully visible (no fade-out on scroll)
    if (animLevelNum.value === 0) return { opacity: 1 };
    const opacity = interpolate(scrollY.value, [0, 100], [1, 0], {
      extrapolateLeft: Extrapolation.CLAMP,
      extrapolateRight: Extrapolation.CLAMP,
    });
    return {
      opacity: withTiming(opacity, {
        duration: animLevelNum.value === 1 ? 50 : 100,
      }),
    };
  });

  const featuresAnimatedStyle = useAnimatedStyle(() => {
    // none/reduced: immediately visible
    if (animLevelNum.value < 2) return { opacity: 1 };
    const opacity = interpolate(scrollY.value, [0, 250, 400], [0, 0.5, 1], {
      extrapolateLeft: Extrapolation.CLAMP,
      extrapolateRight: Extrapolation.CLAMP,
    });
    return { opacity: withTiming(opacity, { duration: 150 }) };
  });

  const ctaAnimatedStyle = useAnimatedStyle(() => {
    // none/reduced: immediately visible
    if (animLevelNum.value < 2) return { opacity: 1 };
    const opacity = interpolate(scrollY.value, [300, 500], [0, 1], {
      extrapolateLeft: Extrapolation.CLAMP,
      extrapolateRight: Extrapolation.CLAMP,
    });
    return { opacity: withTiming(opacity, { duration: 150 }) };
  });

  // Animate feature cards on scroll (staggered for full, instant for reduced/none)
  useAnimatedReaction(
    () => scrollY.value,
    (currentScrollY) => {
      if (animLevelNum.value === 0) {
        feature1Anim.value = 1;
        feature2Anim.value = 1;
        feature3Anim.value = 1;
        return;
      }
      const dur = animLevelNum.value === 1 ? 150 : 500;
      if (currentScrollY > 150) {
        feature1Anim.value = withTiming(1, { duration: dur });
        feature2Anim.value = withDelay(
          animLevelNum.value === 1 ? 0 : 200,
          withTiming(1, { duration: dur }),
        );
        feature3Anim.value = withDelay(
          animLevelNum.value === 1 ? 0 : 400,
          withTiming(1, { duration: dur }),
        );
      } else if (animLevelNum.value === 2) {
        // Only reset in full mode so cards don't disappear when scrolling back
        feature1Anim.value = 0;
        feature2Anim.value = 0;
        feature3Anim.value = 0;
      }
    },
    [],
  );

  const feature1Style = useAnimatedStyle(() => {
    if (animLevelNum.value === 0)
      return { opacity: 1, transform: [{ translateY: 0 }] };
    return {
      opacity: feature1Anim.value,
      transform: [
        {
          translateY: withTiming((1 - feature1Anim.value) * 30, {
            duration: 500,
          }),
        },
      ],
    };
  });
  const feature2Style = useAnimatedStyle(() => {
    if (animLevelNum.value === 0)
      return { opacity: 1, transform: [{ translateY: 0 }] };
    return {
      opacity: feature2Anim.value,
      transform: [
        {
          translateY: withTiming((1 - feature2Anim.value) * 30, {
            duration: 500,
          }),
        },
      ],
    };
  });
  const feature3Style = useAnimatedStyle(() => {
    if (animLevelNum.value === 0)
      return { opacity: 1, transform: [{ translateY: 0 }] };
    return {
      opacity: feature3Anim.value,
      transform: [
        {
          translateY: withTiming((1 - feature3Anim.value) * 30, {
            duration: 500,
          }),
        },
      ],
    };
  });

  const words: string[] = t("taglineFlipList").split(",");
  const staticTagline = resolveHeroTaglineText(words, " ", true);
  const heroLogoSource =
    animationLevel === "none"
      ? getHashpassStaticHeroLogo(isDark)
      : getHashpassFullLogo(isDark);

  return (
    <Animated.View style={[styles.container, animatedBackground]}>
      <BackToTop
        scrollY={scrollY}
        scrollRef={scrollRef}
        colors={colors}
        bottomOffset={floatingControlsBottom}
      />
      <QuickSettingsPanel
        scrollY={scrollY}
        hideAfterScrollY={isTabletLayout ? 120 : 30}
      />

      <Animated.ScrollView
        ref={scrollRef}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        contentOffset={{ x: 0, y: 0 }}
        contentInsetAdjustmentBehavior="never"
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          {animationLevel === "full" && (
            <CrystalForgeBackground
              isDarkMode={isDark}
              enableClickSpawn={!isPhoneLayout}
              maxCrystals={isPhoneLayout ? 20 : 36}
            />
          )}
          <Animated.View
            style={[styles.heroTextContainer, headerAnimatedStyle]}
          >
            <View style={styles.logoStack}>
              <Image
                source={heroLogoSource}
                style={styles.logo}
                resizeMode="contain"
              />
              <View style={styles.taglineContainer} pointerEvents="none">
                {isHeroAnimationEnabled ? (
                  <FlipWords words={words} textStyle={styles.taglineAnimated} />
                ) : (
                  <Text
                    style={styles.taglineStatic}
                    numberOfLines={1}
                    ellipsizeMode="clip"
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    {staticTagline}
                  </Text>
                )}
              </View>
            </View>
          </Animated.View>
          <View style={{ flex: 1 }} />
          <Animated.View
            style={[styles.scrollDownContainer, headerAnimatedStyle]}
          >
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleScrollToFeatures}
              style={styles.scrollDownButton}
              hitSlop={
                isPhoneLayout
                  ? { top: 12, bottom: 0, left: 24, right: 24 }
                  : { top: 30, bottom: 0, left: 40, right: 40 }
              }
            >
              <View
                style={[
                  styles.scrollDownContent,
                  isPhoneLayout && styles.scrollDownContentMobile,
                ]}
                pointerEvents="box-none"
              >
                <Text
                  style={[
                    styles.scrollDownText,
                    isPhoneLayout && styles.scrollDownTextMobile,
                  ]}
                >
                  {t("scroll", "Scroll")}
                </Text>
                <View
                  style={[
                    styles.scrollIndicatorMouse,
                    isPhoneLayout && styles.scrollIndicatorMouseMobile,
                  ]}
                >
                  <Animated.View
                    style={[
                      styles.scrollWheel,
                      isPhoneLayout && styles.scrollWheelMobile,
                      wheelAnimatedStyle,
                    ]}
                  />
                </View>
                <Animated.View
                  style={[
                    styles.arrowDown,
                    isPhoneLayout && styles.arrowDownMobile,
                    arrowAnimatedStyle,
                  ]}
                >
                  <Svg
                    width={isPhoneLayout ? 16 : 20}
                    height={isPhoneLayout ? 10 : 12}
                    viewBox="0 0 20 12"
                    fill="none"
                  >
                    <Path
                      d="M2 2L10 10L18 2"
                      stroke={heroForegroundColor}
                      strokeWidth={isPhoneLayout ? "1.7" : "2"}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </Animated.View>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </View>

        <View
          ref={featuresRef}
          onLayout={(event) => {
            const { y } = event.nativeEvent.layout;
            featuresLayoutRef.current = { y };
          }}
        >
          <Features
            styles={styles}
            featuresAnimatedStyle={featuresAnimatedStyle}
            feature1Style={feature1Style}
            feature2Style={feature2Style}
            feature3Style={feature3Style}
            isDark={isDark}
          />
        </View>

        <Animated.View style={[styles.socialProof, featuresAnimatedStyle]}>
          <Testimonials locale={getCurrentLocale()} />
        </Animated.View>

        {/* Event Banner Carousel with Mobile App Download */}
        <Animated.View style={[styles.carouselSection, ctaAnimatedStyle]}>
          <EventBannerCarousel
            showDotIndicators={true}
            autoPlay={true}
            autoPlayInterval={5000}
            onEventPress={(
              event: { routes?: { home?: string } } | null | undefined,
            ) => {
              const routeHome = event?.routes?.home;
              if (routeHome) {
                const route = routeHome.replace(/\/+/g, "/"); // Remove any double slashes
                router.push(route as any);
              }
            }}
          />
        </Animated.View>

        <Animated.View
          style={[styles.cta, styles.ctaCentered, ctaAnimatedStyle]}
        >
          {userName ? (
            <>
              <Text style={styles.ctaHeadline}>
                👋 {t("welcomeBack")}
                {"\n"}
                {userName}
              </Text>
              <Animated.View style={styles.ctaButton}>
                <TouchableOpacity
                  onPress={() => router.push("/(shared)/dashboard/explore")}
                  activeOpacity={0.9}
                  onPressIn={() => {
                    buttonAnimation.value = withSpring(1);
                  }}
                  onPressOut={() => {
                    buttonAnimation.value = withSpring(0);
                  }}
                >
                  <Animated.View>
                    <InteractiveHoverButton text={t("goToApp")} />
                  </Animated.View>
                </TouchableOpacity>
              </Animated.View>
            </>
          ) : (
            <>
              <Text style={styles.ctaHeadline}>{t("readyToSimplify")}</Text>
              <Animated.View style={styles.ctaButton}>
                <TouchableOpacity
                  onPress={() => router.push("/(shared)/auth" as any)}
                  activeOpacity={0.9}
                  onPressIn={() => {
                    buttonAnimation.value = withSpring(1);
                  }}
                  onPressOut={() => {
                    buttonAnimation.value = withSpring(0);
                  }}
                >
                  <Animated.View>
                    <InteractiveHoverButton text={t("getStartedNow")} />
                  </Animated.View>
                </TouchableOpacity>
              </Animated.View>
            </>
          )}
        </Animated.View>

        <Animated.View style={[styles.socialProof, featuresAnimatedStyle]}>
          <Newsletter mode={isDark ? "dark" : "light"} />
        </Animated.View>

        <View style={styles.footer}>
          {Platform.OS === "web" && (
            <>
              <AnimatedGradientBackground
                startingGap={isDark ? 94 : 88}
                Breathing
                animationSpeed={0.08}
                breathingRange={10}
                driftSpeed={0.012}
                driftStrengthX={3.8}
                driftStrengthY={2.6}
                topOffset={isDark ? 8 : 2}
                gradientColors={
                  isDark
                    ? [
                        "#020617",
                        "#04213f",
                        "#0a3b66",
                        "#0e5a8a",
                        "#0c436f",
                        "#052a4e",
                        "#020617",
                      ]
                    : [
                        "#f8fafc",
                        "#e2e8f0",
                        "#dbeafe",
                        "#bfdbfe",
                        "#dbeafe",
                        "#e2e8f0",
                        "#f8fafc",
                      ]
                }
                gradientStops={[20, 38, 52, 66, 79, 90, 100]}
                containerClassName={isDark ? "opacity-95" : "opacity-88"}
              />
              <View style={styles.footerOverlay} />
            </>
          )}

          <View style={styles.footerForeground}>
            <View style={styles.footerContent}>
              {/* Brand Section */}
              <View style={styles.footerBrand}>
                <Image
                  source={getHashpassFooterLogo(isDark)}
                  style={styles.footerLogo}
                  resizeMode="contain"
                />
                <Text style={styles.footerBrandTagline}>
                  {t("footer.tagline")}
                </Text>
              </View>

              {/* Links Section */}
              <View style={styles.footerLinks}>
                <View style={styles.footerLinksColumn}>
                  <Text style={styles.footerLinksTitle}>
                    {t("footer.resources")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push("/(shared)/docs")}
                    style={styles.footerLink}
                  >
                    <Text style={styles.footerLinkText}>
                      {t("footer.docs")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      const storybookUrl =
                        Platform.OS === "web" &&
                        typeof window !== "undefined" &&
                        (process.env.NODE_ENV === "production" ||
                          window.location.hostname !== "localhost")
                          ? "/storybook"
                          : process.env.EXPO_PUBLIC_STORYBOOK_URL ||
                            "http://localhost:6006";
                      if (
                        Platform.OS === "web" &&
                        typeof window !== "undefined"
                      ) {
                        window.open(storybookUrl, "_blank");
                      } else {
                        Linking.openURL(storybookUrl);
                      }
                    }}
                    style={styles.footerLink}
                  >
                    <Text style={styles.footerLinkText}>
                      {t("footer.guides")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      const supportEmail =
                        process.env.NODEMAILER_FROM_SUPPORT ||
                        "support@hashpass.tech";
                      Linking.openURL(`mailto:${supportEmail}`);
                    }}
                    style={styles.footerLink}
                  >
                    <Text style={styles.footerLinkText}>
                      {t("footer.support")}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View
                  style={[
                    styles.footerLinksColumn,
                    isPhoneLayout && styles.footerLinksColumnMobile,
                  ]}
                >
                  <Text style={styles.footerLinksTitle}>
                    {t("footer.legal")}
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push("/(shared)/privacy")}
                    style={styles.footerLink}
                  >
                    <Text style={styles.footerLinkText}>
                      {t("footer.privacy")}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => router.push("/(shared)/terms")}
                    style={styles.footerLink}
                  >
                    <Text style={styles.footerLinkText}>
                      {t("footer.terms")}
                    </Text>
                  </TouchableOpacity>
                  {shouldShowFooterLink && footerLinkUrl && footerLinkName && (
                    <TouchableOpacity
                      onPress={() => Linking.openURL(footerLinkUrl)}
                      style={styles.footerLink}
                    >
                      <Text style={styles.footerLinkText}>
                        {footerLinkName}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>

            {/* Bottom Bar */}
            <View style={styles.footerBottom}>
              <View style={styles.footerBottomContent}>
                <Text style={styles.footerCopyright}>{t("copyright")}</Text>
                <VersionStatusIndicator
                  compact={true}
                  showVersion={true}
                  size="small"
                />
              </View>
            </View>
          </View>
        </View>
      </Animated.ScrollView>
    </Animated.View>
  );
}

const getStyles = (
  isDark: boolean,
  colors: any,
  isMobile: boolean,
  isHeroAnimationEnabled: boolean,
  heroForegroundColor: string,
  heroForegroundMutedColor: string,
  windowWidth = 375,
  windowHeight = 800,
  footerBottomReserve = 0,
) => {
  // On narrow native screens, cap logo width so it never overflows with padding
  const isNative = Platform.OS !== "web";
  const isNativeTablet = isNative && !isMobile;
  const maxLogoWidth = isNative
    ? Math.min(
        windowWidth - (isNativeTablet ? 160 : 48),
        isNativeTablet ? 500 : 300,
      )
    : isMobile
      ? 300
      : 580;
  const logoWidth = isMobile ? maxLogoWidth : 580;
  const nativeTabletLogoWidth = isNativeTablet ? maxLogoWidth : logoWidth;
  const resolvedLogoWidth = isNativeTablet ? nativeTabletLogoWidth : logoWidth;
  const logoHeight = isMobile
    ? Math.round(resolvedLogoWidth * 0.5)
    : isNativeTablet
      ? Math.round(resolvedLogoWidth * 0.36)
      : 220;
  const taglineOffset = isMobile ? 10 : isNativeTablet ? 12 : 18;
  const nativeHeroHeight = isNativeTablet
    ? Math.min(Math.max(windowHeight * 0.52, 560), 700)
    : Math.min(Math.max(windowHeight * 0.58, 440), 540);
  const heroHeight = isNative ? nativeHeroHeight : isMobile ? 480 : "100%";
  const heroMinHeight = isNative ? nativeHeroHeight : isMobile ? 480 : 520;

  return StyleSheet.create({
    container: {
      flex: 1,
      position: "relative",
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: footerBottomReserve,
    },
    hero: {
      minHeight: heroMinHeight,
      height: heroHeight,
      maxHeight: 1000,
      position: "relative",
      overflow: "hidden",
      borderBottomLeftRadius: 30,
      borderBottomRightRadius: 30,
      flexDirection: "column",
      justifyContent: "space-between",
      paddingBottom: isMobile ? 40 : isNativeTablet ? 54 : 60,
      // Native has no CrystalForgeBackground — provide a subtle gradient-tinted surface
      // so the logo has visual contrast in both light and dark mode.
      backgroundColor:
        Platform.OS !== "web" ? (isDark ? "#0e1117" : "#f0f0f5") : undefined,
    },
    heroImage: {
      width: "100%",
      height: "100%",
      opacity: isDark ? 0.8 : 1,
    },
    heroTextContainer: {
      position: "absolute",
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 2,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 20,
      width: "100%",
    },
    logoStack: {
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    logo: {
      width: resolvedLogoWidth,
      height: logoHeight,
    },
    headline: {
      fontSize: isMobile ? 24 : 48,
      fontWeight: "800",
      marginBottom: 10,
      letterSpacing: isMobile ? -0.5 : -1,
      lineHeight: isMobile ? 28 : 48,
    },
    taglineContainer: {
      position: "relative",
      marginTop: taglineOffset,
      width: "100%",
      maxWidth: isHeroAnimationEnabled
        ? resolvedLogoWidth
        : Math.min(
            Math.max(resolvedLogoWidth, isMobile ? 340 : 900),
            windowWidth - (isMobile ? 32 : 80),
          ),
      alignSelf: "center",
      alignItems: "center",
      justifyContent: "center",
      // On web the FlipWords exit uses scale:2 + translate — needs overflow
      // visible and extra height so the word flies out without a rectangular clip.
      height:
        Platform.OS === "web"
          ? isHeroAnimationEnabled
            ? isMobile
              ? 80
              : 160
            : isMobile
              ? 44
              : 72
          : isMobile
            ? 42
            : 60,
      overflow: Platform.OS === "web" ? "visible" : "hidden",
    },
    taglineAnimated: {
      fontSize: isMobile ? 18 : 34,
      opacity: 0.9,
      fontWeight: "500",
      letterSpacing: isMobile ? 0.8 : 1.5,
      lineHeight: isMobile ? 22 : 40,
      textAlign: "center",
      color: heroForegroundColor,
    },
    taglineStatic: {
      fontSize: isMobile ? 14 : 30,
      opacity: 1,
      fontWeight: "600",
      letterSpacing: isMobile ? 0.5 : 1.2,
      lineHeight: isMobile ? 18 : 34,
      textAlign: "center",
      color: heroForegroundColor,
    },
    sectionTitle: {
      fontSize: isMobile ? 24 : 28,
      fontWeight: "800",
      marginBottom: 30,
      textAlign: "center",
      letterSpacing: isMobile ? -0.5 : -0.5,
      marginTop: 10,
    },
    footer: {
      backgroundColor: colors.background.default,
      borderTopWidth: 1,
      borderTopColor: isDark
        ? "rgba(255, 255, 255, 0.1)"
        : "rgba(0, 0, 0, 0.1)",
      paddingTop: isMobile ? 40 : 60,
      paddingBottom: (isMobile ? 30 : 40) + footerBottomReserve,
      paddingHorizontal: isMobile ? 20 : 40,
      position: "relative",
      bottom: 0,
    },
    footerOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: isDark
        ? "rgba(2, 6, 23, 0.30)"
        : "rgba(248, 250, 252, 0.42)",
      pointerEvents: "none",
    },
    footerForeground: {
      position: "relative",
      zIndex: 1,
    },
    footerContent: {
      flexDirection: isMobile ? "column" : "row",
      justifyContent: isMobile ? "flex-start" : "space-between",
      alignItems: isMobile ? "flex-start" : "flex-start",
      marginBottom: isMobile ? 30 : 40,
      gap: isMobile ? 40 : 60,
      width: "100%",
    },
    footerBrand: {
      flex: isMobile ? 0 : 0.4,
      width: isMobile ? "100%" : "auto",
      marginBottom: isMobile ? 40 : 0,
      alignItems: isMobile ? "flex-start" : "flex-start",
    },
    footerLogo: {
      width: isMobile ? 180 : 220,
      height: isMobile ? 50 : 60,
      marginBottom: isMobile ? 16 : 12,
    },
    footerBrandTagline: {
      fontSize: isMobile ? 14 : 16,
      color: colors.text.secondary,
      lineHeight: isMobile ? 20 : 24,
      maxWidth: isMobile ? "100%" : 300,
      textAlign: isMobile ? "left" : "left",
      width: isMobile ? "100%" : "auto",
    },
    footerLinks: {
      flex: isMobile ? 0 : 0.6,
      flexDirection: isMobile ? "column" : "row",
      gap: isMobile ? 48 : 40,
      justifyContent: isMobile ? "flex-start" : "flex-end",
      width: isMobile ? "100%" : "auto",
      alignItems: isMobile ? "flex-start" : "flex-start",
      marginTop: isMobile ? 24 : 0,
      paddingTop: isMobile ? 0 : 0,
    },
    footerLinksColumn: {
      flex: isMobile ? 0 : 1,
      minWidth: isMobile ? "100%" : 140,
      width: isMobile ? "100%" : "auto",
    },
    footerLinksColumnMobile: {
      marginTop: isMobile ? 24 : 0,
    },
    footerLinksTitle: {
      fontSize: isMobile ? 14 : 16,
      fontWeight: "700",
      color: colors.text.primary,
      marginBottom: isMobile ? 14 : 16,
      letterSpacing: -0.3,
    },
    footerLink: {
      marginBottom: isMobile ? 12 : 12,
    },
    footerLinkText: {
      fontSize: isMobile ? 14 : 15,
      color: colors.text.secondary,
      lineHeight: isMobile ? 20 : 22,
    },
    footerBottom: {
      paddingTop: isMobile ? 20 : 30,
      borderTopWidth: 1,
      borderTopColor: isDark
        ? "rgba(255, 255, 255, 0.05)"
        : "rgba(0, 0, 0, 0.05)",
    },
    footerBottomContent: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 12,
      paddingRight: Platform.OS !== "web" && !isMobile ? 96 : 0,
    },
    footerCopyright: {
      fontSize: isMobile ? 12 : 14,
      color: colors.text.secondary,
      textAlign: "center",
    },
    features: {
      paddingHorizontal: 24,
      paddingVertical: 32,
      backgroundColor: "transparent",
      borderRadius: 16,
      marginHorizontal: 16,
      marginBottom: 32,
    },
    featuresContainer: {
      marginTop: isMobile ? 40 : isNativeTablet ? 34 : 40,
      marginBottom: 40,
    },
    featuresGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 24,
      paddingHorizontal: 16,
    },
    cta: {
      padding: 32,
      borderRadius: 2 * 16,
      alignItems: "center",
      marginBottom: 32,
      overflow: "hidden",
      position: "relative",
      color: isDark ? "#FFFFFF" : "#121212",
    },
    ctaCentered: {
      width: "100%",
      maxWidth: 740,
      alignSelf: "center",
    },
    ctaHeadline: {
      fontSize: 28,
      fontWeight: "800",
      color: isDark ? "#FFFFFF" : "#121212",
      textAlign: "center",
      marginBottom: 24,
      textShadowColor: "rgba(0, 0, 0, 0.2)",
      textShadowOffset: { width: 1, height: 1 },
      textShadowRadius: 2,
      letterSpacing: -0.5,
      lineHeight: 36,
    },
    ctaButton: {
      transform: [{ scale: 1.3 }],
      overflow: "hidden",
    },
    ctaButtonText: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.text.primary,
      letterSpacing: 0.5,
    },
    glossyOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: "60%",
      backgroundColor: "transparent",
      opacity: 0.3,
      pointerEvents: "none",
    },
    socialProof: {
      paddingHorizontal: 24,
      marginHorizontal: 16,
      marginBottom: 32,
    },
    testimonialContainer: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: "#2F2F2F",
    },
    testimonialText: {
      fontSize: 18,
      fontStyle: "italic",
      color: "#FFFFFF",
      textAlign: "center",
      marginBottom: 10,
      lineHeight: 26,
    },
    testimonialAuthor: {
      fontSize: 16,
      fontWeight: "bold",
      color: "#A3A3A3",
      textAlign: "right",
    },
    scrollDownContainer: {
      width: "100%",
      alignItems: "center",
      justifyContent: "flex-end",
      backgroundColor: "transparent",
      paddingBottom: isMobile ? 8 : 40,
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 10,
    },
    scrollDownButton: {
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      zIndex: 1001,
    },
    scrollDownContent: {
      alignItems: "center",
      justifyContent: "center",
      padding: 12,
      gap: 8,
      elevation: 3,
    },
    scrollDownContentMobile: {
      paddingVertical: 6,
      paddingHorizontal: 8,
      gap: 5,
    },
    scrollDownText: {
      color: heroForegroundColor,
      fontSize: 11,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 2.2,
      textAlign: "center",
    },
    scrollDownTextMobile: {
      fontSize: 9,
      letterSpacing: 1.2,
    },
    scrollIndicatorMouse: {
      width: 30,
      height: 46,
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: heroForegroundMutedColor,
      backgroundColor:
        Platform.OS === "web" && isHeroAnimationEnabled
          ? "rgba(255, 255, 255, 0.06)"
          : isDark
            ? "rgba(0, 0, 0, 0.18)"
            : "rgba(26, 26, 26, 0.03)",
      alignItems: "center",
      paddingTop: 8,
    },
    scrollIndicatorMouseMobile: {
      width: 24,
      height: 34,
      borderRadius: 14,
      borderWidth: 1.2,
      paddingTop: 6,
    },
    scrollWheel: {
      width: 4,
      height: 8,
      borderRadius: 2,
      backgroundColor: heroForegroundColor,
    },
    scrollWheelMobile: {
      width: 3,
      height: 6,
      borderRadius: 1.5,
    },
    arrowContainer: {
      width: 40,
      height: 40,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: 20,
      pointerEvents: "auto",
      elevation: 50,
      zIndex: 1001,
    },
    arrowButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: "center",
      alignItems: "center",
      cursor: "pointer",
      transform: [{ scale: 1 }],
    },
    arrowDown: {
      width: 20,
      height: 12,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 0,
      opacity: 0.88,
      position: "relative",
      bottom: 0,
    },
    arrowDownMobile: {
      width: 16,
      height: 10,
      opacity: 0.82,
    },
    carouselSection: {
      marginBottom: 32,
      marginHorizontal: 0,
    },
  });
};
