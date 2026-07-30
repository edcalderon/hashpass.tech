import { createTranslator } from '../src/core';
import { catalogs } from '../src/locales';
import type { SupportedLocale } from '../src/types';

const downloadKeys = [
  'badge',
  'title',
  'description',
  'getItOn',
  'googlePlay',
  'googlePlayAriaLabel',
  'downloadHashpass',
  'downloadAriaLabel',
] as const;

const localizedKeys = downloadKeys.filter((key) => key !== 'googlePlay');
const locales = Object.keys(catalogs) as SupportedLocale[];
const english = createTranslator(catalogs.en);

for (const locale of locales) {
  const translate = createTranslator(catalogs[locale], catalogs.en);

  for (const key of downloadKeys) {
    const translationKey = `download.${key}`;
    const value = translate(translationKey);

    if (!value.trim() || value === translationKey) {
      throw new Error(`${locale} is missing ${translationKey}`);
    }

    if (locale !== 'en' && localizedKeys.includes(key) && value === english(translationKey)) {
      throw new Error(`${locale} still uses the English value for ${translationKey}`);
    }
  }
}

console.log(`Verified localized download CTA copy for ${locales.join(', ')}.`);
