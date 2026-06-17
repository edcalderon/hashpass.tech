import React from "react";
import { View, Image, Text, StyleSheet } from "react-native";

export interface LampBrandBannerProps {
  logoSrc?: string;
  logoSrcDark?: string;
  logoSrcLight?: string;
  logoFallbackSrc?: string;
  isDarkMode?: boolean;
  logoAlt?: string;
  className?: string;
  backgroundColor?: string;
  accentColor?: string;
}

export default function LampBrandBanner({
  logoSrc,
  logoSrcDark,
  logoSrcLight,
  logoFallbackSrc,
  isDarkMode = true,
  logoAlt = "Event brand",
  backgroundColor = "#07111F",
  accentColor = "#6FDDFD",
}: LampBrandBannerProps) {
  const resolvedLogoSrc =
    logoSrc ||
    (isDarkMode ? logoSrcDark : logoSrcLight) ||
    logoFallbackSrc ||
    "";

  return (
    <View style={[styles.container, { backgroundColor }]}>
      {resolvedLogoSrc ? (
        <Image
          source={{ uri: resolvedLogoSrc }}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel={logoAlt}
        />
      ) : (
        <Text style={[styles.fallbackText, { color: isDarkMode ? "#e2e8f0" : accentColor }]}>
          {logoAlt}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 200,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    overflow: "hidden",
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  logo: {
    width: "84%",
    height: 120,
  },
  fallbackText: {
    fontSize: 24,
    fontWeight: "600",
    textAlign: "center",
  },
});
