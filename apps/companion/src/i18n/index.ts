/** Companion text catalogs and the pure lookup used by the whole app. DOM-free so node tests can import it. */
import type { LocaleCode } from '@hashpass/ui/settings';
import type { TranslateVars } from '../types.ts';
import { en } from './en.ts';
import { es } from './es.ts';
import { ja } from './ja.ts';

export const catalogs: Record<LocaleCode, Record<string, string>> = { en, es, ja };

export function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

export function translate(locale: LocaleCode, key: string, vars?: TranslateVars): string {
  const text = catalogs[locale]?.[key] ?? catalogs.en[key] ?? key;
  return interpolate(text, vars);
}
