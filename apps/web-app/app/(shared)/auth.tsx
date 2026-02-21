import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../../i18n/i18n';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Platform, Image, ScrollView, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import ThemeAndLanguageSwitcher from '../../components/ThemeAndLanguageSwitcher';
import { OptimizedSplashCursor } from '../../components/OptimizedSplashCursor';
import { useTheme } from '../../hooks/useTheme';
import { useToastHelpers } from '../../contexts/ToastContext';
import PrivacyTermsModal from '../../components/PrivacyTermsModal';
import { memoryManager } from '../../lib/memory-manager';
import { throttle } from '../../lib/performance-utils';
import { CURRENT_VERSION } from '../../config/version';
import VersionStatusIndicator from '../../components/VersionStatusIndicator';
import { useAuth } from '../../hooks/useAuth';
import { authService } from '@hashpass/auth';

export default function AuthScreen() {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('auth');
  const router = useRouter();
  const params = useLocalSearchParams();
  const { showError, showSuccess, showWarning } = useToastHelpers();
  
  // Auth hook
  const { user, isLoggedIn, isLoading: authLoading, signIn, signOut, signInWithOAuth } = useAuth();
  
  // Get returnTo parameter from URL
  const returnTo = params.returnTo as string | undefined;
  
  // Helper function to get redirect path after authentication
  const getRedirectPath = (): string => {
    if (returnTo) {
      try {
        return decodeURIComponent(returnTo);
      } catch {
        console.warn('Failed to decode returnTo parameter');
      }
    }
    return '/(shared)/dashboard/explore';
  };

  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'privacy' | 'terms'>('privacy');
  const [showPassword, setShowPassword] = useState(false);
  const styles = getStyles(isDark, colors);

  // Processing guards to prevent duplicate processing
  const hasNavigatedRef = useRef(false);

  // Check if user is already authenticated and redirect
  useEffect(() => {
    if (isLoggedIn && user && !hasNavigatedRef.current && !authLoading) {
      console.log(`🔐 User already authenticated: ${user.email}`);
      hasNavigatedRef.current = true;
      router.replace(getRedirectPath() as any);
    }
  }, [isLoggedIn, user, authLoading, router]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validatePassword = (password: string): boolean => {
    return password.length >= 6; // Minimum 6 characters
  };

  const handleLogin = async () => {
    if (loading) return;

    // Clear previous errors
    setEmailError('');
    setPasswordError('');

    // Validate inputs
    if (!email.trim()) {
      setEmailError(t('emailRequired', 'Email is required'));
      return;
    }

    if (!validateEmail(email.trim())) {
      setEmailError(t('emailInvalid', 'Please enter a valid email address'));
      return;
    }

    if (!password.trim()) {
      setPasswordError(t('passwordRequired', 'Password is required'));
      return;
    }

    if (!validatePassword(password)) {
      setPasswordError(t('passwordMinLength', 'Password must be at least 6 characters'));
      return;
    }

    setLoading(true);

    try {
      console.log('🔐 Attempting login with Directus SSO...');
      await signIn(email.trim(), password);
      
      // Success will be handled by the useEffect that watches isLoggedIn
      showSuccess(t('loginSuccess', 'Login Successful'), t('welcomeBack', 'Welcome back!'));
      
    } catch (error: any) {
      console.error('❌ Login error:', error);
      
      let errorMessage = t('loginError', 'Login failed. Please check your credentials.');
      
      if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        errorMessage = t('invalidCredentials', 'Invalid email or password. Please try again.');
      } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
        errorMessage = t('networkError', 'Network error. Please check your connection and try again.');
      }
      
      showError(t('authenticationError', 'Authentication Error'), errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuthSignIn = async (provider: 'google' | 'github') => {
    if (loading) return;
    
    setLoading(true);
    
    try {
      console.log(`🔐 Attempting OAuth sign in with ${provider}...`);
      const result = await signInWithOAuth(provider);
      
      if (result.pending) {
        // OAuth redirect is in progress, nothing more to do here
        console.log(`🔄 OAuth redirect initiated for ${provider}`);
        return;
      }
      
      // Success will be handled by the useEffect that watches isLoggedIn
      showSuccess(
        t('loginSuccess', 'Login Successful'), 
        t('welcomeBack', 'Welcome back!')
      );
      
    } catch (error: any) {
      console.error(`❌ ${provider} OAuth error:`, error);
      
      let errorMessage = t('oauthError', `${provider} sign-in failed. Please try again.`);
      
      if (error.message?.includes('not supported')) {
        errorMessage = t('oauthNotSupported', `${provider} sign-in is not available in mobile apps. Please use the web app or email/password authentication.`);
      } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
        errorMessage = t('networkError', 'Network error. Please check your connection and try again.');
      }
      
      showError(t('authenticationError', 'Authentication Error'), errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const openPrivacyModal = () => {
    setModalType('privacy');
    setModalVisible(true);
  };

  const openTermsModal = () => {
    setModalType('terms');
    setModalVisible(true);
  };

  // Show loading spinner during auth state loading
  if (authLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <OptimizedSplashCursor />
        <Text style={styles.loadingText}>{t('checkingAuth', 'Checking authentication...')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <OptimizedSplashCursor
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: -1
        }}
        SIM_RESOLUTION={32}
        DYE_RESOLUTION={256}
        CAPTURE_RESOLUTION={128}
        DENSITY_DISSIPATION={5.0}
        VELOCITY_DISSIPATION={3.0}
        PRESSURE={0.1}
        PRESSURE_ITERATIONS={5}
        CURL={1}
        SPLAT_RADIUS={0.1}
        SPLAT_FORCE={2000}
        SHADING={false}
        COLOR_UPDATE_SPEED={3}
      />
      <ThemeAndLanguageSwitcher />
      <TouchableOpacity
        style={{ position: 'absolute', top: 20, left: 20, zIndex: 1001 }}
        onPress={() => router.push('/home')}
        accessibilityLabel="Go Back"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="arrow-back" size={28} color={isDark ? "#fff" : "#000"} />
      </TouchableOpacity>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        nestedScrollEnabled={false}
        keyboardDismissMode="on-drag"
      >
        <View style={styles.content}>
          <View style={styles.overlay} pointerEvents="none" />
          <Text style={styles.title}>{t('title', 'Welcome to HashPass')}</Text>
          
          {/* Logo */}
          <View style={styles.logoContainer}>            
            <Image
              source={isDark
                ? require('../../assets/logos/hashpass/logo-full-hashpass-black.svg')
                : require('../../assets/logos/hashpass/logo-full-hashpass-white.svg')
              }
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.tagline}>{t('subtitle', 'Secure authentication for Web3 events')}</Text>

          {/* Primary Auth Container */}
          <View style={styles.primaryAuthContainer}>
          {/* Email Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>{t('email', 'Email')}</Text>
            <TextInput
              style={[styles.input, emailError ? styles.inputError : {}]}
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (emailError) setEmailError('');
              }}
              placeholder={t('enterEmail', 'Enter your email')}
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
            {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>{t('password', 'Password')}</Text>
            <View style={styles.passwordInputContainer}>
              <TextInput
                style={[styles.passwordInput, passwordError ? styles.inputError : {}]}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (passwordError) setPasswordError('');
                }}
                placeholder={t('enterPassword', 'Enter your password')}
                placeholderTextColor={colors.textSecondary}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
              />
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setShowPassword(!showPassword)}
                disabled={loading}
              >
                <Ionicons
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            </View>
            {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
          </View>

          {/* Sign In Button */}
          <TouchableOpacity
            style={[styles.signInButton, loading && styles.signInButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.background} />
            ) : (
              <Text style={styles.signInButtonText}>{t('signIn', 'Sign In')}</Text>
            )}
          </TouchableOpacity>
        </View>

          {/* OAuth Section */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('orContinueWith', 'Or continue with')}</Text>
            <View style={styles.dividerLine} />
          </View>

          <View style={styles.oauthContainer}>
            <TouchableOpacity
              style={styles.oauthButton}
              onPress={() => handleOAuthSignIn('google')}
              disabled={loading}
            >
              <Ionicons name="logo-google" size={20} color={colors.text} />
              <Text style={styles.oauthButtonText}>Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.oauthButton}
              onPress={() => handleOAuthSignIn('github')}
              disabled={loading}
            >
              <Ionicons name="logo-github" size={20} color={colors.text} />
              <Text style={styles.oauthButtonText}>GitHub</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {t('bySigningIn', 'By signing in, you agree to our ')}{' '}
              <Text style={styles.footerLink} onPress={openPrivacyModal}>
                {t('privacyPolicy', 'Privacy Policy')}
              </Text>
              {' '}{t('and', 'and')}{' '}
              <Text style={styles.footerLink} onPress={openTermsModal}>
                {t('termsOfService', 'Terms of Service')}
              </Text>
            </Text>
          </View>
        </View>


      </ScrollView>

      {/* Privacy/Terms Modal */}
      <PrivacyTermsModal
        visible={modalVisible}
        type={modalType}
        onClose={() => setModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: isDark ? '#000' : '#fff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)',
    zIndex: -1,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: isDark ? '#fff' : '#121212',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  logoContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  logo: {
    width: 200,
    height: 60,
  },
  tagline: {
    fontSize: 16,
    color: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.6)',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  primaryAuthContainer: {
    width: '100%',
    maxWidth: 400,
    marginBottom: 24,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 16,
  },
  emailInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    paddingHorizontal: 16,
    height: 52,
  },
  emailInputContainerError: {
    borderColor: '#F44336',
    backgroundColor: isDark ? 'rgba(244, 67, 54, 0.1)' : 'rgba(244, 67, 54, 0.05)',
  },
  inputIcon: {
    marginRight: 12,
  },
  emailInput: {
    flex: 1,
    fontSize: 16,
    color: isDark ? '#fff' : '#121212',
    paddingVertical: 0,
  },
  emailInputError: {
    color: '#F44336',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    paddingHorizontal: 16,
    height: 52,
  },
  passwordInput: {
    flex: 1,
    fontSize: 16,
    color: isDark ? '#fff' : '#121212',
    paddingVertical: 0,
    paddingRight: 40,
  },
  passwordToggle: {
    position: 'absolute',
    right: 16,
    padding: 4,
  },
  emailErrorText: {
    color: '#F44336',
    fontSize: 14,
    marginTop: 6,
    marginLeft: 4,
  },
  sendButton: {
    backgroundColor: colors.primary || '#7A5ECC',
    borderRadius: 12,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 4px 12px rgba(122, 94, 204, 0.3)',
    } : {
      shadowColor: colors.primary || '#7A5ECC',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    }),
  },
  sendButtonDisabled: {
    opacity: 0.5,
    backgroundColor: isDark ? 'rgba(122, 94, 204, 0.3)' : 'rgba(122, 94, 204, 0.3)',
  },
  sendButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)',
  },
  dividerText: {
    marginHorizontal: 16,
    fontSize: 14,
    color: isDark ? '#999' : '#666',
  },
  oauthContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  oauthButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 3,
    }),
  },
  oauthButtonText: {
    fontSize: 10,
    color: isDark ? '#fff' : '#121212',
    marginTop: 2,
    textAlign: 'center',
  },
  footer: {
    marginTop: 20,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: isDark ? '#FFFFFF' : '#121212',
    textAlign: 'center',
    lineHeight: 20,
  },
  footerLink: {
    color: isDark ? '#FFFFFF' : colors.primary || '#7A5ECC',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
});
