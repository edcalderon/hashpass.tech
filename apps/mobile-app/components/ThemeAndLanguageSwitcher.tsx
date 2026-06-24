
import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, Easing, Text, TouchableWithoutFeedback, Dimensions, Platform } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '../providers/LanguageProvider';
import { getAvailableLocales, useTranslation } from '../i18n/i18n';
import { useRouter, usePathname } from 'expo-router';
import Reanimated, { SharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Ionicons } from '../lib/vector-icons';

interface ThemeAndLanguageSwitcherProps {
  scrollY?: SharedValue<number>;
  hideAfterScrollY?: number;
}

const ThemeAndLanguageSwitcher = ({ scrollY, hideAfterScrollY = 30 }: ThemeAndLanguageSwitcherProps) => {
  const { toggleTheme, colors, isDark } = useTheme();
  const { locale, setLocale } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const loginScaleAnim = useRef(new Animated.Value(1)).current;
  const availableLocales = getAvailableLocales();
  const { t } = useTranslation('profile');

  // Check if we're on the auth page
  const isOnAuthPage = pathname?.includes('/auth') || pathname === '/(shared)/auth';
  
  // Check if mobile view
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const updateDimensions = () => {
      const { width } = Dimensions.get('window');
      setIsMobile(width < 768);
    };
    
    updateDimensions();
    const subscription = Dimensions.addEventListener('change', updateDimensions);
    
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  const currentLanguage = availableLocales.find(lang => lang.code === locale) || availableLocales[0];
  const currentLanguageLabel = t(`languages.${currentLanguage.name}`);

  const handleThemeToggle = () => {

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.bounce,
      }),
    ]).start();

    Animated.timing(rotateAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
      easing: Easing.linear,
    }).start(({ finished }) => {
      if (finished) {
        rotateAnim.setValue(0);
      }
    });

    toggleTheme();
  };

  const toggleLanguageMenu = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (showLanguageMenu) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setShowLanguageMenu(false));
    } else {
      setShowLanguageMenu(true);
      slideAnim.setValue(0);
      Animated.spring(slideAnim, {
        toValue: 1,
        friction: 5,
        useNativeDriver: true,
      }).start();
    }
  };

  const handleLanguageSelect = (langCode: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setLocale(langCode);
      setShowLanguageMenu(false);
    } catch (error) {
      console.error('Failed to change language:', error);
    }
  };

  const handleLoginPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    Animated.sequence([
      Animated.timing(loginScaleAnim, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(loginScaleAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.bounce,
      }),
    ]).start();

    router.push('/(shared)/auth');
  };

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const animatedStyle = {
    transform: [
      { rotate: rotateInterpolate },
      { scale: scaleAnim },
    ],
  };

  const loginAnimatedStyle = {
    transform: [{ scale: loginScaleAnim }],
  };

  const menuTranslateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-20, 0],
  });

  const menuOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const containerAnimatedStyle = useAnimatedStyle(() => {
    if (!scrollY) {
      return {
        opacity: 1,
        pointerEvents: 'auto',
      } as const;
    }

    const shouldShow = scrollY.value <= hideAfterScrollY;
    return {
      opacity: withTiming(shouldShow ? 1 : 0, { duration: 160 }),
      pointerEvents: shouldShow ? 'auto' : 'none',
    } as const;
  }, [scrollY, hideAfterScrollY]);

  return (
    <Reanimated.View
      style={[
        styles.container,
        isMobile && styles.containerMobile,
        containerAnimatedStyle,
      ]}
    >
      <View style={styles.languageContainer}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.surface }]}
          onPress={toggleLanguageMenu}
          activeOpacity={0.8}
          accessibilityLabel={`${currentLanguage.code.toUpperCase()} ${currentLanguageLabel}`}
        >
          <Text style={[styles.languageText, { color: colors.text.primary }]}>
            {currentLanguage.code.toUpperCase()}
          </Text>
        </TouchableOpacity>

        {showLanguageMenu && (
          <Animated.View
            style={[
              styles.languageMenu,
              {
                backgroundColor: colors.surface,
                transform: [{ translateY: menuTranslateY }],
                opacity: menuOpacity,
                shadowColor: isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.2)',
              }
            ]}
          >
            {availableLocales.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.languageItem,
                  lang.code === locale && { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)' }
                ]}
                onPress={() => handleLanguageSelect(lang.code)}
              >
                <View style={styles.languageItemRow}>
                  <Text style={[styles.languageText, { color: colors.text.primary }]}>
                    {t(`languages.${lang.name}`)}
                  </Text>
                  <View
                    style={[
                      styles.languageCodeBadge,
                      {
                        borderColor: isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.14)',
                        backgroundColor: lang.code === locale
                          ? (isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(0, 0, 0, 0.08)')
                          : (isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.85)'),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.languageCodeText,
                        {
                          color: colors.text.secondary,
                        },
                      ]}
                    >
                      {lang.code.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </Animated.View>
        )}
      </View>

      <Animated.View style={[styles.button, styles.buttonSpacing, animatedStyle]}>
        <TouchableOpacity
          style={{
            width: '100%',
            height: '100%',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: colors.primary,
            borderRadius: 25,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.25,
            shadowRadius: 3.84,
            elevation: 5,
          }}
          onPress={handleThemeToggle}
          activeOpacity={0.8}
        >
          <Ionicons
            name={isDark ? 'sunny' : 'moon'}
            size={24}
            color={colors.primaryContrastText}
          />
        </TouchableOpacity>
      </Animated.View>

      {!isOnAuthPage && (
        <Animated.View style={[styles.button, styles.buttonSpacing, loginAnimatedStyle]}>
          <TouchableOpacity
            style={{
              width: '100%',
              height: '100%',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: isDark ? colors.secondary : colors.primary,
              borderRadius: 25,
              shadowColor: isDark ? colors.secondary : colors.primary,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.25,
              shadowRadius: 3.84,
              elevation: 5,
            }}
            onPress={handleLoginPress}
            activeOpacity={0.8}
          >
            <Ionicons
              name="log-in"
              size={24}
              color={isDark ? colors.secondaryContrastText : colors.primaryContrastText}
            />
          </TouchableOpacity>
        </Animated.View>
      )}

      {showLanguageMenu && (
        <TouchableWithoutFeedback onPress={toggleLanguageMenu}>
          <View style={[
            styles.overlay,

          ]} />
        </TouchableWithoutFeedback>
      )}
    </Reanimated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1000,
    alignItems: 'center',
  },
  containerMobile: {
    top: Platform.OS === 'web' ? 16 : 56,
    right: 12,
  },
  languageContainer: {
    position: 'relative',
  },
  button: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  buttonSpacing: {
    marginLeft: 10,
  },
  languageMenu: {
    position: 'absolute',
    top: 60,
    right: 0,
    minWidth: 184,
    maxWidth: 220,
    borderRadius: 16,
    paddingVertical: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 1001,
    maxHeight: 420,
  },
  languageItem: {
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  languageItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  languageText: {
    fontSize: 16,
    fontWeight: '500',
    flexShrink: 1,
  },
  languageCodeBadge: {
    minWidth: 42,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageCodeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
});

export default ThemeAndLanguageSwitcher;
