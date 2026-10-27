import { useEffect, useState } from 'react';
import { ANIMATION_ICONS, LOCALES, LOCALE_FLAGS, THEMES, THEME_ICONS, ANIMATION_LEVELS, localeInfo } from '@hashpass/ui/settings';
import type { AnimationLevel, SettingsChoice, SettingsPaletteSet, ThemeMode } from '@hashpass/ui/settings';
import { SettingsMenu, SettingsToggle } from '@hashpass/ui/settings-menu';
import { onVoicesChanged, voiceStatus } from '../voice';
import type { VoiceStatus } from '../types';
import { useSettings } from './SettingsContext';

/** The shared menu, re-skinned for the pixel theme: navy panel, cyan active state. */
const PIXEL_PALETTES: SettingsPaletteSet = {
  dark: { panel: '#141b4a', border: '#6f86c9', surface: '#0b1230', hoverSurface: '#1b2150', text: '#f4f7ff', mutedText: '#b8c4e8', activeSurface: '#22d3ee', activeBorder: '#22d3ee', activeShadow: 'none', activeText: '#06222a' },
  light: { panel: '#ffffff', border: '#10243a', surface: '#f1f4f8', hoverSurface: '#e3e9f2', text: '#17181c', mutedText: '#4a4d57', activeSurface: '#0e7490', activeBorder: '#10243a', activeShadow: 'none', activeText: '#ffffff' },
};

export function CompanionSettings() {
  const { settings, isDark, t, setTheme, setLanguage, setAnimation, setVoice } = useSettings();
  const tag = localeInfo(settings.language).speechTag;
  const [status, setStatus] = useState<VoiceStatus>(() => voiceStatus(tag));
  useEffect(() => {
    setStatus(voiceStatus(tag));
    return onVoicesChanged(() => setStatus(voiceStatus(tag)));
  }, [tag]);

  const themes: SettingsChoice[] = THEMES.map((value) => ({ value, label: t(`set.theme.${value}`), icon: THEME_ICONS[value] }));
  const animations: SettingsChoice[] = ANIMATION_LEVELS.map((value) => ({ value, label: t(`set.anim.${value}`), description: t(`set.anim.${value}.d`), icon: ANIMATION_ICONS[value] }));
  const note = status === 'unsupported' ? t('set.voice.unsupported') : status === 'novoice' ? t('set.voice.novoice', { lang: localeInfo(settings.language).nativeName }) : undefined;

  return (
    <SettingsMenu
      labels={{ open: t('set.open'), close: t('set.close'), panel: t('set.panel'), appearance: t('set.appearance'), language: t('set.language'), animation: t('set.animation') }}
      isDark={isDark}
      palettes={PIXEL_PALETTES}
      triggerClassName="settings-trigger"
      panelTop={64}
      panelRight={16}
      themes={themes}
      theme={settings.theme}
      onTheme={(v) => setTheme(v as ThemeMode)}
      locales={LOCALES.map((l) => ({ code: l.code, nativeName: l.nativeName, flag: LOCALE_FLAGS[l.code] }))}
      locale={settings.language}
      onLocale={(code) => setLanguage(code as typeof settings.language)}
      animations={animations}
      animation={settings.animation}
      onAnimation={(v) => setAnimation(v as AnimationLevel)}
    >
      <SettingsToggle label={t('set.voice')} description={t('set.voice.d')} note={note} checked={settings.voice && status === 'ok'} disabled={status !== 'ok'} onChange={setVoice} />
    </SettingsMenu>
  );
}
