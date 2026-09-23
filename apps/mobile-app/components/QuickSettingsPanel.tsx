import { IconButton, ModalBackdrop } from '@hashpass/ui/primitives';
import { uiTokens, uiPalette } from '@hashpass/ui/tokens';
/**
 * QuickSettingsPanel
 *
 * Single floating button (gear SVG) that expands to a settings card.
 * Uses react-native-svg inline icons — no Ionicons/vector-icons dependency,
 * no font loading, consistent on native and web.
 *
 * Sections: Appearance (dark/auto/light), Language, Animations (full/reduced/none).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Reanimated, { SharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { useLanguage } from '../providers/LanguageProvider';
import { getAvailableLocales, useTranslation } from '../i18n/i18n';
import { useAnimationLevel } from '../contexts/AnimationLevelContext';
import type { AnimationLevel } from '../contexts/AnimationLevelContext';
import { createShadowStyle } from '../lib/utils';
import type { ThemeMode } from '../types/theme';
import type { ViewStyle } from 'react-native';
import {
  SettingsIcon,
  LogInIcon,
  MoonIcon,
  SunIcon,
  AutoIcon,
  ZapIcon,
  SliderIcon,
  PauseIcon,
  CheckIcon,
  ChevronDownIcon,
  getFlagEmoji,
} from './icons/SettingsIcons';

interface Props {
  scrollY?: SharedValue<number>;
  hideAfterScrollY?: number;
  forceVisible?: boolean;
  topOffset?: number;
  inline?: boolean;
  showSignIn?: boolean;
}

type LocaleOption = { code: string; name: string };

// ─── sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ label, colors }: { label: string; colors: any }) {
  return (
    <Text style={[sheet.sectionLabel, { color: colors.text.secondary }]}>{label}</Text>
  );
}

function Divider({ isDark }: { isDark: boolean }) {
  return (
    <View
      style={[
        sheet.divider,
        { backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' },
      ]}
    />
  );
}

type PillOption<T> = { value: T; label: string; Icon: React.ComponentType<any> };

function PillGroup<T extends string>({
  options,
  value,
  onChange,
  colors,
  isDark,
}: {
  options: PillOption<T>[];
  value: T;
  onChange: (v: T) => void;
  colors: any;
  isDark: boolean;
}) {
  return (
    <View style={sheet.pillRow}>
      {options.map((opt) => {
        const active = opt.value === value;
        const fg = active ? colors.primaryContrastText : colors.text.secondary;
        return (
          <TouchableOpacity
            key={opt.value}
            style={[
              sheet.pill,
              {
                backgroundColor: active
                  ? colors.primary
                  : isDark
                  ? 'rgba(255,255,255,0.07)'
                  : 'rgba(0,0,0,0.05)',
                borderColor: active
                  ? colors.primary
                  : isDark
                  ? 'rgba(255,255,255,0.12)'
                  : 'rgba(0,0,0,0.1)',
              },
            ]}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={opt.label}
            activeOpacity={0.72}
          >
            <opt.Icon size={12} color={fg} strokeWidth={2} />
            <Text
              style={[sheet.pillLabel, { color: fg }]}
              numberOfLines={1}
              allowFontScaling={false}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── main ────────────────────────────────────────────────────────────────────

export default function QuickSettingsPanel({
  scrollY,
  hideAfterScrollY = 30,
  forceVisible = false,
  topOffset,
  inline = false,
  showSignIn = true,
}: Props) {
  const { theme, setTheme, colors, isDark } = useTheme();
  const { locale, setLocale } = useLanguage();
  const { animationLevel, setAnimationLevel } = useAnimationLevel();
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation('profile');
  const availableLocales = getAvailableLocales();

  const isOnAuthPage = pathname?.includes('/auth') || pathname === '/(shared)/auth';
  const [open, setOpen] = useState(false);
  const [languageExpanded, setLanguageExpanded] = useState(false);
  const [languageOptionsMounted, setLanguageOptionsMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const useModalPanel = Platform.OS !== 'web' || (inline && isMobile);

  const panelAnim = useRef(new Animated.Value(0)).current;
  const btnRotate = useRef(new Animated.Value(0)).current;
  const languageAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const update = () => setIsMobile(Dimensions.get('window').width < 768);
    update();
    const sub = Dimensions.addEventListener('change', update);
    return () => sub.remove();
  }, []);

  const openPanel = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOpen(true);
    Animated.parallel([
      Animated.spring(panelAnim, { toValue: 1, tension: 70, friction: 12, useNativeDriver: true }),
      Animated.timing(btnRotate, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [panelAnim, btnRotate]);

  const closePanel = useCallback(() => {
    Animated.parallel([
      Animated.timing(panelAnim, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(btnRotate, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => setOpen(false));
  }, [panelAnim, btnRotate]);

  const togglePanel = useCallback(() => { if (open) closePanel(); else openPanel(); }, [open, openPanel, closePanel]);

  const toggleLanguageOptions = useCallback(() => {
    const nextExpanded = !languageExpanded;
    setLanguageExpanded(nextExpanded);
    if (nextExpanded) {
      setLanguageOptionsMounted(true);
    }
    Animated.timing(languageAnim, {
      toValue: nextExpanded ? 1 : 0,
      duration: 220,
      easing: nextExpanded ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      if (!nextExpanded) {
        setLanguageOptionsMounted(false);
      }
    });
  }, [languageAnim, languageExpanded]);

  const closeLanguageOptions = useCallback(() => {
    setLanguageExpanded(false);
    Animated.timing(languageAnim, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(() => setLanguageOptionsMounted(false));
  }, [languageAnim]);

  const panelOpacity = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const panelTranslateY = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] });
  const panelScale = panelAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });
  const btnRotateDeg = btnRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  const containerStyle = useAnimatedStyle(() => {
    if (forceVisible) return { opacity: 1, pointerEvents: 'auto' } as const;
    if (!scrollY) return { opacity: 1, pointerEvents: 'auto' } as const;
    const visible = scrollY.value <= hideAfterScrollY;
    return { opacity: withTiming(visible ? 1 : 0, { duration: 160 }), pointerEvents: visible ? 'auto' : 'none' } as const;
  }, [scrollY, hideAfterScrollY, forceVisible]);

  const bg = uiPalette(isDark).surface;
  const borderCol = uiPalette(isDark).border;

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
  const currentLanguage = availableLocales.find((lang: LocaleOption) => lang.code === locale) ?? availableLocales[0];
  const languageChevronRotation = languageAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const panel = (
    <Animated.View
      style={[
        panelStyles.panel,
        useModalPanel && { position: 'relative', top: 0, right: 0, alignSelf: 'center', width: 320, maxWidth: '100%', maxHeight: '90%' },
        {
          backgroundColor: bg,
          borderColor: borderCol,
          opacity: panelOpacity,
          transform: [{ translateY: panelTranslateY }, { scale: panelScale }],
        },
        createShadowStyle('#000', { width: 0, height: 10 }, isDark ? 0.4 : 0.12, 24, 20) as ViewStyle,
      ]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {/* Appearance */}
        <SectionLabel label={t('settings.appearance') || 'Appearance'} colors={colors} />
        <PillGroup<ThemeMode>
          options={themeOptions}
          value={theme}
          onChange={(v) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTheme(v); }}
          colors={colors}
          isDark={isDark}
        />

        <Divider isDark={isDark} />

        {/* Language */}
        <SectionLabel label={t('settings.language') || 'Language'} colors={colors} />
        {currentLanguage ? (
          <TouchableOpacity
            style={[
              panelStyles.languageSummary,
              { borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.1)' },
            ]}
            onPress={toggleLanguageOptions}
            accessibilityRole="button"
            accessibilityState={{ expanded: languageExpanded }}
            accessibilityLabel={`${t('settings.language') || 'Language'}: ${t(`languages.${currentLanguage.name}`)}`}
            activeOpacity={0.72}
          >
            <Text style={panelStyles.flag}>{getFlagEmoji(currentLanguage.code)}</Text>
            <Text style={[panelStyles.langName, { color: colors.text.primary, marginLeft: 8 }]}>
              {t(`languages.${currentLanguage.name}`)}
            </Text>
            <Animated.View style={{ transform: [{ rotate: languageChevronRotation }] }}>
              <ChevronDownIcon size={18} color={colors.text.secondary} strokeWidth={2} />
            </Animated.View>
          </TouchableOpacity>
        ) : null}
        <Animated.View
          style={[
            panelStyles.languageOptions,
            {
              opacity: languageAnim,
              maxHeight: languageAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 320] }),
              transform: [{ translateY: languageAnim.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }) }],
            },
          ]}
        >
          {languageOptionsMounted ? availableLocales.map((lang: LocaleOption) => {
            const active = lang.code === locale;
            return (
              <TouchableOpacity
                key={lang.code}
                style={[
                  panelStyles.langRow,
                  active && {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    borderRadius: uiTokens.radius.input,
                  },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setLocale(lang.code);
                  closeLanguageOptions();
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(`languages.${lang.name}`)}
                activeOpacity={0.7}
              >
                <Text style={panelStyles.flag}>{getFlagEmoji(lang.code)}</Text>
                <Text style={[panelStyles.langName, { color: colors.text.primary, marginLeft: 8 }]}>
                  {t(`languages.${lang.name}`)}
                </Text>
                <View
                  style={[
                    panelStyles.langBadge,
                    {
                      backgroundColor: active ? colors.primary : 'transparent',
                      borderColor: active ? colors.primary : isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.1)',
                    },
                  ]}
                >
                  {active ? (
                    <CheckIcon size={12} color={colors.primaryContrastText} strokeWidth={2.5} />
                  ) : (
                    <Text style={[panelStyles.langCode, { color: colors.text.secondary }]}>
                      {lang.code.toUpperCase()}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }) : null}
        </Animated.View>

        <Divider isDark={isDark} />

        {/* Animations */}
        <SectionLabel label={t('settings.animations') || 'Animations'} colors={colors} />
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
    <Reanimated.View
      style={[
        styles.container,
        isMobile && styles.containerMobile,
        typeof topOffset === 'number' ? { top: topOffset } : null,
        containerStyle,
        inline && { position: 'relative', top: 0, right: 0 },
      ]}
    >
      {/* Backdrop */}
      {open && !useModalPanel && (
        <TouchableWithoutFeedback onPress={closePanel}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
      )}

      {/* Button row: [Settings] [Sign In] */}
      <View style={styles.btnRow}>
        {/* Settings gear — first/left */}
        {inline ? <IconButton mode={isDark ? 'dark' : 'light'} label={t('settings.title', 'Quick Settings')} accessibilityState={{ expanded: open }} onPress={togglePanel}><SettingsIcon size={22} color={colors.primary} /></IconButton> : (        <View
          style={[
            styles.triggerWrap,
            createShadowStyle('#000', { width: 0, height: 3 }, isDark ? 0.35 : 0.15, 6, 8) as ViewStyle,
          ]}
        >
          <TouchableOpacity
            style={[styles.trigger, { backgroundColor: open ? colors.primary : colors.surface }]}
            onPress={togglePanel}
            activeOpacity={0.8}
            accessibilityLabel="Quick Settings"
            accessibilityRole="button"
          >
            <Animated.View style={{ transform: [{ rotate: btnRotateDeg }] }}>
              <SettingsIcon
                size={20}
                color={open ? colors.primaryContrastText : colors.text.primary}
                strokeWidth={1.8}
              />
            </Animated.View>
          </TouchableOpacity>
        </View>)}


        {/* Sign-in button — direct access, second/right */}
        {showSignIn && !isOnAuthPage && (
          <View
            style={[
              styles.triggerWrap,
              createShadowStyle('#000', { width: 0, height: 3 }, isDark ? 0.35 : 0.15, 6, 8) as ViewStyle,
            ]}
          >
            <TouchableOpacity
              style={[styles.trigger, { backgroundColor: isDark ? colors.secondary : colors.primary }]}
              onPress={() => router.push('/(shared)/auth')}
              activeOpacity={0.8}
              accessibilityLabel="Sign in"
              accessibilityRole="button"
            >
              <LogInIcon
                size={20}
                color={isDark ? colors.secondaryContrastText : colors.primaryContrastText}
                strokeWidth={2}
              />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Panel */}
      {open && !useModalPanel && panel}
      {open && useModalPanel && (
        <Modal
          transparent
          visible={open}
          animationType="none"
          presentationStyle="overFullScreen"
          statusBarTranslucent
          onRequestClose={closePanel}
        >
          <ModalBackdrop mode={isDark ? 'dark' : 'light'}>
            <TouchableWithoutFeedback onPress={closePanel}>
              <View style={styles.modalBackdrop} />
            </TouchableWithoutFeedback>
            {panel}
          </ModalBackdrop>
        </Modal>
      )}
    </Reanimated.View>
  );
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 1000,
    alignItems: 'flex-end',
  },
  containerMobile: {
    top: Platform.OS === 'web' ? 16 : 56,
    right: 12,
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
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 2,
  },
  triggerWrap: {
    width: 46,
    height: 46,
    borderRadius: uiTokens.radius.pill,
  },
  loginWrap: {},
  trigger: {
    width: 46,
    height: 46,
    borderRadius: uiTokens.radius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
});

const panelStyles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 54,
    right: 0,
    width: 264,
    maxHeight: 460,
    borderRadius: uiTokens.radius.card,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    zIndex: 1,
    // Aligns to the right edge of the gear button regardless of login btn
    alignSelf: 'flex-end',
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    marginVertical: 1,
  },
  languageSummary: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: uiTokens.radius.input,
    borderWidth: 1,
  },
  languageOptions: {
    overflow: 'hidden',
    paddingTop: 4,
  },
  langName: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  langBadge: {
    width: 26,
    height: 26,
    borderRadius: uiTokens.radius.input,
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

const sheet = StyleSheet.create({
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
    flexWrap: 'nowrap',
    marginBottom: 2,
  },
  pill: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: uiTokens.control.compactHeight,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderRadius: uiTokens.radius.pill,
    borderWidth: 1,
  },
  pillLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
    flexShrink: 1,
  },
});
