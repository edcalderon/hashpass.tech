import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../i18n/i18n';

interface VersionUpdateNotificationProps {
  currentVersion: string;
  latestVersion: string;
  onUpdateComplete?: () => void;
}

type UpdateStep = 'idle' | 'clearing' | 'reloading';

export default function VersionUpdateNotification({
  currentVersion,
  latestVersion,
  onUpdateComplete,
}: VersionUpdateNotificationProps) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('version');
  const [step, setStep] = useState<UpdateStep>('idle');

  if (Platform.OS !== 'web') {
    return null;
  }

  const isUpdating = step !== 'idle';

  const handleUpdate = async () => {
    setStep('clearing');
    try {
      await clearAllCaches();
      setStep('reloading');
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch {
      setStep('idle');
    }
  };

  const handleLater = () => {
    onUpdateComplete?.();
  };

  const buttonLabel =
    step === 'clearing' ? t('updateClearing', 'Clearing cache…')
    : step === 'reloading' ? t('updateReloading', 'Reloading…')
    : t('updateNow', 'Update Now');

  const styles = getStyles(isDark, colors);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={isUpdating ? undefined : handleLater} />
        <View style={styles.dialog}>

          {/* Icon with concentric glow rings */}
          <View style={styles.iconRow}>
            <View style={styles.iconRingOuter}>
              <View style={styles.iconRingInner}>
                <View style={styles.iconBg}>
                  {/* inline SVG — download arrow pointing DOWN into tray */}
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 3V15M8 11L12 15L16 11" stroke={colors.primary} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M4 18H20" stroke={colors.primary} strokeWidth="2.2" strokeLinecap="round"/>
                  </svg>
                </View>
              </View>
            </View>
          </View>

          <Text style={styles.title}>{t('updateAvailable', 'Update Available')}</Text>
          <Text style={styles.subtitle}>
            {t('updateSubtitle', 'A new version of HASHPASS is ready to install.')}
          </Text>

          {/* Version comparison */}
          <View style={styles.versionRow}>
            <View style={styles.versionChip}>
              <Text style={styles.versionChipLabel}>{t('updateCurrentLabel', 'Current')}</Text>
              <Text style={styles.versionChipValue}>v{currentVersion}</Text>
            </View>

            <View style={styles.arrowWrap}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 12H19M15 8L19 12L15 16" stroke={colors.primary} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </View>

            <View style={[
              styles.versionChip,
              styles.versionChipNew,
              {
                borderColor: colors.primary,
                backgroundColor: isDark ? 'rgba(200,16,0,0.12)' : 'rgba(200,16,0,0.07)',
              },
            ]}>
              <View style={styles.newBadgeRow}>
                <Text style={[styles.versionChipLabel, { color: colors.primary }]}>{t('updateLatestLabel', 'Latest')}</Text>
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>{t('updateNewBadge', 'NEW')}</Text>
                </View>
              </View>
              <Text style={[styles.versionChipValue, { color: colors.primary }]}>v{latestVersion}</Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.laterButton}
              onPress={handleLater}
              disabled={isUpdating}
            >
              <Text style={[styles.laterText, isUpdating && { opacity: 0.4 }]}>{t('updateLater', 'Later')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.updateButton, isUpdating && styles.buttonUpdating]}
              onPress={handleUpdate}
              disabled={isUpdating}
            >
              <View style={styles.updateButtonContent}>
                {isUpdating && (
                  <View style={styles.spinnerWrap}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  </View>
                )}
                <Text style={styles.updateText}>{buttonLabel}</Text>
              </View>
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
      backgroundColor: 'rgba(0,0,0,0.60)',
    },
    dialog: {
      backgroundColor: colors.background.paper,
      borderRadius: 24,
      padding: 28,
      paddingTop: 32,
      width: '100%',
      maxWidth: 368,
      alignItems: 'center',
      boxShadow: '0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(200,16,0,0.12)',
      elevation: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    },
    iconRow: {
      marginBottom: 20,
    },
    iconRingOuter: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: isDark ? 'rgba(200,16,0,0.07)' : 'rgba(200,16,0,0.05)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconRingInner: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: isDark ? 'rgba(200,16,0,0.12)' : 'rgba(200,16,0,0.08)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    iconBg: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: isDark ? 'rgba(200,16,0,0.22)' : 'rgba(200,16,0,0.12)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontSize: 21,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 8,
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    subtitle: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 24,
      lineHeight: 20,
    },
    versionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 28,
    },
    versionChip: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 10,
      alignItems: 'center',
      minWidth: 90,
    },
    versionChipNew: {
      borderWidth: 1,
    },
    newBadgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginBottom: 2,
    },
    newBadge: {
      backgroundColor: colors.primary,
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 1,
    },
    newBadgeText: {
      fontSize: 8,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: 0.4,
    },
    versionChipLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.text.secondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    versionChipValue: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text.primary,
    },
    arrowWrap: {
      opacity: 0.85,
    },
    buttonRow: {
      flexDirection: 'row',
      gap: 10,
      width: '100%',
    },
    laterButton: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.divider,
      alignItems: 'center',
      justifyContent: 'center',
    },
    laterText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    updateButton: {
      flex: 2,
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: '0 4px 14px rgba(200,16,0,0.35)',
    },
    buttonUpdating: {
      opacity: 0.85,
    },
    updateButtonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    spinnerWrap: {
      width: 18,
      height: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    updateText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
