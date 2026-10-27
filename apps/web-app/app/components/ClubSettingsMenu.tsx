'use client';

import type { CSSProperties } from 'react';
import { useAvailableLocales, useLocale, useSetLocale } from '@hashpass/i18n';
import type { SupportedLocale } from '@hashpass/i18n';
import { LOCALE_FLAGS, SETTINGS_PALETTES } from '@hashpass/ui/settings';
import type { SettingsChoice } from '@hashpass/ui/settings';
import { SettingsMenu } from '@hashpass/ui/settings-menu';
import { useLandingAnimationModeOptional, type LandingAnimationMode } from './LandingAnimationProvider';
import { useTheme } from './ThemeProvider';

type ClubSettingsMenuProps = {
  triggerStyle: CSSProperties;
  size?: number;
};

const themeChoices: SettingsChoice[] = [
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'Auto', icon: 'contrast' },
  { value: 'light', label: 'Light', icon: 'sun' },
];

const animationChoices: SettingsChoice[] = [
  { value: 'full', label: 'Full', description: 'Maximum visual motion', icon: 'zap' },
  { value: 'low', label: 'Low', description: 'Balanced performance', icon: 'sliders' },
  { value: 'static', label: 'Static', description: 'No animated background', icon: 'pause' },
];

const labels = {
  open: 'Open settings',
  close: 'Close settings',
  panel: 'Club settings',
  appearance: 'Appearance',
  language: 'Language',
  animation: 'Landing motion',
};

/** Club wiring for the shared settings dropdown: its own providers in, the shared look out. */
export function ClubSettingsMenu({ triggerStyle, size = 40 }: ClubSettingsMenuProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const availableLocales = useAvailableLocales();
  const animationSettings = useLandingAnimationModeOptional();

  return (
    <SettingsMenu
      labels={labels}
      isDark={resolvedTheme === 'dark'}
      palettes={SETTINGS_PALETTES.cool}
      size={size}
      triggerStyle={{ transition: 'opacity 0.15s', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', ...triggerStyle }}
      themes={themeChoices}
      theme={theme}
      onTheme={(value) => setTheme(value as typeof theme)}
      locales={availableLocales.map((option) => ({ code: option.code, nativeName: option.nativeName, flag: LOCALE_FLAGS[option.code] }))}
      locale={locale}
      onLocale={(code) => setLocale(code as SupportedLocale)}
      animations={animationSettings ? animationChoices : undefined}
      animation={animationSettings?.animationMode}
      onAnimation={(value) => animationSettings?.setAnimationMode(value as LandingAnimationMode)}
    />
  );
}
