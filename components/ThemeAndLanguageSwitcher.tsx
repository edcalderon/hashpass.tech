
import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, Easing, Text, Dimensions, Platform } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useLanguage } from '../providers/LanguageProvider';
import { getAvailableLocales } from '../i18n/i18n';
import { useRouter, usePathname } from 'expo-router';

const ThemeAndLanguageSwitcher = () => {
  const { toggleTheme, colors, isDark } = useTheme();
  const { locale, setLocale } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const languageScaleAnim = useRef(new Animated.Value(1)).current;
  const loginScaleAnim = useRef(new Animated.Value(1)).current;
  const allAvailableLocales = getAvailableLocales();

  // Check if we're on the auth page
  const isOnAuthPage = pathname?.includes('/auth') || pathname === '/(shared)/auth';
  
  // Check if we're on the LUKAS page - only show en, es, pt
  const isOnLukasPage = pathname?.includes('/lukas') || pathname === '/lukas';
  const availableLocales = isOnLukasPage
    ? allAvailableLocales.filter(lang => ['en', 'es', 'pt'].includes(lang.code))
    : allAvailableLocales;
  
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

  // If on LUKAS page and current locale is not in allowed list, switch to English
  useEffect(() => {
    if (isOnLukasPage && !['en', 'es', 'pt'].includes(locale)) {
      setLocale('en');
    }
  }, [isOnLukasPage, locale, setLocale]);

  const currentLanguage = availableLocales.find(lang => lang.code === locale) || availableLocales[0];

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

  const handleLanguageSwitch = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      // Find current index and cycle to next
      const currentIndex = availableLocales.findIndex(lang => lang.code === locale);
      const nextIndex = (currentIndex + 1) % availableLocales.length;
      const nextLocale = availableLocales[nextIndex].code;
      
      // Animate the switch
      Animated.sequence([
        Animated.timing(languageScaleAnim, {
          toValue: 0.8,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(languageScaleAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.bounce,
        }),
      ]).start();
      
      setLocale(nextLocale);
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

  const languageAnimatedStyle = {
    transform: [{ scale: languageScaleAnim }],
  };

  return (
    <View style={[
      styles.container,
      isOnAuthPage && isMobile && styles.containerMobile
    ]}>
      <Animated.View style={[styles.button, languageAnimatedStyle, { backgroundColor: colors.surface }]}>
        <TouchableOpacity
          style={{
            width: '100%',
            height: '100%',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={handleLanguageSwitch}
          activeOpacity={0.8}
        >
          <Text style={[styles.languageText, { color: colors.text.primary }]}>
            {currentLanguage.code.toUpperCase()}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {!isOnLukasPage && (
        <Animated.View style={[styles.button, animatedStyle, { marginLeft: 10 }]}>
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
      )}

      {!isOnAuthPage && !isOnLukasPage && (
        <Animated.View style={[styles.button, loginAnimatedStyle, { marginLeft: 10 }]}>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1000,
    alignItems: 'flex-start',
  },
  containerMobile: {
    top: Platform.OS === 'web' ? 10 : 60,
    right: 10,
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
  languageText: {
    fontSize: 16,
    fontWeight: '500',
  },
});

export default ThemeAndLanguageSwitcher;
