import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '../../lib/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from '../../i18n/i18n';

// See privacy.tsx for why this uses useTranslation() (the app's real,
// working i18n system) instead of @lingui/macro's t() -- that macro's
// catalogs are never actually compiled in this repo, so every t() call
// here was silently broken in production.
export default function TermsOfServiceScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const styles = getStyles(isDark, colors);
  const { t } = useTranslation('terms');
  const handleBackPress = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBackPress}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} selectable={false}>{t('title', 'Terms of Service')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated} selectable={false}>
          {t('lastUpdated', 'Last Updated: August 18, 2026')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('acceptance.title', '1. Acceptance of Terms')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('acceptance.text', 'By accessing and using HASHPASS ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('description.title', '2. Service Description')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('description.text', 'HASHPASS is a digital event platform that provides event management, pass management, networking features, and related services. We reserve the right to modify, suspend, or discontinue any part of the Service at any time.')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('accounts.title', '3. User Accounts')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('accounts.text', 'You are responsible for maintaining the confidentiality of your account credentials. You agree to:\n\n• Provide accurate and complete information\n• Keep your account information updated\n• Not share your account with others\n• Notify us immediately of any unauthorized use\n• Accept responsibility for all activities under your account\n\nIf you choose to sign in by linking a cryptocurrency wallet, you are solely responsible for the security of your wallet, private keys, and seed phrase. We never request, collect, or have access to your private keys or seed phrase, and we cannot recover a wallet-linked account if you lose access to your wallet.')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('conduct.title', '4. User Conduct')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('conduct.text', 'You agree not to:\n\n• Violate any laws or regulations\n• Infringe on intellectual property rights\n• Transmit harmful code or malware\n• Harass, abuse, or harm other users\n• Collect user data without permission\n• Impersonate others or provide false information\n• Interfere with the Service\'s operation')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('content.title', '5. User Content')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('content.text', 'You retain ownership of content you submit to the Service. By submitting content, you grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, modify, and distribute your content for the purpose of providing and improving the Service.\n\nMessages you send through our in-app meeting chat feature are end-to-end encrypted and readable only by you and the recipient (see our Privacy Policy for details) — this license to message content is limited accordingly, since we cannot access or process encrypted message content ourselves.')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('intellectual.title', '6. Intellectual Property')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('intellectual.text', 'The Service and its original content, features, and functionality are owned by HASHPASS and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('termination.title', '7. Termination')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('termination.text', 'We may terminate or suspend your account and access to the Service immediately, without prior notice, for any reason, including if you breach the Terms. Upon termination, your right to use the Service will cease immediately.')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('disclaimer.title', '8. Disclaimer of Warranties')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('disclaimer.text', 'The Service is provided "as is" and "as available" without warranties of any kind, either express or implied. We do not warrant that the Service will be uninterrupted, secure, or error-free.')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('limitation.title', '9. Limitation of Liability')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('limitation.text', 'In no event shall HASHPASS be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or use, incurred by you or any third party, whether in an action in contract or tort.')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('changes.title', '10. Changes to Terms')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('changes.text', 'We reserve the right to modify these Terms at any time. We will notify users of any material changes by posting the new Terms on this page and updating the "Last Updated" date. Your continued use of the Service after such modifications constitutes acceptance of the updated Terms.')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('contact.title', '11. Contact Information')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('contact.text', 'If you have any questions about these Terms of Service, please contact us at:\n\nEmail: legal@hashpass.tech\nWebsite: https://hashpass.tech')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  lastUpdated: {
    fontSize: 12,
    color: colors.text.secondary,
    marginBottom: 24,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 24,
    marginBottom: 12,
  },
  sectionText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text.primary,
    marginBottom: 16,
  },
});
