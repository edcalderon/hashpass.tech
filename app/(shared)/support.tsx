import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Linking, Platform } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from '../../i18n/i18n';

export default function SupportScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const { t } = useTranslation('common');
  const styles = getStyles(isDark, colors);
  
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!subject.trim() || !message.trim()) {
      return;
    }

    setIsSubmitting(true);
    
    const supportEmail = 'support@hashpass.tech';
    const emailSubject = encodeURIComponent(`[BSL 2025 Support] ${subject}`);
    const emailBody = encodeURIComponent(`\n\n---\nMessage:\n${message}\n\n---\nPlatform: ${Platform.OS}\nApp Version: ${require('../../config/version').default.version}`);
    
    const mailtoLink = `mailto:${supportEmail}?subject=${emailSubject}&body=${emailBody}`;
    
    try {
      const canOpen = await Linking.canOpenURL(mailtoLink);
      if (canOpen) {
        await Linking.openURL(mailtoLink);
      } else {
        // Fallback: copy email details
        const emailText = `To: ${supportEmail}\nSubject: ${emailSubject}\n\n${emailBody}`;
        // In a real app, you'd use Clipboard API here
        console.log('Email details:', emailText);
      }
    } catch (error) {
      console.error('Error opening email client:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenWebsite = () => {
    Linking.openURL('https://hashpass.tech/support').catch(err => 
      console.error('Error opening support website:', err)
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>Support</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.section}>
        <MaterialIcons name="help-outline" size={48} color={colors.primary} style={styles.icon} />
        <Text style={styles.sectionTitle}>Need Help?</Text>
        <Text style={styles.sectionDescription}>
          We&apos;re here to help! Report bugs, ask questions, or share feedback.
        </Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Subject</Text>
          <TextInput
            style={styles.input}
            placeholder="Brief description of your issue"
            placeholderTextColor={colors.text.secondary}
            value={subject}
            onChangeText={setSubject}
            editable={!isSubmitting}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Message</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Describe your issue, bug, or question in detail..."
            placeholderTextColor={colors.text.secondary}
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            editable={!isSubmitting}
          />
        </View>

        <TouchableOpacity
          style={[
            styles.submitButton,
            (!subject.trim() || !message.trim() || isSubmitting) && styles.submitButtonDisabled
          ]}
          onPress={handleSubmit}
          disabled={!subject.trim() || !message.trim() || isSubmitting}
        >
          <MaterialIcons name="email" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.submitButtonText}>
            {isSubmitting ? 'Opening Email...' : 'Open Email Client'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      <View style={styles.contactSection}>
        <Text style={styles.contactTitle}>Other Ways to Reach Us</Text>
        
        <TouchableOpacity 
          style={styles.contactItem}
          onPress={handleOpenWebsite}
        >
          <MaterialIcons name="language" size={24} color={colors.primary} />
          <View style={styles.contactItemContent}>
            <Text style={styles.contactItemTitle}>Support Website</Text>
            <Text style={styles.contactItemSubtitle}>https://hashpass.tech/support</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={colors.text.secondary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.contactItem}
          onPress={() => Linking.openURL('mailto:edward@hashpass.tech')}
        >
          <MaterialIcons name="email" size={24} color={colors.primary} />
          <View style={styles.contactItemContent}>
            <Text style={styles.contactItemTitle}>Join the Team</Text>
            <Text style={styles.contactItemSubtitle}>edward@hashpass.tech</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          We typically respond within 24-48 hours.
        </Text>
      </View>
    </ScrollView>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingTop: Platform.OS === 'web' ? 20 : 0,
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.primary,
  },
  section: {
    alignItems: 'center',
    marginBottom: 32,
  },
  icon: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 16,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  form: {
    marginBottom: 32,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.background.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text.primary,
    minHeight: 50,
  },
  textArea: {
    minHeight: 120,
    paddingTop: 16,
  },
  submitButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 32,
  },
  contactSection: {
    marginBottom: 24,
  },
  contactTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 16,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.paper,
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  contactItemContent: {
    flex: 1,
    marginLeft: 16,
  },
  contactItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  contactItemSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
  },
});

