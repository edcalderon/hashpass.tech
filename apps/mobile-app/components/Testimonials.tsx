import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import TestimonialsColumn from "./TestimonialsColumns";
import testimonials from "../i18n/locales/testimonials.json";
import { useTranslation } from "../i18n/i18n";
import { useTheme } from "../hooks/useTheme";

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const Testimonials: React.FC<{ locale: string }> = () => {
  const { t } = useTranslation("index.testimonials");
  const { colors } = useTheme();

  const mixed = useMemo(() => {
    const all: any[] = [];
    Object.keys(testimonials).forEach((lang) => {
      const langT = testimonials[lang as keyof typeof testimonials];
      if (Array.isArray(langT)) all.push(...langT);
    });
    return shuffleArray(all).slice(0, 4);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.badge, { borderColor: colors.text.primary + "40" }]}>
          <Text style={[styles.badgeText, { color: colors.text.primary }]}>
            {t("title")}
          </Text>
        </View>
        <Text style={[styles.subtitle, { color: colors.text.primary }]}>
          {t("subtitle")}
        </Text>
        <Text style={[styles.description, { color: colors.text.primary }]}>
          {t("description")}
        </Text>
      </View>
      <TestimonialsColumn testimonials={mixed} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { paddingVertical: 32, paddingHorizontal: 16 },
  header: { alignItems: "center", marginBottom: 24 },
  badge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  badgeText: { fontSize: 13 },
  subtitle: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  description: { fontSize: 14, textAlign: "center", opacity: 0.75 },
});

export default Testimonials;
