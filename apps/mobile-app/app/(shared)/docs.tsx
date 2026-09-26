import React from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MaterialIcons } from '../../lib/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from '../../i18n/i18n';

// A dedicated HTTPS redirect keeps this short public link stable while the
// documentation site remains published beneath the Club's canonical path.
const DEFAULT_PROD_DOCS_URL = 'https://docs.hashpass.club/';
const DEFAULT_LOCAL_DOCS_URL = 'http://localhost:3101/';
const PWA_GUIDE_URL = 'https://hashpass.club/documentation/guides/install-hashpass/';
const PWA_GUIDE_COPY = { message: 'Install HASHPASS PWA guide' } as const;

function getDocumentationUrl() {
  if (typeof window === 'undefined') {
    return DEFAULT_PROD_DOCS_URL;
  }

  const explicitUrl = process.env.EXPO_PUBLIC_DOCS_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  return isLocalHost
    ? (process.env.EXPO_PUBLIC_DOCS_LOCAL_URL?.trim() || DEFAULT_LOCAL_DOCS_URL)
    : DEFAULT_PROD_DOCS_URL;
}

export default function DocsScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const styles = getStyles(isDark, colors);
  const { t: tDocs } = useTranslation('index.docs');
  const { t: tPrivacy } = useTranslation('privacy');
  const { t: tTerms } = useTranslation('terms');
  const { t: tDeleteAccount } = useTranslation('deleteAccount');

  const guides = [
    {
      id: 'getting-started',
      title: tDocs('gettingStarted.title', 'Getting Started'),
      description: tDocs('gettingStarted.description', 'Learn how to sign in and navigate the app'),
      sections: [
        {
          title: tDocs('gettingStarted.signIn.title', 'Sign In to Your Account'),
          content: tDocs('gettingStarted.signIn.content', 'To get started, you\'ll need to sign in to the HASHPASS app. Open the app, enter your email address, check your email for a one-time login code, and enter the code to access your account.'),
        },
        {
          title: tDocs('gettingStarted.explore.title', 'Explore Speakers & Events'),
          content: tDocs('gettingStarted.explore.content', 'Once you\'re signed in, you can browse speakers and events. Open Explore, browse by category or search for a name, then view speaker profiles, topics, and availability.'),
        },
        {
          title: tDocs('gettingStarted.requestMeeting.title', 'Send a Meeting Request'),
          content: tDocs('gettingStarted.requestMeeting.content', 'Find a speaker you would like to meet, open their profile, select Request Meeting, choose a date and time, add an optional message, and submit your request.'),
        },
        {
          title: tDocs('gettingStarted.trackRequests.title', 'Track Your Requests'),
          content: tDocs('gettingStarted.trackRequests.content', 'Check Notifications for updates, review pending, accepted, or declined requests, and see when speakers respond.'),
        },
      ],
    },
    {
      id: 'troubleshooting',
      title: tDocs('troubleshooting.title', 'Troubleshooting'),
      description: tDocs('troubleshooting.description', 'Solutions to common problems'),
      sections: [
        {
          title: tDocs('troubleshooting.loadingIssues.title', 'Having Issues Loading the Web App?'),
          content: tDocs('troubleshooting.loadingIssues.content', 'If the web app is not loading correctly, try clearing your browser cache or performing a hard refresh.'),
          steps: [
            tDocs('troubleshooting.loadingIssues.step1', 'Clear browser cache: Open your browser settings and clear cached images and files.'),
            tDocs('troubleshooting.loadingIssues.step2', 'Hard refresh: Press Ctrl+Shift+R on Windows or Linux, or Cmd+Shift+R on Mac.'),
          ],
        },
        {
          title: tDocs('troubleshooting.loginIssues.title', 'Login Problems'),
          content: tDocs('troubleshooting.loginIssues.content', 'Confirm your email address and check your spam folder for the login code. If the code expired, request a new one.'),
        },
        {
          title: tDocs('troubleshooting.meetingIssues.title', 'Meeting Request Issues'),
          content: tDocs('troubleshooting.meetingIssues.content', 'Check your internet connection, confirm that you are signed in, and verify that the speaker is available during the selected time.'),
        },
      ],
    },
    {
      id: 'tips',
      title: tDocs('tips.title', 'Pro Tips'),
      description: tDocs('tips.description', 'Best practices for using HASHPASS'),
      sections: [
        {
          title: tDocs('tips.specificRequests.title', 'Be Specific in Meeting Requests'),
          content: tDocs('tips.specificRequests.content', 'Tell the speaker what you would like to discuss. A specific message can improve the chance that your request is accepted.'),
        },
        {
          title: tDocs('tips.checkAvailability.title', 'Check Speaker Availability'),
          content: tDocs('tips.checkAvailability.content', 'Before sending a request, check the speaker\'s calendar to confirm they are free at your preferred time.'),
        },
        {
          title: tDocs('tips.respondPromptly.title', 'Respond Promptly'),
          content: tDocs('tips.respondPromptly.content', 'When a speaker accepts your request, respond promptly to confirm the meeting.'),
        },
        {
          title: tDocs('tips.useSearch.title', 'Use Search'),
          content: tDocs('tips.useSearch.content', 'Search by topic, company, or name to find the right people more quickly.'),
        },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={tDocs('back', 'Go back')}
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} selectable={false}>
          {tDocs('title', 'Documentation')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.subtitle} selectable={false}>
          {tDocs('subtitle', 'Complete guides and troubleshooting')}
        </Text>

        {guides.map((guide) => (
          <View key={guide.id} style={styles.guideSection}>
            <Text style={styles.guideTitle} selectable={false}>{guide.title}</Text>
            <Text style={styles.guideDescription} selectable={false}>{guide.description}</Text>
            
            {guide.sections.map((section, index) => (
              <View key={index} style={styles.section}>
                <Text style={styles.sectionTitle} selectable={false}>{section.title}</Text>
                <Text style={styles.sectionContent} selectable={false}>{section.content}</Text>
                {section.steps && (
                  <View style={styles.stepsContainer}>
                    {section.steps.map((step, stepIndex) => (
                      <View key={stepIndex} style={styles.step}>
                        <Text style={styles.stepBullet} selectable={false}>•</Text>
                        <Text style={styles.stepText} selectable={false}>{step}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            ))}

            {guide.id === 'getting-started' && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={tDocs('gettingStarted.seeDemo', 'See the demo videos')}
                onPress={() => router.push('/demo')}
                style={styles.demoLinkButton}
                activeOpacity={0.8}
              >
                <MaterialIcons name="play-circle-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.demoLinkButtonText} selectable={false}>
                  {tDocs('gettingStarted.seeDemo', 'See the demo videos')}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        ))}

        <TouchableOpacity
          accessibilityRole="link"
          accessibilityLabel={tDocs('installPwaGuide', PWA_GUIDE_COPY.message)}
          onPress={() => Linking.openURL(PWA_GUIDE_URL)}
          style={[styles.documentationButton, styles.pwaGuideButton]}
        >
          <Ionicons name="download-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.documentationButtonText} selectable={false}>
            {tDocs('installPwaGuide', PWA_GUIDE_COPY.message)}
          </Text>
        </TouchableOpacity>

        {/* Full Documentation Section */}
        {Platform.OS === 'web' && (
          <View style={styles.documentationSection}>
            <Text style={styles.documentationTitle} selectable={false}>
              {tDocs('interactiveDocs.title', 'Full Documentation')}
            </Text>
            <Text style={styles.documentationDescription} selectable={false}>
              {tDocs('interactiveDocs.description', 'Open the full documentation site for guides, references, and examples')}
            </Text>
            <TouchableOpacity
              accessibilityRole="link"
              accessibilityLabel={tDocs('viewStorybook', 'See Full Documentation')}
              onPress={() => {
                if (typeof window !== 'undefined') {
                  const docsUrl = getDocumentationUrl();
                  window.open(docsUrl, '_blank', 'noopener,noreferrer');
                }
              }}
              style={styles.documentationButton}
            >
              <Ionicons name="book-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.documentationButtonText} selectable={false}>
                {tDocs('viewStorybook', 'See Full Documentation')}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Contact Support Section */}
        <View style={styles.footer}>
          <Text style={styles.footerText} selectable={false}>
            {tDocs('needHelp', 'Need more help?')}
          </Text>
          <TouchableOpacity
            accessibilityRole="link"
            accessibilityLabel={tDocs('contactSupport', 'Contact Support')}
            onPress={() => {
              const supportEmail = process.env.NODEMAILER_FROM_SUPPORT || 'support@hashpass.tech';
              Linking.openURL(`mailto:${supportEmail}`);
            }}
            style={styles.supportButton}
          >
            <Text style={styles.supportButtonText} selectable={false}>
              {tDocs('contactSupport', 'Contact Support')}
            </Text>
          </TouchableOpacity>

          <View style={styles.legalLinksRow}>
            <TouchableOpacity onPress={() => router.push('/(shared)/privacy' as any)}>
              <Text style={styles.legalLinkText} selectable={false}>{tPrivacy('title', 'Privacy Policy')}</Text>
            </TouchableOpacity>
            <Text style={styles.legalLinkSeparator} selectable={false}>·</Text>
            <TouchableOpacity onPress={() => router.push('/(shared)/terms' as any)}>
              <Text style={styles.legalLinkText} selectable={false}>{tTerms('title', 'Terms of Service')}</Text>
            </TouchableOpacity>
            <Text style={styles.legalLinkSeparator} selectable={false}>·</Text>
            <TouchableOpacity onPress={() => router.push('/(shared)/delete-account' as any)}>
              <Text style={styles.legalLinkText} selectable={false}>{tDeleteAccount('title', 'Delete Your Account')}</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 1,
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  subtitle: {
    fontSize: 16,
    color: colors.text.secondary,
    lineHeight: 24,
    marginBottom: 24,
  },
  guideSection: {
    marginBottom: 40,
    padding: 20,
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  guideTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 8,
  },
  guideDescription: {
    fontSize: 15,
    color: colors.text.secondary,
    marginBottom: 20,
    lineHeight: 22,
  },
  section: {
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  sectionContent: {
    fontSize: 15,
    color: colors.text.secondary,
    lineHeight: 22,
    marginBottom: 12,
  },
  stepsContainer: {
    marginTop: 8,
  },
  step: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 8,
  },
  stepBullet: {
    fontSize: 16,
    color: colors.primary,
    marginRight: 12,
    fontWeight: '600',
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    color: colors.text.secondary,
    lineHeight: 22,
  },
  documentationSection: {
    marginTop: 20,
    marginBottom: 20,
    padding: 24,
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  documentationTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 8,
    textAlign: 'center',
  },
  documentationDescription: {
    fontSize: 15,
    color: colors.text.secondary,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 22,
  },
  documentationButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentationButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  pwaGuideButton: {
    alignSelf: 'center',
    marginBottom: 20,
  },
  demoLinkButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  demoLinkButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    marginTop: 20,
    padding: 20,
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 15,
    color: colors.text.secondary,
    marginBottom: 16,
    textAlign: 'center',
  },
  supportButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  supportButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  legalLinksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    gap: 8,
  },
  legalLinkText: {
    fontSize: 13,
    color: colors.text.secondary,
    textDecorationLine: 'underline',
  },
  legalLinkSeparator: {
    fontSize: 13,
    color: colors.text.faint || colors.text.secondary,
  },
});
