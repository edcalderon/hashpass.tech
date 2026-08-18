import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Link } from 'expo-router';
import { Ionicons } from '../../lib/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from '../../i18n/i18n';

// Uses the app's real i18n system (flat JSON catalogs in i18n/locales/,
// already populated and translated for all 6 locales) rather than
// @lingui/macro's t() -- that macro compiles into i18n/catalogs/{locale},
// which has never actually been extracted/compiled in this repo (no
// extract/compile scripts wired into package.json, no committed catalog
// files), so every t({id, message}) call here was silently rendering
// either the raw message id or nothing at all, confirmed live in
// production. The 'privacy' namespace below already existed in the JSON
// catalogs with real translations for most sections (this screen simply
// wasn't reading them); only 'analytics' was genuinely missing everywhere,
// added alongside this migration.
export default function PrivacyPolicyScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const styles = getStyles(isDark, colors);
  const { t } = useTranslation('privacy');
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
        <Text style={styles.headerTitle} selectable={false}>{t('title', 'Privacy Policy')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated} selectable={false}>
          {t('lastUpdated', 'Last Updated: August 18, 2026')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('introduction.title', '1. Introduction')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('introduction.text', 'HASHPASS ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our digital event platform and services (the "Service"). Please read this privacy policy carefully. If you do not agree with the terms of this privacy policy, please do not access the Service.')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('collection.title', '2. Information We Collect')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('collection.text', 'We collect information that you provide directly to us, including:\n\n• Account Information: Your name and email address, whether you sign in with Google, with an email verification code, or with a linked cryptocurrency wallet.\n• Profile Photo: If you choose to upload a profile picture, we store and display it. This is optional.\n• Wallet Information: If you connect a cryptocurrency wallet (e.g. Solana or Ethereum) to sign in, we collect and store your public wallet address. We never collect or have access to your private keys or seed phrase.\n• Messages: If you use in-app messaging (e.g. event meeting chat), we store sender and recipient identifiers and timestamps so messages can be delivered. Message content sent through meeting chat is end-to-end encrypted — see Section 5 for details.\n• Event Data: Information about events you attend, passes you hold, and interactions within our platform.\n• Usage Data: Information about how you use our Service, including features accessed and actions taken.\n• Device Information: Technical information about your device, browser, and operating system.')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('use.title', '3. How We Use Your Information')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('use.text', 'We use the information we collect to:\n\n• Provide and maintain our Service\n• Process your event registrations and manage your passes\n• Send you important updates about events and services\n• Improve and personalize your experience\n• Detect and prevent fraud or abuse\n• Comply with legal obligations')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('sharing.title', '4. Information Sharing and Disclosure')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('sharing.text', 'We do not sell your personal information, and we do not share it with third parties for their own independent purposes. We use a small number of service providers who process data solely on our behalf, under contract, to help us operate the Service:\n\n• Supabase, for authentication and database hosting\n• Brevo, to deliver transactional emails such as sign-in verification codes\n• Cloudinary, to host and optimize profile pictures you choose to upload\n\nWe may also share your information:\n\n• With event organizers for events you register for\n• When required by law or to protect our rights\n• In connection with a merger, acquisition, or sale of assets')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('security.title', '5. Data Security')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('security.text', 'We implement appropriate technical and organizational security measures to protect your personal information:\n\n• Encryption in transit: All data sent between your device and our servers is encrypted using HTTPS/TLS.\n• End-to-end encrypted messaging: Messages you send through our in-app meeting chat feature are end-to-end encrypted (X25519 key exchange, HKDF-SHA256, and XChaCha20-Poly1305) directly on your device. Only you and the recipient can read message content — HASHPASS cannot access it.\n• Account deletion: You can permanently delete your account and associated personal data at any time from within the app.\n\nNo method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('rights.title', '6. Your Rights')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('rights.text', 'You have the right to:\n\n• Access your personal information\n• Correct inaccurate information\n• Request deletion of your information\n• Object to processing of your information\n• Data portability\n• Withdraw consent at any time')}
        </Text>
        <Link href="/(shared)/delete-account" style={styles.inlineLink}>
          {t('rights.deleteAccountLink', 'You can delete your account and data at any time — see how →')}
        </Link>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('cookies.title', '7. Cookies and Tracking')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('cookies.text', 'We use cookies and similar tracking technologies to maintain your session, remember preferences, and analyze usage of our Service. Cookies we use include:\n\n• Essential cookies: required for authentication and security (session tokens, CSRF tokens).\n• Analytics cookies: set by Google Analytics to measure how visitors interact with our website (see Section 8).\n\nYou can instruct your browser to refuse all cookies or to notify you when a cookie is being sent. Disabling essential cookies will prevent you from signing in.')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('analytics.title', '8. Analytics Services (Google Analytics)')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('analytics.text', 'We use Google Analytics 4 (GA4), a web analytics service provided by Google LLC ("Google"), to help us understand how visitors use our website.\n\nWhat Google Analytics collects:\n• Pages visited and time spent on each page\n• Browser type, operating system, and device type\n• Approximate geographic location (country/city level)\n• Referral source (how you arrived at our site)\n• Events and interactions (e.g. button clicks, form submissions)\n\nIP anonymization: We have enabled IP anonymization (anonymize_ip: true), so your full IP address is never stored or processed by Google.\n\nData transfer: Google processes analytics data on servers located in the United States. Google LLC is certified under the EU–US Data Privacy Framework, providing adequate safeguards for data transfers from the European Economic Area.\n\nData retention: Analytics data is retained for 14 months, after which it is automatically deleted.\n\nYour choices:\n• Browser opt-out: Install the Google Analytics Opt-out Browser Add-on at https://tools.google.com/dlpage/gaoptout\n• Do Not Track: We honor browser Do Not Track signals — when DNT is enabled, no analytics data is collected.\n\nGoogle\'s privacy policy is available at https://policies.google.com/privacy')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('changes.title', '9. Changes to This Privacy Policy')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('changes.text', 'We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date.')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('contact.title', '10. Contact Us')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('contact.text', 'If you have any questions about this Privacy Policy, please contact us at:\n\nEmail: privacy@hashpass.tech\nWebsite: https://hashpass.tech')}
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
  inlineLink: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: 16,
    marginTop: -8,
  },
});
