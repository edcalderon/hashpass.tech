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
import lukasMessages from './locales/lukas.json';

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

// lukas.json stores every locale variant as a sibling key with a `_<locale>` suffix
// (e.g. "title" / "title_es" / "title_pt") in a single file, rather than one file per
// locale like en.json/es.json/etc. A plain transformMessages() walk would flatten all
// of those siblings as their own distinct keys (hero.title, hero.title_es, ...) and
// nothing would ever select between them per active locale — every locale's catalog
// ended up with the identical (English) hero.title value. This resolves the suffix
// per target locale instead, falling back to the base (English) key when no
// locale-specific sibling exists (lukas.json currently only has _es/_pt variants).
const LUKAS_LOCALE_SUFFIXES: Record<string, string> = { es: '_es', pt: '_pt' };

function buildLukasCatalog(nested: any, locale: string): Record<string, string> {
  const suffix = LUKAS_LOCALE_SUFFIXES[locale];
  const flat: Record<string, string> = {};
  const walk = (obj: any, prefix = '') => {
    Object.keys(obj || {}).forEach((k) => {
      // Locale-variant sibling keys (e.g. "title_es") are resolved via the base key's
      // lookup below, not emitted as their own top-level keys.
      if (/_(es|pt)$/.test(k)) return;
      const v = (obj as any)[k];
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object') {
        walk(v, key);
      } else if (typeof v === 'string') {
        const localized = suffix ? obj[`${k}${suffix}`] : undefined;
        flat[key] = typeof localized === 'string' ? localized : v;
      }
    });
  };
  walk(nested);
  return flat;
}

function lukasScopedMessagesFor(locale: string): Record<string, string> {
  const catalog = buildLukasCatalog(lukasMessages as any, locale);
  return Object.fromEntries(Object.entries(catalog).map(([key, value]) => [`lukas.${key}`, value]));
}

const messagesByLocale: Record<string, Record<string, string>> = {
  en: { ...transformMessages(enMessages as any), ...lukasScopedMessagesFor('en') },
  es: { ...transformMessages(esMessages as any), ...lukasScopedMessagesFor('es') },
  ko: { ...transformMessages(koMessages as any), ...lukasScopedMessagesFor('ko') },
  fr: { ...transformMessages(frMessages as any), ...lukasScopedMessagesFor('fr') },
  pt: { ...transformMessages(ptMessages as any), ...lukasScopedMessagesFor('pt') },
  de: { ...transformMessages(deMessages as any), ...lukasScopedMessagesFor('de') },
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
