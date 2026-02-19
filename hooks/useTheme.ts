import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeColors, lightColors, darkColors } from '../lib/theme';
import { ThemeContext, ThemeContextType, ThemeMode } from '../types/theme';

const THEME_STORAGE_KEY = '@theme_preference';

export const useThemeProvider = () => {
  const systemColorScheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [isReady, setIsReady] = useState(false);

  // Load saved theme preference
  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const savedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null;
        if (savedTheme) {
          setThemeState(savedTheme);
        }
      } catch (error) {
        console.error('Failed to load theme preference', error);
      } finally {
        setIsReady(true);
      }
    };

    loadThemePreference();
  }, []);

  const setTheme = useCallback(async (newTheme: ThemeMode) => {
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, newTheme);
      setThemeState(newTheme);
    } catch (error) {
      console.error('Failed to save theme preference', error);
    }
  }, []);

  const isDark = useMemo(() => {
    return theme === 'dark' || (theme === 'system' && systemColorScheme === 'dark');
  }, [theme, systemColorScheme]);

  const colors: ThemeColors = useMemo(() => {
    return isDark ? darkColors : lightColors;
  }, [isDark]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  return useMemo(() => ({
    theme,
    setTheme,
    isDark,
    colors,
    toggleTheme,
    isReady,
  }), [theme, isDark, colors, toggleTheme, isReady, setTheme]);
};

export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};