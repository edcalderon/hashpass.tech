'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { catalogs } from '../locales/index';
import { createTranslator, detectLocale, persistLocale, AVAILABLE_LOCALES } from '../core';
import type { I18nContextValue, SupportedLocale } from '../types';

const I18nContext = createContext<I18nContextValue | null>(null);

const SUPPORTED = AVAILABLE_LOCALES.map((l) => l.code);

interface I18nProviderProps {
  children: React.ReactNode;
  defaultLocale?: SupportedLocale;
  /** Pass a detected locale from the server (e.g. from Accept-Language header) */
  serverLocale?: SupportedLocale;
}

export function I18nProvider({ children, defaultLocale = 'en', serverLocale }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<SupportedLocale>(serverLocale ?? defaultLocale);

  useEffect(() => {
    const detected = detectLocale(SUPPORTED);
    setLocaleState(detected);
  }, []);

  const setLocale = useCallback((next: SupportedLocale) => {
    setLocaleState(next);
    persistLocale(next);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = next;
    }
  }, []);

  const t = useMemo(
    () => createTranslator(catalogs[locale], catalogs['en']),
    [locale]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t, availableLocales: AVAILABLE_LOCALES }),
    [locale, setLocale, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
