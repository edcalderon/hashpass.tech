import type { AnimationLevel, AppSettings, LocaleCode, LocaleInfo, SettingsChoice, SettingsEnvironment, SettingsPaletteSet, ThemeMode } from './settings.types';

export const SETTINGS_STORAGE_KEY = 'hashpass.settings.v1';

export const LOCALES: readonly LocaleInfo[] = [
  { code: 'en', nativeName: 'English', speechTag: 'en-US' },
  { code: 'es', nativeName: 'Español', speechTag: 'es-ES' },
  { code: 'ja', nativeName: '日本語', speechTag: 'ja-JP' },
];

export const THEMES: readonly ThemeMode[] = ['system', 'light', 'dark'];
export const ANIMATION_LEVELS: readonly AnimationLevel[] = ['full', 'reduced', 'none'];

const isLocale = (v: unknown): v is LocaleCode => LOCALES.some((l) => l.code === v);
const isTheme = (v: unknown): v is ThemeMode => THEMES.includes(v as ThemeMode);
const isAnimation = (v: unknown): v is AnimationLevel => ANIMATION_LEVELS.includes(v as AnimationLevel);

/** First supported language in the browser's preference list, else English. */
export function pickLocale(languages: readonly string[]): LocaleCode {
  for (const tag of languages) {
    const base = tag.toLowerCase().split('-')[0];
    const hit = LOCALES.find((l) => l.code === base);
    if (hit) return hit.code;
  }
  return 'en';
}

export function defaultSettings(env: SettingsEnvironment): AppSettings {
  return {
    theme: 'system',
    language: pickLocale(env.languages),
    animation: env.prefersReducedMotion ? 'reduced' : 'full',
    voice: false,
  };
}

/** Accepts whatever was stored, keeps every valid field and falls back to defaults for the rest. */
export function parseSettings(raw: string | null | undefined, env: SettingsEnvironment): AppSettings {
  const base = defaultSettings(env);
  if (!raw) return base;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return base;
    const d = data as Record<string, unknown>;
    return {
      theme: isTheme(d.theme) ? d.theme : base.theme,
      language: isLocale(d.language) ? d.language : base.language,
      animation: isAnimation(d.animation) ? d.animation : base.animation,
      voice: typeof d.voice === 'boolean' ? d.voice : base.voice,
    };
  } catch {
    return base;
  }
}

export const serializeSettings = (s: AppSettings): string => JSON.stringify(s);

export const localeInfo = (code: LocaleCode): LocaleInfo => LOCALES.find((l) => l.code === code) ?? LOCALES[0];

/** Flag glyphs for every locale used by Club, mobile and Companion. */
export const LOCALE_FLAGS: Readonly<Record<string, string>> = {
  en: '🇺🇸', es: '🇪🇸', ja: '🇯🇵', ko: '🇰🇷', fr: '🇫🇷', pt: '🇧🇷', de: '🇩🇪', et: '🇪🇪',
};

/** Order and icons match the mobile Quick Settings panel. */
export const THEME_ICONS: Readonly<Record<ThemeMode, NonNullable<SettingsChoice['icon']>>> = { dark: 'moon', system: 'contrast', light: 'sun' };
export const ANIMATION_ICONS: Readonly<Record<AnimationLevel, NonNullable<SettingsChoice['icon']>>> = { full: 'zap', reduced: 'sliders', none: 'pause' };

/** `cool` is the Club blue; `crimson` is the mobile app red. Both are built from the same shape. */
export const SETTINGS_PALETTES: Readonly<Record<'cool' | 'crimson', SettingsPaletteSet>> = {
  cool: {
    dark: {
      panel: 'linear-gradient(150deg, rgba(19,34,64,0.985), rgba(8,18,39,0.985) 72%)',
      border: 'rgba(138,163,218,0.24)', surface: 'rgba(164,187,232,0.075)', hoverSurface: 'rgba(104,145,237,0.15)',
      text: '#f4f7ff', mutedText: 'rgba(207,218,240,0.70)',
      activeSurface: 'linear-gradient(135deg, #1678e5 0%, #386be7 52%, #735fd3 100%)',
      activeBorder: 'rgba(143,191,255,0.82)', activeShadow: '0 10px 22px rgba(42,102,220,0.30)', activeText: '#ffffff',
    },
    light: {
      panel: 'linear-gradient(155deg, rgba(255,255,255,0.99), rgba(242,247,255,0.985))',
      border: 'rgba(77,107,166,0.20)', surface: 'rgba(44,79,145,0.055)', hoverSurface: 'rgba(65,108,207,0.10)',
      text: '#15213a', mutedText: 'rgba(31,51,88,0.62)',
      activeSurface: 'linear-gradient(135deg, #1764d7 0%, #3b64cb 58%, #6758bb 100%)',
      activeBorder: 'rgba(74,116,218,0.75)', activeShadow: '0 10px 22px rgba(39,91,194,0.22)', activeText: '#ffffff',
    },
  },
  crimson: {
    dark: {
      panel: '#1c1c22', border: '#34343e', surface: '#26262e', hoverSurface: '#2f2f39',
      text: '#fafafa', mutedText: '#b0b0bc',
      activeSurface: '#af0d01', activeBorder: '#af0d01', activeShadow: 'none', activeText: '#ffffff',
    },
    light: {
      panel: '#ffffff', border: '#dfe3e8', surface: '#f1f3f5', hoverSurface: '#e8ebee',
      text: '#17181c', mutedText: '#565963',
      activeSurface: '#af0d01', activeBorder: '#af0d01', activeShadow: 'none', activeText: '#ffffff',
    },
  },
};
