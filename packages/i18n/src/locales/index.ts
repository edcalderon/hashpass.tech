import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { pt } from './pt';
import { de } from './de';
import { ko } from './ko';
import type { SupportedLocale, Messages } from '../types';

export { en, es, fr, pt, de, ko };

export const catalogs: Record<SupportedLocale, Messages> = {
  en: en as unknown as Messages,
  es: es as unknown as Messages,
  fr: fr as unknown as Messages,
  pt: pt as unknown as Messages,
  de: de as unknown as Messages,
  ko: ko as unknown as Messages,
};
