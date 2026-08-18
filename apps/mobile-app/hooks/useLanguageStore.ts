import { useCallback, useState, useEffect } from 'react';
import * as Localization from 'expo-localization';
import { setLocale, isLocaleOverrideActive } from '../i18n/i18n';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type LanguageStoreType = {
  locale: string | null;
  setLocale: (locale: string) => Promise<void>;
};

export const useLanguageStore = (): LanguageStoreType => {
  const [locale, setLocaleState] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const updateLocale = useCallback(async (newLocale: string) => {
    try {
      await AsyncStorage.setItem('user_locale', newLocale);
      setLocale(newLocale);
      setLocaleState(newLocale);
    } catch (error) {
      console.error('Failed to update locale', error);
      // Fallback to English if setting fails
      setLocale('en');
      setLocaleState('en');
    }
  }, []);

  // Load saved language preference on initial render
  useEffect(() => {
    const loadLocale = async () => {
      try {
        const savedLocale = await AsyncStorage.getItem('user_locale');
        // A screen can request a specific locale that must win over this
        // provider's own device/saved-preference detection (see
        // i18n.ts's setLocaleOverride doc comment) -- this AsyncStorage read
        // is real async I/O, so it can resolve after that screen's own
        // effect already applied its locale. Re-check right before applying
        // rather than only at effect start, since the override can be set
        // at any point during this await.
        if (isLocaleOverrideActive()) {
          setIsInitialLoad(false);
          return;
        }
        if (savedLocale) {
          setLocale(savedLocale);
          setLocaleState(savedLocale);
        } else {
          // If no saved preference, use device locale
          const deviceLocale = Localization.getLocales()[0].languageCode || 'en';
          if (['en', 'es', 'ko'].includes(deviceLocale)) {
            setLocale(deviceLocale);
            setLocaleState(deviceLocale);
          } else {
            setLocale('en');
            setLocaleState('en');
          }
        }
        setIsInitialLoad(false);
      } catch (error) {
        console.error('Failed to load locale', error);
        if (isLocaleOverrideActive()) {
          setIsInitialLoad(false);
          return;
        }
        // Fallback to English if loading fails
        await AsyncStorage.setItem('user_locale', 'en');
        setLocale('en');
        setLocaleState('en');
        setIsInitialLoad(false);
      }
    };

    loadLocale();
  }, []);

  // Listen for system locale changes
  useEffect(() => {
    if (Platform.OS === 'ios') {
      const subscription = AppState.addEventListener('change', async () => {
        const currentLocale = await AsyncStorage.getItem('user_locale');
        if (!currentLocale) { // Only auto-update if user hasn't set a preference
          const deviceLocale = Localization.getLocales()[0].languageCode || 'en';
          if (['en', 'es', 'ko'].includes(deviceLocale) && deviceLocale !== locale) {
            await updateLocale(deviceLocale);
          }
        }
      });

      return () => {
        subscription.remove();
      };
    }
  }, [locale, updateLocale]);

  const changeLocale = async (newLocale: string) => {
    if (newLocale !== locale) {
      await updateLocale(newLocale);
    }
  };

  return { locale, setLocale: changeLocale };
};
