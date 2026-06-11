'use client';

import { useI18n } from './context';
import type { SupportedLocale, TranslateFn } from '../types';

export function useTranslation(namespace?: string): {
  t: TranslateFn;
  locale: SupportedLocale;
} {
  const { t: rootT, locale } = useI18n();

  const t: TranslateFn = (key, params) => {
    const fullKey = namespace ? `${namespace}.${key}` : key;
    return rootT(fullKey, params);
  };

  return { t, locale };
}

export function useLocale(): SupportedLocale {
  return useI18n().locale;
}

export function useSetLocale(): (locale: SupportedLocale) => void {
  return useI18n().setLocale;
}

export function useAvailableLocales() {
  return useI18n().availableLocales;
}
