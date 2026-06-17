import React, { useState, useEffect, useMemo } from "react";
import { View, Text, Image, StyleSheet } from "react-native";

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
  const [imgSrc, setImgSrc] = useState(fallbacks[0] || "");
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    setImgSrc(fallbacks[0] || "");
    setErrorCount(0);
  }, [address, fallbacks]);

  const handleError = () => {
    if (errorCount < fallbacks.length - 1) {
      const nextIndex = errorCount + 1;
      setErrorCount(nextIndex);
      setImgSrc(fallbacks[nextIndex]);
    }
  };

  return (
    <Image
      source={{ uri: imgSrc }}
      style={styles.avatar}
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
  return (
    <View style={styles.column}>
      {props.testimonials.map(({ text, wallet, role }: any, i: number) => {
        const walletAddress =
          wallet || "0x0000000000000000000000000000000000000000";
        return (
          <View key={i} style={styles.card}>
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

const styles = StyleSheet.create({
  column: { flex: 1, gap: 12 },
  card: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginBottom: 12,
  },
  cardText: { color: "#e2e8f0", fontSize: 13, lineHeight: 20 },
  authorRow: { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 8 },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  authorInfo: { flex: 1 },
  walletText: { color: "#94a3b8", fontSize: 11, fontFamily: "monospace" },
  roleText: { color: "#64748b", fontSize: 11, marginTop: 2 },
});

export default TestimonialsColumn;
