import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Switch, TouchableOpacity, ScrollView, StyleSheet, Alert, StatusBar, TextInput, Modal, Platform, Linking } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import { useLanguage } from '../../../providers/LanguageProvider';
import { useAnimations } from '../../../providers/AnimationProvider';
import { useToastHelpers } from '@contexts/ToastContext';
// @ts-ignore — Expo SDK 53 type definitions lag behind; named export works at runtime
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../../i18n/i18n';
import { version } from '../../../package.json';
import { useScroll } from '@contexts/ScrollContext';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { t } from '@lingui/macro';
import { useTutorialPreferences } from '../../../hooks/useTutorialPreferences';
import { useAuth } from '../../../hooks/useAuth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../../../lib/api-client';
import { buildEventPath } from '../../../lib/event-path';
import VersionDetailsModal from '../../../components/VersionDetailsModal';

export default function SettingsScreen() {
  const [notifications, setNotifications] = useState(true);
  const [biometricAuth, setBiometricAuth] = useState(false);
  const [dataUsage, setDataUsage] = useState(false);
  const { isDark, toggleTheme, colors } = useTheme();
  const { locale, setLocale } = useLanguage();
  const { animationsEnabled, setAnimationsEnabled } = useAnimations();
  const { headerHeight } = useScroll();
  const { showSuccess, showInfo, showError } = useToastHelpers();
  const { t: tProfile } = useTranslation('profile');
  const { t: tSettings } = useTranslation('settings');
  const router = useRouter();
  const { resetTutorial, resetAllTutorials, mainTutorialCompleted, networkingTutorialCompleted } = useTutorialPreferences();
  const { user, signOut } = useAuth();
  const [clearingCache, setClearingCache] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const otpInputRef = useRef<TextInput>(null);
  const styles = getStyles(isDark, colors);
  
  // Debug: Log modal state changes
  useEffect(() => {
    console.log('showDeleteConfirm state changed:', showDeleteConfirm);
  }, [showDeleteConfirm]);

  // Focus the OTP input when it becomes visible
  useEffect(() => {
    if (otpSent && showDeleteConfirm && otpInputRef.current) {
      // Small delay to ensure modal is fully rendered
      const timer = setTimeout(() => {
        otpInputRef.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [otpSent, showDeleteConfirm]);
  
  // Calculate safe area for nav bar overlay
  const navBarHeight = (StatusBar.currentHeight || 0) + 80;

  const handleAnimationsToggle = async (enabled: boolean) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await setAnimationsEnabled(enabled);
      if (enabled) {
        showSuccess('Animations Enabled', 'Smooth transitions and animations are now active');
      } else {
        showInfo('Animations Disabled', 'Transitions are now disabled for better performance');
      }
    } catch (error) {
      console.error('Failed to toggle animations:', error);
    }
  };


  // All available languages (all translations are available in the system)
  const allAvailableLocales = [
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'es', name: 'Spanish', nativeName: 'Español' },
    { code: 'ko', name: 'Korean', nativeName: '한국어' },
    { code: 'fr', name: 'French', nativeName: 'Français' },
    { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
    { code: 'de', name: 'German', nativeName: 'Deutsch' },
  ];

  // Main languages shown in UI (only these 3 can be selected)
  const mainLocales = ['en', 'es', 'ko'];

  const handleLanguageChange = async () => {
    // Only cycle through the 3 main languages in the UI
    const currentIndex = mainLocales.indexOf(locale);
    const nextIndex = (currentIndex + 1) % mainLocales.length;
    await setLocale(mainLocales[nextIndex]);
  };

  const getLanguageName = (locale: string) => {
    const lang = allAvailableLocales.find(l => l.code === locale);
    return lang ? lang.nativeName : 'English';
  };

  const clearGoogleAccount = async () => {
    if (Platform.OS === 'web' || process.env.EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN !== 'true') return;
    try {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
      await GoogleSignin.signOut();
    } catch {
      // Non-critical
    }
  };

  const handleClearCache = async () => {
    try {
      setClearingCache(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Get all keys from AsyncStorage
      const allKeys = await AsyncStorage.getAllKeys();
      
      // Keep essential keys (auth, theme, language)
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
      const supabaseProjectId = supabaseUrl.split('//')[1]?.split('.')[0] || 'supabase';
      
      const essentialKeys = [
        '@theme_preference',
        'user_locale',
        `sb-${supabaseProjectId}-auth-token`, // Supabase auth token pattern
      ];
      
      // Filter out essential keys - keep auth tokens and user preferences
      const keysToRemove = allKeys.filter(key => {
        // Keep Supabase auth tokens
        if (key.includes('sb-') && key.includes('auth-token')) {
          return false;
        }
        // Keep theme and language preferences
        if (essentialKeys.some(essential => key === essential || key.includes(essential))) {
          return false;
        }
        return true;
      });

      // Remove non-essential keys
      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
      }

      // Clear Google account cache so next sign-in shows account picker
      await clearGoogleAccount();

      // Also clear web localStorage if on web (but keep auth)
      if (typeof window !== 'undefined' && window.localStorage) {
        const localStorageKeys = Object.keys(window.localStorage);
        
        localStorageKeys.forEach(key => {
          // Keep Supabase auth tokens
          if (key.includes('sb-') && key.includes('auth-token')) {
            return;
          }
          // Remove everything else
          window.localStorage.removeItem(key);
        });
      }

      showSuccess('Cache Cleared', 'App cache has been cleared successfully. Essential data has been preserved.');
    } catch (error: any) {
      console.error('Error clearing cache:', error);
      showError('Clear Cache Failed', error.message || 'Failed to clear cache. Please try again.');
    } finally {
      setClearingCache(false);
    }
  };

  const handleDeleteAccount = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowDisclaimerModal(true);
  };

  const handleDisclaimerConfirm = () => {
    setShowDisclaimerModal(false);
    setShowDeleteConfirm(true);
    setOtpCode('');
    setOtpSent(false);
  };

  const sendDeleteOtp = async () => {
    console.log('sendDeleteOtp called, user email:', user?.email);
    
    if (!user?.email) {
      console.error('No user email found');
      showError('Error', 'User email not found. Please try logging in again.');
      setShowDeleteConfirm(false);
      return;
    }

    try {
      setSendingOtp(true);
      console.log('Sending OTP to:', user.email);
      
      const result = await apiClient.post('/auth/delete-account-otp', { email: user.email }, { skipEventSegment: true });
      console.log('OTP response:', result);

      if (!result.success) {
        throw new Error(result.error || 'Failed to send verification code');
      }

      setOtpSent(true);
      console.log('OTP sent successfully, showing success message');
      showSuccess('Code Sent', 'Please check your email for the 6-digit verification code.');
    } catch (error: any) {
      console.error('Error sending OTP:', error);
      showError('Send Failed', error.message || 'Failed to send verification code. Please try again.');
      // Don't close modal on error, let user try again
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.length !== 6) {
      showError('Invalid Code', 'Please enter a valid 6-digit code.');
      return;
    }

    if (!user?.email) {
      showError('Error', 'User email not found. Please try logging in again.');
      return;
    }

    try {
      setVerifyingOtp(true);
      
      const result = await apiClient.post('/auth/delete-account-otp/verify', { 
          email: user.email,
          code: otpCode 
      }, { skipEventSegment: true });

      if (!result.success) {
        throw new Error(result.error || 'Invalid verification code');
      }

      // OTP verified, proceed with account deletion
      await proceedWithDeletion();
    } catch (error: any) {
      console.error('Error verifying OTP:', error);
      showError('Verification Failed', error.message || 'Invalid code. Please try again.');
      setOtpCode('');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const proceedWithDeletion = async () => {
    try {
      setDeletingAccount(true);
      setShowDeleteConfirm(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      if (!user?.id) {
        showError('Error', 'User not found. Please try logging in again.');
        return;
      }

      // Store user email and name before deletion (for sending confirmation email)
      const userEmail = user.email;
      const userName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0];

      // Call server-side delete endpoint (handles data cleanup + auth.users deletion)
      const deleteResult = await apiClient.post('/auth/delete-account', {
        userId: user.id,
      }, { skipEventSegment: true });

      if (!deleteResult.success) {
        const errorMessage = deleteResult.error || 'Failed to delete account';
        console.error('Error deleting user account:', errorMessage);
        throw new Error(errorMessage);
      }

      // Send confirmation email (don't wait for it, as it's not critical)
      if (userEmail) {
        try {
          await apiClient.post('/auth/delete-account-email', { 
              email: userEmail,
              userName: userName 
          }, { skipEventSegment: true });
          // Don't wait for response or throw errors - email is not critical
        } catch (emailError) {
          console.error('Error sending deletion confirmation email:', emailError);
          // Continue with deletion even if email fails
        }
      }

      // Sign out the user
      await signOut();

      // Clear all local storage
      await AsyncStorage.clear();
      
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear();
      }

      showSuccess('Account Deleted', 'Your account has been deleted successfully. A confirmation email has been sent.');
      
      // Navigate to home/auth screen
      setTimeout(() => {
        router.replace('/');
      }, 2000);

    } catch (error: any) {
      console.error('Error deleting account:', error);
      showError('Delete Failed', error.message || 'Failed to delete account. Please contact support.');
    } finally {
      setDeletingAccount(false);
      setOtpCode('');
      setOtpSent(false);
    }
  };

  const renderSettingItem = ({
    icon,
    title,
    subtitle,
    onPress,
    rightComponent,
    showChevron = false,
    disabled = false,
  }: {
    icon: string;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    rightComponent?: React.ReactNode;
    showChevron?: boolean;
    disabled?: boolean;
  }) => (
    <TouchableOpacity
      style={[styles.settingItem, disabled && styles.settingItemDisabled]}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress || disabled}
    >
      <View style={styles.settingItemLeft}>
        <View style={styles.iconContainer}>
          <Ionicons name={icon as any} size={22} color={colors.primary} />
        </View>
        <View style={styles.settingItemContent}>
          <Text style={styles.settingItemTitle}>{title}</Text>
          {subtitle && <Text style={styles.settingItemSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      <View style={styles.settingItemRight}>
        {rightComponent}
        {showChevron && (
          <Ionicons name="chevron-forward" size={16} color={colors.text.secondary} />
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: navBarHeight }}
      >
        {/* App Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{tSettings('appSettings', 'App Settings')}</Text>

          {renderSettingItem({
            icon: isDark ? 'moon' : 'moon-outline',
            title: tSettings('darkMode', 'Dark Mode'),
            subtitle: tSettings('darkModeSubtitle', 'Switch between light and dark themes'),
            rightComponent: (
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                trackColor={{ false: '#e5e7eb', true: colors.primary }}
                thumbColor={isDark ? '#4f46e5' : '#f3f4f6'}
              />
            ),
          })}

          {renderSettingItem({
            icon: 'language-outline',
            title: tSettings('language', 'Language'),
            subtitle: getLanguageName(locale),
            onPress: handleLanguageChange,
            showChevron: true,
          })}

          {renderSettingItem({
            icon: 'notifications-outline',
            title: tSettings('pushNotifications', 'Push Notifications'),
            subtitle: tSettings('pushNotificationsSubtitle', 'Receive notifications about events and updates'),
            rightComponent: (
              <Switch
                value={notifications}
                onValueChange={setNotifications}
                trackColor={{ false: '#e5e7eb', true: colors.primary }}
                thumbColor={notifications ? '#4f46e5' : '#f3f4f6'}
              />
            ),
          })}

          {renderSettingItem({
            icon: 'eye-outline',
            title: tSettings('animations', 'Animations'),
            subtitle: tSettings('animationsSubtitle', 'Enable smooth transitions and animations'),
            rightComponent: (
              <Switch
                value={animationsEnabled}
                onValueChange={handleAnimationsToggle}
                trackColor={{ false: '#e5e7eb', true: colors.primary }}
                thumbColor={animationsEnabled ? '#4f46e5' : '#f3f4f6'}
              />
            ),
          })}
        </View>

        {/* Tutorial Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{tSettings('tutorials', 'Tutorials')}</Text>

          {renderSettingItem({
            icon: 'school-outline',
            title: tSettings('mainTutorial', 'Main Screen Tutorial'),
            subtitle: mainTutorialCompleted ? tSettings('mainTutorialCompleted', 'Completed') : tSettings('mainTutorialNotCompleted', 'Not completed'),
            onPress: async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              await resetTutorial('main');
              showSuccess('Tutorial Reset', 'The main screen tutorial will start automatically when you visit the explore screen.');
              // Navigate after a delay to ensure state is fully updated and preferences reloaded
              setTimeout(() => {
                router.push('./explore');
              }, 1000);
            },
            showChevron: true,
          })}

          {renderSettingItem({
            icon: 'people-outline',
            title: tSettings('networkingTutorial', 'Networking Tutorial'),
            subtitle: networkingTutorialCompleted ? tSettings('networkingTutorialCompleted', 'Completed') : tSettings('networkingTutorialNotCompleted', 'Not completed'),
            onPress: async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              await resetTutorial('networking');
              showSuccess('Tutorial Reset', tSettings('networking.tutorialResetMessage') || 'The networking tutorial will start automatically when you visit the networking center.');
              // Navigate after a short delay to ensure state is updated
              setTimeout(() => {
                router.push(buildEventPath(undefined, 'networking') as any);
              }, 500);
            },
            showChevron: true,
          })}

          {renderSettingItem({
            icon: 'refresh-outline',
            title: tSettings('resetAllTutorials', 'Reset All Tutorials'),
            subtitle: tSettings('resetAllTutorialsSubtitle', 'Restart all tutorials from the beginning'),
            onPress: () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              Alert.alert(
                'Reset All Tutorials',
                'This will reset both the main screen and networking tutorials. They will start automatically the next time you visit those screens.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: async () => {
                      await resetAllTutorials();
                      showSuccess('Tutorials Reset', 'All tutorials have been reset and will start automatically.');
                    },
                  },
                ]
              );
            },
            showChevron: true,
          })}
        </View>

        {/* Security Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{tSettings('security', 'Security')}</Text>

          {renderSettingItem({
            icon: 'finger-print-outline',
            title: tSettings('biometric', 'Biometric Authentication'),
            subtitle: tSettings('biometricSubtitle', 'Use fingerprint or face recognition'),
            rightComponent: (
              <Switch
                value={biometricAuth}
                onValueChange={setBiometricAuth}
                trackColor={{ false: '#e5e7eb', true: colors.primary }}
                thumbColor={biometricAuth ? '#4f46e5' : '#f3f4f6'}
              />
            ),
          })}

          {renderSettingItem({
            icon: 'lock-closed-outline',
            title: tSettings('changePassword', 'Change Password'),
            subtitle: tSettings('changePasswordSubtitle', 'Update your account password'),
            onPress: () => {
              Alert.alert('Coming Soon', 'Password change feature will be available soon.');
            },
            showChevron: true,
          })}

          {Platform.OS !== 'web' && process.env.EXPO_PUBLIC_NATIVE_GOOGLE_SIGNIN === 'true' && renderSettingItem({
            icon: 'logo-google',
            title: tSettings('resetGoogleAccount', 'Reset Google Account'),
            subtitle: tSettings('resetGoogleAccountSubtitle', 'Force account picker on next Google sign-in'),
            onPress: async () => {
              await clearGoogleAccount();
              showSuccess('Google Account Reset', 'The cached Google account has been cleared. You will be prompted to choose an account on your next sign-in.');
            },
          })}
        </View>

        {/* Privacy Settings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{tSettings('privacy_section', 'Privacy')}</Text>

          {renderSettingItem({
            icon: 'shield-outline',
            title: tSettings('dataUsage', 'Data Usage'),
            subtitle: tSettings('dataUsageSubtitle', 'Allow app to collect usage data for improvements'),
            rightComponent: (
              <Switch
                value={dataUsage}
                onValueChange={setDataUsage}
                trackColor={{ false: '#e5e7eb', true: colors.primary }}
                thumbColor={dataUsage ? '#4f46e5' : '#f3f4f6'}
              />
            ),
          })}

          {renderSettingItem({
            icon: 'trash-outline',
            title: tSettings('clearCache', 'Clear Cache'),
            subtitle: clearingCache ? tSettings('clearingCache', 'Clearing...') : tSettings('clearCacheSubtitle', 'Free up storage space'),
            onPress: handleClearCache,
            showChevron: false,
            disabled: clearingCache,
          })}

          {renderSettingItem({
            icon: 'warning-outline',
            title: tSettings('deleteAccount', 'Delete Account'),
            subtitle: deletingAccount ? tSettings('deleteConfirm.deleting', 'Deleting...') : tSettings('deleteAccountSubtitle', 'Permanently delete your account and all data'),
            onPress: handleDeleteAccount,
            showChevron: true,
            disabled: deletingAccount,
          })}
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{tSettings('about', 'About')}</Text>

          {renderSettingItem({
            icon: 'information-circle-outline',
            title: tSettings('appVersion', 'App Version'),
            subtitle: `HashPass v${version}`,
            onPress: () => setShowVersionModal(true),
            showChevron: true,
          })}

          {renderSettingItem({
            icon: 'help-circle-outline',
            title: tSettings('helpSupport', 'Help & Support'),
            subtitle: tSettings('helpSupportSubtitle', 'Get help and contact support'),
            onPress: () => {
              Alert.alert('Help & Support', 'Contact us at support@hashpass.tech');
            },
            showChevron: true,
          })}

          {renderSettingItem({
            icon: 'document-text-outline',
            title: t({ id: 'terms.title', message: 'Terms of Service' }),
            subtitle: t({ id: 'settings.terms.subtitle', message: 'Read our terms and conditions' }),
            onPress: () => {
              router.push('/(shared)/terms');
            },
            showChevron: true,
          })}

          {renderSettingItem({
            icon: 'shield-checkmark-outline',
            title: t({ id: 'privacy.title', message: 'Privacy Policy' }),
            subtitle: t({ id: 'settings.privacy.subtitle', message: 'Learn how we protect your data' }),
            onPress: () => {
              router.push('/(shared)/privacy');
            },
            showChevron: true,
          })}
        </View>

      </ScrollView>

      <VersionDetailsModal
        visible={showVersionModal}
        onClose={() => setShowVersionModal(false)}
      />

      {/* Delete Account Disclaimer Modal */}
      <Modal
        visible={showDisclaimerModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowDisclaimerModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.disclaimerContent]}>
            {/* Warning icon */}
            <View style={styles.disclaimerIconWrap}>
              <Ionicons name="warning" size={32} color="#ef4444" />
            </View>

            <Text style={styles.disclaimerTitle}>{tSettings('deleteDisclaimer.title', 'Delete Account')}</Text>
            <Text style={styles.disclaimerSubtitle}>{tSettings('deleteDisclaimer.subtitle', 'This action is permanent and cannot be undone')}</Text>

            {/* Bullet points */}
            <View style={styles.disclaimerList}>
              <View style={styles.disclaimerRow}>
                <Ionicons name="close-circle" size={16} color="#ef4444" style={styles.disclaimerRowIcon} />
                <Text style={styles.disclaimerRowText}>{tSettings('deleteDisclaimer.bullet1', 'All your data will be permanently deleted from our systems')}</Text>
              </View>
              <View style={styles.disclaimerRow}>
                <Ionicons name="close-circle" size={16} color="#ef4444" style={styles.disclaimerRowIcon} />
                <Text style={styles.disclaimerRowText}>{tSettings('deleteDisclaimer.bullet2', 'We do not retain any of your personal information after deletion')}</Text>
              </View>
              <View style={styles.disclaimerRow}>
                <Ionicons name="close-circle" size={16} color="#ef4444" style={styles.disclaimerRowIcon} />
                <Text style={styles.disclaimerRowText}>{tSettings('deleteDisclaimer.bullet3', 'Your passes, connections, and history will be lost forever')}</Text>
              </View>
            </View>

            {/* Legal links */}
            <View style={styles.disclaimerLinks}>
              <TouchableOpacity onPress={() => Linking.openURL('https://hashpass.tech/terms')}>
                <Text style={styles.disclaimerLink}>{tSettings('deleteDisclaimer.terms', 'Terms of Service')}</Text>
              </TouchableOpacity>
              <Text style={styles.disclaimerLinkSep}>·</Text>
              <TouchableOpacity onPress={() => Linking.openURL('https://hashpass.tech/privacy')}>
                <Text style={styles.disclaimerLink}>{tSettings('deleteDisclaimer.privacy', 'Privacy Policy')}</Text>
              </TouchableOpacity>
            </View>

            {/* Actions */}
            <TouchableOpacity
              style={styles.disclaimerDeleteBtn}
              onPress={handleDisclaimerConfirm}
            >
              <Text style={styles.disclaimerDeleteBtnText}>{tSettings('deleteDisclaimer.confirm', 'I Understand, Continue')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.disclaimerCancelBtn}
              onPress={() => setShowDisclaimerModal(false)}
            >
              <Text style={styles.disclaimerCancelBtnText}>{tSettings('deleteDisclaimer.cancel', 'Cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Delete Account Confirmation Modal */}
      <Modal
        visible={showDeleteConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          console.log('Modal onRequestClose called');
          if (!sendingOtp && !verifyingOtp && !deletingAccount) {
            setShowDeleteConfirm(false);
            setOtpCode('');
            setOtpSent(false);
          }
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{tSettings('deleteConfirm.title', 'Confirm Account Deletion')}</Text>

            {!otpSent ? (
              <>
                <Text style={styles.modalMessage}>
                  {tSettings('deleteConfirm.sendCodeMessage', 'A verification code will be sent to your email address to confirm account deletion.')}
                </Text>
                {user?.email && (
                  <Text style={[styles.modalMessage, { marginTop: 8, fontWeight: '600' }]}>
                    {user.email}
                  </Text>
                )}
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonCancel, { marginRight: 6 }]}
                    onPress={() => {
                      setShowDeleteConfirm(false);
                      setOtpCode('');
                      setOtpSent(false);
                    }}
                    disabled={sendingOtp}
                  >
                    <Text style={styles.modalButtonCancelText}>{tSettings('deleteConfirm.cancel', 'Cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalButton,
                      styles.modalButtonDelete,
                      { marginLeft: 6 },
                      sendingOtp && styles.modalButtonDisabled
                    ]}
                    onPress={sendDeleteOtp}
                    disabled={sendingOtp}
                  >
                    <Text style={styles.modalButtonDeleteText}>
                      {sendingOtp ? tSettings('deleteConfirm.sending', 'Sending...') : tSettings('deleteConfirm.sendCode', 'Send Code')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.modalMessage}>
                  {tSettings('deleteConfirm.enterCode', 'Enter the 6-digit verification code sent to:')}
                </Text>
                {user?.email && (
                  <Text style={[styles.modalMessage, { marginTop: 4, fontWeight: '600', color: colors.primary || '#4f46e5' }]}>
                    {user.email}
                  </Text>
                )}
                <TextInput
                  ref={otpInputRef}
                  style={styles.modalInput}
                  value={otpCode}
                  onChangeText={(text) => setOtpCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder={tSettings('deleteConfirm.placeholder', 'Enter 6-digit code')}
                  placeholderTextColor={colors.text.secondary}
                  keyboardType="numeric"
                  maxLength={6}
                  textContentType="oneTimeCode"
                  editable={!verifyingOtp && !deletingAccount}
                  selectTextOnFocus={false}
                />
                <TouchableOpacity
                  style={styles.resendButton}
                  onPress={sendDeleteOtp}
                  disabled={sendingOtp || verifyingOtp || deletingAccount}
                >
                  <Text style={styles.resendButtonText}>
                    {sendingOtp ? tSettings('deleteConfirm.sending', 'Sending...') : tSettings('deleteConfirm.resend', "Didn't receive code? Resend")}
                  </Text>
                </TouchableOpacity>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonCancel, { marginRight: 6 }]}
                    onPress={() => {
                      setShowDeleteConfirm(false);
                      setOtpCode('');
                      setOtpSent(false);
                    }}
                    disabled={verifyingOtp || deletingAccount}
                  >
                    <Text style={styles.modalButtonCancelText}>{tSettings('deleteConfirm.cancel', 'Cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalButton,
                      styles.modalButtonDelete,
                      { marginLeft: 6 },
                      (otpCode.length !== 6 || verifyingOtp || deletingAccount) && styles.modalButtonDisabled
                    ]}
                    onPress={handleVerifyOtp}
                    disabled={otpCode.length !== 6 || verifyingOtp || deletingAccount}
                  >
                    <Text style={styles.modalButtonDeleteText}>
                      {deletingAccount
                        ? tSettings('deleteConfirm.deleting', 'Deleting...')
                        : verifyingOtp
                        ? tSettings('deleteConfirm.verifying', 'Verifying...')
                        : tSettings('deleteConfirm.verify', 'Verify & Delete')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
    marginLeft: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingItemContent: {
    flex: 1,
  },
  settingItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.primary,
    marginBottom: 2,
  },
  settingItemSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  settingItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  signOutSection: {
    marginTop: 32,
    marginBottom: 32,
    marginHorizontal: 16,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ef4444',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ef4444',
    marginLeft: 8,
  },
  settingItemDisabled: {
    opacity: 0.5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: colors.background.paper,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 16,
    lineHeight: 20,
    textAlign: 'center',
  },
  modalBoldText: {
    fontWeight: 'bold',
    color: '#F44336',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: colors.text.primary,
    backgroundColor: colors.background.default,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonCancel: {
    backgroundColor: colors.background.default,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  modalButtonCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  modalButtonDelete: {
    backgroundColor: '#F44336',
  },
  modalButtonDisabled: {
    opacity: 0.5,
    backgroundColor: '#999',
  },
  modalButtonDeleteText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  resendButton: {
    marginTop: -12,
    marginBottom: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  resendButtonText: {
    fontSize: 14,
    color: colors.primary?.main || '#4f46e5',
    fontWeight: '500',
  },
  disclaimerContent: {
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  disclaimerIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 16,
  },
  disclaimerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: 6,
  },
  disclaimerSubtitle: {
    fontSize: 14,
    color: '#ef4444',
    textAlign: 'center',
    fontWeight: '500',
    marginBottom: 20,
  },
  disclaimerList: {
    backgroundColor: isDark ? 'rgba(239,68,68,0.08)' : '#fff5f5',
    borderRadius: 10,
    padding: 14,
    marginBottom: 18,
    gap: 10,
  },
  disclaimerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  disclaimerRowIcon: {
    marginTop: 1,
    marginRight: 8,
  },
  disclaimerRowText: {
    flex: 1,
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  disclaimerLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    gap: 6,
  },
  disclaimerLink: {
    fontSize: 13,
    color: colors.primary?.main || '#4f46e5',
    textDecorationLine: 'underline',
  },
  disclaimerLinkSep: {
    fontSize: 13,
    color: colors.text.secondary,
  },
  disclaimerDeleteBtn: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  disclaimerDeleteBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  disclaimerCancelBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  disclaimerCancelBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text.secondary,
  },
});
