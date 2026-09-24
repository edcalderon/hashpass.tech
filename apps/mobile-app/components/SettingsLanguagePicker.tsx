import React, { useCallback, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Haptics from "expo-haptics";
import { uiTokens } from "@hashpass/ui/tokens";
import { getAvailableLocales, useTranslation } from "../i18n/i18n";
import { useLanguage } from "../providers/LanguageProvider";
import { CheckIcon, ChevronDownIcon, getFlagEmoji } from "./icons/SettingsIcons";

type LocaleOption = { code: string; name: string };

type SettingsColors = {
  primary: string;
  primaryContrastText: string;
  text: { primary: string; secondary: string };
};

interface SettingsLanguagePickerProps {
  isDark: boolean;
  colors: SettingsColors;
}

/**
 * Shared collapsed language chooser for every settings-wheel panel.
 * The selected locale stays visible, while the complete list mounts only after
 * an explicit tap—keeping floating settings surfaces compact on first open.
 */
export function SettingsLanguagePicker({
  isDark,
  colors,
}: SettingsLanguagePickerProps) {
  const { locale, setLocale } = useLanguage();
  const { t } = useTranslation("profile");
  const availableLocales = getAvailableLocales() as LocaleOption[];
  const currentLanguage = availableLocales.find((language) => language.code === locale) ?? availableLocales[0];
  const [expanded, setExpanded] = useState(false);
  const [optionsMounted, setOptionsMounted] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  const collapse = useCallback(() => {
    setExpanded(false);
    Animated.timing(progress, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(() => setOptionsMounted(false));
  }, [progress]);

  const toggleOptions = useCallback(() => {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded) setOptionsMounted(true);
    Animated.timing(progress, {
      toValue: nextExpanded ? 1 : 0,
      duration: nextExpanded ? 220 : 180,
      easing: nextExpanded ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      if (!nextExpanded) setOptionsMounted(false);
    });
  }, [expanded, progress]);

  const selectLanguage = useCallback((code: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocale(code);
    collapse();
  }, [collapse, setLocale]);

  if (!currentLanguage) return null;

  const chevronRotation = progress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <View testID="settings-language-picker">
      <TouchableOpacity
        testID="settings-language-toggle"
        style={[
          styles.summary,
          {
            borderColor: isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.1)",
            backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
          },
        ]}
        onPress={toggleOptions}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${t("settings.language") || "Language"}: ${t(`languages.${currentLanguage.name}`)}`}
        activeOpacity={0.72}
      >
        <Text style={styles.flag}>{getFlagEmoji(currentLanguage.code)}</Text>
        <Text style={[styles.name, { color: colors.text.primary }]}>
          {t(`languages.${currentLanguage.name}`)}
        </Text>
        <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
          <ChevronDownIcon size={18} color={colors.text.secondary} strokeWidth={2} />
        </Animated.View>
      </TouchableOpacity>

      <Animated.View
        testID="settings-language-options"
        style={[
          styles.options,
          {
            opacity: progress,
            maxHeight: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 320] }),
            transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }) }],
          },
        ]}
      >
        {optionsMounted ? availableLocales.map((language) => {
          const active = language.code === locale;
          return (
            <TouchableOpacity
              key={language.code}
              style={[
                styles.option,
                active && {
                  backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
                },
              ]}
              onPress={() => selectLanguage(language.code)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t(`languages.${language.name}`)}
              activeOpacity={0.7}
            >
              <Text style={styles.flag}>{getFlagEmoji(language.code)}</Text>
              <Text style={[styles.name, { color: colors.text.primary }]}>
                {t(`languages.${language.name}`)}
              </Text>
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: active ? colors.primary : "transparent",
                    borderColor: active ? colors.primary : isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.1)",
                  },
                ]}
              >
                {active ? (
                  <CheckIcon size={12} color={colors.primaryContrastText} strokeWidth={2.5} />
                ) : (
                  <Text style={[styles.code, { color: colors.text.secondary }]}>{language.code.toUpperCase()}</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        }) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    minHeight: uiTokens.control.compactHeight,
    borderRadius: uiTokens.radius.input,
    borderWidth: uiTokens.control.borderWidth,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTokens.space.sm,
    paddingHorizontal: uiTokens.space.md,
  },
  options: { overflow: "hidden", marginTop: uiTokens.space.xs },
  option: {
    minHeight: uiTokens.control.compactHeight,
    borderRadius: uiTokens.radius.input,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTokens.space.sm,
    paddingHorizontal: uiTokens.space.sm,
    marginVertical: 1,
  },
  flag: { fontSize: 16, lineHeight: 20 },
  name: { flex: 1, fontSize: 14, fontWeight: "500" },
  badge: {
    width: 26,
    height: 26,
    borderRadius: uiTokens.radius.circle,
    borderWidth: uiTokens.control.borderWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  code: { fontSize: 9, fontWeight: "700", letterSpacing: 0.6 },
});
