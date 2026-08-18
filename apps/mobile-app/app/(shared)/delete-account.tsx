import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '../../lib/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from '../../i18n/i18n';
import ThemeAndLanguageSwitcher from '../../components/ThemeAndLanguageSwitcher';

// Standalone, unauthenticated page required by Google Play's "Delete account"
// store-listing link. Must work without installing the app or signing in --
// the previous URL (dashboard/settings) failed that requirement outright,
// since app/(shared)/dashboard/_layout.tsx redirects unauthenticated
// visitors to /auth. This file sits directly under (shared)/, same as
// privacy.tsx and terms.tsx, which have no auth gate of their own -- but
// unlike those two, this route also had to be added explicitly to
// app/_layout.tsx's isPublicPage list (a *separate*, root-level redirect
// check that isn't scoped to dashboard/_layout.tsx) -- without that, this
// screen still silently bounced an unauthenticated visitor to /auth despite
// having no gate of its own.
//
// ThemeAndLanguageSwitcher renders a floating top-right control (language
// picker, theme toggle, and -- since this page is never itself the auth
// screen -- a sign-in shortcut) so a visitor arriving from the Play Store
// listing can switch locale or jump straight to sign-in without hunting for
// controls. The header below is left-aligned (not centered) specifically so
// its title never sits under that floating cluster.
export default function DeleteAccountScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const styles = getStyles(isDark, colors);
  const { t } = useTranslation('deleteAccount');
  const handleBackPress = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ThemeAndLanguageSwitcher />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBackPress}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} selectable={false}>{t('title', 'Delete Your Account')}</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.lastUpdated} selectable={false}>
          {t('lastUpdated', 'Last Updated: August 18, 2026')}
        </Text>

        <Text style={styles.sectionText} selectable={false}>
          {t('intro', 'This page explains how to permanently delete your HASHPASS account and what happens to your data when you do. It works whether or not you have the HASHPASS app installed or are signed in.')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('steps.title', 'How to Delete Your Account')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('steps.text', 'If you have access to your account:\n\n1. Open the HASHPASS app.\n2. Sign in to your account.\n3. Go to Dashboard → Settings.\n4. Scroll down and tap "Delete Account".\n5. Confirm that you understand this is permanent.\n6. We\'ll email a verification code to your account\'s email address — enter it to confirm.\n7. Your account and data are deleted immediately.')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('noAccess.title', "Can't Access Your Account?")}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('noAccess.text', 'If you\'ve lost access to the app or your account, email privacy@hashpass.tech from the email address associated with your HASHPASS account, with the subject "Account Deletion Request". We\'ll verify your identity and delete your account manually.')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('deleted.title', 'What Data Is Deleted')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('deleted.text', 'When you delete your account, we immediately and permanently delete:\n\n• Your name, email address, and profile photo\n• Your linked cryptocurrency wallet address, if any\n• Your event passes and pass requests\n• Your meeting requests, meetings, and messages you sent in event chat\n• Your networking status, agenda, and tutorial progress\n• Blocked-user relationships\n• Your account credentials and ability to sign in')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('retained.title', 'What Data May Be Retained')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('retained.text', 'A limited amount of data may be retained after your account is deleted:\n\n• Records we are required to keep for legal, tax, accounting, or fraud-prevention purposes, such as token transaction history\n• Data that may persist in routine backups for a limited period before being purged\n• Messages you sent to other users may remain in the recipient\'s own copy of the conversation. Message content sent through event chat is end-to-end encrypted, so HASHPASS cannot read it regardless of retention\n\nAny retained data is used only for the purposes listed above and is handled according to our Privacy Policy — we do not use it to keep operating your account or profile.')}
        </Text>

        <Text style={styles.sectionTitle} selectable={false}>
          {t('contact.title', 'Questions')}
        </Text>
        <Text style={styles.sectionText} selectable={false}>
          {t('contact.text', 'If you have questions about deleting your account or your data, contact us at:\n\nEmail: privacy@hashpass.tech\nWebsite: https://hashpass.tech')}
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
    gap: 12,
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
