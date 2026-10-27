import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { SETTINGS_STORAGE_KEY, localeInfo, parseSettings, serializeSettings } from '@hashpass/ui/settings';
import type { AnimationLevel, AppSettings, LocaleCode, SettingsEnvironment, ThemeMode } from '@hashpass/ui/settings';
import { translate } from '../i18n/index.ts';
import { cancelSpeech } from '../voice';
import type { SettingsContextValue, Translate, TranslateVars } from '../types';

const SettingsContext = createContext<SettingsContextValue | null>(null);

const environment = (): SettingsEnvironment => ({
  languages: typeof navigator === 'undefined' ? [] : (navigator.languages?.length ? navigator.languages : [navigator.language]),
  prefersReducedMotion: typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
});

function load(): AppSettings {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  } catch {
    // Storage can be blocked (private windows); defaults still work for this visit.
  }
  return parseSettings(raw, environment());
}

const prefersDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(load);
  const [systemDark, setSystemDark] = useState(prefersDark);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return undefined;
    const listener = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, []);

  const isDark = settings.theme === 'system' ? systemDark : settings.theme === 'dark';

  useEffect(() => {
    const root = document.documentElement;
    root.lang = localeInfo(settings.language).code;
    root.dataset.theme = settings.theme;
    root.dataset.motion = settings.animation;
    document.title = translate(settings.language, 'app.name');
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(settings));
    } catch {
      // Not persisted; the choice still applies until the page closes.
    }
  }, [settings]);

  const update = useCallback((patch: Partial<AppSettings>) => setSettings((s) => ({ ...s, ...patch })), []);

  const value = useMemo<SettingsContextValue>(() => {
    const t: Translate = (key: string, vars?: TranslateVars) => translate(settings.language, key, vars);
    return {
      settings,
      isDark,
      t,
      setTheme: (theme: ThemeMode) => update({ theme }),
      setLanguage: (language: LocaleCode) => {
        cancelSpeech();
        update({ language });
      },
      setAnimation: (animation: AnimationLevel) => update({ animation }),
      setVoice: (voice: boolean) => {
        if (!voice) cancelSpeech();
        update({ voice });
      },
    };
  }, [settings, isDark, update]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
