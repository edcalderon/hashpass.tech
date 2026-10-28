import React, { useEffect, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../hooks/useTheme';
import { getAvailableLocales, useTranslation } from '../i18n/i18n';
import { useLanguage } from '../providers/LanguageProvider';
import type { LukasSettingsMenuProps } from '../types/lukas.types';

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
  const { colors, theme, setTheme } = useTheme();
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
    <Pressable
      key={value}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.choice, { borderColor: active ? colors.primary : colors.divider, backgroundColor: active ? `${colors.primary}18` : colors.surface }]}
    >
      <Text style={[styles.choiceText, { color: colors.text.primary }]}>{label}</Text>
      {active ? <Text style={[styles.check, { color: colors.primary }]}>✓</Text> : null}
    </Pressable>
  );

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('settings.open')}
        style={[styles.trigger, { borderColor: colors.divider, backgroundColor: colors.surface }]}
      >
        <Text style={{ color: colors.text.primary, fontSize: 20 }}>⚙</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel={t('settings.close')} />
          <View style={[styles.panel, { backgroundColor: colors.background.paper, borderColor: colors.divider }]} accessibilityViewIsModal>
            <ScrollView contentContainerStyle={styles.panelContent} showsVerticalScrollIndicator={false}>
              <View style={styles.headerRow}>
                <View>
                  <Text style={[styles.eyebrow, { color: colors.primary }]}>{t('settings.eyebrow')}</Text>
                  <Text style={[styles.title, { color: colors.text.primary }]}>{t('settings.title')}</Text>
                </View>
                <Pressable onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel={t('settings.close')} style={styles.close}>
                  <Text style={[styles.closeText, { color: colors.text.secondary }]}>×</Text>
                </Pressable>
              </View>

              <Text style={[styles.label, { color: colors.text.secondary }]}>{t('settings.appearance')}</Text>
              <View style={styles.choiceGrid}>
                {option(t('settings.system'), 'system', theme === 'system', () => void setTheme('system'))}
                {option(t('settings.light'), 'light', theme === 'light', () => void setTheme('light'))}
                {option(t('settings.dark'), 'dark', theme === 'dark', () => void setTheme('dark'))}
              </View>

              <Text style={[styles.label, { color: colors.text.secondary }]}>{t('settings.language')}</Text>
              <View style={styles.languageGrid}>
                {getAvailableLocales().map((item) => option(localeNames[item.name] || item.name, item.code, locale === item.code, () => void setLocale(item.code)))}
              </View>

              <Text style={[styles.label, { color: colors.text.secondary }]}>{t('settings.motion')}</Text>
              <View style={styles.choiceGrid}>
                {option(t('settings.motionFull'), 'full', animation === 'full', () => updateAnimation('full'))}
                {option(t('settings.motionReduced'), 'reduced', animation === 'reduced', () => updateAnimation('reduced'))}
                {option(t('settings.motionOff'), 'none', animation === 'none', () => updateAnimation('none'))}
              </View>

              <View style={[styles.privacyRow, { borderTopColor: colors.divider }]}>
                <View style={styles.privacyCopy}>
                  <Text style={[styles.privacyTitle, { color: colors.text.primary }]}>{t('settings.analytics')}</Text>
                  <Text style={[styles.privacyDescription, { color: colors.text.secondary }]}>{t('settings.analyticsDescription')}</Text>
                </View>
                <Switch value={analytics} onValueChange={updateAnalytics} trackColor={{ false: colors.divider, true: colors.primary }} thumbColor="#FFFFFF" />
              </View>
              <Pressable onPress={openPrivacy} accessibilityRole="link" style={styles.privacyLink}>
                <Text style={[styles.privacyLinkText, { color: colors.primary }]}>{t('settings.privacyPolicy')} ↗</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  modalRoot: { flex: 1, justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 76, paddingHorizontal: 18 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(3, 8, 18, 0.56)' },
  panel: { width: '100%', maxWidth: 380, maxHeight: '82%', borderWidth: 1, borderRadius: 24, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 26, elevation: 10 },
  panelContent: { padding: 22, gap: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase' },
  title: { fontSize: 24, fontWeight: '800', marginTop: 4 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 28, lineHeight: 30 },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase', marginTop: 7 },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  languageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 42, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  choiceText: { fontSize: 14, fontWeight: '700' },
  check: { fontSize: 16, fontWeight: '800' },
  privacyRow: { borderTopWidth: 1, paddingTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 5 },
  privacyCopy: { flex: 1 },
  privacyTitle: { fontSize: 15, fontWeight: '800' },
  privacyDescription: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  privacyLink: { alignSelf: 'flex-start', paddingVertical: 4 },
  privacyLinkText: { fontSize: 13, fontWeight: '800' },
});
