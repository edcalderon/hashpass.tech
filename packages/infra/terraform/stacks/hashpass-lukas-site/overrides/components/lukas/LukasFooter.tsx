import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from '../../i18n/i18n';

const LEGAL_LINKS = [
  { label: 'LKS index notice', url: 'https://hashpass.club/documentation/legal/lks-latam-currency-index/' },
  { label: 'Terms of Service', url: 'https://hashpass.club/documentation/legal/terms-of-service/' },
  { label: 'Privacy Policy', url: 'https://hashpass.club/documentation/legal/privacy-policy/' },
];

const RELEASE_VERSION = '__LUKAS_RELEASE_VERSION__';

export function LukasFooter() {
  const { isDark } = useTheme();
  const isMobile = useIsMobile();
  const { t } = useTranslation('lukas');
  const styles = getStyles(isDark, isMobile);
  const year = new Date().getFullYear();

  const openLink = (url: string) => {
    Linking.openURL(url);
  };

  return (
    <View style={styles.footer}>
      <View style={styles.inner}>
        <View style={styles.brandBlock}>
          <Text style={styles.brand}>$LUKAS</Text>
          <Text style={styles.description}>{t('footer.subtext')}</Text>
          <Text style={styles.disclaimer}>
            $LUKAS is a LatAm peso index product. Availability, eligibility, and launch timing are subject to the applicable terms.
          </Text>
        </View>

        <View style={styles.linkColumns}>
          <View style={styles.linkColumn}>
            <Text style={styles.columnTitle}>LUKAS</Text>
            <Pressable onPress={() => openLink('https://lukas.lat')} accessibilityRole="link" style={styles.linkButton}>
              <Text style={styles.linkText}>lukas.lat</Text>
            </Pressable>
            <Pressable onPress={() => openLink('https://github.com/hashpass-tech/hashpass.tech')} accessibilityRole="link" style={styles.linkButton}>
              <Text style={styles.linkText}>GitHub</Text>
            </Pressable>
          </View>
          <View style={styles.linkColumn}>
            <Text style={styles.columnTitle}>LEGAL</Text>
            {LEGAL_LINKS.map((link) => (
              <Pressable key={link.url} onPress={() => openLink(link.url)} accessibilityRole="link" style={styles.linkButton}>
                <Text style={styles.linkText}>{link.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.bottomRow}>
        <Text style={styles.copyright}>© {year} HASHPASS. All rights reserved.</Text>
        <Text style={styles.version}>LUKAS landing v{RELEASE_VERSION}</Text>
        <Pressable onPress={() => openLink('https://hashpass.tech')} accessibilityRole="link" style={styles.hashPassLink}>
          <Text style={styles.hashPassLinkText}>Powered by HashPass</Text>
        </Pressable>
      </View>
    </View>
  );
}

const getStyles = (isDark: boolean, isMobile: boolean) => StyleSheet.create({
  footer: {
    backgroundColor: isDark ? '#070D19' : '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(148, 163, 184, 0.2)' : '#E2E8F0',
    paddingHorizontal: isMobile ? 20 : 40,
    paddingTop: isMobile ? 40 : 56,
    paddingBottom: isMobile ? 24 : 32,
  },
  inner: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
    flexDirection: isMobile ? 'column' : 'row',
    justifyContent: 'space-between',
    gap: isMobile ? 32 : 64,
  },
  brandBlock: { flex: 1, gap: 12, maxWidth: 560 },
  brand: { color: isDark ? '#F8FAFC' : '#0F172A', fontSize: isMobile ? 24 : 28, fontWeight: '900', letterSpacing: 1.5 },
  description: { color: isDark ? '#CBD5E1' : '#334155', fontSize: 14, lineHeight: 21 },
  disclaimer: { color: isDark ? '#8193A8' : '#64748B', fontSize: 12, lineHeight: 18 },
  linkColumns: { flexDirection: 'row', gap: isMobile ? 48 : 72 },
  linkColumn: { gap: 8, minWidth: 120 },
  columnTitle: { color: isDark ? '#7EE6A0' : '#137A42', fontSize: 12, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  linkButton: { minHeight: 32, justifyContent: 'center' },
  linkText: { color: isDark ? '#D5DFEC' : '#334155', fontSize: 14 },
  bottomRow: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
    flexDirection: isMobile ? 'column' : 'row',
    alignItems: isMobile ? 'flex-start' : 'center',
    gap: 12,
    marginTop: isMobile ? 32 : 48,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(148, 163, 184, 0.14)' : '#E2E8F0',
  },
  copyright: { color: isDark ? '#8193A8' : '#64748B', fontSize: 12, flex: 1 },
  version: { color: isDark ? '#8193A8' : '#64748B', fontSize: 12 },
  hashPassLink: { minHeight: 32, justifyContent: 'center' },
  hashPassLinkText: { color: isDark ? '#7EE6A0' : '#137A42', fontSize: 12, fontWeight: '700' },
});
