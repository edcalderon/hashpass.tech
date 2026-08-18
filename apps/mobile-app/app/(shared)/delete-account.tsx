import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '../../lib/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { t } from '@lingui/macro';

// Standalone, unauthenticated page required by Google Play's "Delete account"
// store-listing link. Must work without installing the app or signing in --
// the previous URL (dashboard/settings) failed that requirement outright,
// since app/(shared)/dashboard/_layout.tsx redirects unauthenticated
// visitors to /auth. This file sits directly under (shared)/, same as
// privacy.tsx and terms.tsx, which have no auth gate of their own (there is
// no (shared)/_layout.tsx at all -- only dashboard/_layout.tsx gates on
// isLoggedIn).
export default function DeleteAccountScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const styles = getStyles(isDark, colors);
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
        <Text style={styles.headerTitle} selectable={false}>{t({ id: 'deleteAccount.title', message: 'Delete Your Account' })}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated} selectable={false}>
          {t({ id: 'deleteAccount.lastUpdated', message: 'Last Updated: August 18, 2026' })}
        </Text>

        <Text style={styles.sectionText} selectable={false}>
          {t({
            id: 'deleteAccount.intro',
            message: 'This page explains how to permanently delete your HASHPASS account and what happens to your data when you do. It works whether or not you have the HASHPASS app installed or are signed in.'
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'deleteAccount.steps.title', message: 'How to Delete Your Account' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({
            id: 'deleteAccount.steps.text',
            message: 'If you have access to your account:\n\n1. Open the HASHPASS app.\n2. Sign in to your account.\n3. Go to Dashboard → Settings.\n4. Scroll down and tap "Delete Account".\n5. Confirm that you understand this is permanent.\n6. We\'ll email a verification code to your account\'s email address — enter it to confirm.\n7. Your account and data are deleted immediately.'
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'deleteAccount.noAccess.title', message: "Can't Access Your Account?" })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({
            id: 'deleteAccount.noAccess.text',
            message: 'If you\'ve lost access to the app or your account, email privacy@hashpass.tech from the email address associated with your HASHPASS account, with the subject "Account Deletion Request". We\'ll verify your identity and delete your account manually.'
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'deleteAccount.deleted.title', message: 'What Data Is Deleted' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({
            id: 'deleteAccount.deleted.text',
            message: 'When you delete your account, we immediately and permanently delete:\n\n• Your name, email address, and profile photo\n• Your linked cryptocurrency wallet address, if any\n• Your event passes and pass requests\n• Your meeting requests, meetings, and messages you sent in event chat\n• Your networking status, agenda, and tutorial progress\n• Blocked-user relationships\n• Your account credentials and ability to sign in'
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'deleteAccount.retained.title', message: 'What Data May Be Retained' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({
            id: 'deleteAccount.retained.text',
            message: 'A limited amount of data may be retained after your account is deleted:\n\n• Records we are required to keep for legal, tax, accounting, or fraud-prevention purposes, such as token transaction history\n• Data that may persist in routine backups for a limited period before being purged\n• Messages you sent to other users may remain in the recipient\'s own copy of the conversation. Message content sent through event chat is end-to-end encrypted, so HASHPASS cannot read it regardless of retention\n\nAny retained data is used only for the purposes listed above and is handled according to our Privacy Policy — we do not use it to keep operating your account or profile.'
          })}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t({ id: 'deleteAccount.contact.title', message: 'Questions' })}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t({
            id: 'deleteAccount.contact.text',
            message: 'If you have questions about deleting your account or your data, contact us at:\n\nEmail: privacy@hashpass.tech\nWebsite: https://hashpass.tech'
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
