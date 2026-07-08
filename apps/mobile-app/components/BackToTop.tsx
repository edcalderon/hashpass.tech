/**
 * BackToTop
 *
 * Floating vertical button stack that appears when the user scrolls down.
 * Layout (top → bottom): back-to-top · settings · sign-in
 *
 * The middle "settings" button opens an inline QuickSettingsPanel (same content
 * as the top-right panel) positioned to the left of the button stack.
 *
 * All icons use react-native-svg inline paths — no Ionicons/font dependency.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Reanimated, { SharedValue, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useRouter, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';
import { useLanguage } from '../providers/LanguageProvider';
import { getAvailableLocales, useTranslation } from '../i18n/i18n';
import { useAnimationLevel } from '../contexts/AnimationLevelContext';
import type { AnimationLevel } from '../contexts/AnimationLevelContext';
import { createShadowStyle } from '../lib/utils';
import type { ThemeMode } from '../types/theme';
import type { ViewStyle } from 'react-native';
import {
  ArrowUpIcon,
  SettingsIcon,
  LogInIcon,
  MoonIcon,
  SunIcon,
  AutoIcon,
  ZapIcon,
  SliderIcon,
  PauseIcon,
  CheckIcon,
  getFlagEmoji,
} from './icons/SettingsIcons';

interface Props {
  scrollY: SharedValue<number>;
  scrollRef: React.RefObject<any>;
  colors: any;
}

type LocaleOption = { code: string; name: string };
type PillOption<T> = { value: T; label: string; Icon: React.ComponentType<any> };

// ─── shared panel sub-components ─────────────────────────────────────────────

function SectionLabel({ label, isDark, colors }: { label: string; isDark: boolean; colors: any }) {
  return <Text style={[pStyles.sectionLabel, { color: colors.text.secondary }]}>{label}</Text>;
}

function Divider({ isDark }: { isDark: boolean }) {
  return (
    <View style={[pStyles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }]} />
  );
}

function PillGroup<T extends string>({
  options, value, onChange, colors, isDark,
}: {
  options: PillOption<T>[];
  value: T;
  onChange: (v: T) => void;
  colors: any;
  isDark: boolean;
}) {
  return (
    <View style={pStyles.pillRow}>
      {options.map((opt) => {
        const active = opt.value === value;
        const fg = active ? colors.primaryContrastText : colors.text.secondary;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[
              pStyles.pill,
              {
                backgroundColor: active ? colors.primary : isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                borderColor: active ? colors.primary : isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)',
              },
            ]}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.72}
          >
            <opt.Icon size={13} color={fg} strokeWidth={2} />
            <Text style={[pStyles.pillLabel, { color: fg }]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

const BackToTop: React.FC<Props> = ({ scrollY, scrollRef, colors }) => {
  const { theme, setTheme, isDark } = useTheme();
  const { locale, setLocale } = useLanguage();
  const { animationLevel, setAnimationLevel } = useAnimationLevel();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation('profile');
  const availableLocales = getAvailableLocales();
  const isOnAuthPage = pathname?.includes('/auth');

  const [panelOpen, setPanelOpen] = useState(false);
  const panelAnim = useRef(new Animated.Value(0)).current;
  const settingsBtnScale = useSharedValue(1);
  const upBtnScale = useSharedValue(1);
  const loginBtnScale = useSharedValue(1);

  // Show the whole stack only when scrolled past threshold
  const stackStyle = useAnimatedStyle(() => ({
    opacity: withTiming(scrollY.value > 30 ? 1 : 0, { duration: 200 }),
    pointerEvents: scrollY.value > 30 ? 'auto' : 'none',
  } as const));

  const settingsBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: settingsBtnScale.value }],
  }));

  const upBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: upBtnScale.value }],
  }));

  const loginBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: loginBtnScale.value }],
  }));

  const openPanel = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    settingsBtnScale.value = withSpring(0.88, { damping: 10 }, () => {
      settingsBtnScale.value = withSpring(1, { damping: 8 });
    });
    setPanelOpen(true);
    Animated.spring(panelAnim, { toValue: 1, tension: 70, friction: 12, useNativeDriver: true }).start();
  }, [panelAnim, settingsBtnScale]);

  const closePanel = useCallback(() => {
    Animated.timing(panelAnim, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true })
      .start(() => setPanelOpen(false));
  }, [panelAnim]);

  const handleScrollToTop = () => {
    upBtnScale.value = withSpring(0.88, { damping: 10 }, () => { upBtnScale.value = withSpring(1, { damping: 8 }); });
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const handleLogin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loginBtnScale.value = withSpring(0.88, { damping: 10 }, () => { loginBtnScale.value = withSpring(1, { damping: 8 }); });
    router.push('/(shared)/auth');
  };

  const panelOpacity = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const panelTranslateX = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  const panelScale = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });

  const bg = isDark ? 'rgba(14,14,26,0.97)' : 'rgba(255,255,255,0.97)';
  const borderCol = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
  const btnBg = colors.surface;

  const themeOptions: PillOption<ThemeMode>[] = [
    { value: 'dark',   label: t('settings.themeDark')  || 'Dark',  Icon: MoonIcon },
    { value: 'system', label: t('settings.themeAuto')  || 'Auto',  Icon: AutoIcon },
    { value: 'light',  label: t('settings.themeLight') || 'Light', Icon: SunIcon },
  ];

  const animOptions: PillOption<AnimationLevel>[] = [
    { value: 'full', label: t('settings.animationsFull') || 'Full', Icon: ZapIcon },
    { value: 'reduced', label: t('settings.animationsReduced') || 'Low', Icon: SliderIcon },
    { value: 'none', label: t('settings.animationsNone') || 'Off', Icon: PauseIcon },
  ];

  const panel = (
    <Animated.View
      style={[
        pStyles.panel,
        {
          backgroundColor: bg,
          borderColor: borderCol,
          opacity: panelOpacity,
          transform: [{ translateX: panelTranslateX }, { scale: panelScale }],
        },
        createShadowStyle('#000', { width: 0, height: 8 }, isDark ? 0.38 : 0.12, 20, 16) as ViewStyle,
      ]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {/* Appearance */}
        <SectionLabel label={t('settings.appearance') || 'Appearance'} isDark={isDark} colors={colors} />
        <PillGroup<ThemeMode>
          options={themeOptions}
          value={theme}
          onChange={(v) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTheme(v); }}
          colors={colors}
          isDark={isDark}
        />

        <Divider isDark={isDark} />

        {/* Language */}
        <SectionLabel label={t('settings.language') || 'Language'} isDark={isDark} colors={colors} />
        {availableLocales.map((lang: LocaleOption) => {
          const active = lang.code === locale;
          return (
            <TouchableOpacity
              key={lang.code}
              style={[
                pStyles.langRow,
                active && { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 10 },
              ]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setLocale(lang.code); }}
              activeOpacity={0.7}
            >
              <Text style={pStyles.flag}>{getFlagEmoji(lang.code)}</Text>
              <Text style={[pStyles.langName, { color: colors.text.primary }]}>
                {t(`languages.${lang.name}`)}
              </Text>
              <View
                style={[
                  pStyles.langBadge,
                  {
                    backgroundColor: active ? colors.primary : 'transparent',
                    borderColor: active ? colors.primary : isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.1)',
                  },
                ]}
              >
                {active ? (
                  <CheckIcon size={12} color={colors.primaryContrastText} strokeWidth={2.5} />
                ) : (
                  <Text style={[pStyles.langCode, { color: colors.text.secondary }]}>
                    {lang.code.toUpperCase()}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        <Divider isDark={isDark} />

        {/* Animations */}
        <SectionLabel label={t('settings.animations') || 'Animations'} isDark={isDark} colors={colors} />
        <PillGroup<AnimationLevel>
          options={animOptions}
          value={animationLevel}
          onChange={(v) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAnimationLevel(v); }}
          colors={colors}
          isDark={isDark}
        />
      </ScrollView>
    </Animated.View>
  );

  return (
    <Reanimated.View style={[styles.stack, stackStyle]}>
      {/* Backdrop — closes panel on outside tap */}
      {panelOpen && Platform.OS === 'web' && (
        <TouchableWithoutFeedback onPress={closePanel}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
      )}

      {/* Settings panel — renders to the left of the button stack */}
      {panelOpen && Platform.OS === 'web' && panel}
      {panelOpen && Platform.OS !== 'web' && (
        <Modal
          transparent
          visible={panelOpen}
          animationType="none"
          presentationStyle="overFullScreen"
          statusBarTranslucent
          onRequestClose={closePanel}
        >
          <View style={styles.modalRoot}>
            <TouchableWithoutFeedback onPress={closePanel}>
              <View style={styles.modalBackdrop} />
            </TouchableWithoutFeedback>
            {panel}
          </View>
        </Modal>
      )}

      {/* ── Button 1: Back to top ── */}
      <Reanimated.View style={[styles.btnWrap, upBtnStyle]}>
        <TouchableOpacity
          style={[styles.btn, createShadowStyle('#000', { width: 0, height: 2 }, 0.2, 4, 6) as ViewStyle, { backgroundColor: btnBg }]}
          onPress={handleScrollToTop}
          activeOpacity={0.8}
          accessibilityLabel="Back to top"
        >
          <ArrowUpIcon size={22} color={colors.text.primary} strokeWidth={2} />
        </TouchableOpacity>
      </Reanimated.View>

      {/* ── Button 2: Settings (middle) ── */}
      <Reanimated.View style={[styles.btnWrap, settingsBtnStyle]}>
        <TouchableOpacity
          style={[
            styles.btn,
            createShadowStyle('#000', { width: 0, height: 2 }, 0.25, 4, 6) as ViewStyle,
            { backgroundColor: panelOpen ? colors.primary : btnBg },
          ]}
          onPress={panelOpen ? closePanel : openPanel}
          activeOpacity={0.8}
          accessibilityLabel="Settings"
        >
          <SettingsIcon
            size={22}
            color={panelOpen ? colors.primaryContrastText : colors.text.primary}
            strokeWidth={1.8}
          />
        </TouchableOpacity>
      </Reanimated.View>

      {/* ── Button 3: Sign in (always direct, never inside the panel) ── */}
      {!isOnAuthPage && (
        <Reanimated.View style={[styles.btnWrap, styles.loginWrap, loginBtnStyle]}>
          <TouchableOpacity
            style={[
              styles.btn,
              createShadowStyle('#000', { width: 0, height: 2 }, 0.25, 4, 6) as ViewStyle,
              { backgroundColor: isDark ? colors.secondary : colors.primary, marginBottom: 0 },
            ]}
            onPress={handleLogin}
            activeOpacity={0.8}
            accessibilityLabel="Sign in"
          >
            <LogInIcon size={22} color={isDark ? colors.secondaryContrastText : colors.primaryContrastText} strokeWidth={2} />
          </TouchableOpacity>
        </Reanimated.View>
      )}
    </Reanimated.View>
  );
};

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    bottom: 50,
    right: 20,
    zIndex: 100,
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: -2000,
    left: -2000,
    right: -2000,
    bottom: -2000,
    zIndex: -1,
  },
  modalRoot: {
    flex: 1,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  btnWrap: {
    marginBottom: 12,
  },
  loginWrap: {
    marginBottom: 0,
  },
  btn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

const pStyles = StyleSheet.create({
  panel: {
    position: 'absolute',
    bottom: 0,
    right: 62,
    width: 228,
    maxHeight: 440,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    zIndex: 1,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 8,
    marginVertical: 1,
  },
  langName: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  langBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  langCode: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  flag: {
    fontSize: 16,
    lineHeight: 20,
  },
});

export default BackToTop;
