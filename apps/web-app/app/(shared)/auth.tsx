import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Animated,
  Easing,
  type NativeSyntheticEvent,
  type TextInputKeyPressEventData,
  Platform,
  Image,
  ScrollView,
  Modal,
  FlatList,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import ThemeAndLanguageSwitcher from '../../components/ThemeAndLanguageSwitcher';
import { useTheme } from '../../hooks/useTheme';
import { useToastHelpers } from '../../contexts/ToastContext';
import PrivacyTermsModal from '../../components/PrivacyTermsModal';
import VersionDisplay from '../../components/VersionDisplay';
import { useAuth } from '../../hooks/useAuth';
import { getCurrentLocale, useTranslation } from '../../i18n/i18n';
import { apiClient } from '../../lib/api-client';
import { authService } from '@hashpass/auth';
import { getEmailAutocompleteSuggestions } from '../../lib/email-autocomplete';
import {
  buildCountryDialOptions,
  filterCountryDialOptions,
  resolveDefaultCountryISO2,
} from '../../lib/country-dial-options';
import { supabase } from '../../lib/supabase';

type EmailAuthMethod = 'magic-link' | 'otp-code';
type BusyAction = 'magic-link' | 'otp-send' | 'otp-verify' | 'oauth' | null;
type OtpDeliveryMethod = 'email' | 'sms';
type ActiveSubmitField = 'email' | 'phone' | 'otp' | null;

const OTP_CODE_LENGTH = 6;
const MAGIC_LINK_RESEND_COOLDOWN_SECONDS = 45;
const OTP_RESEND_COOLDOWN_SECONDS = 45;
const OTP_DIGIT_KEYS = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'] as const;

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

const resolveOAuthErrorMessage = (
  errorCode: string | undefined,
  rawMessage: string | undefined,
  fallback: string
): string => {
  const message = rawMessage?.trim();
  const normalized = `${errorCode || ''} ${message || ''}`.toLowerCase();

  if (message) {
    return message;
  }

  if (
    normalized.includes('otp_expired') ||
    normalized.includes('email link is invalid or has expired')
  ) {
    return 'Your magic link is invalid or has expired. Request a new link and try again.';
  }

  if (
    normalized.includes('invalid_credentials') ||
    normalized.includes('invalid user credentials')
  ) {
    return 'Google sign-in completed, but Directus did not establish a valid session. Please try again.';
  }

  if (
    normalized.includes('networkerror') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('cors')
  ) {
    return 'Your browser could not reach the Directus auth server. Please verify local CORS and Directus URL settings.';
  }

  return fallback;
};

const DESKTOP_AUTH_BREAKPOINT = 1100;

type HeroSlide = {
  id: string;
  icon: string;
  title: string;
  description: string;
};

type DesktopHeroPanelProps = {
  slides: HeroSlide[];
  isDark: boolean;
  styles: any;
};

const createFloatingLoop = (
  value: Animated.Value,
  duration: number,
  useNativeDriver: boolean
) =>
  Animated.loop(
    Animated.sequence([
      Animated.timing(value, {
        toValue: 1,
        duration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver,
      }),
      Animated.timing(value, {
        toValue: 0,
        duration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver,
      }),
    ])
  );

const DesktopHeroPanel = ({ slides, isDark, styles }: DesktopHeroPanelProps) => {
  const useNativeDriver = Platform.OS !== 'web';
  const blobOne = useRef(new Animated.Value(0)).current;
  const blobTwo = useRef(new Animated.Value(0)).current;
  const blobThree = useRef(new Animated.Value(0)).current;
  const contentEntrance = useRef(new Animated.Value(0)).current;
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const heroGradientColors = isDark
    ? ['#030a12', '#0a1f31', '#13415e']
    : ['#ffffff', '#fff9f8', '#fff1ee'];

  useEffect(() => {
    const blobAnimations = [
      createFloatingLoop(blobOne, 6200, useNativeDriver),
      createFloatingLoop(blobTwo, 7600, useNativeDriver),
      createFloatingLoop(blobThree, 9400, useNativeDriver),
    ];

    const blobTimers = blobAnimations.map((animation, index) =>
      setTimeout(() => animation.start(), index * 420)
    );

    contentEntrance.setValue(0);
    const revealAnimation = Animated.timing(contentEntrance, {
      toValue: 1,
      duration: 820,
      easing: Easing.out(Easing.cubic),
      useNativeDriver,
    });
    const revealTimer = setTimeout(() => revealAnimation.start(), 120);

    return () => {
      blobTimers.forEach(clearTimeout);
      clearTimeout(revealTimer);
      blobAnimations.forEach((animation) => animation.stop());
      revealAnimation.stop();
    };
  }, [blobOne, blobThree, blobTwo, contentEntrance, useNativeDriver]);

  const blobOneTranslateX = blobOne.interpolate({
    inputRange: [0, 1],
    outputRange: [-24, 18],
  });
  const blobOneTranslateY = blobOne.interpolate({
    inputRange: [0, 1],
    outputRange: [18, -28],
  });
  const blobTwoTranslateX = blobTwo.interpolate({
    inputRange: [0, 1],
    outputRange: [26, -16],
  });
  const blobTwoTranslateY = blobTwo.interpolate({
    inputRange: [0, 1],
    outputRange: [-12, 22],
  });
  const blobThreeTranslateX = blobThree.interpolate({
    inputRange: [0, 1],
    outputRange: [-18, 22],
  });
  const blobThreeTranslateY = blobThree.interpolate({
    inputRange: [0, 1],
    outputRange: [24, -16],
  });
  const contentOpacity = contentEntrance.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const contentTranslateY = contentEntrance.interpolate({
    inputRange: [0, 1],
    outputRange: [22, 0],
  });
  const safeSlideIndex = slides.length ? activeSlideIndex % slides.length : 0;
  const currentSlide = slides[safeSlideIndex] || {
    id: 'secure',
    icon: 'shield-checkmark-outline',
    title: 'Secure & Private',
    description: 'Your data is encrypted and protected with industry-leading security protocols. We prioritize your privacy above all else.',
  };

  useEffect(() => {
    if (!slides.length) {
      setActiveSlideIndex(0);
      return;
    }
    setActiveSlideIndex((previousIndex) => previousIndex % slides.length);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const rotationInterval = setInterval(() => {
      setActiveSlideIndex((previousIndex) => (previousIndex + 1) % slides.length);
    }, 4200);
    return () => clearInterval(rotationInterval);
  }, [slides.length]);

  return (
    <View style={styles.desktopHeroPane}>
      <LinearGradient
        colors={heroGradientColors}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <Animated.View
        style={[
          styles.desktopHeroBlob,
          styles.desktopHeroBlobOne,
          {
            transform: [{ translateX: blobOneTranslateX }, { translateY: blobOneTranslateY }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.desktopHeroBlob,
          styles.desktopHeroBlobTwo,
          {
            transform: [{ translateX: blobTwoTranslateX }, { translateY: blobTwoTranslateY }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.desktopHeroBlob,
          styles.desktopHeroBlobThree,
          {
            transform: [{ translateX: blobThreeTranslateX }, { translateY: blobThreeTranslateY }],
          },
        ]}
      />

      <View style={styles.desktopHeroWaveTop} />
      <View style={styles.desktopHeroWaveBottom} />

      <Animated.View
        style={[
          styles.desktopHeroBody,
          {
            opacity: contentOpacity,
            transform: [{ translateY: contentTranslateY }],
          },
        ]}
      >
        <View style={styles.desktopHeroBadge}>
          <Ionicons name={currentSlide.icon as any} size={32} color={isDark ? '#ddf7fb' : '#af0d01'} />
        </View>
        <Text style={styles.desktopHeroTitle}>{currentSlide.title}</Text>
        <Text style={styles.desktopHeroDescription}>{currentSlide.description}</Text>

        <View style={styles.desktopHeroProgress}>
          {slides.map((slide, index) => (
            <TouchableOpacity
              key={slide.id}
              style={styles.desktopHeroProgressDotButton}
              onPress={() => setActiveSlideIndex(index)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`Show ${slide.title}`}
            >
              <View
                style={[
                  styles.desktopHeroProgressDot,
                  index === safeSlideIndex ? styles.desktopHeroProgressDotActive : null,
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </View>
  );
};

export default function AuthScreen() {
  const { width: windowWidth } = useWindowDimensions();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('auth');
  const { t: tIndex } = useTranslation('index');
  const router = useRouter();
  const params = useLocalSearchParams();
  const { showError, showSuccess } = useToastHelpers();
  const { user, isLoggedIn, isLoading: authLoading, signInWithOAuth } = useAuth();
  const isDesktopLayout = Platform.OS === 'web' && windowWidth >= DESKTOP_AUTH_BREAKPOINT;
  const useNativeDriver = Platform.OS !== 'web';
  const formEntrance = useRef(new Animated.Value(0)).current;

  const rawReturnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const rawAuthError = Array.isArray(params.error) ? params.error[0] : params.error;
  const rawAuthMessage = Array.isArray(params.message) ? params.message[0] : params.message;

  const redirectPath =
    typeof rawReturnTo === 'string' && rawReturnTo.trim()
      ? normalizeReturnToPath(rawReturnTo)
      : '/dashboard/explore';

  const currentLocale = getCurrentLocale();
  const heroSlides: HeroSlide[] = [
    {
      id: 'secure',
      icon: 'shield-checkmark-outline',
      title: tIndex('features.secure.title', 'Secure & Private'),
      description: tIndex(
        'features.secure.description',
        'Your data is encrypted and protected with industry-leading security protocols. We prioritize your privacy above all else.'
      ),
    },
    {
      id: 'management',
      icon: 'key-outline',
      title: tIndex('features.management.title', 'Effortless Management'),
      description: tIndex(
        'features.management.description',
        'Organize all your digital credentials, loyalty cards, and communities in one intuitive place.'
      ),
    },
    {
      id: 'sync',
      icon: 'sync-outline',
      title: tIndex('features.sync.title', 'Cross-Platform Sync'),
      description: tIndex(
        'features.sync.description',
        'Access your data across all your devices with our secure cloud sync.'
      ),
    },
  ];
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
  const [otpCodeSentAt, setOtpCodeSentAt] = useState<number | null>(null);
  const [magicLinkSentAt, setMagicLinkSentAt] = useState<number | null>(null);
  const [magicLinkTimerNow, setMagicLinkTimerNow] = useState<number>(() => Date.now());
  const [emailError, setEmailError] = useState('');
  const [emailSuggestionsDismissed, setEmailSuggestionsDismissed] = useState(false);
  const [activeEmailSuggestionIndex, setActiveEmailSuggestionIndex] = useState(0);
  const [otpError, setOtpError] = useState('');
  const [isOtpInputFocused, setIsOtpInputFocused] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'privacy' | 'terms'>('privacy');
  const emailInputRef = useRef<TextInput>(null);
  const otpInputRef = useRef<TextInput>(null);
  const lastSubmitTriggerRef = useRef(0);
  const shouldShowEmailSuggestionsRef = useRef(false);
  const activeEmailSuggestionRef = useRef<string | null>(null);
  const skipNextEmailSubmitRef = useRef(false);
  const acceptActiveEmailSuggestionRef = useRef<() => boolean>(() => false);
  const activeSubmitFieldRef = useRef<ActiveSubmitField>(null);
  const submitActionsRef = useRef<{
    primary: () => void;
    email: () => void;
    phone: () => void;
    otp: () => void;
  }>({
    primary: () => {},
    email: () => {},
    phone: () => {},
    otp: () => {},
  });

  const hasNavigatedRef = useRef(false);
  const hasShownOAuthErrorRef = useRef(false);
  const authProviderName = authService.getProviderName();
  const hasSupabasePasswordlessConfig = Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_KEY
  );
  const isPasswordlessSupported = authProviderName === 'supabase' || hasSupabasePasswordlessConfig;
  const passwordlessUnavailableMessage = t(
    'passwordlessUnavailableMessage',
    'Magic link and OTP sign-in are unavailable because Supabase passwordless is not configured for this environment.'
  );

  const styles = getStyles(isDark, colors);
  const isBusy = busyAction !== null;
  const magicLinkResendRemainingSeconds = magicLinkSentAt === null
    ? 0
    : Math.max(
      0,
      Math.ceil((magicLinkSentAt + (MAGIC_LINK_RESEND_COOLDOWN_SECONDS * 1000) - magicLinkTimerNow) / 1000)
    );
  const otpResendRemainingSeconds = otpCodeSentAt === null
    ? 0
    : Math.max(
      0,
      Math.ceil((otpCodeSentAt + (OTP_RESEND_COOLDOWN_SECONDS * 1000) - magicLinkTimerNow) / 1000)
    );
  const isMagicLinkConfirmationVisible = emailAuthMethod === 'magic-link' && magicLinkSentAt !== null;
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
  const otpCodeDigits = useMemo(
    () => OTP_DIGIT_KEYS.map((_, index) => otpCode[index] || ''),
    [otpCode]
  );
  const activeOtpDigitIndex = Math.min(otpCode.length, OTP_CODE_LENGTH - 1);
  const emailSuggestions = useMemo(
    () => getEmailAutocompleteSuggestions(email, { limit: 12 }),
    [email]
  );
  const normalizedEmailInput = email.trim().toLowerCase();
  const shouldShowEmailSuggestions =
    !isBusy &&
    !emailSuggestionsDismissed &&
    normalizedEmailInput.length > 0 &&
    emailSuggestions.length > 0 &&
    !isValidEmail(normalizedEmailInput);
  const activeEmailSuggestion =
    emailSuggestions[activeEmailSuggestionIndex] || emailSuggestions[0] || null;
  shouldShowEmailSuggestionsRef.current = shouldShowEmailSuggestions;
  activeEmailSuggestionRef.current = activeEmailSuggestion;

  const formCardOpacity = formEntrance.interpolate({
    inputRange: [0, 1],
    outputRange: [0.78, 1],
  });
  const formCardTranslateY = formEntrance.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });

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

  useEffect(() => {
    if (!shouldShowEmailSuggestions) {
      setActiveEmailSuggestionIndex(0);
      return;
    }

    setActiveEmailSuggestionIndex((previousIndex) => {
      if (!emailSuggestions.length) return 0;
      return Math.min(previousIndex, emailSuggestions.length - 1);
    });
  }, [emailSuggestions, shouldShowEmailSuggestions]);

  useEffect(() => {
    if (magicLinkSentAt === null && otpCodeSentAt === null) return;

    setMagicLinkTimerNow(Date.now());
    const interval = setInterval(() => {
      setMagicLinkTimerNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [magicLinkSentAt, otpCodeSentAt]);

  useEffect(() => {
    if (!otpSent) {
      setIsOtpInputFocused(false);
      if (activeSubmitFieldRef.current === 'otp') {
        activeSubmitFieldRef.current = null;
      }
      return;
    }

    const timer = setTimeout(() => {
      otpInputRef.current?.focus();
      activeSubmitFieldRef.current = 'otp';
      setIsOtpInputFocused(true);
      try {
        otpInputRef.current?.setNativeProps?.({ selection: { start: 0, end: 0 } });
      } catch {
        // Ignore selection assignment failures on unsupported targets.
      }
    }, 40);

    return () => clearTimeout(timer);
  }, [otpSent]);

  useEffect(() => {
    if (hasShownOAuthErrorRef.current) return;
    if (typeof rawAuthError !== 'string' && typeof rawAuthMessage !== 'string') return;

    const signInMethod =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? window.localStorage.getItem('auth_signin_method')
        : null;
    const isPasswordlessMethod = signInMethod === 'magic_link' || signInMethod === 'otp_code';

    let message = resolveOAuthErrorMessage(
      typeof rawAuthError === 'string' ? rawAuthError : undefined,
      typeof rawAuthMessage === 'string' ? rawAuthMessage : undefined,
      t('oauthError', 'Google sign-in failed. Please try again.')
    );

    if (isPasswordlessMethod && !isPasswordlessSupported) {
      message = passwordlessUnavailableMessage;
    }

    hasShownOAuthErrorRef.current = true;
    console.error('[Auth] OAuth callback failed', {
      error: rawAuthError,
      message,
    });
    showError(t('authenticationError', 'Authentication Error'), message);

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('error');
      cleanUrl.searchParams.delete('message');
      window.history.replaceState({}, '', `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`);
      window.localStorage.removeItem('auth_signin_method');
    }
  }, [isPasswordlessSupported, passwordlessUnavailableMessage, rawAuthError, rawAuthMessage, showError, t]);

  useEffect(() => {
    formEntrance.setValue(0);
    const formReveal = Animated.timing(formEntrance, {
      toValue: 1,
      duration: 560,
      easing: Easing.out(Easing.cubic),
      useNativeDriver,
    });

    formReveal.start();
    return () => formReveal.stop();
  }, [formEntrance, isDesktopLayout, useNativeDriver]);

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

  const resetMagicLinkConfirmation = () => {
    setMagicLinkSentAt(null);
    setMagicLinkTimerNow(Date.now());
    setOtpError('');
  };

  const handleSendMagicLink = async () => {
    if (isBusy) return;
    if (magicLinkSentAt !== null && magicLinkResendRemainingSeconds > 0) return;

    if (!isPasswordlessSupported) {
      showError(t('authenticationError', 'Authentication Error'), passwordlessUnavailableMessage);
      return;
    }

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
      setMagicLinkSentAt(Date.now());
      setMagicLinkTimerNow(Date.now());

      showSuccess(
        t('magicLinkSentTitle', 'Link sent'),
        t('magicLinkSentMessage', 'Please check your email to login.')
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
    if (otpCodeSentAt !== null && otpResendRemainingSeconds > 0) return;

    if (!isPasswordlessSupported) {
      showError(t('authenticationError', 'Authentication Error'), passwordlessUnavailableMessage);
      return;
    }

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
      setOtpCodeSentAt(Date.now());
      setMagicLinkTimerNow(Date.now());
      focusOtpInput(0);

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

    if (!isPasswordlessSupported) {
      showError(t('authenticationError', 'Authentication Error'), passwordlessUnavailableMessage);
      return;
    }

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

      const initialType = verifyResponse.data.type || 'magiclink';
      const verificationTypes = Array.from(
        new Set([initialType, 'signup', 'magiclink', 'email'])
      ) as ('signup' | 'magiclink' | 'email' | 'invite' | 'recovery' | 'email_change')[];

      let otpVerifyError: any = null;
      for (const type of verificationTypes) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: verifyResponse.data.token_hash,
          type,
        } as any);

        if (!error) {
          otpVerifyError = null;
          break;
        }

        otpVerifyError = error;
        const message = typeof error.message === 'string' ? error.message : '';
        const canRetryWithAnotherType =
          /email link is invalid or has expired/i.test(message) ||
          /otp has expired or is invalid/i.test(message);

        if (!canRetryWithAnotherType) {
          break;
        }
      }

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

  const handleOtpCodeChange = (text: string) => {
    const normalizedDigits = text.replace(/[^0-9]/g, '').slice(0, OTP_CODE_LENGTH);
    setOtpCode(normalizedDigits);
    if (otpError) setOtpError('');
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

  const applyEmailSuggestion = (suggestedEmail: string) => {
    setEmail(suggestedEmail);
    setEmailSuggestionsDismissed(false);
    if (emailError) setEmailError('');

    const focusInput = () => {
      emailInputRef.current?.focus();
      activeSubmitFieldRef.current = 'email';
      try {
        emailInputRef.current?.setNativeProps?.({
          selection: { start: suggestedEmail.length, end: suggestedEmail.length },
        });
      } catch {
        // Ignore selection assignment failures on unsupported targets.
      }
    };

    if (Platform.OS === 'web') {
      setTimeout(focusInput, 0);
      return;
    }

    focusInput();
  };

  const handleEmailInputChange = (text: string) => {
    const previousNormalizedEmail = email.trim().toLowerCase();
    const nextNormalizedEmail = text.trim().toLowerCase();

    if (emailSuggestionsDismissed && previousNormalizedEmail !== nextNormalizedEmail) {
      setEmailSuggestionsDismissed(false);
    }

    setEmail(text);
    setActiveEmailSuggestionIndex(0);
    if (emailError) setEmailError('');
  };

  const dismissEmailSuggestions = () => {
    setEmailSuggestionsDismissed(true);
    setActiveEmailSuggestionIndex(0);
  };

  const tryApplyTopEmailSuggestion = (): boolean => {
    if (emailSuggestionsDismissed) return false;
    const normalizedEmail = normalizedEmailInput;
    if (!normalizedEmail || isValidEmail(normalizedEmail)) return false;
    if (!activeEmailSuggestion) return false;

    applyEmailSuggestion(activeEmailSuggestion);
    return true;
  };

  const acceptActiveEmailSuggestion = (): boolean => {
    if (!shouldShowEmailSuggestionsRef.current) return false;
    const suggestion = activeEmailSuggestionRef.current;
    if (!suggestion) return false;

    skipNextEmailSubmitRef.current = true;
    applyEmailSuggestion(suggestion);
    return true;
  };
  acceptActiveEmailSuggestionRef.current = acceptActiveEmailSuggestion;

  const handlePrimaryEmailAction = () => {
    if (tryApplyTopEmailSuggestion()) return;

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

  const runSubmitAction = (action: () => void) => {
    const now = Date.now();
    if (now - lastSubmitTriggerRef.current < 250) return;
    lastSubmitTriggerRef.current = now;
    action();
  };

  const handleEnterKeyPress = (
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
    action: () => void
  ) => {
    if (Platform.OS !== 'web') return;
    if (event.nativeEvent.key !== 'Enter') return;
    runSubmitAction(action);
  };

  const handleEmailInputKeyPress = (
    event: NativeSyntheticEvent<TextInputKeyPressEventData>
  ) => {
    if (Platform.OS !== 'web') return;

    const key = event.nativeEvent.key;
    if (key === 'Tab') {
      if (shouldShowEmailSuggestions && emailSuggestions.length > 0) {
        const isShiftPressed = Boolean((event.nativeEvent as any).shiftKey);
        setActiveEmailSuggestionIndex((previousIndex) => {
          const total = emailSuggestions.length;
          if (!total) return 0;
          const delta = isShiftPressed ? -1 : 1;
          return (previousIndex + delta + total) % total;
        });
        (event as any).preventDefault?.();
      }
      return;
    }

    if (key === 'Enter') {
      if (acceptActiveEmailSuggestion()) {
        (event as any).preventDefault?.();
        return;
      }
      handleEnterKeyPress(event, handleEmailInputSubmit);
    }
  };

  const focusOtpInput = (selectionIndex = otpCode.length) => {
    const boundedIndex = Math.max(0, Math.min(OTP_CODE_LENGTH, selectionIndex));

    const applyFocus = () => {
      otpInputRef.current?.focus();
      activeSubmitFieldRef.current = 'otp';
      setIsOtpInputFocused(true);
      try {
        otpInputRef.current?.setNativeProps?.({ selection: { start: boundedIndex, end: boundedIndex } });
      } catch {
        // Ignore selection assignment failures on unsupported targets.
      }
    };

    if (Platform.OS === 'web') {
      setTimeout(applyFocus, 0);
      return;
    }

    applyFocus();
  };

  const handleEmailInputSubmit = () => {
    if (isBusy) return;
    if (tryApplyTopEmailSuggestion()) return;

    // If OTP was already sent, move focus to the code input instead of submitting empty code.
    if (emailAuthMethod === 'otp-code' && otpSent) {
      focusOtpInput();
      return;
    }

    handlePrimaryEmailAction();
  };

  const handleEmailSubmitEditing = () => {
    if (skipNextEmailSubmitRef.current) {
      skipNextEmailSubmitRef.current = false;
      return;
    }

    runSubmitAction(handleEmailInputSubmit);
  };

  const focusEmailInput = () => {
    if (Platform.OS !== 'web') return;
    setTimeout(() => {
      emailInputRef.current?.focus();
    }, 0);
  };

  const handlePhoneInputSubmit = () => {
    if (isBusy) return;
    if (emailAuthMethod === 'otp-code' && !otpSent) {
      handlePrimaryEmailAction();
    }
  };

  const handleOtpInputSubmit = () => {
    if (isBusy) return;

    if (otpCode.trim().length !== OTP_CODE_LENGTH) {
      setOtpError(
        t('otpLengthError', `Please enter the ${OTP_CODE_LENGTH}-digit verification code.`)
      );
      return;
    }

    void handleVerifyOtpCode();
  };

  submitActionsRef.current.primary = () => runSubmitAction(handlePrimaryEmailAction);
  submitActionsRef.current.email = () => runSubmitAction(handleEmailInputSubmit);
  submitActionsRef.current.phone = () => runSubmitAction(handlePhoneInputSubmit);
  submitActionsRef.current.otp = () => runSubmitAction(handleOtpInputSubmit);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleWindowEnter = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 'NumpadEnter') return;
      if (event.defaultPrevented) return;

      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (!target.closest('[data-auth-enter-submit="true"]')) return;
      if (target.closest('[data-auth-enter-ignore="true"]')) return;

      event.preventDefault();

      const activeField = activeSubmitFieldRef.current;
      if (activeField) {
        if (activeField === 'email' && acceptActiveEmailSuggestionRef.current()) {
          return;
        }
        submitActionsRef.current[activeField]();
        return;
      }

      submitActionsRef.current.primary();
    };

    window.addEventListener('keydown', handleWindowEnter);
    return () => window.removeEventListener('keydown', handleWindowEnter);
  }, []);

  if (authLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        {/* <AuthBackgroundScene /> */}
        <Text style={styles.loadingText}>{t('checkingAuth', 'Checking authentication...')}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={[styles.layoutShell, isDesktopLayout ? styles.layoutShellDesktop : null]}>
        <View style={[styles.formPane, isDesktopLayout ? styles.formPaneDesktop : null]}>
          <ThemeAndLanguageSwitcher />

          <TouchableOpacity
            style={[styles.backButton, isDesktopLayout ? styles.backButtonDesktop : null]}
            onPress={() => router.push('/home')}
            accessibilityLabel={t('back', 'Go Back')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={28} color={isDark ? '#fff' : '#000'} />
          </TouchableOpacity>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={[
              styles.scrollContent,
              isDesktopLayout ? styles.scrollContentDesktop : null,
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            bounces={false}
          >
            <View style={[styles.content, isDesktopLayout ? styles.contentDesktop : null]}>
              <View style={[styles.authHeaderBlock, isDesktopLayout ? styles.authHeaderBlockDesktop : null]}>
                <Text style={styles.authHeaderTitle}>{t('welcomeHeading', 'Welcome')}</Text>
                <Text style={styles.authHeaderSubtitle}>
                  {t('subtitle', 'Sign in to unlock your digital life.')}
                </Text>
              </View>

              <Animated.View
                style={
                  isDesktopLayout
                    ? {
                      opacity: formCardOpacity,
                      transform: [{ translateY: formCardTranslateY }],
                    }
                    : null
                }
              >
                <View style={[styles.authCard, isDesktopLayout ? styles.authCardDesktop : null]}>
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

            <View style={styles.primaryAuthContainer} dataSet={{ authEnterSubmit: 'true' }}>
              {!isPasswordlessSupported ? (
                <View style={styles.passwordlessInfoCard}>
                  <Ionicons
                    name="information-circle-outline"
                    size={28}
                    color={isDark ? '#f5f5f5' : '#1f2125'}
                  />
                  <Text style={styles.passwordlessInfoTitle}>
                    {t('passwordlessUnavailableTitle', 'Email Link and OTP Unavailable')}
                  </Text>
                  <Text style={styles.passwordlessInfoMessage}>{passwordlessUnavailableMessage}</Text>
                </View>
              ) : isMagicLinkConfirmationVisible ? (
                <View style={styles.magicLinkConfirmationCard}>
                  <Ionicons
                    name="mail-open-outline"
                    size={30}
                    color={isDark ? '#f5f5f5' : '#1f2125'}
                  />
                  <Text style={styles.magicLinkConfirmationTitle}>
                    {t('magicLinkSentTitle', 'Link sent')}
                  </Text>
                  <Text style={styles.magicLinkConfirmationMessage}>
                    {t('magicLinkSentMessage', 'Please check your email to login.')}
                  </Text>
                  <Text style={styles.magicLinkConfirmationEmail}>{email.trim().toLowerCase()}</Text>
                  {magicLinkResendRemainingSeconds > 0 ? (
                    <Text style={styles.magicLinkCountdownText}>
                      {t('magicLinkResendCountdown', { seconds: magicLinkResendRemainingSeconds })}
                    </Text>
                  ) : (
                    <TouchableOpacity
                      style={styles.secondaryActionButton}
                      onPress={() => void handleSendMagicLink()}
                      disabled={isBusy}
                      dataSet={{ authEnterIgnore: 'true' }}
                    >
                      <Text style={styles.secondaryActionText}>
                        {t('magicLinkSendAnother', 'Send another link')}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.magicLinkCloseButton}
                    onPress={resetMagicLinkConfirmation}
                    disabled={isBusy}
                    dataSet={{ authEnterIgnore: 'true' }}
                  >
                    <Text style={styles.magicLinkCloseText}>{t('magicLinkClose', 'Close')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View
                    style={[
                      styles.emailInputContainer,
                      emailError ? styles.emailInputContainerError : null,
                    ]}
                  >
                    <Ionicons
                      name="mail-outline"
                      size={18}
                      color={emailError ? '#F44336' : colors.text.secondary}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      ref={emailInputRef}
                      style={styles.emailInput}
                      value={email}
                      onChangeText={handleEmailInputChange}
                      placeholder={t('emailPlaceholder', 'Enter your email')}
                      placeholderTextColor={colors.text.secondary}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isBusy}
                      onFocus={() => {
                        activeSubmitFieldRef.current = 'email';
                      }}
                      onBlur={() => {
                        if (activeSubmitFieldRef.current === 'email') {
                          activeSubmitFieldRef.current = null;
                        }
                      }}
                      returnKeyType="send"
                      onSubmitEditing={handleEmailSubmitEditing}
                      onKeyPress={handleEmailInputKeyPress}
                    />
                  </View>
                  {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
                  {shouldShowEmailSuggestions ? (
                    <View style={styles.emailSuggestionsContainer}>
                      <View style={styles.emailSuggestionsHeader}>
                        <Text style={styles.emailSuggestionsTitle}>
                          {t('emailAutocompleteTitle', 'Suggestions')}
                        </Text>
                        <TouchableOpacity
                          style={styles.emailSuggestionsCloseButton}
                          onPress={dismissEmailSuggestions}
                          disabled={isBusy}
                          dataSet={{ authEnterIgnore: 'true' }}
                          accessibilityRole="button"
                          accessibilityLabel={t('closeSuggestions', 'Close suggestions')}
                        >
                          <Ionicons name="close" size={16} color={isDark ? '#cfd3de' : '#5f6678'} />
                        </TouchableOpacity>
                      </View>
                      <ScrollView
                        style={styles.emailSuggestionsList}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator
                        dataSet={{ authEnterIgnore: 'true' }}
                      >
                        {emailSuggestions.map((suggestion, index) => (
                          <TouchableOpacity
                            key={suggestion}
                            style={[
                              styles.emailSuggestionItem,
                              index === 0 ? styles.emailSuggestionItemFirst : null,
                              index === activeEmailSuggestionIndex ? styles.emailSuggestionItemActive : null,
                            ]}
                            onPress={() => applyEmailSuggestion(suggestion)}
                            disabled={isBusy}
                            dataSet={{ authEnterIgnore: 'true' }}
                          >
                            <Text style={styles.emailSuggestionText} numberOfLines={1}>
                              {suggestion}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}

                  <View style={styles.methodTabs}>
                    <TouchableOpacity
                      style={[
                        styles.methodTab,
                        emailAuthMethod === 'magic-link' ? styles.methodTabActive : null,
                      ]}
                      onPress={() => {
                        setEmailAuthMethod('magic-link');
                        resetMagicLinkConfirmation();
                        setOtpError('');
                        setPhoneError('');
                        focusEmailInput();
                      }}
                      disabled={isBusy}
                    >
                      <Ionicons
                        name="link-outline"
                        size={16}
                        color={emailAuthMethod === 'magic-link' ? colors.text.primary : colors.text.secondary}
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
                        resetMagicLinkConfirmation();
                        setOtpError('');
                        setPhoneError('');
                        focusEmailInput();
                      }}
                      disabled={isBusy}
                    >
                      <Ionicons
                        name="keypad-outline"
                        size={16}
                        color={emailAuthMethod === 'otp-code' ? colors.text.primary : colors.text.secondary}
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
                        dataSet={{ authEnterIgnore: 'true' }}
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
                              dataSet={{ authEnterIgnore: 'true' }}
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
                                color={colors.text.secondary}
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
                                color={phoneError ? '#F44336' : colors.text.secondary}
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
                                placeholderTextColor={colors.text.secondary}
                                keyboardType="phone-pad"
                                autoCapitalize="none"
                                autoCorrect={false}
                                editable={!isBusy}
                                onFocus={() => {
                                  activeSubmitFieldRef.current = 'phone';
                                }}
                                onBlur={() => {
                                  if (activeSubmitFieldRef.current === 'phone') {
                                    activeSubmitFieldRef.current = null;
                                  }
                                }}
                                returnKeyType="send"
                                onSubmitEditing={() => runSubmitAction(handlePhoneInputSubmit)}
                                onKeyPress={(event) => handleEnterKeyPress(event, handlePhoneInputSubmit)}
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
                      <Text style={styles.otpInputPrompt}>
                        {t('enterOtpCode', 'Enter 6-digit code')}
                      </Text>

                      <TouchableOpacity
                        activeOpacity={0.92}
                        onPress={() => focusOtpInput()}
                        style={styles.otpDigitsWrapper}
                        disabled={isBusy}
                        dataSet={{ authEnterIgnore: 'true' }}
                      >
                        {otpCodeDigits.map((digit, index) => {
                          const isActive =
                            !isBusy &&
                            otpCode.length < OTP_CODE_LENGTH &&
                            index === activeOtpDigitIndex;
                          const isTargetActive = isActive && isOtpInputFocused;

                          return (
                            <View
                              key={OTP_DIGIT_KEYS[index]}
                              style={[
                                styles.otpDigitCell,
                                digit ? styles.otpDigitCellFilled : null,
                                isTargetActive ? styles.otpDigitCellActive : null,
                                otpError ? styles.otpDigitCellError : null,
                              ]}
                            >
                              <Text style={styles.otpDigitText}>{digit || ' '}</Text>
                              <View
                                style={[
                                  styles.otpDigitUnderline,
                                  isTargetActive ? styles.otpDigitUnderlineActive : null,
                                  otpError ? styles.otpDigitUnderlineError : null,
                                ]}
                              />
                            </View>
                          );
                        })}
                      </TouchableOpacity>

                      <TextInput
                        ref={otpInputRef}
                        style={styles.otpHiddenInput}
                        value={otpCode}
                        onChangeText={handleOtpCodeChange}
                        keyboardType="number-pad"
                        maxLength={OTP_CODE_LENGTH}
                        editable={!isBusy}
                        onFocus={() => {
                          activeSubmitFieldRef.current = 'otp';
                          setIsOtpInputFocused(true);
                        }}
                        onBlur={() => {
                          if (activeSubmitFieldRef.current === 'otp') {
                            activeSubmitFieldRef.current = null;
                          }
                          setIsOtpInputFocused(false);
                        }}
                        textContentType="oneTimeCode"
                        autoComplete="one-time-code"
                        returnKeyType="done"
                        onSubmitEditing={() => runSubmitAction(handleOtpInputSubmit)}
                        onKeyPress={(event) => handleEnterKeyPress(event, handleOtpInputSubmit)}
                      />

                      {otpError ? <Text style={styles.errorText}>{otpError}</Text> : null}
                      <Text style={styles.otpResendPrompt}>
                        {t('otpResendPrompt', "Didn't receive the OTP code?")}
                      </Text>
                      {otpResendRemainingSeconds > 0 ? (
                        <Text style={styles.otpResendCountdownText}>
                          {t('otpResendCountdown', { seconds: otpResendRemainingSeconds })}
                        </Text>
                      ) : (
                        <TouchableOpacity
                          style={styles.secondaryActionButton}
                          onPress={() => void handleSendOtpCode()}
                          disabled={isBusy}
                          dataSet={{ authEnterIgnore: 'true' }}
                        >
                          <Text style={styles.secondaryActionText}>{t('otpSendAnother', 'Send again')}</Text>
                        </TouchableOpacity>
                      )}
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
                </>
              )}
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
                  <ActivityIndicator size="small" color={colors.text.primary} />
                ) : (
                  <Ionicons name="logo-google" size={28} color={colors.text.primary} />
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
              </Animated.View>
            </View>
          </ScrollView>
        </View>

        {isDesktopLayout ? (
          <DesktopHeroPanel
            slides={heroSlides}
            isDark={isDark}
            styles={styles}
          />
        ) : null}
      </View>

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
                color={colors.text.secondary}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.countrySearchInput}
                value={countrySearchQuery}
                onChangeText={setCountrySearchQuery}
                placeholder={t('countrySearchPlaceholder', 'Search by country, ISO, or dial code')}
                placeholderTextColor={colors.text.secondary}
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
      backgroundColor: isDark ? '#050507' : '#f3f4f8',
    },
    layoutShell: {
      flex: 1,
      flexDirection: 'column',
    },
    layoutShellDesktop: {
      flexDirection: 'row',
    },
    formPane: {
      flex: 1,
      position: 'relative',
    },
    formPaneDesktop: {
      flex: 1.34,
      minWidth: 620,
      maxWidth: 920,
      borderRightWidth: 1,
      borderRightColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(12,13,18,0.08)',
      backgroundColor: isDark ? '#070709' : '#eef0f5',
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
    backButtonDesktop: {
      top: 26,
      left: 26,
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
    scrollContentDesktop: {
      paddingTop: 82,
      paddingHorizontal: 40,
      paddingBottom: 48,
    },
    content: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      zIndex: 1,
    },
    contentDesktop: {
      justifyContent: 'center',
      alignItems: 'center',
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
    authCardDesktop: {
      maxWidth: 520,
    },
    logoContainer: {
      alignItems: 'center',
      marginBottom: 18,
    },
    logo: {
      width: 302,
      height: 86,
    },
    authHeaderBlock: {
      width: '100%',
      maxWidth: 520,
      marginBottom: 18,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    authHeaderBlockDesktop: {
      marginBottom: 22,
      paddingHorizontal: 12,
    },
    authHeaderTitle: {
      fontSize: 44,
      fontWeight: '800',
      color: isDark ? '#f8f8fb' : '#0f1220',
      textAlign: 'center',
      letterSpacing: -0.8,
    },
    authHeaderSubtitle: {
      marginTop: 8,
      fontSize: 24,
      lineHeight: 30,
      color: isDark ? 'rgba(238,239,247,0.78)' : 'rgba(25,34,56,0.64)',
      textAlign: 'center',
    },
    primaryAuthContainer: {
      width: '100%',
      gap: 12,
    },
    passwordlessInfoCard: {
      width: '100%',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#d9d9de',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f5f6f9',
      paddingHorizontal: 16,
      paddingVertical: 16,
      alignItems: 'center',
      gap: 8,
    },
    passwordlessInfoTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: isDark ? '#fff' : '#131418',
      textAlign: 'center',
    },
    passwordlessInfoMessage: {
      fontSize: 14,
      lineHeight: 20,
      color: isDark ? '#d5d6db' : '#4c4e55',
      textAlign: 'center',
    },
    magicLinkConfirmationCard: {
      width: '100%',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#d9d9de',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f5f6f9',
      paddingHorizontal: 16,
      paddingVertical: 16,
      alignItems: 'center',
      gap: 8,
    },
    magicLinkConfirmationTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: isDark ? '#fff' : '#131418',
      textAlign: 'center',
    },
    magicLinkConfirmationMessage: {
      fontSize: 14,
      lineHeight: 20,
      color: isDark ? '#d5d6db' : '#4c4e55',
      textAlign: 'center',
    },
    magicLinkConfirmationEmail: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#ffffff' : '#17181b',
      textAlign: 'center',
    },
    magicLinkCountdownText: {
      fontSize: 13,
      lineHeight: 18,
      color: isDark ? '#bec0c6' : '#61636a',
      textAlign: 'center',
      marginTop: 2,
    },
    magicLinkCloseButton: {
      marginTop: 6,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.18)' : '#d1d2d8',
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#eceef4',
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    magicLinkCloseText: {
      fontSize: 14,
      fontWeight: '700',
      color: isDark ? '#ffffff' : '#24262b',
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
    emailSuggestionsContainer: {
      width: '100%',
      marginTop: 2,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.14)' : '#d9dbe2',
      backgroundColor: isDark ? '#111521' : '#f8f9fc',
      overflow: 'hidden',
    },
    emailSuggestionsHeader: {
      minHeight: 38,
      paddingLeft: 14,
      paddingRight: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : '#e4e7f0',
      backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#f1f3f8',
    },
    emailSuggestionsTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#aeb4c4' : '#5a6276',
    },
    emailSuggestionsCloseButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emailSuggestionsList: {
      maxHeight: 220,
    },
    emailSuggestionItem: {
      minHeight: 42,
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : '#e4e7f0',
    },
    emailSuggestionItemFirst: {
      borderTopWidth: 0,
    },
    emailSuggestionItemActive: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#eef2fc',
    },
    emailSuggestionText: {
      fontSize: 17,
      fontWeight: '600',
      color: isDark ? '#e9ecf2' : '#2d3240',
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
    otpInputPrompt: {
      fontSize: 13,
      lineHeight: 18,
      color: isDark ? '#d0d1d6' : '#54565d',
      marginLeft: 4,
      marginBottom: 2,
      fontWeight: '500',
    },
    otpDigitsWrapper: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    otpDigitCell: {
      flex: 1,
      height: 52,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.16)' : '#d8d9dd',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f1f4',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
    },
    otpDigitCellFilled: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : '#ececf1',
      borderColor: isDark ? 'rgba(255,255,255,0.28)' : '#c8c9ce',
    },
    otpDigitCellActive: {
      borderColor: '#c81000',
      backgroundColor: isDark ? 'rgba(200,16,0,0.18)' : '#fff2f1',
    },
    otpDigitCellError: {
      borderColor: '#F44336',
    },
    otpDigitText: {
      fontSize: 24,
      fontWeight: '700',
      letterSpacing: 1.4,
      color: isDark ? '#fff' : '#121212',
      textAlign: 'center',
      minWidth: 12,
    },
    otpDigitUnderline: {
      position: 'absolute',
      left: 10,
      right: 10,
      bottom: 8,
      height: 2,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255,255,255,0.24)' : 'rgba(18,18,18,0.14)',
    },
    otpDigitUnderlineActive: {
      height: 3,
      backgroundColor: '#c81000',
    },
    otpDigitUnderlineError: {
      backgroundColor: '#F44336',
    },
    otpHiddenInput: {
      position: 'absolute',
      width: 1,
      height: 1,
      opacity: 0,
      padding: 0,
      margin: 0,
    },
    otpResendPrompt: {
      fontSize: 13,
      lineHeight: 18,
      color: isDark ? '#c7c9ce' : '#5d5f66',
      textAlign: 'center',
      marginTop: 2,
    },
    otpResendCountdownText: {
      fontSize: 13,
      lineHeight: 18,
      color: isDark ? '#bec0c6' : '#61636a',
      textAlign: 'center',
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
    desktopHeroPane: {
      flex: 0.74,
      minWidth: 320,
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: isDark ? '#030910' : '#ffffff',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 34,
    },
    desktopHeroBlob: {
      position: 'absolute',
      borderRadius: 999,
      opacity: 0.58,
    },
    desktopHeroBlobOne: {
      width: 270,
      height: 270,
      top: -60,
      left: -90,
      backgroundColor: isDark ? 'rgba(161,209,214,0.34)' : 'rgba(175,13,1,0.24)',
    },
    desktopHeroBlobTwo: {
      width: 240,
      height: 240,
      top: 92,
      right: -96,
      backgroundColor: isDark ? 'rgba(42,146,196,0.3)' : 'rgba(175,13,1,0.14)',
    },
    desktopHeroBlobThree: {
      width: 252,
      height: 252,
      bottom: -104,
      left: 52,
      backgroundColor: isDark ? 'rgba(28,112,160,0.28)' : 'rgba(210,36,23,0.2)',
    },
    desktopHeroWaveTop: {
      position: 'absolute',
      top: -92,
      left: -150,
      right: -150,
      height: 220,
      borderRadius: 180,
      backgroundColor: isDark ? 'rgba(161,209,214,0.18)' : 'rgba(255,255,255,0.94)',
      transform: [{ rotate: '-8deg' }],
    },
    desktopHeroWaveBottom: {
      position: 'absolute',
      bottom: -118,
      left: -126,
      right: -126,
      height: 246,
      borderRadius: 210,
      backgroundColor: isDark ? 'rgba(2,11,20,0.74)' : 'rgba(175,13,1,0.12)',
      transform: [{ rotate: '6deg' }],
    },
    desktopHeroBody: {
      width: '100%',
      maxWidth: 320,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
      zIndex: 2,
    },
    desktopHeroBadge: {
      width: 72,
      height: 72,
      borderRadius: 36,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(161,209,214,0.42)' : 'rgba(175,13,1,0.32)',
      backgroundColor: isDark ? 'rgba(161,209,214,0.2)' : 'rgba(175,13,1,0.1)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    desktopHeroTitle: {
      fontSize: 34,
      lineHeight: 38,
      fontWeight: '800',
      color: isDark ? '#f3f9ff' : '#111214',
      textAlign: 'center',
      letterSpacing: -0.8,
    },
    desktopHeroDescription: {
      marginTop: 12,
      fontSize: 15,
      lineHeight: 22,
      color: isDark ? 'rgba(220,240,248,0.88)' : 'rgba(17,18,20,0.86)',
      textAlign: 'center',
      maxWidth: 320,
    },
    desktopHeroProgress: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 18,
      gap: 8,
    },
    desktopHeroProgressDotButton: {
      width: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    desktopHeroProgressDot: {
      width: 10,
      height: 10,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(161,209,214,0.42)' : 'rgba(175,13,1,0.24)',
    },
    desktopHeroProgressDotActive: {
      backgroundColor: isDark ? '#a1d1d6' : '#af0d01',
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: colors.textSecondary,
    },
  });
