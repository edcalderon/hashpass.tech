import React, { useEffect, useState } from 'react';
import { useTranslation, getCurrentLocale } from '../i18n/i18n';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import Features from './components/Features';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { ThemeAndLanguageSwitcher } from './components/ThemeAndLanguageSwitcher';
import { BackToTop } from './components/BackToTop';
import Testimonials from './components/Testimonials';
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
} from 'react-native-reanimated';
import { InteractiveHoverButton } from './components/InteractiveHoverButton';
import { FlipWords } from './components/FlipWords';
import { Newsletter } from './components/newsletter';

export default function HomeScreen() {
  const AnimatedImage = Animated.createAnimatedComponent(Image);
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const [userName, setUserName] = useState<string | null>(null);
  const { t } = useTranslation('index');
  const styles = getStyles(isDark, colors);
  const bgAnimation = useSharedValue(0);
  const scrollRef = React.useRef<any>(null);
  const feature1Anim = useSharedValue(0);
  const feature2Anim = useSharedValue(0);
  const feature3Anim = useSharedValue(0);


  useEffect(() => {
    bgAnimation.value = withTiming(1, { duration: 300 });
  }, [isDark]);

  const animatedBackground = useAnimatedStyle(() => ({
    opacity: bgAnimation.value,
    backgroundColor: withTiming(
      isDark ? '#121212' : '#FFFFFF',
      { duration: 300 }
    )
  }));

  const router = useRouter();
  const scrollY = useSharedValue(0);
  const buttonAnimation = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });


  useEffect(() => {
    if (user) {
      setUserName(user.email || user.user_metadata?.full_name || user.id);
    } else {
      setUserName(null);
    }
  }, [user]);

  const headerAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, 100],
      [1, 0],
      { extrapolateLeft: Extrapolation.CLAMP, extrapolateRight: Extrapolation.CLAMP }
    );
    return {
      opacity: withTiming(opacity, { duration: 100 })
    };
  });

  const heroImageAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(
      scrollY.value,
      [0, 200],
      [1, 0.9],
      { extrapolateLeft: Extrapolation.CLAMP, extrapolateRight: Extrapolation.CLAMP }
    );
    const opacity = interpolate(
      scrollY.value,
      [0, 200],
      [1, 0],
      { extrapolateLeft: Extrapolation.CLAMP, extrapolateRight: Extrapolation.CLAMP }
    );
    return {
      transform: [{ scale: withTiming(scale, { duration: 100 }) }],
      opacity: withTiming(opacity, { duration: 100 })
    };
  });

  const featuresAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, 250, 400],
      [0, 0.5, 1],
      { extrapolateLeft: Extrapolation.CLAMP, extrapolateRight: Extrapolation.CLAMP }
    );
    const scale = interpolate(
      scrollY.value,
      [0, 250, 400],
      [0.9, 0.95, 1],
      { extrapolateLeft: Extrapolation.CLAMP, extrapolateRight: Extrapolation.CLAMP }
    );
    return {
      opacity: withTiming(opacity, { duration: 100 }),
      transform: [{ scale: withTiming(scale, { duration: 100 }) }]
    };
  });

  const ctaAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [300, 500],
      [0, 1],
      { extrapolateLeft: Extrapolation.CLAMP, extrapolateRight: Extrapolation.CLAMP }
    );
    const scale = interpolate(
      scrollY.value,
      [300, 500],
      [0.9, 1],
      { extrapolateLeft: Extrapolation.CLAMP, extrapolateRight: Extrapolation.CLAMP }
    );
    return {
      opacity: withTiming(opacity, { duration: 100 }),
      transform: [{ scale: withTiming(scale, { duration: 100 }) }]
    };
  });

  // Animate features based on scroll position
  useAnimatedReaction(
    () => scrollY.value,
    (currentScrollY) => {
      // Start animating when the features section comes into view
      if (currentScrollY > 150) {
        feature1Anim.value = withTiming(1, { duration: 500 });
        feature2Anim.value = withDelay(200, withTiming(1, { duration: 500 }));
        feature3Anim.value = withDelay(400, withTiming(1, { duration: 500 }));
      } else {
        // Reset animations when scrolling back up
        feature1Anim.value = 0;
        feature2Anim.value = 0;
        feature3Anim.value = 0;
      }
    },
    []
  );

  // Animated styles for each feature
  const feature1Style = useAnimatedStyle(() => ({
    opacity: feature1Anim.value,
    transform: [
      {
        translateY: withTiming((1 - feature1Anim.value) * 30, { duration: 500 })
      }
    ],
  }));

  const feature2Style = useAnimatedStyle(() => ({
    opacity: feature2Anim.value,
    transform: [
      {
        translateY: withTiming((1 - feature2Anim.value) * 30, { duration: 500 })
      }
    ],
  }));

  const feature3Style = useAnimatedStyle(() => ({
    opacity: feature3Anim.value,
    transform: [
      {
        translateY: withTiming((1 - feature3Anim.value) * 30, { duration: 500 })
      }
    ],
  }));

  const words: string[] = t('taglineFlipList').split(',');

  return (
    <Animated.View style={[styles.container, animatedBackground]}>

      <BackToTop scrollY={scrollY} scrollRef={scrollRef} colors={colors} />

      <Animated.ScrollView
        ref={scrollRef}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
      >
        <ThemeAndLanguageSwitcher />

        <View style={styles.hero}>
          <Animated.View style={heroImageAnimatedStyle}>
            <AnimatedImage
              source={{ uri: 'https://images.pexels.com/photos/7096461/pexels-photo-7096461.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=2' }}
              style={styles.heroImage}
              resizeMode="cover"
              sharedTransitionTag="heroImage"
            />
          </Animated.View>
          <Animated.View style={[styles.heroTextContainer, headerAnimatedStyle]}>
            <Image
              source={isDark
                ? require('../assets/logos/logo-full-hashpass-black.svg')
                : require('../assets/logos/logo-full-hashpass-white.svg')
              }
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={[styles.tagline, { color: colors.text.primary }]}>
              -<FlipWords words={words} />-
            </Text>
          </Animated.View>

        </View>


        <Features
          styles={styles}
          featuresAnimatedStyle={featuresAnimatedStyle}
          feature1Style={feature1Style}
          feature2Style={feature2Style}
          feature3Style={feature3Style}
          isDark={isDark}
        />


        <Animated.View className="max-w-[740px] mx-auto" style={[styles.cta, ctaAnimatedStyle]}>
          {userName ? (
            <>

              <Text style={styles.ctaHeadline}>👋 {t('welcomeBack')} <br />{userName}</Text>
              <Animated.View style={styles.ctaButton}>
                <TouchableOpacity
                  onPress={() => router.push('/(tabs)/wallet')}
                  activeOpacity={0.9}
                  onPressIn={() => {
                    buttonAnimation.value = withSpring(1);
                  }}
                  onPressOut={() => {
                    buttonAnimation.value = withSpring(0);
                  }}
                >
                  <Animated.View>
                    <InteractiveHoverButton text={t('goToApp')} />
                  </Animated.View>
                </TouchableOpacity>
              </Animated.View>
            </>
          ) : (
            <>
              <Text style={styles.ctaHeadline}>{t('readyToSimplify')}</Text>
              <Animated.View style={styles.ctaButton}>
                <TouchableOpacity
                  onPress={() => router.push('/auth')}
                  activeOpacity={0.9}
                  onPressIn={() => {
                    buttonAnimation.value = withSpring(1);
                  }}
                  onPressOut={() => {
                    buttonAnimation.value = withSpring(0);
                  }}
                >
                  <Animated.View>
                    <InteractiveHoverButton text={t('getStartedNow')} />
                  </Animated.View>
                </TouchableOpacity>
              </Animated.View>
            </>
          )}
        </Animated.View>



        <Animated.View style={[styles.socialProof, featuresAnimatedStyle]}>
          <Testimonials locale={getCurrentLocale()} />
        </Animated.View>

        <Newsletter mode={isDark ? 'dark' : 'light'} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('copyright')}</Text>
        </View>
      </Animated.ScrollView>
    </Animated.View>

  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  scrollView: {
    flex: 1,
  },
  hero: {
    height: 400,
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  heroImage: {
    width: '100%',
    height: '100%',
    opacity: isDark ? 0.8 : 1,
  },
  heroTextContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    width: '100%',
  },
  logo: {
    width: 300,
    height: 100,
    marginBottom: 15,
  },
  headline: {
    fontSize: 48,
    fontWeight: '800',
    marginBottom: 10,
    letterSpacing: -1,
    lineHeight: 48,
  },
  tagline: {
    fontSize: 16,
    opacity: 0.9,
    fontWeight: '400',
    letterSpacing: 1,
    textAlign: 'center',
    width: '100%',
    maxWidth: 400,
    transform: [{ translateY: 0 }],
    backfaceVisibility: 'hidden',
    position: 'relative',
  } as const,
  sectionTitle: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 30,
    textAlign: 'center',
    letterSpacing: -0.5,
    marginTop: 10,
  },
  footer: {
    padding: 20,
    backgroundColor: colors.background.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 14,
    color: colors.text.primary,
    textAlign: 'center',
  },
  features: {
    paddingHorizontal: 24,
    paddingVertical: 32,
    backgroundColor: 'transparent',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 32,
  },
  featuresContainer: {
    marginTop: 40,
    marginBottom: 40,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 24,
    paddingHorizontal: 16,
  },
  cta: {
    padding: 32,
    borderRadius: 2 * 16,
    alignItems: 'center',
    marginBottom: 32,
    overflow: 'hidden',
    position: 'relative',
    color: isDark ? '#FFFFFF' : '#121212',
  },
  ctaHeadline: {
    fontSize: 28,
    fontWeight: '800',
    color: isDark ? '#FFFFFF' : '#121212',
    textAlign: 'center',
    marginBottom: 24,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
    letterSpacing: -0.5,
    lineHeight: 36,
  },
  ctaButton: {
    transform: [{ scale: 1.3 }],
    overflow: 'hidden',
  },
  ctaButtonText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  glossyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60%',
    backgroundColor: 'transparent',
    opacity: 0.3,
    pointerEvents: 'none',
  },
  socialProof: {
    paddingHorizontal: 24,
    marginHorizontal: 16,
    marginBottom: 32,
  },
  testimonialContainer: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2F2F2F',
  },
  testimonialText: {
    fontSize: 18,
    fontStyle: 'italic',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 26,
  },
  testimonialAuthor: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#A3A3A3',
    textAlign: 'right',
  }
});