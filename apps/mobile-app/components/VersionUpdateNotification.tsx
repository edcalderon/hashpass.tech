import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';

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

  if (Platform.OS !== 'web') {
    return null;
  }

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      await clearAllCaches();
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch {
      setIsUpdating(false);
    }
  };

  const handleLater = () => {
    onUpdateComplete?.();
  };

  const styles = getStyles(isDark, colors);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleLater} />
        <View style={styles.dialog}>
          <View style={styles.iconRow}>
            <View style={styles.iconBg}>
              {/* inline SVG — no font dependency, renders reliably on web */}
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L12 14M12 2L8 6M12 2L16 6" stroke={colors.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M4 16V18C4 19.1 4.9 20 6 20H18C19.1 20 20 19.1 20 18V16" stroke={colors.primary} strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </View>
          </View>
          <Text style={styles.title}>Update Available</Text>
          <Text style={styles.subtitle}>
            A new version of HashPass is ready.
          </Text>
          <View style={styles.versionRow}>
            <View style={styles.versionChip}>
              <Text style={styles.versionChipLabel}>Current</Text>
              <Text style={styles.versionChipValue}>v{currentVersion}</Text>
            </View>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="10" stroke={colors.primary} strokeWidth="2"/>
              <path d="M10 8L14 12L10 16" stroke={colors.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <View style={[styles.versionChip, styles.versionChipNew, { borderColor: colors.primary }]}>
              <Text style={[styles.versionChipLabel, { color: colors.primary }]}>Latest</Text>
              <Text style={[styles.versionChipValue, { color: colors.primary }]}>v{latestVersion}</Text>
            </View>
          </View>
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.laterButton} onPress={handleLater}>
              <Text style={styles.laterText}>Later</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.updateButton, isUpdating && styles.buttonDisabled]}
              onPress={handleUpdate}
              disabled={isUpdating}
            >
              <Text style={styles.updateText}>
                {isUpdating ? 'Updating…' : 'Update Now'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

async function clearAllCaches(): Promise<void> {
  if (typeof window === 'undefined') return;
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch { /* ignore */ }
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
}

const getStyles = (isDark: boolean, colors: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    dialog: {
      backgroundColor: colors.background.paper,
      borderRadius: 20,
      padding: 28,
      width: '100%',
      maxWidth: 360,
      alignItems: 'center',
      boxShadow: '0px 8px 16px rgba(0, 0, 0, 0.35)',
      elevation: 16,
    },
    iconRow: {
      marginBottom: 16,
    },
    iconBg: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: isDark ? 'rgba(220,38,38,0.15)' : 'rgba(220,38,38,0.08)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 8,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 20,
      lineHeight: 20,
    },
    versionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 24,
    },
    versionChip: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
      alignItems: 'center',
    },
    versionChipNew: {
      borderWidth: 1,
    },
    versionChipLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 2,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    versionChipValue: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text.primary,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 10,
      width: '100%',
    },
    laterButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.divider,
      alignItems: 'center',
    },
    laterText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    updateButton: {
      flex: 2,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    updateText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
