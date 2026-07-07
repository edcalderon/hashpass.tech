import React, { useState, useMemo } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import type { ThemeColors } from "../lib/theme";

const avatarStyles = StyleSheet.create({
  avatar: { width: 36, height: 36, borderRadius: 18 },
});

const formatWalletAddress = (address: string): string => {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

const isValidEthereumAddress = (address: string): boolean => {
  if (!address || typeof address !== "string") return false;
  if (address.length !== 42) return false;
  if (!address.startsWith("0x")) return false;
  return /^0x[0-9a-fA-F]{40}$/.test(address);
};

const getAvatarUrls = (address: string): string[] => {
  const normalizedAddress = address.toLowerCase();
  const urls: string[] = [];
  if (isValidEthereumAddress(address)) {
    urls.push(`https://effigy.im/a/${normalizedAddress}.svg`);
  }
  urls.push(`https://avatar.vercel.sh/${normalizedAddress}`);
  urls.push(
    `https://ui-avatars.com/api/?name=${encodeURIComponent(normalizedAddress)}&background=random&size=128`
  );
  return urls;
};

const AvatarImage = ({ address, alt }: { address: string; alt: string }) => {
  const fallbacks = useMemo(() => getAvatarUrls(address), [address]);
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const imgSrc = fallbacks[fallbackIndex] || fallbacks[0] || "";

  const handleError = () => {
    if (fallbackIndex < fallbacks.length - 1) {
      setFallbackIndex((currentIndex) => Math.min(currentIndex + 1, fallbacks.length - 1));
    }
  };

  return (
    <Image
      source={{ uri: imgSrc }}
      style={avatarStyles.avatar}
      onError={handleError}
      accessibilityLabel={alt}
    />
  );
};

const TestimonialsColumn = (props: {
  className?: string;
  testimonials: any;
  duration?: number;
}) => {
  const { useTheme } = require("../hooks/useTheme") as typeof import("../hooks/useTheme");
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors, isDark);

  return (
    <View style={styles.column}>
      {props.testimonials.map(({ text, wallet, role }: any, i: number) => {
        const walletAddress =
          wallet || "0x0000000000000000000000000000000000000000";
        const testimonialKey = `${walletAddress}-${role || "no-role"}-${text}`;
        return (
          <View key={testimonialKey} style={styles.card}>
            <Text style={styles.cardText}>{text}</Text>
            <View style={styles.authorRow}>
              <AvatarImage
                address={walletAddress}
                alt={formatWalletAddress(walletAddress)}
              />
              <View style={styles.authorInfo}>
                <Text style={styles.walletText}>
                  {formatWalletAddress(walletAddress)}
                </Text>
                {role ? <Text style={styles.roleText}>{role}</Text> : null}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
};

const getStyles = (colors: ThemeColors, isDark: boolean) =>
  StyleSheet.create({
    column: { flex: 1, gap: 12 },
    card: {
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : colors.background.paper,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: isDark ? "rgba(255,255,255,0.1)" : colors.divider,
      marginBottom: 12,
      ...(isDark
        ? {}
        : {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.08,
            shadowRadius: 16,
            elevation: 2,
          }),
    },
    cardText: {
      color: colors.text.primary,
      fontSize: 13,
      lineHeight: 20,
    },
    authorRow: { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 8 },
    authorInfo: { flex: 1 },
    walletText: {
      color: colors.text.primary,
      fontSize: 11,
      fontFamily: "monospace",
    },
    roleText: {
      color: colors.text.secondary,
      fontSize: 11,
      marginTop: 2,
    },
  });

export default TestimonialsColumn;
