import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { qrSystemService, QRCode } from '../lib/qr-system';
import { passSystemService } from '../lib/pass-system';
import { qrScannerService } from '../lib/qr-scanner-service';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, withSpring } from 'react-native-reanimated';
import QRCodeSvg from 'react-native-qrcode-svg';
import Svg, { Image as SvgImage } from 'react-native-svg';

interface DynamicQRDisplayProps {
  passId: string;
  passNumber?: string;
  passType?: string;
  size?: number;
  showRefreshButton?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number; // in seconds
  onRefresh?: () => void;
  onError?: (error: string) => void;
}

export default function DynamicQRDisplay({
  passId,
  passNumber,
  passType,
  size = 200,
  showRefreshButton = true,
  autoRefresh = true,
  refreshInterval = 30, // Refresh every 30 seconds
  onRefresh,
  onError,
}: DynamicQRDisplayProps) {
  const { colors, isDark } = useTheme();
  const { user, isLoading: authLoading } = useAuth();
  const [qrCode, setQrCode] = useState<QRCode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timeUntilExpiry, setTimeUntilExpiry] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const expiryTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  const pulseAnimation = useSharedValue(1);
  const rotateAnimation = useSharedValue(0);

  const styles = getStyles(isDark, colors, size);

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) {
      return;
    }
    
    // Only generate QR if user is authenticated
    if (user) {
      generateQR();
    } else {
      setError('User not authenticated');
      setIsLoading(false);
    }
    
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
      if (expiryTimerRef.current) {
        clearInterval(expiryTimerRef.current);
      }
    };
  }, [passId, user, authLoading]);

  useEffect(() => {
    if (autoRefresh && qrCode && qrCode.status === 'active') {
      // Set up auto-refresh timer
      refreshTimerRef.current = setInterval(() => {
        refreshQR();
      }, refreshInterval * 1000);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [qrCode, autoRefresh, refreshInterval]);

  useEffect(() => {
    if (qrCode && qrCode.expires_at) {
      // Set up expiry countdown
      const updateCountdown = () => {
        const expiryTime = new Date(qrCode.expires_at!).getTime();
        const now = Date.now();
        const remaining = Math.max(0, Math.floor((expiryTime - now) / 1000));
        setTimeUntilExpiry(remaining);

        if (remaining <= 0) {
          // QR expired, refresh it
          refreshQR();
        }
      };

      updateCountdown();
      expiryTimerRef.current = setInterval(updateCountdown, 1000);

      return () => {
        if (expiryTimerRef.current) {
          clearInterval(expiryTimerRef.current);
        }
      };
    }
  }, [qrCode]);

  const generateQR = async () => {
    if (!user) {
      setError('User not authenticated');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await qrSystemService.generatePassQR(passId, {
        expiresInMinutes: 30,
        maxUses: 1,
      });

      if (!result) {
        throw new Error('Failed to generate QR code');
      }

      // Fetch the full QR code details
      const qrDetails = await qrSystemService.getQRById(result.qrId);
      if (qrDetails) {
        // Validate QR code has required fields
        if (!qrDetails.token) {
          console.error('❌ QR code missing token:', qrDetails);
          throw new Error('Generated QR code is missing token');
        }
        
        console.log('✅ QR code generated successfully');
        console.log('🔑 Token:', qrDetails.token);
        console.log('📊 QR details:', {
          id: qrDetails.id,
          token: qrDetails.token,
          status: qrDetails.status,
          expires_at: qrDetails.expires_at,
        });
        
        // Test QR payload generation
        const testPayload = qrSystemService.generateQRPayload(qrDetails.token);
        console.log('🧪 Test payload:', testPayload);
        
        // Test parsing the payload
        const testParsed = qrScannerService.parseQRData(testPayload);
        console.log('🧪 Test parsed:', testParsed);
        
        if (!testParsed.isValid || !testParsed.token) {
          console.error('❌ QR payload test failed!', testParsed);
          throw new Error('QR payload format validation failed');
        }
        
        if (testParsed.token !== qrDetails.token) {
          console.error('❌ Token mismatch!', {
            original: qrDetails.token,
            parsed: testParsed.token,
          });
          throw new Error('QR token mismatch in payload');
        }
        
        console.log('✅ QR payload validation passed');
        setQrCode(qrDetails);
      } else {
        throw new Error('Failed to fetch QR code details');
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Error generating QR code';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const refreshQR = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    setError(null);

    // Animate refresh
    rotateAnimation.value = withRepeat(
      withTiming(360, { duration: 1000 }),
      1,
      false
    );

    try {
      await generateQR();
      if (onRefresh) {
        onRefresh();
      }
    } catch (err: any) {
      const errorMessage = err.message || 'Error refreshing QR code';
      setError(errorMessage);
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getQRPayload = (token: string): string => {
    if (!token) {
      console.error('❌ getQRPayload: No token provided');
      throw new Error('QR token is required');
    }
    
    console.log('🔑 Generating QR payload for token:', token.substring(0, 50));
    const payload = qrSystemService.generateQRPayload(token);
    console.log('✅ QR payload generated, length:', payload.length);
    console.log('📄 Payload preview:', payload.substring(0, 150));
    
    return payload;
  };

  const animatedRefreshStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${rotateAnimation.value}deg` }],
    };
  });

  const animatedPulseStyle = useAnimatedStyle(() => {
    return {
      opacity: pulseAnimation.value,
    };
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Generating QR code...</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={generateQR}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!qrCode) {
    return null;
  }

  // Validate QR code has token before generating payload
  if (!qrCode.token) {
    console.error('❌ QR code missing token:', qrCode);
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={48} color={colors.error} />
          <Text style={styles.errorText}>QR code missing token. Please refresh.</Text>
          <TouchableOpacity style={styles.retryButton} onPress={generateQR}>
            <Text style={styles.retryButtonText}>Refresh QR</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  console.log('🎯 Generating QR code for token:', qrCode.token);
  const qrPayload = getQRPayload(qrCode.token);
  console.log('✅ QR payload ready for display, length:', qrPayload.length);
  
  // Get logo for embedding in QR code center - use higher resolution android-chrome-192x192.png
  // Use URI for both platforms to avoid require() issues
  const getLogoUri = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const origin = window.location.origin;
      // For localhost development, Metro bundler doesn't serve public folder
      // Use the assets folder which Metro can bundle, or try public folder path
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        // Try public folder first (for webpack), then fallback
        // In development, Metro may not serve public folder, so we'll use production URL as fallback
        return `${origin}/assets/android-chrome-192x192.png`;
      }
      // Production: use public folder path
      return `${origin}/assets/android-chrome-192x192.png`;
    }
    // For native platforms, use the production URL or localhost for development
    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace('/rest/v1', '') || 'https://hashpass.co';
    return `${baseUrl}/assets/android-chrome-192x192.png`;
  };
  
  const logoSource = { uri: getLogoUri() };

  return (
    <View style={styles.container}>
      {/* QR Code Display */}
      <View style={styles.qrContainer}>
        <Animated.View style={[styles.qrWrapper, animatedPulseStyle]}>
          <QRCodeSvg
            value={qrPayload}
            size={size}
            color={isDark ? '#FFFFFF' : '#000000'}
            backgroundColor={isDark ? '#1A1A1A' : '#FFFFFF'}
            logo={logoSource}
            logoSize={size * 0.2}
            logoBackgroundColor="transparent"
            logoMargin={2}
            logoBorderRadius={8}
            quietZone={size * 0.05}
            ecl="L"
            enableLinearGradient={false}
          />
          
          {/* Status Badge */}
          {qrCode.status !== 'active' && (
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>
                {qrCode.status === 'used' ? 'Used' : 
                 qrCode.status === 'expired' ? 'Expired' : 
                 qrCode.status === 'revoked' ? 'Revoked' : 'Suspended'}
              </Text>
            </View>
          )}
        </Animated.View>

      </View>

      {/* Refresh Button */}
      {showRefreshButton && (
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={refreshQR}
          disabled={isRefreshing}
        >
          <Animated.View style={animatedRefreshStyle}>
            <Ionicons
              name="refresh"
              size={20}
              color={isRefreshing ? colors.text.secondary : colors.primary}
            />
          </Animated.View>
          <Text style={[
            styles.refreshButtonText,
            isRefreshing && styles.refreshButtonTextDisabled
          ]}>
            {isRefreshing ? 'Refreshing...' : 'Refresh QR'}
          </Text>
        </TouchableOpacity>
      )}

    </View>
  );
}

const getStyles = (isDark: boolean, colors: any, size: number) =>
  StyleSheet.create({
    container: {
      alignItems: 'center',
      padding: 16,
    },
    loadingContainer: {
      alignItems: 'center',
      padding: 32,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: colors.text.secondary,
    },
    errorContainer: {
      alignItems: 'center',
      padding: 32,
    },
    errorText: {
      marginTop: 12,
      fontSize: 14,
      color: colors.error,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: 16,
      paddingHorizontal: 24,
      paddingVertical: 12,
      backgroundColor: colors.primary,
      borderRadius: 8,
    },
    retryButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    qrContainer: {
      alignItems: 'center',
      marginBottom: 16,
    },
    qrWrapper: {
      position: 'relative',
      backgroundColor: '#FFFFFF',
      padding: 16,
      borderRadius: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    qrImage: {
      width: size,
      height: size,
    },
    statusBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      backgroundColor: colors.error,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
    },
    statusText: {
      color: '#FFFFFF',
      fontSize: 12,
      fontWeight: '600',
    },
    expiryContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: colors.background.secondary,
      borderRadius: 8,
    },
    expiryText: {
      marginLeft: 6,
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    passInfo: {
      marginTop: 16,
      alignItems: 'center',
    },
    passNumber: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    passType: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    refreshButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.background.secondary,
      borderRadius: 8,
      marginTop: 8,
    },
    refreshButtonText: {
      marginLeft: 8,
      fontSize: 14,
      color: colors.primary,
      fontWeight: '500',
    },
    refreshButtonTextDisabled: {
      color: colors.text.secondary,
    },
    securityNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 16,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.background.secondary,
      borderRadius: 8,
      maxWidth: size + 64,
    },
    securityText: {
      marginLeft: 8,
      fontSize: 11,
      color: colors.text.secondary,
      flex: 1,
      textAlign: 'center',
    },
  });

