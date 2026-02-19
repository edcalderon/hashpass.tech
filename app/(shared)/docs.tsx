import React from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { t } from '@lingui/macro';
import { useLingui } from '@lingui/react';

export default function DocsScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { i18n } = useLingui();
  const styles = getStyles(isDark, colors);

  const guides = [
    {
      id: 'getting-started',
      title: t({ id: 'index.docs.gettingStarted.title', message: 'Getting Started' }),
      description: t({ id: 'index.docs.gettingStarted.description', message: 'Learn how to sign in and navigate the app' }),
      sections: [
        {
          title: t({ id: 'index.docs.gettingStarted.signIn.title', message: 'Sign In to Your Account' }),
          content: t({ id: 'index.docs.gettingStarted.signIn.content', message: 'To get started, you\'ll need to sign in to the HashPass app. Open the app, enter your email address, check your email for a one-time login code, and enter the code to access your account.' }),
        },
        {
          title: t({ id: 'index.docs.gettingStarted.explore.title', message: 'Explore Speakers & Events' }),
          content: t({ id: 'index.docs.gettingStarted.explore.content', message: 'Once you\'re signed in, you can browse through the amazing speakers and events. Navigate to the Explore section, browse speakers by category or search for specific names, and view speaker profiles, topics, and availability.' }),
        },
        {
          title: t({ id: 'index.docs.gettingStarted.requestMeeting.title', message: 'Send a Meeting Request' }),
          content: t({ id: 'index.docs.gettingStarted.requestMeeting.content', message: 'Ready to connect with a speaker? Find a speaker you\'d like to meet, tap on their profile to view details, click the "Request Meeting" button, select your preferred date and time slot, add a message (optional), and submit your request.' }),
        },
        {
          title: t({ id: 'index.docs.gettingStarted.trackRequests.title', message: 'Track Your Requests' }),
          content: t({ id: 'index.docs.gettingStarted.trackRequests.content', message: 'Keep track of all your meeting requests. Check the Notifications section for updates, view pending, accepted, or declined requests, and receive notifications when speakers respond.' }),
        },
      ],
    },
    {
      id: 'troubleshooting',
      title: t({ id: 'index.docs.troubleshooting.title', message: 'Troubleshooting' }),
      description: t({ id: 'index.docs.troubleshooting.description', message: 'Solutions to common problems' }),
      sections: [
        {
          title: t({ id: 'index.docs.troubleshooting.loadingIssues.title', message: 'Having Issues Loading the Web App?' }),
          content: t({ id: 'index.docs.troubleshooting.loadingIssues.content', message: 'If you\'re experiencing problems loading the web app, we recommend clearing your browser cache or performing a hard refresh.' }),
          steps: [
            t({ id: 'index.docs.troubleshooting.loadingIssues.step1', message: 'Clear browser cache: Go to your browser settings and clear cached images and files' }),
            t({ id: 'index.docs.troubleshooting.loadingIssues.step2', message: 'Hard refresh: Press Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac) to reload the page without cache' }),
          ],
        },
        {
          title: t({ id: 'index.docs.troubleshooting.loginIssues.title', message: 'Login Problems' }),
          content: t({ id: 'index.docs.troubleshooting.loginIssues.content', message: 'If you\'re having trouble logging in, make sure you\'re using the correct email address and check your spam folder for the login code. If the code has expired, request a new one.' }),
        },
        {
          title: t({ id: 'index.docs.troubleshooting.meetingIssues.title', message: 'Meeting Request Issues' }),
          content: t({ id: 'index.docs.troubleshooting.meetingIssues.content', message: 'If your meeting requests aren\'t being sent or received, check your internet connection, ensure you\'re signed in, and verify that the speaker has availability during your selected time slot.' }),
        },
      ],
    },
    {
      id: 'tips',
      title: t({ id: 'index.docs.tips.title', message: 'Pro Tips' }),
      description: t({ id: 'index.docs.tips.description', message: 'Best practices for using HashPass' }),
      sections: [
        {
          title: t({ id: 'index.docs.tips.specificRequests.title', message: 'Be Specific in Meeting Requests' }),
          content: t({ id: 'index.docs.tips.specificRequests.content', message: 'Speakers appreciate knowing what you\'d like to discuss. Be specific in your meeting request message to increase the chances of acceptance.' }),
        },
        {
          title: t({ id: 'index.docs.tips.checkAvailability.title', message: 'Check Speaker Availability' }),
          content: t({ id: 'index.docs.tips.checkAvailability.content', message: 'Before sending requests, check the speaker\'s availability calendar to ensure they\'re free during your preferred time slot.' }),
        },
        {
          title: t({ id: 'index.docs.tips.respondPromptly.title', message: 'Respond Promptly' }),
          content: t({ id: 'index.docs.tips.respondPromptly.content', message: 'When a speaker accepts your meeting request, respond promptly to confirm your meeting and show your commitment.' }),
        },
        {
          title: t({ id: 'index.docs.tips.useSearch.title', message: 'Use the Search Function' }),
          content: t({ id: 'index.docs.tips.useSearch.content', message: 'Use the search function to find speakers by topic, company, or name. This will help you quickly find the right people to connect with.' }),
        },
      ],
    },
  ];

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
        <Text style={styles.headerTitle} selectable={false}>
          {t({ id: 'index.docs.title', message: 'Documentation' })}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.subtitle} selectable={false}>
          {t({ id: 'index.docs.subtitle', message: 'Complete guides and troubleshooting' })}
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
          </View>
        ))}

        {/* Interactive Documentation Section */}
        {Platform.OS === 'web' && (
          <View style={styles.documentationSection}>
            <Text style={styles.documentationTitle} selectable={false}>
              {t({ id: 'index.docs.interactiveDocs.title', message: 'Interactive Documentation' })}
            </Text>
            <Text style={styles.documentationDescription} selectable={false}>
              {t({ id: 'index.docs.interactiveDocs.description', message: 'Explore step-by-step guides with interactive examples' })}
            </Text>
            <TouchableOpacity
              onPress={() => {
                // Open Storybook documentation
                // In production, use relative path to static Storybook build
                // In development, use the Storybook dev server URL
                let storybookUrl: string;
                if (typeof window !== 'undefined') {
                  if (process.env.NODE_ENV === 'production' || window.location.hostname !== 'localhost') {
                    // Production: use relative path to static Storybook build
                    storybookUrl = '/storybook';
                  } else {
                    // Development: use Storybook dev server
                    storybookUrl = process.env.EXPO_PUBLIC_STORYBOOK_URL || 'http://localhost:6006';
                  }
                  window.open(storybookUrl, '_blank');
                }
              }}
              style={styles.documentationButton}
            >
              <Ionicons name="book-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.documentationButtonText} selectable={false}>
            {t({ id: 'index.docs.viewStorybook', message: 'View Full Interactive Documentation' })}
          </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Contact Support Section */}
        <View style={styles.footer}>
          <Text style={styles.footerText} selectable={false}>
            {t({ id: 'index.docs.needHelp', message: 'Need more help?' })}
          </Text>
          <TouchableOpacity
            onPress={() => {
              const supportEmail = process.env.NODEMAILER_FROM_SUPPORT || 'support@hashpass.tech';
              Linking.openURL(`mailto:${supportEmail}`);
            }}
            style={styles.supportButton}
          >
            <Text style={styles.supportButtonText} selectable={false}>
              {t({ id: 'index.docs.contactSupport', message: 'Contact Support' })}
            </Text>
          </TouchableOpacity>
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
});

