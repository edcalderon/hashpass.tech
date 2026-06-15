import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, Platform, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { t } from '@lingui/macro';

type ModalType = 'privacy' | 'terms';

interface PrivacyTermsModalProps {
  visible: boolean;
  type: ModalType;
  onClose: () => void;
}

export default function PrivacyTermsModal({ visible, type, onClose }: PrivacyTermsModalProps) {
  const { colors, isDark } = useTheme();
  const [screenWidth, setScreenWidth] = useState(Dimensions.get('window').width);
  
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenWidth(window.width);
    });
    
    return () => subscription?.remove();
  }, []);
  
  const styles = getStyles(isDark, colors, screenWidth);

  const renderContent = () => {
    if (type === 'privacy') {
      return (
        <>
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
        </>
      );
    } else {
      return (
        <>
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
        </>
      );
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={28} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.headerTitle} selectable={false}>
              {type === 'privacy' 
                ? t({ id: 'privacy.title', message: 'Privacy Policy' })
                : t({ id: 'terms.title', message: 'Terms of Service' })
              }
            </Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView 
            style={styles.content} 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.contentContainer}
          >
            {renderContent()}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const getStyles = (isDark: boolean, colors: any, screenWidth: number) => StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    flex: 1,
    backgroundColor: colors.background.default,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    maxHeight: '90%',
    ...Platform.select({
      web: {
        width: '100%',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        marginTop: 40,
        ...(screenWidth >= 768 ? {
          maxWidth: '100%',
        } : {
          maxWidth: 600,
          alignSelf: 'center',
        }),
      },
    }),
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
  closeButton: {
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
  },
  contentContainer: {
    paddingTop: 24,
    paddingBottom: 40,
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

