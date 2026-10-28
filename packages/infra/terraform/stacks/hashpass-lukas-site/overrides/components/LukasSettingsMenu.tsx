import React, { useEffect, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../hooks/useTheme';
import { getAvailableLocales, useTranslation } from '../i18n/i18n';
import { useLanguage } from '../providers/LanguageProvider';
import type { LukasAnimationLevel, LukasSettingsMenuProps } from '../types/lukas.types';
import { LukasGlyph } from './lukas/LukasGlyph';
import { FilterChip } from '@hashpass/ui/primitives';
import { lukasPalette, lukasSkin } from './lukas/lukas-ui';

const ANIMATION_STORAGE_KEY = 'lukas.animation.v1';
const PRIVACY_STORAGE_KEY = 'lukas.privacy.analytics.v1';

const localeNames: Record<string, string> = {
  english: 'English',
  spanish: 'Español',
  korean: '한국어',
  french: 'Français',
  portuguese: 'Português',
  german: 'Deutsch',
};

const readStorage = async (key: string): Promise<string | null> => {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') return window.localStorage.getItem(key);
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = async (key: string, value: string) => {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.localStorage.setItem(key, value);
    else await AsyncStorage.setItem(key, value);
  } catch {
    // Preferences remain active for this session when storage is unavailable.
  }
};

export function LukasSettingsMenu({ animation, onAnimationChange }: LukasSettingsMenuProps) {
  const { theme, setTheme, isDark } = useTheme();
  const palette = lukasPalette(isDark);
  const mode = isDark ? 'dark' : 'light';
  const skin = lukasSkin(palette);
  const { locale, setLocale } = useLanguage();
  const { t } = useTranslation('lukas');
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    readStorage(PRIVACY_STORAGE_KEY).then((value) => setAnalytics(value === 'true'));
  }, []);

  const updateAnimation = (level: LukasAnimationLevel) => {
    onAnimationChange(level);
    void writeStorage(ANIMATION_STORAGE_KEY, level);
  };

  const updateAnalytics = (value: boolean) => {
    setAnalytics(value);
    void writeStorage(PRIVACY_STORAGE_KEY, String(value));
  };

  const openPrivacy = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.open('https://hashpass.tech/privacy', '_blank', 'noopener,noreferrer');
    else void Linking.openURL('https://hashpass.tech/privacy');
  };

  const option = (label: string, value: string, active: boolean, onPress: () => void) => (
    <FilterChip key={value} mode={mode} skin={skin} label={label} selected={active} onPress={onPress} />
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('settings.open')}
        style={[styles.trigger, { borderColor: palette.border, backgroundColor: palette.cardRaised }]}
      >
        <LukasGlyph name="settings" size={32} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel={t('settings.close')} />
          <View style={[styles.panel, { backgroundColor: palette.cardRaised, borderColor: palette.border }]} accessibilityViewIsModal>
            <ScrollView contentContainerStyle={styles.panelContent} showsVerticalScrollIndicator={false}>
              <View style={styles.headerRow}>
                <View>
                  <Text style={[styles.eyebrow, { color: palette.accent }]}>{t('settings.eyebrow')}</Text>
                  <Text style={[styles.title, { color: palette.text }]}>{t('settings.title')}</Text>
                </View>
                <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={t('settings.close')} style={styles.close}>
                  <Text style={[styles.closeText, { color: palette.body }]}>×</Text>
                </Pressable>
              </View>

              <Text style={[styles.label, { color: palette.body }]}>{t('settings.appearance')}</Text>
              <View style={styles.choiceGrid}>
                {option(t('settings.system'), 'system', theme === 'system', () => void setTheme('system'))}
                {option(t('settings.light'), 'light', theme === 'light', () => void setTheme('light'))}
                {option(t('settings.dark'), 'dark', theme === 'dark', () => void setTheme('dark'))}
              </View>

              <Text style={[styles.label, { color: palette.body }]}>{t('settings.language')}</Text>
              <View style={styles.languageGrid}>
                {getAvailableLocales().map((item) => option(localeNames[item.name] || item.name, item.code, locale === item.code, () => void setLocale(item.code)))}
              </View>

              <Text style={[styles.label, { color: palette.body }]}>{t('settings.motion')}</Text>
              <View style={styles.choiceGrid}>
                {option(t('settings.motionFull'), 'full', animation === 'full', () => updateAnimation('full'))}
                {option(t('settings.motionReduced'), 'reduced', animation === 'reduced', () => updateAnimation('reduced'))}
                {option(t('settings.motionOff'), 'none', animation === 'none', () => updateAnimation('none'))}
              </View>

              <View style={[styles.privacyRow, { borderTopColor: palette.border }]}>
                <View style={styles.privacyCopy}>
                  <Text style={[styles.privacyTitle, { color: palette.text }]}>{t('settings.analytics')}</Text>
                  <Text style={[styles.privacyDescription, { color: palette.body }]}>{t('settings.analyticsDescription')}</Text>
                </View>
                <Switch value={analytics} onValueChange={updateAnalytics} trackColor={{ false: palette.borderStrong, true: palette.fill }} thumbColor="#FFFFFF" />
              </View>
              <Pressable onPress={openPrivacy} accessibilityRole="link" style={styles.privacyLink}>
                <Text style={[styles.privacyLinkText, { color: palette.accent }]}>{t('settings.privacyPolicy')} ↗</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { width: 48, height: 48, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowColor: '#061523', shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 6 },
  modalRoot: { flex: 1, justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 76, paddingHorizontal: 18 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(3, 8, 18, 0.56)' },
  panel: { width: '100%', maxWidth: 380, maxHeight: '82%', borderWidth: 1, borderRadius: 24, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 26, elevation: 10 },
  panelContent: { padding: 22, gap: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
  title: { fontSize: 24, fontWeight: '800', marginTop: 4 },
  close: { width: 44, height: 44, borderRadius: 999, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 28, lineHeight: 30 },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 7 },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  languageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  privacyRow: { borderTopWidth: 1, paddingTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 5 },
  privacyCopy: { flex: 1 },
  privacyTitle: { fontSize: 15, fontWeight: '800' },
  privacyDescription: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  privacyLink: { alignSelf: 'flex-start', paddingVertical: 4 },
  privacyLinkText: { fontSize: 13, fontWeight: '800' },
});
