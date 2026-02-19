import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { t } from '@lingui/macro';
import { useLingui } from '@lingui/react';

export default function TermsOfServiceScreen() {
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
        <Text style={styles.headerTitle} selectable={false}>{t({ id: 'terms.title', message: 'Terms of Service' })}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated} selectable={false}>
          {t({ id: 'terms.lastUpdated', message: 'Last Updated: November 4, 2025' })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'terms.acceptance.title', message: '1. Acceptance of Terms' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'terms.acceptance.text', 
            message: 'By accessing and using HashPass ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.' 
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'terms.description.title', message: '2. Service Description' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'terms.description.text', 
            message: 'HashPass is a digital event platform that provides event management, pass management, networking features, and related services. We reserve the right to modify, suspend, or discontinue any part of the Service at any time.' 
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'terms.accounts.title', message: '3. User Accounts' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'terms.accounts.text', 
            message: 'You are responsible for maintaining the confidentiality of your account credentials. You agree to:\n\n• Provide accurate and complete information\n• Keep your account information updated\n• Not share your account with others\n• Notify us immediately of any unauthorized use\n• Accept responsibility for all activities under your account' 
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'terms.conduct.title', message: '4. User Conduct' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'terms.conduct.text', 
            message: 'You agree not to:\n\n• Violate any laws or regulations\n• Infringe on intellectual property rights\n• Transmit harmful code or malware\n• Harass, abuse, or harm other users\n• Collect user data without permission\n• Impersonate others or provide false information\n• Interfere with the Service\'s operation' 
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'terms.content.title', message: '5. User Content' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'terms.content.text', 
            message: 'You retain ownership of content you submit to the Service. By submitting content, you grant us a worldwide, non-exclusive, royalty-free license to use, reproduce, modify, and distribute your content for the purpose of providing and improving the Service.' 
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'terms.intellectual.title', message: '6. Intellectual Property' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'terms.intellectual.text', 
            message: 'The Service and its original content, features, and functionality are owned by HashPass and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.' 
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'terms.termination.title', message: '7. Termination' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'terms.termination.text', 
            message: 'We may terminate or suspend your account and access to the Service immediately, without prior notice, for any reason, including if you breach the Terms. Upon termination, your right to use the Service will cease immediately.' 
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'terms.disclaimer.title', message: '8. Disclaimer of Warranties' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'terms.disclaimer.text', 
            message: 'The Service is provided "as is" and "as available" without warranties of any kind, either express or implied. We do not warrant that the Service will be uninterrupted, secure, or error-free.' 
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'terms.limitation.title', message: '9. Limitation of Liability' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'terms.limitation.text', 
            message: 'In no event shall HashPass be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or use, incurred by you or any third party, whether in an action in contract or tort.' 
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'terms.changes.title', message: '10. Changes to Terms' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'terms.changes.text', 
            message: 'We reserve the right to modify these Terms at any time. We will notify users of any material changes by posting the new Terms on this page and updating the "Last Updated" date. Your continued use of the Service after such modifications constitutes acceptance of the updated Terms.' 
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'terms.contact.title', message: '11. Contact Information' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({ 
            id: 'terms.contact.text', 
            message: 'If you have any questions about these Terms of Service, please contact us at:\n\nEmail: legal@hashpass.tech\nWebsite: https://hashpass.tech' 
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

