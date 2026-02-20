import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Platform,
  Image,
  ScrollView,
  Modal,
  FlatList,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import ThemeAndLanguageSwitcher from '../../components/ThemeAndLanguageSwitcher';
import { OptimizedSplashCursor } from '../../components/OptimizedSplashCursor';
import { useTheme } from '../../hooks/useTheme';
import { useToastHelpers } from '../../contexts/ToastContext';
import PrivacyTermsModal from '../../components/PrivacyTermsModal';
import VersionDisplay from '../../components/VersionDisplay';
import { useAuth } from '../../hooks/useAuth';
import { getCurrentLocale, useTranslation } from '../../i18n/i18n';
import { apiClient } from '../../lib/api-client';
import {
  buildCountryDialOptions,
  filterCountryDialOptions,
  resolveDefaultCountryISO2,
} from '../../lib/country-dial-options';
import { supabase } from '../../lib/supabase';

type EmailAuthMethod = 'magic-link' | 'otp-code';
type BusyAction = 'magic-link' | 'otp-send' | 'otp-verify' | 'oauth' | null;
type OtpDeliveryMethod = 'email' | 'sms';

const OTP_CODE_LENGTH = 6;

const normalizeReturnToPath = (rawPath: string): string => {
  let normalized = rawPath;

  try {
    normalized = decodeURIComponent(normalized);
  } catch {
    // Keep original value when decode fails.
  }

  if (!normalized.startsWith('/')) {
    return '/dashboard/explore';
  }

  normalized = normalized.replace(/\/\([^/]+\)/g, '');

  if (!normalized || normalized === '/auth' || normalized.includes('/auth/callback')) {
    return '/dashboard/explore';
  }

  return normalized;
};

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isValidE164Phone = (value: string) => /^\+[1-9]\d{7,14}$/.test(value);
const normalizePhoneDigits = (value: string) => value.replace(/\D/g, '');
const buildE164Phone = (dialCode: string, localNumber: string) => {
  const normalizedDialCode = normalizePhoneDigits(dialCode);
  const normalizedLocalNumber = normalizePhoneDigits(localNumber);
  if (!normalizedDialCode || !normalizedLocalNumber) return '';
  return `+${normalizedDialCode}${normalizedLocalNumber}`;
};

const extractApiError = (payload: unknown, fallback: string): string => {
  if (payload && typeof payload === 'object') {
    const body = payload as Record<string, unknown>;

    if (typeof body.message === 'string' && body.message.trim()) return body.message;
    if (typeof body.error === 'string' && body.error.trim()) return body.error;
    if (typeof body.code === 'string' && body.code.trim()) return body.code;
  }

  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  return fallback;
};

export default function AuthScreen() {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('auth');
  const router = useRouter();
  const params = useLocalSearchParams();
  const { showError, showSuccess } = useToastHelpers();
  const { user, isLoggedIn, isLoading: authLoading, signInWithOAuth } = useAuth();

  const rawReturnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;

  const redirectPath =
    typeof rawReturnTo === 'string' && rawReturnTo.trim()
      ? normalizeReturnToPath(rawReturnTo)
      : '/dashboard/explore';

  const currentLocale = getCurrentLocale();
  const countryDialOptions = useMemo(
    () => buildCountryDialOptions(currentLocale),
    [currentLocale]
  );

  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [emailAuthMethod, setEmailAuthMethod] = useState<EmailAuthMethod>('magic-link');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpDeliveryMethod, setOtpDeliveryMethod] = useState<OtpDeliveryMethod>('email');
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [countrySearchQuery, setCountrySearchQuery] = useState('');
  const [selectedCountryISO2, setSelectedCountryISO2] = useState<string>(() =>
    resolveDefaultCountryISO2(countryDialOptions, currentLocale)
  );
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [otpError, setOtpError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'privacy' | 'terms'>('privacy');

  const hasNavigatedRef = useRef(false);

  const styles = getStyles(isDark, colors);
  const isBusy = busyAction !== null;
  const selectedCountry = useMemo(
    () =>
      countryDialOptions.find((country) => country.iso2 === selectedCountryISO2) ||
      countryDialOptions[0],
    [countryDialOptions, selectedCountryISO2]
  );
  const filteredCountryOptions = useMemo(
    () => filterCountryDialOptions(countryDialOptions, countrySearchQuery),
    [countryDialOptions, countrySearchQuery]
  );

  useEffect(() => {
    if (isLoggedIn && user && !hasNavigatedRef.current && !authLoading) {
      hasNavigatedRef.current = true;
      router.replace(redirectPath as any);
    }
  }, [authLoading, isLoggedIn, redirectPath, router, user]);

  useEffect(() => {
    if (!countryDialOptions.length) return;
    if (countryDialOptions.some((country) => country.iso2 === selectedCountryISO2)) return;

    setSelectedCountryISO2(resolveDefaultCountryISO2(countryDialOptions, currentLocale));
  }, [countryDialOptions, currentLocale, selectedCountryISO2]);

  const validateEmailOrShowError = (): string | null => {
    const normalized = email.trim().toLowerCase();

    if (!normalized) {
      setEmailError(t('emailRequired', 'Email is required'));
      return null;
    }

    if (!isValidEmail(normalized)) {
      setEmailError(t('emailInvalid', 'Please enter a valid email address'));
      return null;
    }

    setEmailError('');
    return normalized;
  };

  const handleSendMagicLink = async () => {
    if (isBusy) return;

    const normalizedEmail = validateEmailOrShowError();
    if (!normalizedEmail) return;

    setBusyAction('magic-link');
    setOtpError('');

    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('auth_signin_method', 'magic_link');
      }

      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const redirectTo = origin
        ? `${origin}/auth/callback?returnTo=${encodeURIComponent(redirectPath)}`
        : undefined;

      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: true,
        },
      });

      if (error) {
        throw error;
      }

      setOtpSent(false);
      setOtpCode('');

      showSuccess(
        t('magicLinkSent', 'Magic link sent'),
        t('magicLinkSentMessage', 'Check your inbox and open the secure sign-in link.')
      );
    } catch (error: any) {
      const message = extractApiError(
        error?.message,
        t('magicLinkFailed', 'Could not send magic link. Please try again.')
      );

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('auth_signin_method');
      }

      showError(t('authenticationError', 'Authentication Error'), message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSendOtpCode = async () => {
    if (isBusy) return;

    const normalizedEmail = validateEmailOrShowError();
    if (!normalizedEmail) return;

    let normalizedPhone = '';
    if (otpDeliveryMethod === 'sms') {
      const localNumber = normalizePhoneDigits(phone);
      normalizedPhone = buildE164Phone(selectedCountry?.dialCode || '', localNumber);

      if (!normalizedPhone) {
        setPhoneError(t('phoneRequired', 'Phone number is required for SMS OTP.'));
        return;
      }
      if (!isValidE164Phone(normalizedPhone)) {
        setPhoneError(
          t(
            'phoneInvalid',
            'Enter a valid phone number. The country code is selected separately.'
          )
        );
        return;
      }
    }

    setBusyAction('otp-send');
    setOtpError('');
    setPhoneError('');

    try {
      const response = await apiClient.post<{ success?: boolean; message?: string; error?: string; delivery?: 'email' | 'sms' }>(
        '/auth/otp',
        {
          email: normalizedEmail,
          delivery: otpDeliveryMethod,
          phone: otpDeliveryMethod === 'sms' ? normalizedPhone : undefined,
        },
        { skipEventSegment: true }
      );

      if (!response.success) {
        throw new Error(response.error || t('otpSendFailed', 'Could not send verification code.'));
      }

      if (!response.data?.success) {
        throw new Error(
          extractApiError(response.data, t('otpSendFailed', 'Could not send verification code.'))
        );
      }

      setOtpSent(true);
      setOtpCode('');

      showSuccess(
        t('otpCodeSent', 'Verification code sent'),
        otpDeliveryMethod === 'sms'
          ? t('otpSmsSentMessage', 'Check your phone for the 6-digit code.')
          : t('otpCodeSentMessage', 'Check your email for the 6-digit code.')
      );
    } catch (error: any) {
      const message = extractApiError(
        error?.message,
        t('otpSendFailed', 'Could not send verification code. Please try again.')
      );

      if (otpDeliveryMethod === 'sms' && /phone/i.test(message)) {
        setPhoneError(message);
      }

      showError(t('authenticationError', 'Authentication Error'), message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleVerifyOtpCode = async () => {
    if (isBusy) return;

    const normalizedEmail = validateEmailOrShowError();
    if (!normalizedEmail) return;

    const normalizedCode = otpCode.trim();
    if (normalizedCode.length !== OTP_CODE_LENGTH) {
      setOtpError(
        t('otpLengthError', `Please enter the ${OTP_CODE_LENGTH}-digit verification code.`)
      );
      return;
    }

    setBusyAction('otp-verify');
    setOtpError('');

    try {
      const verifyResponse = await apiClient.post<{
        success?: boolean;
        token_hash?: string;
        type?: 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email';
        email?: string;
        error?: string;
      }>(
        '/auth/otp/verify',
        { email: normalizedEmail, code: normalizedCode },
        { skipEventSegment: true }
      );

      if (!verifyResponse.success) {
        throw new Error(verifyResponse.error || t('otpInvalid', 'Invalid or expired code.'));
      }

      if (!verifyResponse.data?.success || !verifyResponse.data.token_hash) {
        throw new Error(extractApiError(verifyResponse.data, t('otpInvalid', 'Invalid or expired code.')));
      }

      const { error: otpVerifyError } = await supabase.auth.verifyOtp({
        token_hash: verifyResponse.data.token_hash,
        type: verifyResponse.data.type || 'magiclink',
      } as any);

      if (otpVerifyError) {
        throw otpVerifyError;
      }

      showSuccess(t('loginSuccess', 'Login successful'), t('welcomeBack', 'Welcome back!'));

      hasNavigatedRef.current = true;
      router.replace(redirectPath as any);
    } catch (error: any) {
      const rawMessage = extractApiError(
        error?.message,
        t('otpVerifyFailed', 'Could not verify the code. Please request a new one.')
      );
      const message =
        /email link is invalid or has expired/i.test(rawMessage) ||
          /otp has expired or is invalid/i.test(rawMessage)
          ? t('otpInvalid', 'Invalid or expired code.')
          : rawMessage;

      setOtpError(message);
      showError(t('authenticationError', 'Authentication Error'), message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleGoogleSignIn = async () => {
    if (isBusy) return;

    setBusyAction('oauth');

    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('auth_signin_method', 'google_oauth');
      }

      const result = await signInWithOAuth('google');

      if (result.pending) {
        return;
      }

      showSuccess(t('loginSuccess', 'Login successful'), t('welcomeBack', 'Welcome back!'));
    } catch (error: any) {
      const message = extractApiError(
        error?.message,
        t('oauthError', 'Google sign-in failed. Please try again.')
      );

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('auth_signin_method');
      }

      showError(t('authenticationError', 'Authentication Error'), message);
    } finally {
      setBusyAction(null);
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

  const handlePrimaryEmailAction = () => {
    if (emailAuthMethod === 'magic-link') {
      void handleSendMagicLink();
      return;
    }

    if (!otpSent) {
      void handleSendOtpCode();
      return;
    }

    void handleVerifyOtpCode();
  };

  if (authLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <OptimizedSplashCursor />
        <Text style={styles.loadingText}>{t('checkingAuth', 'Checking authentication...')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <OptimizedSplashCursor
        style={styles.cursorBackground}
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
        style={styles.backButton}
        onPress={() => router.push('/home')}
        accessibilityLabel={t('back', 'Go Back')}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="arrow-back" size={28} color={isDark ? '#fff' : '#000'} />
      </TouchableOpacity>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bounces={false}
      >
        <View style={styles.content}>
          <View style={styles.authCard}>
            <Text style={styles.title}>{t('title', 'Welcome to')}</Text>

            <View style={styles.logoContainer}>
              <Image
                source={
                  isDark
                    ? require('../../assets/logos/hashpass/logo-full-hashpass-black.svg')
                    : require('../../assets/logos/hashpass/logo-full-hashpass-white.svg')
                }
                style={styles.logo}
                resizeMode="contain"
              />
            </View>

            <Text style={styles.tagline}>{t('subtitle', 'Sign in to unlock your digital life.')}</Text>

            <View style={styles.primaryAuthContainer}>
              <View
                style={[
                  styles.emailInputContainer,
                  emailError ? styles.emailInputContainerError : null,
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={emailError ? '#F44336' : colors.textSecondary}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={styles.emailInput}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (emailError) setEmailError('');
                  }}
                  placeholder={t('emailPlaceholder', 'Enter your email')}
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isBusy}
                />
              </View>
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}

              <View style={styles.methodTabs}>
                <TouchableOpacity
                  style={[
                    styles.methodTab,
                    emailAuthMethod === 'magic-link' ? styles.methodTabActive : null,
                  ]}
                  onPress={() => {
                    setEmailAuthMethod('magic-link');
                    setOtpError('');
                    setPhoneError('');
                  }}
                  disabled={isBusy}
                >
                  <Ionicons
                    name="link-outline"
                    size={16}
                    color={emailAuthMethod === 'magic-link' ? colors.text : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.methodTabText,
                      emailAuthMethod === 'magic-link' ? styles.methodTabTextActive : null,
                    ]}
                  >
                    {t('magicLink', 'Magic Link')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.methodTab,
                    emailAuthMethod === 'otp-code' ? styles.methodTabActive : null,
                  ]}
                  onPress={() => {
                    setEmailAuthMethod('otp-code');
                    setOtpError('');
                    setPhoneError('');
                  }}
                  disabled={isBusy}
                >
                  <Ionicons
                    name="keypad-outline"
                    size={16}
                    color={emailAuthMethod === 'otp-code' ? colors.text : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.methodTabText,
                      emailAuthMethod === 'otp-code' ? styles.methodTabTextActive : null,
                    ]}
                  >
                    {t('otpCode', 'OTP Code')}
                  </Text>
                </TouchableOpacity>
              </View>

              {emailAuthMethod === 'otp-code' ? (
                <View style={styles.otpDeliveryContainer}>
                  <TouchableOpacity
                    style={styles.deliverySwitchButton}
                    onPress={() => {
                      setOtpDeliveryMethod((prev) => (prev === 'email' ? 'sms' : 'email'));
                      setPhoneError('');
                      setCountryPickerVisible(false);
                      setCountrySearchQuery('');
                    }}
                    disabled={isBusy}
                  >
                    <Text style={styles.deliverySwitchText}>
                      {otpDeliveryMethod === 'email'
                        ? t('cantAccessEmailUseSms', "Can't access email? Send OTP by SMS")
                        : t('useEmailOtpInstead', 'Use email OTP instead')}
                    </Text>
                  </TouchableOpacity>

                  {otpDeliveryMethod === 'sms' ? (
                    <>
                      <View style={styles.phoneRow}>
                        <TouchableOpacity
                          style={styles.countryPickerButton}
                          onPress={() => setCountryPickerVisible(true)}
                          disabled={isBusy}
                          accessibilityRole="button"
                          accessibilityLabel={t('selectCountryCode', 'Select country code')}
                        >
                          <Text style={styles.countryPickerDialCode}>
                            +{selectedCountry?.dialCode || '1'}
                          </Text>
                          <Text style={styles.countryPickerISO2}>
                            {selectedCountry?.iso2 || 'US'}
                          </Text>
                          <Ionicons
                            name="chevron-down"
                            size={16}
                            color={colors.textSecondary}
                          />
                        </TouchableOpacity>

                        <View
                          style={[
                            styles.emailInputContainer,
                            styles.phoneInputContainer,
                            phoneError ? styles.emailInputContainerError : null,
                          ]}
                        >
                          <Ionicons
                            name="call-outline"
                            size={18}
                            color={phoneError ? '#F44336' : colors.textSecondary}
                            style={styles.inputIcon}
                          />
                          <TextInput
                            style={styles.emailInput}
                            value={phone}
                            onChangeText={(text) => {
                              setPhone(text.replace(/[^\d]/g, ''));
                              if (phoneError) setPhoneError('');
                            }}
                            placeholder={t('phonePlaceholder', 'Enter your phone number')}
                            placeholderTextColor={colors.textSecondary}
                            keyboardType="phone-pad"
                            autoCapitalize="none"
                            autoCorrect={false}
                            editable={!isBusy}
                          />
                        </View>
                      </View>

                      <Text style={styles.selectedCountryText}>
                        {selectedCountry?.name || 'United States'}
                      </Text>
                      {phoneError ? <Text style={styles.errorText}>{phoneError}</Text> : null}
                      <Text style={styles.deliveryHint}>
                        {t(
                          'otpSmsHint',
                          'We will send the login code by SMS using the selected country code.'
                        )}
                      </Text>
                    </>
                  ) : null}
                </View>
              ) : null}

              {emailAuthMethod === 'otp-code' && otpSent ? (
                <View style={styles.otpSection}>
                  <TextInput
                    style={[styles.codeInput, otpError ? styles.emailInputContainerError : null]}
                    value={otpCode}
                    onChangeText={(text) => {
                      setOtpCode(text.replace(/[^0-9]/g, ''));
                      if (otpError) setOtpError('');
                    }}
                    placeholder={t('enterOtpCode', 'Enter 6-digit code')}
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="number-pad"
                    maxLength={OTP_CODE_LENGTH}
                    editable={!isBusy}
                    textAlign="center"
                  />
                  {otpError ? <Text style={styles.errorText}>{otpError}</Text> : null}
                  <TouchableOpacity
                    style={styles.secondaryActionButton}
                    onPress={() => void handleSendOtpCode()}
                    disabled={isBusy}
                  >
                    <Text style={styles.secondaryActionText}>{t('resendCode', 'Resend Code')}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              <TouchableOpacity
                style={[styles.primaryButton, isBusy ? styles.primaryButtonDisabled : null]}
                onPress={handlePrimaryEmailAction}
                disabled={isBusy}
              >
                {isBusy && busyAction !== 'oauth' ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {emailAuthMethod === 'magic-link'
                      ? t('sendMagicLink', 'Send Magic Link')
                      : otpSent
                        ? t('verifyCode', 'Verify Code')
                        : t('sendCode', 'Send Code')}
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>{t('orContinueWith', 'Or continue with')}</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.oauthContainer}>
              <TouchableOpacity
                style={styles.oauthButton}
                onPress={() => void handleGoogleSignIn()}
                disabled={isBusy}
              >
                {busyAction === 'oauth' ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Ionicons name="logo-google" size={28} color={colors.text} />
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>
                {t('privacy.text', 'By signing in, you agree to our')}{' '}
                <Text style={styles.footerLink} onPress={openTermsModal}>
                  {t('privacy.terms', 'Terms of Service')}
                </Text>
                {' '}
                {t('and', 'and')}{' '}
                <Text style={styles.footerLink} onPress={openPrivacyModal}>
                  {t('privacy.privacy', 'Privacy Policy')}
                </Text>
                .
              </Text>
            </View>

            <View style={{ alignItems: 'center', marginTop: 12 }}>
              <VersionDisplay compact={true} />
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={countryPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setCountryPickerVisible(false);
          setCountrySearchQuery('');
        }}
      >
        <View style={styles.countryPickerModalRoot}>
          <Pressable
            style={styles.countryPickerBackdrop}
            onPress={() => {
              setCountryPickerVisible(false);
              setCountrySearchQuery('');
            }}
          />

          <View style={styles.countryPickerSheet}>
            <View style={styles.countryPickerSheetHandle} />

            <View style={styles.countryPickerHeader}>
              <Text style={styles.countryPickerTitle}>
                {t('countryCodeTitle', 'Select country code')}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setCountryPickerVisible(false);
                  setCountrySearchQuery('');
                }}
                accessibilityRole="button"
                accessibilityLabel={t('closeCountrySelector', 'Close country selector')}
              >
                <Ionicons
                  name="close"
                  size={22}
                  color={isDark ? '#f3f3f3' : '#1d1e20'}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.countrySearchContainer}>
              <Ionicons
                name="search-outline"
                size={18}
                color={colors.textSecondary}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.countrySearchInput}
                value={countrySearchQuery}
                onChangeText={setCountrySearchQuery}
                placeholder={t('countrySearchPlaceholder', 'Search by country, ISO, or dial code')}
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <FlatList
              data={filteredCountryOptions}
              keyExtractor={(item) => item.iso2}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.countryPickerList}
              ListEmptyComponent={
                <Text style={styles.countryPickerEmptyText}>
                  {t('countryNoMatches', 'No countries match your search.')}
                </Text>
              }
              renderItem={({ item }) => {
                const selected = item.iso2 === selectedCountry?.iso2;

                return (
                  <TouchableOpacity
                    style={[
                      styles.countryPickerOption,
                      selected ? styles.countryPickerOptionSelected : null,
                    ]}
                    onPress={() => {
                      setSelectedCountryISO2(item.iso2);
                      setPhoneError('');
                      setCountryPickerVisible(false);
                      setCountrySearchQuery('');
                    }}
                  >
                    <View style={styles.countryPickerOptionInfo}>
                      <Text style={styles.countryPickerOptionName}>{item.name}</Text>
                      <Text style={styles.countryPickerOptionISO2}>{item.iso2}</Text>
                    </View>

                    <Text style={styles.countryPickerOptionDialCode}>+{item.dialCode}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      <PrivacyTermsModal
        visible={modalVisible}
        type={modalType}
        onClose={() => setModalVisible(false)}
      />
    </SafeAreaView>
  );
}

const getStyles = (isDark: boolean, colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? '#000' : '#f4f4f6',
    },
    centered: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    cursorBackground: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: -1,
    },
    backButton: {
      position: 'absolute',
      top: 20,
      left: 20,
      zIndex: 1001,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingTop: 70,
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
    authCard: {
      width: '100%',
      maxWidth: 420,
      borderRadius: 18,
      paddingHorizontal: 20,
      paddingVertical: 24,
      backgroundColor: isDark ? '#151515' : '#ffffff',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
      overflow: 'hidden',
      ...(Platform.OS === 'web'
        ? { boxShadow: isDark ? '0 14px 36px rgba(0,0,0,0.45)' : '0 12px 34px rgba(0,0,0,0.12)' }
        : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.18,
          shadowRadius: 20,
          elevation: 6,
        }),
    },
    title: {
      fontSize: 46,
      fontWeight: '700',
      color: isDark ? '#fff' : '#121212',
      textAlign: 'center',
      marginBottom: 6,
      letterSpacing: -0.8,
    },
    logoContainer: {
      alignItems: 'center',
      marginVertical: 12,
    },
    logo: {
      width: 200,
      height: 58,
    },
    tagline: {
      fontSize: 18,
      color: isDark ? 'rgba(255,255,255,0.86)' : 'rgba(0,0,0,0.62)',
      textAlign: 'center',
      marginBottom: 20,
    },
    primaryAuthContainer: {
      width: '100%',
      gap: 12,
    },
    emailInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f1f4',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#dddddf',
      paddingHorizontal: 14,
      height: 52,
    },
    emailInputContainerError: {
      borderColor: '#F44336',
    },
    inputIcon: {
      marginRight: 10,
    },
    emailInput: {
      flex: 1,
      fontSize: 18,
      color: isDark ? '#fff' : '#121212',
      paddingVertical: 0,
    },
    methodTabs: {
      flexDirection: 'row',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#d8d8dc',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#eeeeef',
      padding: 4,
      gap: 6,
    },
    methodTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 38,
      borderRadius: 8,
      backgroundColor: 'transparent',
    },
    methodTabActive: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : '#d8d8dc',
    },
    methodTabText: {
      fontSize: 16,
      color: colors.textSecondary,
      fontWeight: '600',
    },
    methodTabTextActive: {
      color: isDark ? '#fff' : '#121212',
    },
    otpSection: {
      width: '100%',
      gap: 8,
    },
    otpDeliveryContainer: {
      width: '100%',
      gap: 8,
    },
    deliverySwitchButton: {
      alignSelf: 'flex-start',
      paddingVertical: 2,
      paddingHorizontal: 2,
    },
    deliverySwitchText: {
      fontSize: 13,
      color: isDark ? '#cfcfd3' : '#55565b',
      textDecorationLine: 'underline',
      fontWeight: '600',
    },
    deliveryHint: {
      fontSize: 12,
      color: isDark ? '#bdbdc2' : '#6a6b70',
      marginLeft: 4,
      lineHeight: 16,
    },
    phoneRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    countryPickerButton: {
      height: 52,
      minWidth: 98,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#dddddf',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f1f4',
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
    },
    countryPickerDialCode: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#fff' : '#121212',
      letterSpacing: 0.2,
    },
    countryPickerISO2: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
    },
    phoneInputContainer: {
      flex: 1,
    },
    selectedCountryText: {
      fontSize: 12,
      color: isDark ? '#cdced2' : '#57585d',
      marginLeft: 4,
      fontWeight: '500',
    },
    countryPickerModalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    countryPickerBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(8, 8, 10, 0.52)',
    },
    countryPickerSheet: {
      maxHeight: '78%',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      backgroundColor: isDark ? '#101113' : '#fbfbfd',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 16,
      ...(Platform.OS === 'web'
        ? { boxShadow: '0 -10px 30px rgba(0,0,0,0.25)' }
        : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.2,
          shadowRadius: 12,
          elevation: 14,
        }),
    },
    countryPickerSheetHandle: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.2)',
      marginBottom: 10,
    },
    countryPickerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    countryPickerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: isDark ? '#ffffff' : '#16171a',
    },
    countrySearchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#d7d8dc',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f2f3f6',
      paddingHorizontal: 12,
      height: 48,
      marginBottom: 12,
    },
    countrySearchInput: {
      flex: 1,
      color: isDark ? '#ffffff' : '#111214',
      fontSize: 16,
      paddingVertical: 0,
    },
    countryPickerList: {
      paddingBottom: 12,
    },
    countryPickerEmptyText: {
      textAlign: 'center',
      color: isDark ? '#c8c9cd' : '#56575c',
      fontSize: 14,
      paddingVertical: 24,
    },
    countryPickerOption: {
      height: 56,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#e0e0e3',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
      paddingHorizontal: 12,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    countryPickerOptionSelected: {
      borderColor: isDark ? 'rgba(255,255,255,0.32)' : '#b7b8be',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f4f5f8',
    },
    countryPickerOptionInfo: {
      flex: 1,
      gap: 2,
    },
    countryPickerOptionName: {
      fontSize: 15,
      fontWeight: '600',
      color: isDark ? '#ffffff' : '#141518',
    },
    countryPickerOptionISO2: {
      fontSize: 12,
      fontWeight: '500',
      color: isDark ? '#bfc0c5' : '#66676d',
      textTransform: 'uppercase',
    },
    countryPickerOptionDialCode: {
      fontSize: 16,
      fontWeight: '700',
      color: isDark ? '#ffffff' : '#141518',
      letterSpacing: 0.2,
    },
    codeInput: {
      height: 52,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#dddddf',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f1f4',
      fontSize: 22,
      letterSpacing: 6,
      color: isDark ? '#fff' : '#121212',
      paddingHorizontal: 14,
    },
    primaryButton: {
      height: 52,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#c81000',
      ...(Platform.OS === 'web'
        ? { boxShadow: '0 4px 14px rgba(200, 16, 0, 0.35)' }
        : {
          shadowColor: '#c81000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.32,
          shadowRadius: 8,
          elevation: 4,
        }),
    },
    primaryButtonDisabled: {
      opacity: 0.6,
    },
    primaryButtonText: {
      fontSize: 20,
      fontWeight: '700',
      color: '#fff',
    },
    secondaryActionButton: {
      alignSelf: 'center',
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    secondaryActionText: {
      color: isDark ? '#fff' : '#434343',
      textDecorationLine: 'underline',
      fontSize: 14,
      fontWeight: '600',
    },
    errorText: {
      color: '#F44336',
      fontSize: 14,
      marginLeft: 4,
    },
    dividerContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      marginVertical: 22,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#d9d9db',
    },
    dividerText: {
      marginHorizontal: 14,
      fontSize: 15,
      color: isDark ? '#bdbdc2' : '#6e6e72',
    },
    oauthContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginBottom: 18,
    },
    oauthButton: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#ffffff',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.18)' : '#d7d7da',
      ...(Platform.OS === 'web'
        ? { boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }
        : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
          elevation: 3,
        }),
    },
    footer: {
      marginTop: 2,
      alignItems: 'center',
      paddingHorizontal: 6,
    },
    footerText: {
      fontSize: 14,
      lineHeight: 20,
      color: isDark ? '#e6e6e8' : '#323236',
      textAlign: 'center',
    },
    footerLink: {
      color: isDark ? '#ffffff' : '#5a4ac9',
      fontWeight: '700',
      textDecorationLine: 'underline',
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: colors.textSecondary,
    },
  });
