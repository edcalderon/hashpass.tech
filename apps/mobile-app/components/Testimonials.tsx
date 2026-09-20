import LandingBadge from "./LandingBadge";
import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import TestimonialsColumn from "./TestimonialsColumns";
import testimonials from "../i18n/locales/testimonials.json";
import { useTranslation } from "../i18n/i18n";
import { useTheme } from "../hooks/useTheme";

const Testimonials: React.FC<{ locale: string }> = ({ locale }) => {
  const { t } = useTranslation("index.testimonials");
  const { colors } = useTheme();

  const localized = useMemo(() => {
    const entries = testimonials[locale as keyof typeof testimonials] || testimonials.en;
    return entries.slice(0, 4);
  }, [locale]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ marginBottom: 16 }}><LandingBadge>{t("title")}</LandingBadge></View>
        <Text style={[styles.subtitle, { color: colors.text.primary }]}>
          {t("subtitle")}
        </Text>
        <Text style={[styles.description, { color: colors.text.primary }]}>
          {t("description")}
        </Text>
      </View>
      <TestimonialsColumn testimonials={localized} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingVertical: 32, paddingHorizontal: 16 },
  header: { alignItems: "center", marginBottom: 24 },
  subtitle: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  description: { fontSize: 14, textAlign: "center", opacity: 0.75 },
});

export default Testimonials;
