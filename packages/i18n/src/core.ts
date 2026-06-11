import type { InterpolationParams, Messages, SupportedLocale, TranslateFn } from './types';

export const AVAILABLE_LOCALES = [
  { code: 'en' as const, name: 'English', nativeName: 'English', dir: 'ltr' as const },
  { code: 'es' as const, name: 'Spanish', nativeName: 'Español', dir: 'ltr' as const },
  { code: 'fr' as const, name: 'French', nativeName: 'Français', dir: 'ltr' as const },
  { code: 'pt' as const, name: 'Portuguese', nativeName: 'Português', dir: 'ltr' as const },
  { code: 'de' as const, name: 'German', nativeName: 'Deutsch', dir: 'ltr' as const },
  { code: 'ko' as const, name: 'Korean', nativeName: '한국어', dir: 'ltr' as const },
];

export const STORAGE_KEY = 'hashpass_locale';

function resolve(messages: Messages, key: string): string | undefined {
  const parts = key.split('.');
  let current: unknown = messages;
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, params: InterpolationParams): string {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`
  );
}

export function createTranslator(messages: Messages, fallback?: Messages): TranslateFn {
  return (key: string, params?: InterpolationParams): string => {
    const raw = resolve(messages, key) ?? (fallback ? resolve(fallback, key) : undefined) ?? key;
    return params ? interpolate(raw, params) : raw;
  };
}

export function detectLocale(supported: SupportedLocale[]): SupportedLocale {
  if (typeof window === 'undefined') return 'en';

  const stored = (() => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  })();

  if (stored && supported.includes(stored as SupportedLocale)) {
    return stored as SupportedLocale;
  }

  const lang = navigator.language.split('-')[0].toLowerCase();
  return supported.includes(lang as SupportedLocale) ? (lang as SupportedLocale) : 'en';
}

export function persistLocale(locale: SupportedLocale): void {
  try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* noop */ }
}
