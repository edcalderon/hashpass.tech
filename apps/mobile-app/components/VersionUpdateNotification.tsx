import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
// clearAllCaches is defined below

interface VersionUpdateNotificationProps {
  currentVersion: string;
  latestVersion: string;
  onUpdateComplete?: () => void;
}

export default function VersionUpdateNotification({
  currentVersion,
  latestVersion,
  onUpdateComplete,
}: VersionUpdateNotificationProps) {
  const { colors, isDark } = useTheme();
  const [isUpdating, setIsUpdating] = useState(false);
  const [countdown, setCountdown] = useState(2);
  const screenWidth = Dimensions.get('window').width;
  const isMobile = screenWidth < 480;
  const isTablet = screenWidth < 768;

  // Auto-reload countdown
  useEffect(() => {
    if (isUpdating) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          // Trigger update
          setIsUpdating(true);
          clearAllCaches().then(() => {
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          }).catch((error) => {
            console.error('Error updating version:', error);
            setIsUpdating(false);
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isUpdating]);

  if (Platform.OS !== 'web') {
    return null;
  }

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      // Clear all caches
      await clearAllCaches();
      
      // Reload the page to get the new version
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (error) {
      console.error('Error updating version:', error);
      setIsUpdating(false);
    }
  };

  const styles = getStyles(isDark, colors, isMobile, isTablet);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Ionicons name="cloud-download-outline" size={24} color={colors.primary} />
        <View style={styles.textContainer}>
          <Text style={styles.title}>New Version Available</Text>
          <Text style={styles.subtitle}>
            Version {latestVersion} is available (current: {currentVersion})
          </Text>
          {!isUpdating && countdown > 0 && (
            <Text style={styles.countdownText}>
              Updating automatically in {countdown}...
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.button, isUpdating && styles.buttonDisabled]}
          onPress={handleUpdate}
          disabled={isUpdating}
        >
          {isUpdating ? (
            <Text style={styles.buttonText}>Updating...</Text>
          ) : (
            <Text style={styles.buttonText}>Update Now</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Helper function to clear all caches (extracted from version-checker for direct use)
async function clearAllCaches(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    // Clear Service Worker caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          console.log('[VersionUpdate] Clearing cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }

    // Clear browser caches (localStorage, sessionStorage)
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.warn('[VersionUpdate] Failed to clear storage:', e);
    }

    // Unregister all service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map((registration) => {
          console.log('[VersionUpdate] Unregistering service worker');
          return registration.unregister();
        })
      );
    }

    console.log('[VersionUpdate] ✅ All caches cleared');
  } catch (error) {
    console.error('[VersionUpdate] Error clearing caches:', error);
    throw error;
  }
}

const getStyles = (isDark: boolean, colors: any, isMobile: boolean, isTablet: boolean) =>
  StyleSheet.create({
    container: {
      position: 'fixed',
      top: isMobile ? 50 : 20,
      left: isMobile ? 8 : 20,
      right: isMobile ? 8 : 'auto',
      width: isMobile ? 'auto' : 'auto',
      maxWidth: isMobile ? '100%' : 'calc(100% - 40px)',
      minWidth: isMobile ? undefined : 320,
      zIndex: 10000,
      backgroundColor: colors.background.paper,
      borderRadius: 12,
      padding: isMobile ? 12 : 16,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 10,
      borderWidth: 0,
      borderColor: colors.primary,
    },
    content: {
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: isMobile ? 'stretch' : 'center',
      gap: isMobile ? 8 : 12,
    },
    textContainer: {
      flex: 1,
      alignItems: isMobile ? 'center' : 'flex-start',
    },
    title: {
      fontSize: isMobile ? 14 : 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
      textAlign: isMobile ? 'center' : 'left',
    },
    subtitle: {
      fontSize: isMobile ? 11 : 12,
      color: colors.text.secondary,
      marginBottom: 4,
      textAlign: isMobile ? 'center' : 'left',
    },
    countdownText: {
      fontSize: isMobile ? 10 : 11,
      color: colors.primary,
      fontWeight: '600',
      marginTop: 4,
      textAlign: isMobile ? 'center' : 'left',
    },
    button: {
      backgroundColor: colors.primary,
      paddingHorizontal: isMobile ? 12 : 16,
      paddingVertical: isMobile ? 6 : 8,
      borderRadius: 8,
      minWidth: isMobile ? undefined : 120,
      width: isMobile ? '100%' : 'auto',
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: colors.primaryContrastText || '#FFFFFF',
      fontSize: isMobile ? 12 : 14,
      fontWeight: '600',
      textAlign: 'center',
    },
  });

