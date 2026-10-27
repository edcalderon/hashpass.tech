import type { ReactNode } from 'react';

/** Framework-free settings model shared by the Companion web app, and importable by Club and the mobile app. */
export type LocaleCode = 'en' | 'es' | 'ja';
export type ThemeMode = 'system' | 'light' | 'dark';
/** Same three levels as the mobile app's AnimationLevelContext. */
export type AnimationLevel = 'full' | 'reduced' | 'none';

export type LocaleInfo = {
  code: LocaleCode;
  /** Name in its own language, shown in the picker. */
  nativeName: string;
  /** BCP 47 tag for speech synthesis and the html lang attribute. */
  speechTag: string;
};

export type AppSettings = {
  theme: ThemeMode;
  language: LocaleCode;
  animation: AnimationLevel;
  /** Spoken voice-over for tutorials. Off until the user turns it on. */
  voice: boolean;
};

export type SettingsEnvironment = {
  /** Browser or device language list, most preferred first (navigator.languages). */
  languages: readonly string[];
  prefersReducedMotion: boolean;
};

/** Colours for the settings surface. Swap the whole object to re-skin it per app. */
export type SettingsPalette = {
  panel: string;
  border: string;
  surface: string;
  hoverSurface: string;
  text: string;
  mutedText: string;
  activeSurface: string;
  activeBorder: string;
  activeShadow: string;
  activeText: string;
};

export type SettingsPaletteSet = { dark: SettingsPalette; light: SettingsPalette };

export type SettingsLocaleOption = { code: string; nativeName: string; flag?: string };

export type SettingsChoice = {
  value: string;
  label: string;
  /** Short helper line under the label. */
  description?: string;
  /** Key into the built-in icon set. */
  icon?: 'moon' | 'contrast' | 'sun' | 'zap' | 'sliders' | 'pause';
};

export type SettingsMenuLabels = {
  open: string;
  close: string;
  panel: string;
  appearance: string;
  language: string;
  animation: string;
};

export type SettingsMenuProps = {
  labels: SettingsMenuLabels;
  /** Is the resolved theme dark right now (picks the palette variant). */
  isDark: boolean;
  themes: readonly SettingsChoice[];
  theme: string;
  onTheme: (value: string) => void;
  locales: readonly SettingsLocaleOption[];
  locale: string;
  onLocale: (code: string) => void;
  /** Leave out to hide the animation section. */
  animations?: readonly SettingsChoice[];
  animation?: string;
  onAnimation?: (value: string) => void;
  palettes?: SettingsPaletteSet;
  triggerStyle?: Record<string, string | number>;
  triggerClassName?: string;
  size?: number;
  panelTop?: number;
  panelRight?: number;
  /** Extra sections rendered under the built-in ones, e.g. a voice-over toggle. */
  children?: ReactNode;
};

export type SettingsToggleProps = {
  label: string;
  description?: string;
  /** Small print under the row, e.g. why it is disabled. */
  note?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
};
