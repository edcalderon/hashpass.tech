import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
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

  const styles = getStyles(isDark, colors);

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

const getStyles = (isDark: boolean, colors: any) =>
  StyleSheet.create({
    container: {
      position: 'fixed',
      top: 20,
      left: '50%',
      transform: [{ translateX: -200 }],
      width: 400,
      maxWidth: '90%',
      zIndex: 10000,
      backgroundColor: colors.background.paper,
      borderRadius: 12,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 4,
      },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 10,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    textContainer: {
      flex: 1,
    },
    title: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 12,
      color: colors.text.secondary,
      marginBottom: 4,
    },
    countdownText: {
      fontSize: 11,
      color: colors.primary,
      fontWeight: '600',
      marginTop: 4,
    },
    button: {
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      minWidth: 120,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      color: colors.primaryContrastText || '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
      textAlign: 'center',
    },
  });

