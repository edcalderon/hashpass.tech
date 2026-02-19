import React, { useState, useEffect, useRef } from 'react';
import { useTranslation, getCurrentLocale } from '../../i18n/i18n';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Platform, Image, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase';
import * as Linking from 'expo-linking';
import ThemeAndLanguageSwitcher from '../../components/ThemeAndLanguageSwitcher';
import { OptimizedSplashCursor } from '../../components/OptimizedSplashCursor';
import { useTheme } from '../../hooks/useTheme';
import { isEthereumWalletAvailable, isSolanaWalletAvailable } from '../../lib/wallet-auth';
import { useToastHelpers } from '../../contexts/ToastContext';
import { getEmailProviderUrl, openEmailProvider } from '../../lib/email-provider';
import PrivacyTermsModal from '../../components/PrivacyTermsModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { memoryManager } from '../../lib/memory-manager';
import { throttle } from '../../lib/performance-utils';
import { clearAuthCache } from '../../lib/version-checker';
import { apiClient } from '../../lib/api-client';
import { CURRENT_VERSION } from '../../config/version';
import VersionStatusIndicator from '../../components/VersionStatusIndicator';

type AuthMethod = 'magiclink' | 'otp';

export default function AuthScreen() {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('auth');
  const router = useRouter();
  const params = useLocalSearchParams();
  const { showError, showSuccess, showWarning } = useToastHelpers();
  
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
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [authMethod, setAuthMethod] = useState<AuthMethod>('magiclink'); // Default to magic link
  const [emailError, setEmailError] = useState('');
  const [ethereumAvailable, setEthereumAvailable] = useState(false);
  const [solanaAvailable, setSolanaAvailable] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<'privacy' | 'terms'>('privacy');
  const [welcomeEmailSending, setWelcomeEmailSending] = useState<Set<string>>(new Set()); // Track users currently sending welcome email
  const [rateLimitCooldown, setRateLimitCooldown] = useState(0); // Countdown timer for rate limit
  const styles = getStyles(isDark, colors);

  // Processing guards to prevent duplicate processing
  const isProcessingRef = useRef(false);
  const hasNavigatedRef = useRef(false);
  const processedUsersRef = useRef<Set<string>>(new Set());
  const subscriptionIdRef = useRef<string | null>(null);

  // Check wallet availability on web and clear auth cache on mount
  useEffect(() => {
    if (Platform.OS === 'web') {
      setEthereumAvailable(isEthereumWalletAvailable());
      setSolanaAvailable(isSolanaWalletAvailable());
      
      // Clear auth cache on mount to prevent stale auth state
      clearAuthCache().catch((error) => {
        console.warn('Failed to clear auth cache:', error);
      });
    }
  }, []);

  // Rate limit countdown timer
  useEffect(() => {
    if (rateLimitCooldown > 0) {
      const timer = setInterval(() => {
        setRateLimitCooldown(prev => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [rateLimitCooldown]);

  // Check for existing session on mount (handles page reload)
  // Skip this check if we're on the callback route to prevent loops
  useEffect(() => {
    const checkExistingSession = async () => {
      // Don't check session if we're on callback route - let callback handle it
      if (typeof window !== 'undefined' && window.location.pathname.includes('/auth/callback')) {
        console.log('⏭️ Skipping session check on callback route');
        return;
      }
      
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user && !hasNavigatedRef.current) {
          // Verify the session token is actually valid before navigating
          const { data: { user }, error } = await supabase.auth.getUser();
          
          if (error || !user || user.id !== session.user.id) {
            console.warn('⚠️ Session invalid on auth screen, clearing');
            await supabase.auth.signOut();
            return;
          }
          
          console.log(`🔐 Found valid existing session on mount for user: ${user.id}`);
          // Navigate immediately if user is already authenticated with valid session
          hasNavigatedRef.current = true;
          router.replace(getRedirectPath() as any);
        }
      } catch (error) {
        console.warn('⚠️ Error checking existing session:', error);
      }
    };
    
    checkExistingSession();
  }, [router]);

  useEffect(() => {
    // Throttled auth change handler (reduced throttle for faster response)
    const throttledHandleAuthChange = throttle(async (event: AuthChangeEvent, session: Session | null) => {
      // Don't handle auth changes if we're on callback route - let callback handle it
      if (typeof window !== 'undefined' && window.location.pathname.includes('/auth/callback')) {
        console.log('⏭️ Skipping auth change handler on callback route');
        return;
      }
      
      // Prevent duplicate processing
      if (isProcessingRef.current || hasNavigatedRef.current) {
        console.log('⏭️ Auth change already processing or navigated, skipping');
        return;
      }

      console.log(`🔐 Auth event: ${event}, user: ${session?.user?.id || 'none'}`);
      
      if (session?.user) {
        const userId = session.user.id;
        
        // Skip if already processed this user (but allow on reload by checking if we've navigated)
        if (processedUsersRef.current.has(userId) && hasNavigatedRef.current) {
          console.log(`⏭️ User ${userId} already processed and navigated, skipping`);
          return;
        }

        // Handle SIGNED_IN, INITIAL_SESSION, or TOKEN_REFRESHED events
        // INITIAL_SESSION fires on page reload when user is already authenticated
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || (event === 'TOKEN_REFRESHED' && !hasNavigatedRef.current)) {
          // For SIGNED_IN events (OAuth, magic link, wallet), trust the session immediately
          // Only verify for INITIAL_SESSION (page reload) to catch stale sessions
          if (event === 'INITIAL_SESSION') {
            // Verify session is actually valid before proceeding (only for reloads)
            try {
              const { data: { user: verifiedUser }, error: verifyError } = await supabase.auth.getUser();
              
              if (verifyError || !verifiedUser || verifiedUser.id !== session.user.id) {
                console.warn('⚠️ Session invalid during INITIAL_SESSION, clearing');
                await supabase.auth.signOut();
                isProcessingRef.current = false;
                return;
              }
            } catch (verifyErr) {
              // If verification fails on INITIAL_SESSION, still allow it (might be network issue)
              console.warn('⚠️ Session verification failed on INITIAL_SESSION, but allowing:', verifyErr);
            }
          }
          
          // For SIGNED_IN events, trust the session and proceed immediately
          // Don't block on verification - the session from Supabase is valid
          isProcessingRef.current = true;
          processedUsersRef.current.add(userId);
          console.log(`🔐 ${event} event for user: ${session.user.id}, email: ${session.user.email}`);
          
          // For INITIAL_SESSION (reload), skip pass creation and email sending - just navigate
          if (event === 'INITIAL_SESSION') {
            console.log('🔄 INITIAL_SESSION detected - user already authenticated, navigating to dashboard');
            if (!hasNavigatedRef.current) {
              hasNavigatedRef.current = true;
              router.replace(getRedirectPath() as any);
            }
            isProcessingRef.current = false;
            return;
          }
          
          try {
            console.log('🎫 Creating default pass for user:', session.user.id);
            const { data: passId, error } = await supabase
              .rpc('create_default_pass', {
                p_user_id: session.user.id,
                p_pass_type: 'general'
              } as any);
              
            if (error) {
              console.error('❌ Error creating default pass:', error);
              // Continue to dashboard even if pass creation fails
              if (!hasNavigatedRef.current) {
                hasNavigatedRef.current = true;
              router.replace(getRedirectPath() as any);
              }
            } else if (passId) {
              console.log('✅ Default pass created successfully:', passId);
              // Navigate immediately, don't wait
              if (!hasNavigatedRef.current) {
                hasNavigatedRef.current = true;
              router.replace(getRedirectPath() as any);
              }
            } else {
              console.warn('⚠️ Pass creation returned null - pass may already exist or creation failed silently');
              // Check if pass already exists
              const { data: existingPass } = await supabase
                .from('passes')
                .select('id')
                .eq('user_id', session.user.id)
                .eq('event_id', 'bsl2025')
                .eq('status', 'active')
                .limit(1)
                .maybeSingle() as any;
              
              if (existingPass) {
                console.log('✅ User already has an active pass:', existingPass.id);
              } else {
                console.warn('⚠️ No pass found - user may need to create one manually');
              }
              if (!hasNavigatedRef.current) {
                hasNavigatedRef.current = true;
              router.replace(getRedirectPath() as any);
              }
            }

            // Send welcome email asynchronously (don't block navigation)
            // This runs in the background and doesn't delay user experience
            const userEmail = session.user.email;
            if (userEmail && !userEmail.includes('@wallet.')) {
              const userId = session.user.id;
              
              // Check if welcome email has already been sent using database flag
              (async () => {
                try {
                  // Check if welcome email has already been sent using RPC function
                  const { data: emailCheck, error: emailCheckError } = await supabase.rpc('has_email_been_sent', {
                    p_user_id: userId,
                    p_email_type: 'welcome'
                  } as any);
                  
                  if (emailCheckError) {
                    console.warn('⚠️ Error checking email tracking:', emailCheckError);
                    // Continue to try sending if check fails (better to send than miss)
                  }
                  
                  const alreadySent = emailCheck === true;
                  
                  if (alreadySent) {
                    console.log(`ℹ️ Welcome email already sent to user ${userId}, skipping`);
                    return;
                  }
                  
                  if (welcomeEmailSending.has(userId)) {
                    console.log(`⏭️ Welcome email already being sent for user ${userId}, skipping duplicate`);
                    return;
                  }
                  
                  // Mark as sending to prevent duplicates
                  setWelcomeEmailSending(prev => new Set(prev).add(userId));
                  
                  // Send email in background - don't await, let it run async
                  // NOTE: We rely on the API endpoint to check if email was already sent
                  // The API has proper permissions (service_role) to check the database
                  // Get locale
                  let userLocale = 'en';
                  try {
                    const savedLocale = await AsyncStorage.getItem('user_locale');
                    if (savedLocale && ['en', 'es', 'ko', 'fr', 'pt', 'de'].includes(savedLocale)) {
                      userLocale = savedLocale;
                    } else {
                      userLocale = getCurrentLocale() || 'en';
                    }
                  } catch {
                    userLocale = getCurrentLocale() || 'en';
                  }
                  
                  if (!userLocale || userLocale === 'en') {
                    userLocale = session.user.user_metadata?.locale || userLocale || 'en';
                  }
                  
                  // Update locale if needed (non-blocking)
                  if (session.user.user_metadata?.locale !== userLocale) {
                    supabase.auth.updateUser({
                      data: { locale: userLocale }
                    }).catch(err => console.warn('⚠️ Could not update user metadata with locale:', err));
                  }
                  
                  // Send welcome email
                  // The API endpoint will check if email was already sent (with message_id) and skip if so
                  apiClient.post('/auth/send-welcome-email', { userId, email: userEmail, locale: userLocale }, { skipEventSegment: true })
                    .then(result => {
                      if (result.success && result.data) {
                        if (result.data.alreadySent) {
                          console.log(`ℹ️ Welcome email already sent to user ${userId}, skipping`);
                          // Don't send onboarding emails if welcome email was already sent
                          return;
                        }
                        
                        if (result.data.skipped) {
                          console.log(`ℹ️ Welcome email skipped for user ${userId} (wallet address or other reason)`);
                          return;
                        }
                        
                        console.log('✅ Welcome email sent successfully');
                        
                        // After welcome email is sent, send onboarding emails
                        // This includes user onboarding for all users and speaker onboarding if user is a speaker
                        // Only send if welcome email was actually sent (not skipped or already sent)
                        apiClient.post('/auth/send-onboarding-emails', { userId, email: userEmail, locale: userLocale }, { skipEventSegment: true })
                          .then(onboardingResult => {
                            if (onboardingResult.success && onboardingResult.data) {
                              if (onboardingResult.data.results?.userOnboarding?.success && !onboardingResult.data.results.userOnboarding.alreadySent) {
                                console.log('✅ User onboarding email sent successfully');
                              } else if (onboardingResult.data.results?.userOnboarding?.alreadySent) {
                                console.log('ℹ️ User onboarding email already sent, skipped');
                              }
                              if (onboardingResult.data.results?.speakerOnboarding?.isSpeaker) {
                                if (onboardingResult.data.results.speakerOnboarding.success && !onboardingResult.data.results.speakerOnboarding.alreadySent) {
                                  console.log('✅ Speaker onboarding email sent successfully');
                                } else if (onboardingResult.data.results.speakerOnboarding.alreadySent) {
                                  console.log('ℹ️ Speaker onboarding email already sent, skipped');
                                }
                              }
                            }
                          })
                          .catch(err => console.error('❌ Error sending onboarding emails:', err));
                      } else {
                        console.warn('⚠️ Welcome email API returned unsuccessful result:', result);
                      }
                    })
                    .catch(err => console.error('❌ Error sending welcome email:', err));
                } catch (emailError) {
                  console.error('❌ Error in welcome email flow:', emailError);
                } finally {
                  setWelcomeEmailSending(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(userId);
                    return newSet;
                  });
                }
              })();
            }
          } catch (error) {
            console.error('❌ Error in pass creation:', error);
            // Continue to dashboard even if pass creation fails
            if (!hasNavigatedRef.current) {
              hasNavigatedRef.current = true;
            router.replace(getRedirectPath() as any);
            }
          } finally {
            isProcessingRef.current = false;
          }
        } else {
          if (!hasNavigatedRef.current) {
            hasNavigatedRef.current = true;
          router.replace(getRedirectPath() as any);
        }
      }
      }
    }, 300); // Throttle to max once per 300ms for faster auth processing

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      throttledHandleAuthChange(event, session);
    });

    // Register with memory manager for cleanup
    const subscriptionId = `auth-screen-${Date.now()}`;
    subscriptionIdRef.current = subscriptionId;
    memoryManager.registerSubscription(subscriptionId, () => {
      subscription.unsubscribe();
    });

    return () => {
      if (subscriptionIdRef.current) {
        memoryManager.unregisterSubscription(subscriptionIdRef.current);
        subscriptionIdRef.current = null;
      }
      subscription.unsubscribe();
      isProcessingRef.current = false;
      hasNavigatedRef.current = false;
    };
  }, [router]);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const sendMagicLinkOrOTP = async () => {
    if (!email) {
      setEmailError('Email required');
      return;
    }

    if (!validateEmail(email)) {
      setEmailError('Please provide a valid email');
      return;
    }

    setEmailError('');
    setLoading(true);
    try {
      // Construct redirect URL - handle production properly
      let redirectTo = '';
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined' && window.location) {
          // Use the actual origin for production
          // In Expo Router, (shared) group is removed from URL, so path is /auth/callback
          const origin = window.location.origin;
          // Include returnTo parameter if it exists
          const returnToParam = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
          redirectTo = `${origin}/auth/callback${returnToParam}`;
        } else {
          // Fallback for SSR
          redirectTo = Linking.createURL('/(shared)/auth/callback');
        }
      } else {
        // For mobile, use deep linking (keeps Expo Router format)
        redirectTo = Linking.createURL('/(shared)/auth/callback');
      }

      if (authMethod === 'otp') {
        // For OTP, use our custom API endpoint that sends the actual code
        try {
          const result = await apiClient.post('/auth/otp', { email: email.trim() }, { skipEventSegment: true });

          if (!result.success) {
            // Handle rate limit errors specifically
            if (result.error?.includes('rate limit') || 
                result.error?.includes('Too many emails') ||
                result.error?.includes('over_email_send_rate_limit')) {
              // Parse the wait time from the error message
              const timeMatch = result.error.match(/(\d+)\s*(second|minute|hour)/i);
              let waitSeconds = 60; // Default to 60 seconds
              let errorMsg = 'Too many emails sent. Please wait a few minutes before requesting another code.';
              
              if (timeMatch) {
                const timeValue = parseInt(timeMatch[1], 10);
                const timeUnit = timeMatch[2].toLowerCase();
                
                if (timeUnit.includes('second')) {
                  waitSeconds = timeValue;
                } else if (timeUnit.includes('minute')) {
                  waitSeconds = timeValue * 60;
                } else if (timeUnit.includes('hour')) {
                  waitSeconds = timeValue * 3600;
                }
                
                const timeDisplay = timeValue === 1 
                  ? `1 ${timeUnit.slice(0, -1)}` 
                  : `${timeValue} ${timeUnit}`;
                errorMsg = `Too many requests. Please wait ${timeDisplay} before requesting another code.`;
              }
              
              // Set the cooldown timer
              setRateLimitCooldown(waitSeconds);
              throw new Error(errorMsg);
            }
            throw new Error(result.error || 'Failed to send OTP code');
          }

          setOtpSent(true);
          setRateLimitCooldown(0); // Clear any rate limit cooldown on success
          
          // Get email provider to add a link in the toast
          const emailProvider = getEmailProviderUrl(email.trim());
          const providerName = emailProvider?.name || 'your email';
          
          showSuccess(
            'Code Sent',
            `Please check ${providerName} for the 6-digit verification code.`,
            10000, // 10 seconds duration
            emailProvider ? {
              label: `Open ${emailProvider.name}`,
              onPress: async () => await openEmailProvider(email.trim()),
            } : undefined
          );
          setLoading(false);
          return;
        } catch (apiError: any) {
          console.error('OTP API error:', apiError);
          // Don't fallback to Supabase's method as it may send a magic link instead of OTP
          // Show a clear error message to the user
          let errorTitle = 'Failed to Send Code';
          let errorMessage = apiError?.message || 'Failed to send OTP code';
          
          // Handle rate limit errors specifically
          if (errorMessage.includes('rate limit') || 
              errorMessage.includes('Too many emails') ||
              apiError?.code === 'over_email_send_rate_limit') {
            errorTitle = 'Rate Limit Exceeded';
            errorMessage = 'Too many emails sent. Please wait a few minutes before requesting another code.';
          }
          
          showError(
            errorTitle,
            errorMessage + (errorMessage.includes('rate limit') ? '' : '. Please try again or contact support if the problem persists.')
          );
          setLoading(false);
          return;
        }
      } else {
        // For Magic Link, include the redirect URL
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: redirectTo,
          },
        });

        if (error) {
          // Handle rate limit errors specifically
          let errorTitle = 'Authentication Error';
          let errorMessage = error.message;
          let waitSeconds = 0;
          
          if (error.message?.includes('rate limit') || 
              error.message?.includes('over_email_send_rate_limit') ||
              error.code === 'over_email_send_rate_limit') {
            errorTitle = 'Rate Limit Exceeded';
            
            // Parse the wait time from the error message
            // Example: "For security purposes, you can only request this after 12 seconds."
            const timeMatch = error.message.match(/(\d+)\s*(second|minute|hour)/i);
            if (timeMatch) {
              const timeValue = parseInt(timeMatch[1], 10);
              const timeUnit = timeMatch[2].toLowerCase();
              
              if (timeUnit.includes('second')) {
                waitSeconds = timeValue;
              } else if (timeUnit.includes('minute')) {
                waitSeconds = timeValue * 60;
              } else if (timeUnit.includes('hour')) {
                waitSeconds = timeValue * 3600;
              }
              
              // Set the cooldown timer
              if (waitSeconds > 0) {
                setRateLimitCooldown(waitSeconds);
              }
              
              const timeDisplay = timeValue === 1 
                ? `1 ${timeUnit.slice(0, -1)}` 
                : `${timeValue} ${timeUnit}`;
              errorMessage = `Too many requests. Please wait ${timeDisplay} before requesting another magic link.`;
            } else {
              // Fallback if we can't parse the time
              errorMessage = 'Too many emails sent. Please wait a few minutes before requesting another magic link.';
              setRateLimitCooldown(60); // Default to 60 seconds
            }
          }
          
          showError(errorTitle, errorMessage);
          setLoading(false);
          return;
        }

        // Get email provider to add a link in the toast
        const emailProvider = getEmailProviderUrl(email.trim());
        const providerName = emailProvider?.name || 'your email';
        
        // Always show a button to open email app, even if provider is not detected
        const emailAction = {
          label: emailProvider ? `Open ${emailProvider.name}` : 'Open Email App',
          onPress: async () => await openEmailProvider(email.trim()),
        };
        
        setRateLimitCooldown(0); // Clear any rate limit cooldown on success
        
        showSuccess(
          'Magic Link Sent',
          `Please check ${providerName} and click the link to sign in.`,
          10000, // 10 seconds duration
          emailAction
        );
      }
      setLoading(false);
    } catch (error: any) {
      showError('Error', error.message || 'Failed to send authentication email.');
      setLoading(false);
    }
  };

  // Helper function to verify session establishment with retries
  // More lenient - accepts session if getSession() succeeds, even if getUser() fails temporarily
  const verifySessionWithRetries = async (maxRetries: number = 3, delayMs: number = 500): Promise<Session> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`🔄 Verifying session establishment (attempt ${attempt}/${maxRetries})...`);
      
      // Wait before checking (longer delay on first attempt)
      const waitTime = attempt === 1 ? delayMs : delayMs * attempt;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // First check if session exists
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (session && !sessionError && session.user) {
        // Session exists and has user - this is sufficient
        // Try to verify with getUser, but don't fail if it errors (might be temporary network issue)
        try {
          const { data: { user }, error: userError } = await supabase.auth.getUser();
          if (user && !userError && user.id === session.user.id) {
            console.log(`✅ Session established and verified successfully on attempt ${attempt}`);
            return session;
          } else if (userError) {
            // getUser failed, but session exists - accept it anyway (might be temporary)
            console.log(`⚠️ getUser failed but session exists, accepting session (attempt ${attempt})`);
            console.log(`⚠️ getUser error:`, userError.message);
            return session;
          }
        } catch (getUserError: any) {
          // getUser threw an error, but session exists - accept it anyway
          console.log(`⚠️ getUser exception but session exists, accepting session (attempt ${attempt})`);
          console.log(`⚠️ getUser exception:`, getUserError?.message);
          return session;
        }
        
        // If we get here, session exists but user doesn't match - this is unusual but accept session
        console.log(`⚠️ Session user mismatch but accepting session (attempt ${attempt})`);
        return session;
      } else {
        if (attempt < maxRetries) {
          console.log(`⚠️ Session not yet established, retrying in ${waitTime}ms... (${attempt}/${maxRetries})`);
        }
      }
    }
    
    // Last attempt - check one more time and be more lenient
    const { data: { session: finalSession }, error: finalError } = await supabase.auth.getSession();
    if (finalSession && finalSession.user && !finalError) {
      console.log(`✅ Found session on final attempt, accepting it`);
      return finalSession;
    }
    
    throw new Error('Session not established after multiple verification attempts');
  };

  const verifyOTP = async () => {
    if (!otpCode || otpCode.length !== 6) {
      showError('Invalid Code', 'Please enter the 6-digit code from your email.');
      return;
    }

    setLoading(true);
    const maxVerificationAttempts = 3;

    try {
      // Use our custom API endpoint first since we're using custom 6-digit codes
      // This avoids the race condition where Supabase's direct verification fails
      // because it doesn't recognize our custom codes
      let verifyResult;
      let apiError: any = null;

      // Retry API call with exponential backoff
      for (let attempt = 1; attempt <= maxVerificationAttempts; attempt++) {
        try {
          verifyResult = await apiClient.post('/auth/otp/verify', { 
            email: email.trim(), 
            code: otpCode 
          }, { skipEventSegment: true });

          if (verifyResult.success) {
            break;
          } else {
            apiError = new Error(verifyResult.error || 'Verification failed');
            if (attempt < maxVerificationAttempts) {
              const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
              console.log(`⚠️ API verification failed, retrying in ${delay}ms... (attempt ${attempt}/${maxVerificationAttempts})`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
            throw apiError;
          }
        } catch (networkError: any) {
          apiError = networkError;
          if (attempt < maxVerificationAttempts) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
            console.log(`⚠️ Network error during verification, retrying in ${delay}ms... (attempt ${attempt}/${maxVerificationAttempts})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new Error(networkError?.message || 'Network error. Please check your connection and try again.');
        }
      }

      if (!verifyResult || !verifyResult.success) {
        throw apiError || new Error('Verification failed after multiple attempts');
      }

      if (!verifyResult.data?.token_hash) {
        throw new Error('No token_hash received from verification');
      }

      // Verify the token_hash using client-side Supabase with retry logic
      let session: Session | null = null;
      let verifyError: any = null;

      // Try multiple OTP types and retry attempts
      const otpTypes = ['magiclink', 'email'] as const;
      
      for (const otpType of otpTypes) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            console.log(`🔄 Verifying OTP with type '${otpType}' (attempt ${attempt}/2)...`);
            
            const { data: verifyResultData, error: verifyErr } = await supabase.auth.verifyOtp({
              token_hash: verifyResult.data.token_hash,
              type: otpType,
            });

            if (!verifyErr && verifyResultData?.session) {
              session = verifyResultData.session;
              console.log(`✅ OTP verified successfully with type '${otpType}'`);
              break;
            } else if (verifyErr) {
              verifyError = verifyErr;
              console.warn(`⚠️ OTP verification failed with type '${otpType}':`, verifyErr.message);
              
              // If it's a network error, retry with delay
              if (verifyErr.message?.includes('network') || verifyErr.message?.includes('fetch')) {
                if (attempt < 2) {
                  const delay = 1000 * attempt;
                  console.log(`⏳ Retrying after ${delay}ms due to network issue...`);
                  await new Promise(resolve => setTimeout(resolve, delay));
                  continue;
                }
              }
            }
          } catch (err: any) {
            verifyError = err;
            console.error(`❌ Error verifying OTP with type '${otpType}':`, err);
            if (attempt < 2) {
              const delay = 1000 * attempt;
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          }
        }

        if (session) {
          break;
        }
      }

      if (!session) {
        // Provide more specific error message
        const errorMsg = verifyError?.message || 'Session could not be established';
        if (errorMsg.includes('expired') || errorMsg.includes('invalid')) {
          throw new Error('This code has expired or is invalid. Please request a new code.');
        } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
          throw new Error('Network error. Please check your connection and try again.');
        } else {
          throw new Error(`Verification failed: ${errorMsg}`);
        }
      }

      // Use the robust session verification helper with retries
      console.log('✅ OTP verified, verifying session establishment...');
      
      try {
        // Use the existing retry helper with more attempts for OTP flow
        const verifiedSession = await verifySessionWithRetries(5, 800);
        
        if (!verifiedSession) {
          throw new Error('Session verification failed after multiple attempts');
        }

        // Final validation - ensure session is still valid
        const { data: { session: finalSessionCheck }, error: finalError } = await supabase.auth.getSession();
        if (finalError || !finalSessionCheck) {
          console.warn('⚠️ Final session check failed, but session was verified earlier');
          // Don't fail here - session was already verified by the helper
        }

        // Mark as navigated to prevent auth state change handler from also navigating
        hasNavigatedRef.current = true;
        setLoading(false);
        
        console.log('✅ Session fully established, navigating...');
        console.log('📍 Redirect path:', getRedirectPath());
        
        // Small delay to ensure auth state change has time to process
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Navigate after session is confirmed
        router.replace(getRedirectPath() as any);
        
        // Also trigger a manual session check to ensure auth state change is processed
        setTimeout(async () => {
          try {
            const { data: { session: checkSession } } = await supabase.auth.getSession();
            console.log('🔍 Post-navigation session check:', checkSession?.user?.id || 'no session');
          } catch (e) {
            console.warn('⚠️ Post-navigation session check failed:', e);
          }
        }, 500);
        
        return;
      } catch (sessionError: any) {
        console.error('❌ Session verification error:', sessionError);
        
        // Try one more time with a fresh session check
        try {
          console.log('🔄 Attempting final session recovery...');
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          const { data: { session: recoverySession }, error: recoveryError } = await supabase.auth.getSession();
          const { data: { user: recoveryUser } } = await supabase.auth.getUser();
          
          if (recoverySession && recoveryUser && !recoveryError) {
            console.log('✅ Session recovered successfully');
            hasNavigatedRef.current = true;
            setLoading(false);
            console.log('📍 Recovery redirect path:', getRedirectPath());
            
            // Small delay to ensure auth state change has time to process
            await new Promise(resolve => setTimeout(resolve, 100));
            
            router.replace(getRedirectPath() as any);
            
            // Also trigger a manual session check to ensure auth state change is processed
            setTimeout(async () => {
              try {
                const { data: { session: checkSession } } = await supabase.auth.getSession();
                console.log('🔍 Post-recovery session check:', checkSession?.user?.id || 'no session');
              } catch (e) {
                console.warn('⚠️ Post-recovery session check failed:', e);
              }
            }, 500);
            
            return;
          }
        } catch (recoveryError: any) {
          console.error('❌ Session recovery failed:', recoveryError);
        }
        
        setLoading(false);
        
        // Provide more helpful error message
        const errorMessage = sessionError?.message || 'Session could not be established';
        if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
          showError(
            'Connection Error', 
            'Unable to establish session due to network issues. Please check your internet connection and try again.'
          );
        } else {
          showError(
            'Session Error', 
            'Session could not be established. This may be due to network latency. Please try again, or request a new code if the problem persists.'
          );
        }
        return;
      }
    } catch (error: any) {
      console.error('❌ OTP verification error:', error);
      setLoading(false);
      
      // Provide more specific error messages
      const errorMessage = error?.message || 'Verification failed';
      
      if (errorMessage.includes('expired') || errorMessage.includes('Invalid verification code')) {
        showError('Code Expired', 'This code has expired or is invalid. Please request a new code.');
      } else if (errorMessage.includes('already been used')) {
        showError('Code Used', 'This code has already been used. Please request a new code.');
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('Connection')) {
        showError('Connection Error', 'Unable to verify code due to network issues. Please check your internet connection and try again.');
      } else {
        showError('Verification Failed', errorMessage || 'Invalid code. Please try again or request a new code.');
      }
    }
  };

  const signInWithOAuth = async (provider: 'google' | 'discord') => {
    setLoading(true);
    try {
      // Build proper redirect URL for OAuth
      let redirectUrl = '';
      
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // Simplified: Use current origin directly, avoid complex detection
        const origin = window.location.origin;
        
        // Basic validation - ensure we have a valid origin
        if (!origin || origin === 'null' || origin === 'undefined') {
          throw new Error('Invalid origin detected. Cannot proceed with OAuth.');
        }
        
        console.log('🔍 OAuth using origin:', origin);
        
        // Simple redirect URL - no complex logic that could cause mismatches
        redirectUrl = `${origin}/auth/callback`;
        
        // Validate the URL is properly formed
        try {
          new URL(redirectUrl);
        } catch (e) {
          console.error('❌ Invalid redirect URL constructed:', redirectUrl);
          throw new Error(`Invalid redirect URL: ${redirectUrl}`);
        }
      } else {
        // For mobile, use Linking.createURL (keeps Expo Router format)
        redirectUrl = Linking.createURL('/(shared)/auth/callback');
      }
      
      // CRITICAL: Supabase validates redirect_to against allowed URLs WITHOUT query parameters
      // So we must send ONLY the base URL (no query params) in redirect_to
      // Query parameters (apikey, returnTo) will be added by Supabase or handled in callback
      
      // Store apikey separately for callback handler (if needed)
      const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_KEY;
      if (supabaseAnonKey && Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        try {
          // Store apikey in localStorage so callback can use it if needed
          window.localStorage.setItem('supabase_anon_key', supabaseAnonKey);
        } catch (e) {
          console.warn('⚠️ Could not store apikey in localStorage:', e);
        }
      }
      
      // Final validation of the redirect URL (base URL only, no query params)
      let redirectUrlObj: URL;
      try {
        redirectUrlObj = new URL(redirectUrl);
        console.log(`🔐 Starting ${provider} OAuth flow`);
        console.log('📍 Redirect URL (base, no query params):', redirectUrl);
        console.log('📍 Redirect URL parsed:', {
          protocol: redirectUrlObj.protocol,
          host: redirectUrlObj.host,
          pathname: redirectUrlObj.pathname,
          origin: redirectUrlObj.origin
        });
        console.log('📍 Current origin:', Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : 'N/A');
        console.log('📍 Apikey stored separately for callback');
      } catch (e) {
        console.error('❌ Failed to parse redirect URL:', redirectUrl, e);
        throw new Error(`Invalid redirect URL format: ${redirectUrl}`);
      }
      
      // CRITICAL: Use ONLY the base URL (no query params) for redirect_to
      // This ensures Supabase validation passes against allowed Redirect URLs
      // Query parameters can be added by Supabase or handled in the callback
      const finalRedirectUrl = redirectUrlObj.origin + redirectUrlObj.pathname;
      console.log('✅ Final redirect URL (base only for Supabase validation):', finalRedirectUrl);
      console.log('💡 Query parameters (apikey, returnTo) will be handled separately');
      
      // Verify the redirect URL matches allowed patterns
      const allowedPatterns = [
        'https://bsl2025.hashpass.tech/auth/callback',
        'http://localhost:8081/auth/callback',
        'https://bsl2025.hashpass.tech/**',
        'http://localhost:8081/**',
      ];
      const matchesAllowed = allowedPatterns.some(pattern => {
        if (pattern.endsWith('/**')) {
          const base = pattern.replace('/**', '');
          return finalRedirectUrl.startsWith(base);
        }
        return finalRedirectUrl === pattern;
      });
      console.log('🔍 Redirect URL validation:', {
        url: finalRedirectUrl,
        matchesAllowed,
        allowedPatterns,
      });
      
      if (!matchesAllowed) {
        console.warn('⚠️ Redirect URL may not match Supabase allowed URLs:', finalRedirectUrl);
        console.warn('⚠️ Please verify this URL is in Supabase Dashboard → Authentication → Redirect URLs');
      }
      
      // Store the origin in localStorage so the callback handler can use it if Supabase redirects incorrectly
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        try {
          window.localStorage.setItem('oauth_redirect_origin', redirectUrlObj.origin);
          console.log('💾 Stored OAuth redirect origin:', redirectUrlObj.origin);
        } catch (e) {
          console.warn('⚠️ Could not store OAuth redirect origin:', e);
        }
      }
      
      // Use Supabase's built-in redirect handling to avoid URI mismatches
      // CRITICAL: Use finalRedirectUrl (base only) instead of redirectUrl to ensure validation passes
      console.log('🚀 Calling Supabase signInWithOAuth with redirectTo:', finalRedirectUrl);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: finalRedirectUrl, // Use finalRedirectUrl (base only) for validation
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      
      if (data?.url) {
        // Log the OAuth URL to verify redirect_to is included
        const oauthUrl = new URL(data.url);
        const redirectToParam = oauthUrl.searchParams.get('redirect_to');
        console.log('📋 OAuth URL from Supabase:', {
          base: oauthUrl.origin + oauthUrl.pathname,
          hasRedirectTo: !!redirectToParam,
          redirectTo: redirectToParam ? redirectToParam.substring(0, 100) : 'NOT FOUND',
          fullUrl: data.url.substring(0, 200),
        });
        
        if (!redirectToParam) {
          console.error('❌ CRITICAL: redirect_to parameter is missing from OAuth URL!');
          console.error('❌ Supabase will use site_url as fallback, which may cause incorrect redirects');
        } else if (redirectToParam !== finalRedirectUrl) {
          console.warn('⚠️ redirect_to in OAuth URL does not match what we sent:', {
            sent: finalRedirectUrl,
            received: redirectToParam,
          });
        } else {
          console.log('✅ redirect_to parameter correctly included in OAuth URL');
        }
      }

      if (error) {
        console.error(`❌ ${provider} OAuth error:`, error);
        showError('Authentication Error', error.message);
        setLoading(false);
        return;
      }
      
      if (data.url) {
        console.log(`✅ Got OAuth URL from Supabase:`, data.url.substring(0, 200));
        // Open the OAuth URL directly - trust Supabase's redirect handling
        Linking.openURL(data.url);
        // Keep loading state - will be cleared by callback handler
      } else {
        console.warn(`⚠️ No URL returned from ${provider} OAuth`);
        setLoading(false);
        showError('OAuth Error', 'Failed to start authentication. Please try again.');
      }
    } catch (error: any) {
      console.error(`❌ ${provider} OAuth exception:`, error);
      showError('Error', error.message);
      setLoading(false);
    }
  };

  const signInWithEthereum = async () => {
    setLoading(true);
    try {
      const { authenticateWithEthereum } = await import('../../lib/wallet-auth');
      const authData = await authenticateWithEthereum();
      
      if (authData.tokenHash) {
        const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: authData.tokenHash,
          type: 'magiclink'
        });
        
        if (!verifyError && verifyData?.session) {
          // Wait a moment for session to be set
          await new Promise(resolve => setTimeout(resolve, 300));
          setLoading(false);
          showSuccess('Authentication Successful', 'Welcome! You have been signed in with your Ethereum wallet.');
          // Navigate - auth state change will handle session verification
          router.replace(getRedirectPath() as any);
          return;
        }
      }
      
      if (authData.magicLink || authData.redirectUrl) {
        const linkToUse = authData.magicLink || authData.redirectUrl;
        
        if (!linkToUse) {
          setLoading(false);
          throw new Error('No authentication link available');
        }
        
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          try {
            const url = new URL(linkToUse);
            const token = url.searchParams.get('token_hash') || url.searchParams.get('token');
            
            if (token) {
              const { data: retryData, error: retryError } = await supabase.auth.verifyOtp({
                token_hash: token,
                type: 'magiclink'
              });
              
              if (!retryError && retryData?.session) {
                // Wait a moment for session to be set
                await new Promise(resolve => setTimeout(resolve, 300));
                setLoading(false);
                showSuccess('Authentication Successful', 'Welcome! You have been signed in with your Ethereum wallet.');
                // Navigate - auth state change will handle session verification
                router.replace(getRedirectPath() as any);
                return;
              }
            }
            
            setLoading(false);
            window.location.href = linkToUse;
            return;
          } catch (urlError) {
            console.error('❌ Error processing magic link:', urlError);
            setLoading(false);
            throw urlError;
          }
        } else {
          setLoading(false);
          Linking.openURL(linkToUse);
          return;
        }
      }
      
      // Check for session with retry (wallet auth might need time)
      let sessionFound = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          sessionFound = true;
          setLoading(false);
          showSuccess('Authentication Successful', 'Welcome! You have been signed in with your Ethereum wallet.');
          router.replace(getRedirectPath() as any);
          return;
        }
      }
      
      if (!sessionFound) {
        setLoading(false);
        // Don't throw error - let auth state change handler process it
        console.warn('⚠️ Session not immediately available, but auth state change will handle it');
        // Still show success - the callback or auth state change will handle navigation
        showSuccess('Authentication Successful', 'Welcome! You have been signed in with your Ethereum wallet.');
      }
    } catch (error: any) {
      console.error('❌ Ethereum auth error:', error);
      setLoading(false);
      
      const errorMessage = error.message || 'Failed to authenticate with Ethereum wallet';
      
      if (errorMessage.includes('Too many authentication attempts')) {
        showError('Rate Limit Exceeded', 'Please wait a few minutes before trying again.');
      } else if (errorMessage.includes('timed out') || errorMessage.includes('check if MetaMask popup')) {
        showWarning('MetaMask Popup Not Appearing', 'Please check your MetaMask extension - the popup may be hidden.');
      } else if (errorMessage.includes('rejected')) {
        showWarning('Request Rejected', 'You rejected the wallet request. Please try again.');
      } else if (errorMessage.includes('wallet not found')) {
        showError('Wallet Not Found', 'Please install MetaMask or another Ethereum wallet extension.');
      } else {
        showError('Authentication Failed', errorMessage);
      }
    }
  };

  const signInWithSolana = async () => {
    setLoading(true);
    try {
      const { authenticateWithSolana } = await import('../../lib/wallet-auth');
      const authData = await authenticateWithSolana();
      
      if (authData.tokenHash) {
        const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: authData.tokenHash,
          type: 'magiclink'
        });
        
        if (!verifyError && verifyData?.session) {
          // Wait a moment for session to be set
          await new Promise(resolve => setTimeout(resolve, 300));
          setLoading(false);
          showSuccess('Authentication Successful', 'Welcome! You have been signed in with your Solana wallet.');
          // Navigate - auth state change will handle session verification
          router.replace(getRedirectPath() as any);
          return;
        }
      }
      
      if (authData.magicLink || authData.redirectUrl) {
        const linkToUse = authData.magicLink || authData.redirectUrl;
        
        if (!linkToUse) {
          setLoading(false);
          throw new Error('No authentication link available');
        }
        
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          try {
            const url = new URL(linkToUse);
            const token = url.searchParams.get('token_hash') || url.searchParams.get('token');
            
            if (token) {
              const { data: retryData, error: retryError } = await supabase.auth.verifyOtp({
                token_hash: token,
                type: 'magiclink'
              });
              
              if (!retryError && retryData?.session) {
                // Wait a moment for session to be set
                await new Promise(resolve => setTimeout(resolve, 300));
                setLoading(false);
                showSuccess('Authentication Successful', 'Welcome! You have been signed in with your Solana wallet.');
                // Navigate - auth state change will handle session verification
                router.replace(getRedirectPath() as any);
                return;
              }
            }
            
            setLoading(false);
            window.location.href = linkToUse;
            return;
          } catch (urlError) {
            console.error('❌ Error processing magic link:', urlError);
            setLoading(false);
            throw urlError;
          }
        } else {
          setLoading(false);
          Linking.openURL(linkToUse);
          return;
        }
      }
      
      // Check for session with retry (wallet auth might need time)
      let sessionFound = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          sessionFound = true;
          setLoading(false);
          showSuccess('Authentication Successful', 'Welcome! You have been signed in with your Solana wallet.');
          router.replace(getRedirectPath() as any);
          return;
        }
      }
      
      if (!sessionFound) {
        setLoading(false);
        // Don't throw error - let auth state change handler process it
        console.warn('⚠️ Session not immediately available, but auth state change will handle it');
        // Still show success - the callback or auth state change will handle navigation
        showSuccess('Authentication Successful', 'Welcome! You have been signed in with your Solana wallet.');
      }
    } catch (error: any) {
      console.error('❌ Solana auth error:', error);
      setLoading(false);
      
      const errorMessage = error.message || 'Failed to authenticate with Solana wallet';
      
      if (errorMessage.includes('Too many authentication attempts')) {
        showError('Rate Limit Exceeded', 'Please wait a few minutes before trying again.');
      } else if (errorMessage.includes('timed out') || errorMessage.includes('check if')) {
        showWarning('Wallet Popup Not Appearing', 'Please check your wallet extension - the popup may be hidden.');
      } else if (errorMessage.includes('rejected')) {
        showWarning('Request Rejected', 'You rejected the wallet request. Please try again.');
      } else if (errorMessage.includes('wallet not found')) {
        showError('Wallet Not Found', 'Please install Phantom or another Solana wallet extension.');
      } else {
        showError('Authentication Failed', errorMessage);
      }
    }
  };

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
          <Text style={styles.title}>{t('title')}</Text>
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
        <Text style={styles.tagline}>{t('subtitle')}</Text>

        {/* Primary Auth Method: Email (Magic Link/OTP) */}
        <View style={styles.primaryAuthContainer}>
          {!otpSent ? (
            <>
              <View>
                <View style={[styles.emailInputContainer, emailError && styles.emailInputContainerError]}>
                  <Ionicons 
                    name="mail-outline" 
                    size={20} 
                    color={emailError ? '#F44336' : (isDark ? '#999' : '#666')} 
                    style={styles.inputIcon} 
                  />
                  <TextInput
                    style={[styles.emailInput, emailError && styles.emailInputError]}
                    placeholder={t('emailPlaceholder')}
                    placeholderTextColor={isDark ? '#999' : '#666'}
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (emailError) {
                        setEmailError('');
                      }
                    }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                    onFocus={() => {
                      if (emailError) {
                        setEmailError('');
                      }
                    }}
                  />
                </View>
                {emailError ? (
                  <Text style={styles.emailErrorText}>{emailError}</Text>
                ) : null}
              </View>

              {/* Method Toggle */}
              <View style={styles.methodToggleContainer}>
                <TouchableOpacity
                  style={[
                    styles.methodToggle, 
                    authMethod === 'magiclink' && styles.methodToggleActive,
                    loading && styles.methodToggleDisabled
                  ]}
                  onPress={() => {
                    if (!loading) {
                      setAuthMethod('magiclink');
                      // Clear any email errors when switching
                      if (emailError) {
                        setEmailError('');
                      }
                    }
                  }}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <Ionicons 
                    name="link" 
                    size={16} 
                    color={
                      loading
                        ? (isDark ? '#666' : '#999')
                        : authMethod === 'magiclink' 
                          ? (isDark ? '#fff' : '#000') 
                          : (isDark ? '#999' : '#666')
                    } 
                  />
                  <Text style={[
                    styles.methodToggleText, 
                    authMethod === 'magiclink' && styles.methodToggleTextActive,
                    loading && styles.methodToggleTextDisabled
                  ]}>
                    {t('magicLink')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.methodToggle, 
                    authMethod === 'otp' && styles.methodToggleActive,
                    loading && styles.methodToggleDisabled
                  ]}
                  onPress={() => {
                    if (!loading) {
                      setAuthMethod('otp');
                      // Clear any email errors when switching
                      if (emailError) {
                        setEmailError('');
                      }
                    }
                  }}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <Ionicons 
                    name="keypad" 
                    size={16} 
                    color={
                      loading 
                        ? (isDark ? '#666' : '#999')
                        : authMethod === 'otp' 
                          ? (isDark ? '#fff' : '#000') 
                          : (isDark ? '#999' : '#666')
                    } 
                  />
                  <Text style={[
                    styles.methodToggleText, 
                    authMethod === 'otp' && styles.methodToggleTextActive,
                    loading && styles.methodToggleTextDisabled
                  ]}>
                    {t('otpCode')}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryButton, 
                  (loading || rateLimitCooldown > 0) && styles.primaryButtonDisabled
                ]}
                onPress={sendMagicLinkOrOTP}
                disabled={loading || rateLimitCooldown > 0}
                activeOpacity={0.7}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : rateLimitCooldown > 0 ? (
                  <View style={styles.primaryButtonContent}>
                    <Ionicons name="time-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>
                      Wait {rateLimitCooldown}s
                    </Text>
                  </View>
                ) : (
                  <View style={styles.primaryButtonContent}>
                    <Ionicons 
                      name={authMethod === 'magiclink' ? 'mail' : 'keypad'} 
                      size={20} 
                      color="#FFFFFF" 
                    />
                    <Text style={styles.primaryButtonText}>
                      {authMethod === 'magiclink' ? t('sendMagicLink') : t('sendCode')}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.otpInstructions}>
                Enter the 6-digit code sent to{'\n'}
                <Text style={styles.otpEmail}>{email}</Text>
              </Text>
              <View style={styles.otpInputContainer}>
                <TextInput
                  style={styles.otpInput}
                  placeholder="000000"
                  placeholderTextColor={isDark ? '#999' : '#666'}
                  value={otpCode}
                  onChangeText={(text) => setOtpCode(text.replace(/[^0-9]/g, '').slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                  editable={!loading}
                />
              </View>
              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                onPress={verifyOTP}
                disabled={loading || otpCode.length !== 6}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <View style={styles.primaryButtonContent}>
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                    <Text style={styles.primaryButtonText}>Verify Code</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.backToEmailButton}
                onPress={() => {
                  setOtpSent(false);
                  setOtpCode('');
                }}
                disabled={loading}
              >
                <Text style={styles.backToEmailText}>← Back to email</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>Or continue with</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Optional Auth Methods - Circular Buttons */}
        <View style={styles.optionalAuthContainer}>
          {/* Google OAuth */}
          <TouchableOpacity
            style={[styles.circularButton, styles.googleButton]}
            onPress={() => signInWithOAuth('google')}
            disabled={loading}
            accessibilityLabel="Sign in with Google"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Ionicons name="logo-google" size={24} color="#FFFFFF" />
            )}
          </TouchableOpacity>

          {/* Discord OAuth */}
          <TouchableOpacity
            style={[styles.circularButton, styles.discordButton]}
            onPress={() => signInWithOAuth('discord')}
            disabled={loading}
            accessibilityLabel="Sign in with Discord"
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Ionicons name="logo-discord" size={24} color="#FFFFFF" />
            )}
          </TouchableOpacity>

          {Platform.OS === 'web' && ethereumAvailable && (
            <TouchableOpacity
              style={[styles.circularButton, styles.ethereumButton]}
              onPress={signInWithEthereum}
              disabled={loading}
              accessibilityLabel="Sign in with Ethereum"
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Ionicons name="logo-bitcoin" size={24} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          )}

          {Platform.OS === 'web' && solanaAvailable && (
            <TouchableOpacity
              style={[styles.circularButton, styles.solanaButton]}
              onPress={signInWithSolana}
              disabled={loading}
              accessibilityLabel="Sign in with Solana"
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Ionicons name="logo-bitcoin" size={24} color="#FFFFFF" />
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.privacyContainer}>
          <Text style={styles.privacyText}>{t('privacy.text')} </Text>
          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={() => {
              setModalType('terms');
              setModalVisible(true);
            }}
            style={styles.linkButton}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          >
            <Text style={styles.linkText}>{t('privacy.terms')}</Text>
          </TouchableOpacity>
          <Text style={styles.privacyText}> and </Text>
          <TouchableOpacity 
            activeOpacity={0.7}
            onPress={() => {
              setModalType('privacy');
              setModalVisible(true);
            }}
            style={styles.linkButton}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          >
            <Text style={styles.linkText}>{t('privacy.privacy')}</Text>
          </TouchableOpacity>
          <Text style={styles.privacyText}>.</Text>
        </View>
        
        <View style={styles.versionContainer}>
          <VersionStatusIndicator compact={false} showVersion={true} size="small" />
        </View>
      </View>
      </ScrollView>
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
    width: '100%',
    backgroundColor: isDark ? colors.primaryDark : colors.background.paper,
  },
  scrollView: {
    flex: 1,
    width: '100%',
    backgroundColor: isDark ? colors.primaryDark : colors.background.paper,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Platform.OS === 'web' ? 40 : 20,
    paddingHorizontal: 20,
    ...(Platform.OS === 'web' ? {
      minHeight: '100%',
    } : {
      paddingBottom: 40,
    }),
  },
  content: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 20,
    width: '100%',
    maxWidth: 400,
    position: 'relative',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    zIndex: 0,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: isDark ? '#fff' : '#121212',
    marginBottom: 0,
    textAlign: 'center',
    ...(Platform.OS === 'web' ? {
      textShadow: isDark ? '0 2px 4px rgba(0, 0, 0, 0.2)' : '0 2px 4px rgba(255, 255, 255, 0.2)',
    } : {
    textShadowColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
    }),
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 16,
  },
  logo: {
    width: 200,
    height: 80,
  },
  tagline: {
    fontSize: 18,
    color: isDark ? '#FFFFFF' : '#121212',
    marginBottom: 32,
    textAlign: 'center',
    lineHeight: 24,
  },
  // Primary Auth Styles
  primaryAuthContainer: {
    width: '100%',
    marginBottom: 24,
    backgroundColor: isDark ? 'rgba(18, 18, 18, 0.95)' : 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    padding: 16,
    zIndex: 10,
    position: 'relative',
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(10px)',
    } : {}),
  },
  emailInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  emailInputContainerError: {
    borderColor: '#F44336',
    borderWidth: 2,
    backgroundColor: isDark ? 'rgba(244, 67, 54, 0.1)' : 'rgba(244, 67, 54, 0.05)',
  },
  inputIcon: {
    marginRight: 12,
  },
  emailInput: {
    flex: 1,
    fontSize: 16,
    color: isDark ? '#fff' : '#121212',
  },
  emailInputError: {
    color: isDark ? '#fff' : '#121212',
  },
  emailErrorText: {
    color: '#F44336',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
    marginLeft: 4,
    fontWeight: '500',
  },
  methodToggleContainer: {
    flexDirection: 'row',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  methodToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  methodToggleActive: {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
  },
  methodToggleText: {
    fontSize: 14,
    color: isDark ? '#999' : '#666',
    fontWeight: '500',
  },
  methodToggleTextActive: {
    color: isDark ? '#fff' : '#121212',
    fontWeight: '600',
  },
  methodToggleDisabled: {
    opacity: 0.5,
  },
  methodToggleTextDisabled: {
    opacity: 0.5,
  },
  primaryButton: {
    backgroundColor: colors.primary || '#7A5ECC',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 4px 8px rgba(122, 94, 204, 0.3)',
    } : {
    shadowColor: colors.primary || '#7A5ECC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    }),
  },
  primaryButtonDisabled: {
    opacity: 0.5,
    backgroundColor: isDark ? 'rgba(122, 94, 204, 0.3)' : 'rgba(122, 94, 204, 0.3)',
  },
  primaryButtonTextDisabled: {
    color: '#999',
  },
  primaryButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // OTP Styles
  otpInstructions: {
    fontSize: 14,
    color: isDark ? '#fff' : '#121212',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  otpEmail: {
    fontWeight: '600',
    color: colors.primary || '#7A5ECC',
  },
  otpInputContainer: {
    width: '100%',
    marginBottom: 16,
  },
  otpInput: {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 8,
    color: isDark ? '#fff' : '#121212',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  backToEmailButton: {
    marginTop: 12,
    paddingVertical: 8,
  },
  backToEmailText: {
    fontSize: 14,
    color: colors.primary || '#7A5ECC',
    textAlign: 'center',
  },
  // Divider
  divider: {
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
  // Optional Auth Styles - Circular Buttons
  optionalAuthContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
    flexWrap: 'wrap',
  },
  circularButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
  googleButton: {
    backgroundColor: '#DB4437',
  },
  discordButton: {
    backgroundColor: '#5865F2',
  },
  ethereumButton: {
    backgroundColor: '#627EEA',
  },
  solanaButton: {
    backgroundColor: '#14F195',
  },
  disabledButton: {
    opacity: 0.5,
    backgroundColor: isDark ? '#444' : '#ccc',
  },
  disabledButtonContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  maintenanceText: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
    textAlign: 'center',
  },
  privacyContainer: {
    marginTop: 20,
    paddingHorizontal: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 200,
    position: 'relative',
    pointerEvents: 'auto',
  },
  privacyText: {
    fontSize: 14,
    color: isDark ? '#FFFFFF' : '#121212',
    textAlign: 'center',
    lineHeight: 20,
  },
  versionContainer: {
    marginTop: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  versionText: {
    fontSize: 12,
    color: isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)',
    textAlign: 'center',
  },
  linkText: {
    color: isDark ? '#FFFFFF' : '#7A5ECC',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  linkButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    zIndex: 201,
    position: 'relative',
  },
});
