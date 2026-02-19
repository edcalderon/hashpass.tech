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
    
    // Get redirect path from URL params
    const getRedirectPath = () => {
        const returnTo = params.returnTo as string | undefined;
        if (returnTo) {
            try {
                const decoded = decodeURIComponent(returnTo);
                // Prevent redirecting to callback route
                if (decoded.includes('/auth/callback')) {
                    console.log('⚠️ returnTo contains callback route, using dashboard instead');
                    return '/(shared)/dashboard/explore';
                }
                console.log('📍 Using returnTo path:', decoded);
                return decoded;
            } catch (e) {
                console.warn('Failed to decode returnTo parameter:', e);
            }
        }
        // Default to dashboard explore
        const defaultPath = '/(shared)/dashboard/explore';
        console.log('📍 Using default redirect path:', defaultPath);
        return defaultPath;
    };
    
    // Safe navigation function - use router instead of window.location to prevent full page reload
    const safeNavigate = (path: string) => {
        console.log('🚀 safeNavigate called with path:', path);
        
        if (path.includes('/auth/callback')) {
            console.warn('⚠️ Attempted to redirect to callback route, redirecting to dashboard instead');
            path = '/(shared)/dashboard/explore';
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
                    console.warn('⚠️ No auth data and no session, redirecting to auth');
                    hasNavigatedRef.current = true;
                    isProcessingRef.current = false;
                    router.replace('/(shared)/auth' as any);
                    return;
                }
                
                // Clean URL on web to prevent re-processing
                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    const cleanUrl = window.location.origin + window.location.pathname;
                    window.history.replaceState({}, '', cleanUrl);
                    console.log('🧹 Cleaned URL to prevent re-processing');
                }
                
                // Use provider-agnostic OAuth callback handler
                console.log('🔄 Processing OAuth callback with provider-agnostic handler...');
                const result = await handleOAuthCallback(params as Record<string, string>);
                
                if (result.error) {
                    console.error('❌ OAuth callback error:', result.error);
                    throw new Error(result.error);
                }
                
                if (result.user) {
                    console.log('✅ OAuth callback successful:', result.user);
                    setStatus('success');
                    setMessage(t('authenticationSuccessful', '✅ Authentication successful!'));
                    showSuccess(t('authenticationSuccessful', 'Authentication successful!'));
                    
                    console.log('🚀 Starting navigation to dashboard...');
                    const redirectPath = getRedirectPath();
                    console.log('📍 Redirect path determined:', redirectPath);
                    
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
                const errorMessage = error.message || t('authenticationFailed', 'Authentication failed. Please try again.');
                setMessage(errorMessage);
                showError(errorMessage);
                
                // After error, redirect back to auth page after a delay
                setTimeout(() => {
                    if (!hasNavigatedRef.current && !getHasNavigated()) {
                        hasNavigatedRef.current = true;
                        setHasNavigated(false); // Clear flag on error
                        isProcessingRef.current = false;
                        router.replace('/(shared)/auth' as any);
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
        // CRITICAL: Only depend on what we actually use
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router, handleOAuthCallback, t, showError, showSuccess]);
    

    
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
