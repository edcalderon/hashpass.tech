import { i18n as coreI18n } from '@lingui/core';
import * as Localization from 'expo-localization';
import { useEffect, useState, useCallback } from 'react';

// Statically import existing locale files (flat JSON under i18n/locales)
import enMessages from './locales/en.json';
import esMessages from './locales/es.json';
import koMessages from './locales/ko.json';
import frMessages from './locales/fr.json';
import ptMessages from './locales/pt.json';
import deMessages from './locales/de.json';

// If your messages are nested under keys, map them here, otherwise export as-is
function transformMessages(nested: any): Record<string, string> {
  const flat: Record<string, string> = {};
  const walk = (obj: any, prefix = '') => {
    Object.keys(obj || {}).forEach((k) => {
      const v = (obj as any)[k];
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object') {
        if ('translation' in v && typeof v.translation === 'string') {
          flat[key] = v.translation as string;
        } else {
          walk(v, key);
        }
      } else if (typeof v === 'string') {
        flat[key] = v;
      }
    });
  };
  walk(nested);
  return flat;
}

const messagesByLocale: Record<string, Record<string, string>> = {
  en: transformMessages(enMessages as any),
  es: transformMessages(esMessages as any),
  ko: transformMessages(koMessages as any),
  fr: transformMessages(frMessages as any),
  pt: transformMessages(ptMessages as any),
  de: transformMessages(deMessages as any),
};

// Use the global singleton so @lingui/macro can see current locale
export const i18n = coreI18n;

// Synchronously set a safe default locale to avoid race conditions with t()/Trans
if (!(i18n as any).locale) {
  i18n.load('en', messagesByLocale.en);
  i18n.activate('en');
}

export function getAvailableLocales() {
  return [
    { code: 'en', name: 'english' },
    { code: 'es', name: 'spanish' },
    { code: 'ko', name: 'korean' },
    { code: 'fr', name: 'french' },
    { code: 'pt', name: 'portuguese' },
    { code: 'de', name: 'german' },
  ];
}

export function getCurrentLocale(): string {
  return ((i18n as any).locale as string) || 'en';
}

export async function initI18n() {
  const device = (Localization.getLocales?.()[0]?.languageCode || 'en').toLowerCase();
  const locale = messagesByLocale[device] ? device : 'en';
  i18n.load(locale, messagesByLocale[locale]);
  i18n.activate(locale);
}

export async function loadMessages(locale: string) {
  const lc = locale.toLowerCase();
  const chosen = messagesByLocale[lc] ? lc : 'en';
  i18n.load(chosen, messagesByLocale[chosen]);
  i18n.activate(chosen);
}

export async function setLocale(locale: string) {
  await loadMessages(locale);
}

// Initialize on import (will adjust from default 'en' to device language)
initI18n().catch(() => {});

export const useTranslation = (ns?: string) => {
  const [currentLocale, setCurrentLocaleState] = useState((i18n as any).locale);

  useEffect(() => {
    const id = setInterval(() => {
      if ((i18n as any).locale !== currentLocale) setCurrentLocaleState((i18n as any).locale);
    }, 100);
    return () => clearInterval(id);
  }, [currentLocale]);

  const t = useCallback(
    (key: string, params: Record<string, any> = {}) => {
      const fullKey = ns ? `${ns}.${key}` : key;
      return (i18n as any)._(fullKey, params as any) as unknown as string;
    },
    [ns, currentLocale]
  );

  return { t };
};
