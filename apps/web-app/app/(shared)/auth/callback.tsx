import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../hooks/useAuth';
import { useTheme } from '../../../hooks/useTheme';
import { useToastHelpers } from '../../../contexts/ToastContext';
import { useTranslation } from '../../../i18n/i18n';
import { Check, AlertCircle } from 'lucide-react-native';

export default function AuthCallback() {
    const { colors } = useTheme();
    const { t } = useTranslation('auth');
    const router = useRouter();
    const params = useLocalSearchParams();
    const { handleOAuthCallback } = useAuth();
    const { showError, showSuccess } = useToastHelpers();
    
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
    const hasShownErrorToastRef = useRef(false);
    const hasShownSuccessToastRef = useRef(false);

    const isTransientSessionError = (message: string) => {
        const value = message.toLowerCase();
        return (
            value.includes('cross-origin restrictions') ||
            value.includes('browser could not reach directus') ||
            value.includes('session could not be established') ||
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
    
    // Get redirect path from URL params
    const getRedirectPath = () => {
        const returnTo = params.returnTo as string | undefined;
        if (returnTo) {
            try {
                const normalizedPath = normalizeRedirectPath(returnTo);
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
        console.log('🚀 safeNavigate called with path:', path);
        
        if (path.includes('/auth/callback')) {
            console.warn('⚠️ Attempted to redirect to callback route, redirecting to dashboard instead');
            path = '/dashboard/explore';
        }
        
        console.log('🚀 Final navigation path:', path);
        console.log('📊 Router state:', { 
            canGoBack: router.canGoBack(), 
            segments: router.segments 
        });
        
        // Mark as navigated BEFORE navigation to prevent re-processing
        hasNavigatedRef.current = true;
        setHasNavigated(true);
        
        try {
            // Use router.replace instead of window.location to avoid full page reload
            console.log('🚀 Calling router.replace...');
            router.replace(path as any);
            console.log('✅ Router.replace called successfully');
            
            // Additional fallback after a delay if navigation doesn't work
            setTimeout(() => {
                if (typeof window !== 'undefined' && window.location.pathname.includes('/auth/callback')) {
                    console.log('⚠️ Still on callback page, forcing navigation...');
                    window.location.href = path;
                }
            }, 1000);
            
        } catch (navError) {
            console.error('❌ Navigation error:', navError);
            
            // Immediate fallback to window.location if router fails
            if (typeof window !== 'undefined') {
                console.log('🔄 Falling back to window.location...');
                window.location.href = path;
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
            console.log('⏭️ Callback already processed (sessionStorage), redirecting...');
            hasNavigatedRef.current = true;
            router.replace(getRedirectPath() as any);
            return;
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
                
                // Check if URL has auth tokens/code before processing
                let hasAuthData = false;
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    const url = window.location.href;
                    hasAuthData = url.includes('#access_token=') || 
                                  url.includes('#oauth_success=') ||
                                  url.includes('#code=') || 
                                  url.includes('?code=') ||
                                  url.includes('&code=') ||
                                  url.includes('access_token=') ||
                                  url.includes('oauth_success=');
                } else {
                    // For mobile, check params
                    hasAuthData = !!(params.code || params.access_token || params.oauth_success);
                }
                
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

                if (!hasShownErrorToastRef.current && !hasNavigatedRef.current) {
                    hasShownErrorToastRef.current = true;
                    showError(toastError.title, toastError.message);
                }

                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.localStorage.removeItem('oauth_in_progress');
                }
                
                // After error, redirect back to auth page after a delay
                setTimeout(() => {
                    if (!hasNavigatedRef.current && !getHasNavigated()) {
                        hasNavigatedRef.current = true;
                        setHasNavigated(false); // Clear flag on error
                        isProcessingRef.current = false;
                        router.replace('/auth' as any);
                    }
                }, 2000);
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
