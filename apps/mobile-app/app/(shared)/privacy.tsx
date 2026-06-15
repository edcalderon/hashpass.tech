import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { t } from '@lingui/macro';
import { useLingui } from '@lingui/react';

export default function PrivacyPolicyScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { i18n } = useLingui();
  const styles = getStyles(isDark, colors);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} selectable={false}>{t({ id: 'privacy.title', message: 'Privacy Policy' })}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated} selectable={false}>
          {t({ id: 'privacy.lastUpdated', message: 'Last Updated: November 4, 2025' })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'privacy.introduction.title', message: '1. Introduction' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'privacy.introduction.text', 
            message: 'HashPass ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our digital event platform and services (the "Service"). Please read this privacy policy carefully. If you do not agree with the terms of this privacy policy, please do not access the Service.' 
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'privacy.collection.title', message: '2. Information We Collect' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'privacy.collection.text', 
            message: 'We collect information that you provide directly to us, including:\n\n• Account Information: When you sign in with Google, we collect your name, email address, and profile picture.\n• Event Data: Information about events you attend, passes you hold, and interactions within our platform.\n• Usage Data: Information about how you use our Service, including features accessed and actions taken.\n• Device Information: Technical information about your device, browser, and operating system.' 
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'privacy.use.title', message: '3. How We Use Your Information' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'privacy.use.text', 
            message: 'We use the information we collect to:\n\n• Provide and maintain our Service\n• Process your event registrations and manage your passes\n• Send you important updates about events and services\n• Improve and personalize your experience\n• Detect and prevent fraud or abuse\n• Comply with legal obligations' 
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'privacy.sharing.title', message: '4. Information Sharing and Disclosure' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'privacy.sharing.text', 
            message: 'We do not sell your personal information. We may share your information only in the following circumstances:\n\n• With event organizers for events you register for\n• With service providers who assist us in operating our platform\n• When required by law or to protect our rights\n• In connection with a merger, acquisition, or sale of assets' 
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'privacy.security.title', message: '5. Data Security' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'privacy.security.text', 
            message: 'We implement appropriate technical and organizational security measures to protect your personal information. However, no method of transmission over the Internet or electronic storage is 100% secure, and we cannot guarantee absolute security.' 
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'privacy.rights.title', message: '6. Your Rights' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'privacy.rights.text', 
            message: 'You have the right to:\n\n• Access your personal information\n• Correct inaccurate information\n• Request deletion of your information\n• Object to processing of your information\n• Data portability\n• Withdraw consent at any time' 
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'privacy.cookies.title', message: '7. Cookies and Tracking' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'privacy.cookies.text', 
            message: 'We use cookies and similar tracking technologies to track activity on our Service and hold certain information. You can instruct your browser to refuse all cookies or to indicate when a cookie is being sent.' 
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'privacy.changes.title', message: '8. Changes to This Privacy Policy' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'privacy.changes.text', 
            message: 'We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last Updated" date.' 
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'privacy.contact.title', message: '9. Contact Us' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'privacy.contact.text', 
            message: 'If you have any questions about this Privacy Policy, please contact us at:\n\nEmail: privacy@hashpass.tech\nWebsite: https://hashpass.tech' 
          })}
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

