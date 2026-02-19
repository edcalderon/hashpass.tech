import React from 'react';
import { TouchableOpacity, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, SharedValue, useSharedValue, withTiming, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useLanguage } from '../providers/LanguageProvider';
import { getAvailableLocales } from '../i18n/i18n';
import * as Haptics from 'expo-haptics';

interface BackToTopProps {
  scrollY: SharedValue<number>;
  scrollRef: React.RefObject<any>;
  colors: any;
}

const BackToTop: React.FC<BackToTopProps> = ({ scrollY, scrollRef, colors }) => {
  const { isDark, toggleTheme } = useTheme();
  const { locale, setLocale } = useLanguage();
  const scaleAnim = useSharedValue(1);
  const rotateAnim = useSharedValue(0);
  const languageScaleAnim = useSharedValue(1);
  const availableLocales = getAvailableLocales();

  const currentLanguage = availableLocales.find(lang => lang.code === locale) || availableLocales[0];

  const buttonOpacity = useAnimatedStyle(() => ({
    opacity: scrollY.value > 30 ? 1 : 0,
    pointerEvents: scrollY.value > 30 ? 'auto' : 'none',
  } as const));

  const handleScrollToTop = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleThemeToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    
    scaleAnim.value = withTiming(0.8, { duration: 100 }, () => {
      scaleAnim.value = withSpring(1, { damping: 10, stiffness: 100 });
    });
    
    rotateAnim.value = withTiming(1, { duration: 300 }, () => {
      rotateAnim.value = 0;
    });

    toggleTheme();
  };

  const handleLanguageSwitch = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      
      // Animate button press
      languageScaleAnim.value = withTiming(0.8, { duration: 100 }, () => {
        languageScaleAnim.value = withSpring(1, { damping: 10, stiffness: 100 });
      });

      // Find current language index and switch to next
      const currentIndex = availableLocales.findIndex(lang => lang.code === locale);
      const nextIndex = (currentIndex + 1) % availableLocales.length;
      const nextLocale = availableLocales[nextIndex].code;
      
      await setLocale(nextLocale);
    } catch (error) {
      console.error('Failed to change language:', error);
    }
  };

  const themeButtonStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scaleAnim.value },
      { rotate: `${rotateAnim.value * 360}deg` },
    ],
  }));

  const languageButtonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: languageScaleAnim.value }],
  }));

  const buttonStyle = {
    ...baseStyles.button,
    backgroundColor: colors.surface
  };

  return (
    <Animated.View style={[baseStyles.buttonContainer, buttonOpacity]}>
      {/* Back to Top Button */}
      <TouchableOpacity
        style={buttonStyle}
        onPress={handleScrollToTop}
        activeOpacity={0.8}
      >
        <Ionicons name="arrow-up" size={24} color={colors.text.primary} />
      </TouchableOpacity>

      {/* Theme Toggle Button */}
      <Animated.View style={themeButtonStyle}>
        <TouchableOpacity
          style={[baseStyles.button, baseStyles.themeButton, { backgroundColor: colors.primary }]}
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

      {/* Language Switch Button */}
      <Animated.View style={languageButtonStyle}>
        <TouchableOpacity
          style={[baseStyles.button, baseStyles.languageButton, { backgroundColor: colors.surface }]}
          onPress={handleLanguageSwitch}
          activeOpacity={0.8}
        >
          <Text style={[baseStyles.languageText, { color: colors.text.primary }]}>
            {currentLanguage.code.toUpperCase()}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
};

const baseStyles = StyleSheet.create({
  buttonContainer: {
    position: 'absolute',
    bottom: 50,
    right: 20,
    zIndex: 100,
    alignItems: 'center',
  },
  button: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    marginBottom: 12,
  },
  themeButton: {
    marginBottom: 12,
  },
  languageButton: {
    marginBottom: 0,
  },
  languageText: {
    fontSize: 16,
    fontWeight: '500',
  },
});

export default BackToTop;
