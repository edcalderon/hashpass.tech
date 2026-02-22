import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { useToastHelpers } from '../../../contexts/ToastContext';
import { useTranslation } from '../../../i18n/i18n';
import { Check, AlertCircle } from 'lucide-react-native';
import { authService } from '@hashpass/auth';
import { createSessionFromUrl } from '../../../lib/supabase';

type CallbackHashError = {
    code: string;
    message: string;
};

const normalizeCallbackHashError = (rawCode: string | null, rawMessage: string | null): CallbackHashError => {
    const code = (rawCode || 'oauth_failed').toLowerCase();
    const message = (rawMessage || '').trim();
    const normalized = `${code} ${message}`.toLowerCase();

    if (
        normalized.includes('otp_expired') ||
        normalized.includes('invalid or has expired') ||
        normalized.includes('otp has expired')
    ) {
        return {
            code: 'otp_expired',
            message: 'Your magic link is invalid or has expired. Request a new link and try again.',
        };
    }

    if (normalized.includes('access_denied')) {
        return {
            code: 'access_denied',
            message: 'Sign-in was canceled or denied. Please try again.',
        };
    }

    return {
        code: code || 'oauth_failed',
        message: message || 'Authentication failed. Please try again.',
    };
};

const getHashAuthError = (): CallbackHashError | null => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location.hash) {
        return null;
    }

    const hashRaw = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash;

    const hashParams = new URLSearchParams(hashRaw);
    const rawError = hashParams.get('error');
    const rawCode = hashParams.get('error_code');
    const rawDescription = hashParams.get('error_description');

    if (!rawError && !rawCode && !rawDescription) {
        return null;
    }

    const sanitizedDescription = rawDescription
        ? rawDescription.split('?returnTo=')[0].trim()
        : '';

    return normalizeCallbackHashError(rawCode || rawError, sanitizedDescription);
};

export default function AuthCallback() {
    const { t } = useTranslation('auth');
    const router = useRouter();
    const params = useLocalSearchParams();
    const { handleOAuthCallback } = useAuth();
    const { showSuccess } = useToastHelpers();
    
    const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
    const [message, setMessage] = useState('Processing authentication...');
    
    // Track if we've already navigated to prevent duplicate navigation
    const getHasNavigated = () => {
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
            return window.sessionStorage.getItem('auth_callback_processed') === 'true';
        }
        return false;
    };
    
    const setHasNavigated = (value: boolean) => {
        if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
            if (value) {
                window.sessionStorage.setItem('auth_callback_processed', 'true');
            } else {
                window.sessionStorage.removeItem('auth_callback_processed');
            }
        }
    };
    
    const hasNavigatedRef = useRef(getHasNavigated());
    const hasShownSuccessToastRef = useRef(false);
    const authProviderName = authService.getProviderName();
    const hasSupabasePasswordlessConfig = Boolean(
        process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_KEY
    );
    const isPasswordlessSupported = authProviderName === 'supabase' || hasSupabasePasswordlessConfig;
    const passwordlessUnavailableMessage =
      'Magic link and OTP sign-in are unavailable because Supabase passwordless is not configured for this environment.';

    const isTransientSessionError = (message: string) => {
        const value = message.toLowerCase();
        return (
            value.includes('cross-origin restrictions') ||
            value.includes('browser could not reach directus') ||
            value.includes('session could not be established') ||
            value.includes('did not establish a valid session') ||
            value.includes('invalid_credentials') ||
            value.includes('invalid user credentials') ||
            value.includes('networkerror') ||
            value.includes('failed to fetch')
        );
    };

    const getToastErrorContent = (rawError: string) => {
        const normalized = rawError.toLowerCase();

        if (
            normalized.includes('invalid user credentials') ||
            normalized.includes('invalid_credentials') ||
            normalized.includes('no active directus session') ||
            normalized.includes('did not establish a valid session')
        ) {
            return {
                title: 'Session Not Established',
                message: 'Google sign-in completed, but Directus did not create a valid session. Please sign in again.'
            };
        }

        if (
            normalized.includes('cross-origin restrictions') ||
            normalized.includes('browser could not reach directus') ||
            normalized.includes('networkerror') ||
            normalized.includes('failed to fetch')
        ) {
            return {
                title: 'Auth Server Unreachable',
                message: 'Your browser could not reach the Directus auth server. Check CORS and Directus URL settings, then try again.'
            };
        }

        if (normalized.includes('no user data')) {
            return {
                title: 'Sign-In Incomplete',
                message: 'Authentication succeeded, but user profile data was not returned.'
            };
        }

        if (normalized.includes('invalid or expired token') || normalized.includes('401')) {
            return {
                title: 'Session Expired',
                message: 'Your session token is invalid or expired. Please sign in again.'
            };
        }

        return {
            title: t('authenticationError', 'Authentication Error'),
            message: rawError || t('authenticationFailed', 'Authentication failed. Please try again.')
        };
    };

    const normalizeRedirectPath = (rawPath: string) => {
        let normalized = rawPath;

        try {
            normalized = decodeURIComponent(normalized);
        } catch {
            // Keep original value if decoding fails.
        }

        if (!normalized.startsWith('/')) {
            normalized = '/dashboard/explore';
        }

        // Route groups are internal to Expo Router and should not be used in browser URLs.
        normalized = normalized.replace(/\/\([^/]+\)/g, '');

        if (!normalized || normalized === '/auth' || normalized.includes('/auth/callback')) {
            return '/dashboard/explore';
        }

        return normalized;
    };

    const mapToRouterPath = (path: string) => {
        if (path.startsWith('/dashboard') && !path.startsWith('/(shared)/dashboard')) {
            return `/(shared)${path}`;
        }
        return path;
    };

    const extractReturnToFromHash = () => {
        if (Platform.OS !== 'web' || typeof window === 'undefined') {
            return null;
        }

        const hashRaw = window.location.hash.startsWith('#')
            ? window.location.hash.slice(1)
            : window.location.hash;

        if (!hashRaw) {
            return null;
        }

        const returnToMatch = hashRaw.match(/[?&]returnTo=([^&]+)/i);
        return returnToMatch?.[1] || null;
    };

    const hasOAuthPayloadInUrl = () => {
        if (Platform.OS !== 'web' || typeof window === 'undefined') {
            return Boolean(params.code || params.access_token || params.oauth_success);
        }

        const url = window.location.href;
        return (
            url.includes('#access_token=') ||
            url.includes('#oauth_success=') ||
            url.includes('#code=') ||
            url.includes('?code=') ||
            url.includes('&code=') ||
            url.includes('access_token=') ||
            url.includes('oauth_success=')
        );
    };
    
    // Get redirect path from URL params
    const getRedirectPath = () => {
        const returnTo = params.returnTo as string | undefined;
        const hashReturnTo = extractReturnToFromHash();
        const rawReturnTo = returnTo || hashReturnTo;

        if (rawReturnTo) {
            try {
                const normalizedPath = normalizeRedirectPath(rawReturnTo);
                console.log('📍 Using returnTo path:', normalizedPath);
                return normalizedPath;
            } catch (e) {
                console.warn('Failed to decode returnTo parameter:', e);
            }
        }
        // Default to dashboard explore
        const defaultPath = '/dashboard/explore';
        console.log('📍 Using default redirect path:', defaultPath);
        return defaultPath;
    };
    
    // Safe navigation function - use router instead of window.location to prevent full page reload
    const safeNavigate = (path: string) => {
        const normalizedPublicPath = normalizeRedirectPath(path);
        let targetPublicPath = normalizedPublicPath;

        if (targetPublicPath.includes('/auth/callback')) {
            console.warn('⚠️ Attempted to redirect to callback route, redirecting to dashboard instead');
            targetPublicPath = '/dashboard/explore';
        }

        const targetRouterPath = mapToRouterPath(targetPublicPath);
        console.log('🚀 safeNavigate called with path:', targetPublicPath, 'routerPath:', targetRouterPath);
        
        // Mark as navigated BEFORE navigation to prevent re-processing
        hasNavigatedRef.current = true;
        setHasNavigated(true);
        
        try {
            router.replace(targetRouterPath as any);

            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                // Router replace can no-op in callback race conditions. Force location fallback quickly.
                setTimeout(() => {
                    if (window.location.pathname.includes('/auth/callback')) {
                        console.warn('⚠️ Router navigation did not leave callback route, forcing location replace');
                        window.location.replace(targetPublicPath);
                    }
                }, 200);
            }
        } catch (navError) {
            console.error('❌ Navigation error:', navError);
            
            // Immediate fallback to window.location if router fails
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                console.log('🔄 Falling back to window.location...');
                window.location.replace(targetPublicPath);
            }
        }
        
        // Clear sessionStorage after a short delay to allow navigation to complete
        setTimeout(() => {
            if (Platform.OS === 'web' && typeof window !== 'undefined' && window.sessionStorage) {
                const currentPath = window.location.pathname;
                if (!currentPath.includes('/auth/callback')) {
                    window.sessionStorage.removeItem('auth_callback_processed');
                    console.log('🧹 Cleared sessionStorage flag after navigation');
                }
            }
        }, 2000);
    };
    
    // Track processing state to prevent multiple simultaneous executions
    const isProcessingRef = useRef(false);
    
    // Provider-agnostic OAuth callback handler
    useEffect(() => {
        // CRITICAL: Check sessionStorage first to prevent re-processing after navigation
        if (getHasNavigated()) {
            if (hasOAuthPayloadInUrl()) {
                // New OAuth payload with stale callback flag: reset and process normally.
                console.warn('⚠️ Stale auth_callback_processed flag detected; resetting for new OAuth payload.');
                setHasNavigated(false);
                hasNavigatedRef.current = false;
            } else {
                console.log('⏭️ Callback already processed (sessionStorage), redirecting...');
                hasNavigatedRef.current = true;
                safeNavigate(getRedirectPath());
                return;
            }
        }
        
        // CRITICAL: Prevent useEffect from running multiple times
        if (hasNavigatedRef.current || isProcessingRef.current) {
            console.log('⏭️ Already processing or navigated, skipping useEffect');
            return;
        }
        
        // CRITICAL: Store a flag to prevent re-execution even if params change
        let executed = false;
        
        const handleAuthCallback = async () => {
            // Triple-check guard (in case of race condition or re-render)
            if (hasNavigatedRef.current || isProcessingRef.current || executed || getHasNavigated()) {
                console.log('⏭️ Already processing or navigated, skipping handler');
                return;
            }
            
            executed = true;
            isProcessingRef.current = true;
            
            try {
                setStatus('processing');
                setMessage(t('processingAuthentication', 'Processing authentication...'));
                
                console.log('🔄 OAuth callback started');
                console.log('📋 Callback params:', params);

                const hashAuthError = getHashAuthError();
                if (hashAuthError) {
                    console.warn('⚠️ OAuth callback hash returned an error:', hashAuthError);
                    setStatus('error');
                    setMessage(hashAuthError.message);

                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        window.localStorage.removeItem('oauth_in_progress');
                    }

                    if (!hasNavigatedRef.current && !getHasNavigated()) {
                        hasNavigatedRef.current = true;
                        setHasNavigated(false);
                        isProcessingRef.current = false;

                        const authErrorPath = `/(shared)/auth?error=${encodeURIComponent(hashAuthError.code)}&message=${encodeURIComponent(hashAuthError.message)}`;
                        router.replace(authErrorPath as any);
                    }
                    return;
                }

                const signInMethod =
                    Platform.OS === 'web' && typeof window !== 'undefined'
                        ? window.localStorage.getItem('auth_signin_method')
                        : null;
                const isPasswordlessMethod = signInMethod === 'magic_link' || signInMethod === 'otp_code';

                if (isPasswordlessMethod && !isPasswordlessSupported) {
                    console.warn('⚠️ Passwordless callback blocked due to provider mismatch:', {
                        authProviderName,
                        signInMethod,
                        hasSupabasePasswordlessConfig,
                    });
                    setStatus('error');
                    setMessage(passwordlessUnavailableMessage);

                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        window.localStorage.removeItem('oauth_in_progress');
                        window.localStorage.removeItem('auth_signin_method');
                    }

                    if (!hasNavigatedRef.current && !getHasNavigated()) {
                        hasNavigatedRef.current = true;
                        setHasNavigated(false);
                        isProcessingRef.current = false;
                        const authErrorPath = `/(shared)/auth?error=passwordless_not_supported&message=${encodeURIComponent(passwordlessUnavailableMessage)}`;
                        router.replace(authErrorPath as any);
                    }
                    return;
                }

                if (isPasswordlessMethod && isPasswordlessSupported) {
                    console.log('🔄 Processing Supabase passwordless callback...');

                    const currentUrl =
                        Platform.OS === 'web' && typeof window !== 'undefined'
                            ? window.location.href
                            : '';

                    const sessionResult = await createSessionFromUrl(currentUrl);

                    if (sessionResult.error || !sessionResult.session?.user) {
                        throw new Error(
                            sessionResult.error?.message ||
                            'Authentication completed but no Supabase session was established.'
                        );
                    }

                    console.log('✅ Supabase passwordless callback successful:', sessionResult.session.user.email);
                    setStatus('success');
                    setMessage(t('authenticationSuccessful', '✅ Authentication successful!'));

                    if (!hasShownSuccessToastRef.current) {
                        hasShownSuccessToastRef.current = true;
                        showSuccess(
                            t('authenticationSuccessful', 'Authentication successful!'),
                            'Redirecting to your dashboard...'
                        );
                    }

                    const redirectPath = getRedirectPath();

                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        const cleanUrl = window.location.origin + window.location.pathname;
                        window.history.replaceState({}, '', cleanUrl);
                        window.localStorage.removeItem('oauth_in_progress');
                        window.localStorage.removeItem('auth_signin_method');
                    }

                    hasNavigatedRef.current = true;
                    setHasNavigated(true);
                    isProcessingRef.current = false;
                    safeNavigate(redirectPath);
                    return;
                }
                
                // Check if URL has auth tokens/code before processing
                const hasAuthData = hasOAuthPayloadInUrl();
                
                if (!hasAuthData) {
                    console.log('ℹ️ No OAuth params in URL, attempting cookie-based session completion...');
                }
                
                // Use provider-agnostic OAuth callback handler
                console.log('🔄 Processing OAuth callback with provider-agnostic handler...');
                let result = await handleOAuthCallback(params as Record<string, string>);

                // Retry once for transient cookie/session propagation delays.
                if (result.error && isTransientSessionError(result.error)) {
                    console.warn('⚠️ Transient OAuth session error detected. Retrying once...');
                    await new Promise(resolve => setTimeout(resolve, 700));
                    result = await handleOAuthCallback(params as Record<string, string>);
                }
                
                if (result.error) {
                    console.error('❌ OAuth callback error:', result.error);
                    throw new Error(result.error);
                }
                
                if (result.user) {
                    console.log('✅ OAuth callback successful:', result.user);
                    setStatus('success');
                    setMessage(t('authenticationSuccessful', '✅ Authentication successful!'));
                    if (!hasShownSuccessToastRef.current) {
                        hasShownSuccessToastRef.current = true;
                        showSuccess(
                            t('authenticationSuccessful', 'Authentication successful!'),
                            'Redirecting to your dashboard...'
                        );
                    }
                    
                    console.log('🚀 Starting navigation to dashboard...');
                    const redirectPath = getRedirectPath();
                    console.log('📍 Redirect path determined:', redirectPath);

                    // Clean callback URL only after OAuth payload has been processed.
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        const cleanUrl = window.location.origin + window.location.pathname;
                        window.history.replaceState({}, '', cleanUrl);
                        window.localStorage.removeItem('oauth_in_progress');
                        window.localStorage.removeItem('auth_signin_method');
                        console.log('🧹 Cleaned URL after successful OAuth processing');
                    }
                    
                    hasNavigatedRef.current = true;
                    setHasNavigated(true);
                    isProcessingRef.current = false;
                    
                    // Wait for auth state to update before navigating
                    let attempts = 0;
                    const waitForAuthState = () => {
                        console.log('🔍 Checking auth state for navigation...');
                        attempts++;
                        
                        // Try navigation after a reasonable wait or max attempts
                        if (attempts >= 5) {
                            console.log('🚀 Max attempts reached, proceeding with navigation');
                            safeNavigate(redirectPath);
                            return;
                        }
                        
                        setTimeout(() => {
                            console.log('🚀 Attempting navigation (attempt', attempts + 1, ')');
                            safeNavigate(redirectPath);
                        }, attempts * 200); // Incremental delay
                    };
                    
                    // Start the auth state check
                    waitForAuthState();
                } else {
                    console.error('❌ No user data in result:', result);
                    throw new Error('Authentication completed but no user data received');
                }
                
            } catch (error: any) {
                console.error('❌ Auth callback error:', error);
                setStatus('error');
                const rawMessage = error?.message || t('authenticationFailed', 'Authentication failed. Please try again.');
                const toastError = getToastErrorContent(rawMessage);
                setMessage(toastError.message);

                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.localStorage.removeItem('oauth_in_progress');
                    window.localStorage.removeItem('auth_signin_method');
                }
                
                // After error, redirect back to auth page after a delay
                setTimeout(() => {
                    if (!hasNavigatedRef.current && !getHasNavigated()) {
                        hasNavigatedRef.current = true;
                        setHasNavigated(false); // Clear flag on error
                        isProcessingRef.current = false;
                        const authErrorPath = `/(shared)/auth?error=oauth_failed&message=${encodeURIComponent(toastError.message)}`;
                        router.replace(authErrorPath as any);
                    }
                }, 800);
            } finally {
                isProcessingRef.current = false;
            }
        };
        
        handleAuthCallback();
        
        // Cleanup function to reset processing state if component unmounts
        return () => {
            // Don't reset hasNavigatedRef - we want to keep that across re-renders
            // Only reset isProcessingRef if we haven't navigated
            if (!hasNavigatedRef.current) {
                isProcessingRef.current = false;
            }
        };
        // Intentionally run once on mount to prevent callback retry loops on re-render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    

    
    return (
        <View style={styles.container}>
            <View style={styles.content}>
                {status === 'processing' && (
                    <>
                        <ActivityIndicator size="large" color="#3B82F6" />
                        <Text style={styles.message}>{message}</Text>
                    </>
                )}
                
                {status === 'success' && (
                    <>
                        <Check size={48} color="#10B981" />
                        <Text style={styles.successMessage}>{message}</Text>
                    </>
                )}
                
                {status === 'error' && (
                    <>
                        <AlertCircle size={48} color="#EF4444" />
                        <Text style={styles.errorMessage}>{message}</Text>
                        <Text style={styles.redirectInfo}>Redirecting to login page...</Text>
                    </>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
        padding: 20,
    },
    content: {
        alignItems: 'center',
        maxWidth: 300,
    },
    message: {
        color: '#fff',
        fontSize: 16,
        textAlign: 'center',
        marginTop: 20,
        lineHeight: 22,
    },
    successMessage: {
        color: '#10B981',
        fontSize: 18,
        textAlign: 'center',
        marginTop: 20,
        fontWeight: '600',
        lineHeight: 24,
    },
    errorMessage: {
        color: '#EF4444',
        fontSize: 16,
        textAlign: 'center',
        marginTop: 20,
        lineHeight: 22,
    },
    redirectInfo: {
        color: '#9CA3AF',
        fontSize: 14,
        textAlign: 'center',
        marginTop: 12,
        lineHeight: 20,
    },
});
