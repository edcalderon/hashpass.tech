// Core (platform-agnostic)
export { createTranslator, detectLocale, persistLocale, AVAILABLE_LOCALES, STORAGE_KEY } from './core';
export type { SupportedLocale, Messages, TranslateFn, InterpolationParams, I18nContextValue, LocaleDescriptor } from './types';

// Locale catalogs
export { catalogs, en, es, fr, pt, de, ko } from './locales/index';

// React bindings
export { I18nProvider, useI18n, useTranslation, useLocale, useSetLocale, useAvailableLocales } from './react/index';
