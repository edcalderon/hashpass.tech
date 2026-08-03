import React, { useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { versionService } from '../lib/services/version-service';
import { apiClient } from '../lib/api-client';
import { compareAppVersions } from '../config/runtime-version';
import packageJson from '../package.json';
import { useOtaUpdate } from '../hooks/useOtaUpdate';
import { useTranslation } from '../i18n/i18n';

type StatusState = 'healthy' | 'degraded' | 'unhealthy' | 'checking' | 'unknown';
type UpdateCheckState = 'idle' | 'checking' | 'up-to-date' | 'update-available' | 'error';

interface VersionQuickSheetProps {
  visible: boolean;
  onClose: () => void;
  onExpand: () => void;
  status?: StatusState;
  showStatusIndicator?: boolean;
}

const getStatusText = (status?: StatusState): string => {
  switch (status) {
    case 'healthy':
      return 'All systems operational';
    case 'degraded':
      return 'Some systems experiencing issues';
    case 'unhealthy':
      return 'Systems experiencing problems';
    case 'checking':
      return 'Checking system status...';
    default:
      return 'Status unknown';
  }
};

const getStatusColor = (status?: StatusState): string => {
  switch (status) {
    case 'healthy':
      return '#4CAF50';
    case 'degraded':
      return '#FF9800';
    case 'unhealthy':
      return '#F44336';
    case 'checking':
      return '#9E9E9E';
    default:
      return '#9E9E9E';
  }
};

export default function VersionQuickSheet({
  visible,
  onClose,
  onExpand,
  status,
  showStatusIndicator = false,
}: VersionQuickSheetProps) {
  const { isDark, colors } = useTheme();
  const styles = getStyles(isDark, colors);
  const { t } = useTranslation('version');
  const [updateCheckState, setUpdateCheckState] = useState<UpdateCheckState>('idle');
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [storeWebUrl, setStoreWebUrl] = useState<string | null>(null);
  // The app shell and details modal own the always-on OTA lifecycle. Keep the
  // quick sheet passive while hidden so mounting it does not start a third
  // check/download listener; when opened it may perform a foreground check.
  const otaUpdate = useOtaUpdate({ autoCheck: visible });

  const versionInfo = versionService.getCurrentVersion();
  const badgeInfo = versionService.getVersionBadgeInfo(versionInfo.releaseType);
  const buildInfo = versionService.getBuildInfo();

  const handleCheckForUpdates = async () => {
    setUpdateCheckState('checking');
    try {
      const currentVersion = packageJson.version;
      const response = await apiClient.get('/config/versions', {
        skipAuth: true,
        skipEventSegment: true,
        params: { clientVersion: currentVersion },
      } as any);
      if (!response.success || !response.data) {
        setUpdateCheckState('error');
        return;
      }
      const data = response.data;
      // Only a version with a native Play artifact belongs in this flow.
      // currentVersion can be newer because of web/OTA-only releases and must
      // never send users to the store for a binary that does not exist there.
      const latest: string | null = data.nativeVersion ?? data.currentVersion ?? null;
      setAvailableVersion(latest);
      const url: string | null = Platform.OS === 'android'
        ? (data.androidStoreUrl ?? null)
        : (data.iosStoreUrl ?? null);
      const webUrl: string | null = Platform.OS === 'android'
        ? (data.androidStoreWebUrl ?? null)
        : (data.iosStoreWebUrl ?? null);
      setStoreUrl(url);
      setStoreWebUrl(webUrl);
      if (latest && compareAppVersions(currentVersion, latest) < 0) {
        setUpdateCheckState('update-available');
      } else {
        setUpdateCheckState('up-to-date');
      }
    } catch {
      setUpdateCheckState('error');
    }
  };

  const handleOpenStore = async () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.location.reload();
      return;
    }

    // Prefer the native market:// deep link so this opens the Play Store app
    // directly; canOpenURL can return false (e.g. package visibility not
    // declared, or no store app installed), so fall back to the https URL
    // rather than let openURL reject with no fallback.
    if (storeUrl) {
      const canOpen = await Linking.canOpenURL(storeUrl).catch(() => false);
      if (canOpen) {
        await Linking.openURL(storeUrl).catch(() => null);
        return;
      }
    }
    if (storeWebUrl) {
      await Linking.openURL(storeWebUrl).catch(() => null);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.dragHandle} />
          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerRow}>
              <Text style={styles.title}>{t('quickTitle', 'Version')}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <MaterialIcons name="close" size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.versionRow}>
              <Text style={styles.versionNumber}>v{versionInfo.version}</Text>
              <View style={[styles.versionBadge, { backgroundColor: badgeInfo.color }]}>
                <Text style={styles.versionBadgeText}>{badgeInfo.text}</Text>
              </View>
            </View>

            <Text style={styles.releaseText}>{t('released', 'Released:')} {versionInfo.releaseDate}</Text>
            <Text style={styles.notesText}>{versionInfo.notes}</Text>

            <View style={styles.buildInfoCard}>
              <Text style={styles.buildLabel}>{t('buildInfoShort', 'Build Information')}</Text>
              <Text style={styles.buildText}>{t('buildId', 'Build ID:')} {buildInfo.buildId}</Text>
              <Text style={styles.buildText}>{t('buildTime', 'Build Time:')} {new Date(buildInfo.buildTime).toLocaleString()}</Text>
              <View style={styles.buildRow}>
                <Text style={styles.buildText}>{t('gitCommit', 'Git Commit:')} </Text>
                {buildInfo.gitCommitUrl && buildInfo.gitCommit !== 'unknown' ? (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(buildInfo.gitCommitUrl)}
                    style={styles.linkContainer}
                  >
                    <Text style={styles.linkText}>{buildInfo.gitCommit}</Text>
                    <MaterialIcons name="open-in-new" size={14} color={colors.primary} style={styles.linkIcon} />
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.buildText}>{buildInfo.gitCommit}</Text>
                )}
              </View>
              <Text style={styles.buildText}>{t('branch', 'Branch:')} {buildInfo.gitBranch}</Text>
            </View>

            {showStatusIndicator && status && (
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(status) }]} />
                <Text style={styles.statusText}>{getStatusText(status)}</Text>
              </View>
            )}

            <View style={styles.updateCheckSection}>
              {updateCheckState === 'idle' && (
                <TouchableOpacity style={styles.checkButton} onPress={handleCheckForUpdates} accessibilityLabel="Check for Play Store updates">
                  <MaterialIcons name="system-update" size={16} color={colors.primary} />
                  <Text style={styles.checkButtonText}>{t('playCheck', 'Check for Play Store updates')}</Text>
                </TouchableOpacity>
              )}
              {updateCheckState === 'checking' && (
                <View style={styles.checkResult}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.checkResultText}>{t('playChecking', 'Checking for Play Store updates…')}</Text>
                </View>
              )}
              {updateCheckState === 'up-to-date' && (
                <View style={styles.checkResult}>
                  <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                  <Text style={[styles.checkResultText, { color: '#4CAF50' }]}>{t('playUpToDate', "You're on the latest native version")}</Text>
                </View>
              )}
              {updateCheckState === 'update-available' && (
                <View style={styles.updateAvailableRow}>
                  <View style={styles.checkResult}>
                    <MaterialIcons name="new-releases" size={16} color={colors.primary} />
                    <Text style={[styles.checkResultText, { color: colors.primary }]}>
                      {t('playAvailable', 'v{version} is available', { version: availableVersion })}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.updateNowButton} onPress={handleOpenStore}>
                    <Text style={styles.updateNowText}>{t('playUpdate', 'Update')}</Text>
                  </TouchableOpacity>
                </View>
              )}
              {updateCheckState === 'error' && (
                <TouchableOpacity style={styles.checkResult} onPress={handleCheckForUpdates}>
                  <MaterialIcons name="error-outline" size={16} color={colors.text.secondary} />
                  <Text style={styles.checkResultText}>{t('playError', "Couldn't check — tap to retry")}</Text>
                </TouchableOpacity>
              )}
            </View>

            {Platform.OS !== 'web' && otaUpdate.state !== 'unsupported' && (
              <View style={styles.otaSection}>
                <Text style={styles.otaSectionTitle}>{t('otaSection', 'In-app updates')}</Text>
                {otaUpdate.state === 'checking' || otaUpdate.state === 'downloading' ? (
                  <View style={styles.checkResult}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.checkResultText}>
                      {otaUpdate.state === 'downloading' ? t('otaDownloading', 'Downloading OTA update…') : t('otaChecking', 'Checking for OTA updates…')}
                    </Text>
                  </View>
                ) : otaUpdate.state === 'ready' ? (
                  <View style={styles.updateAvailableRow}>
                    <View style={styles.checkResult}>
                      <MaterialIcons name="cloud-download" size={16} color="#4CAF50" />
                      <Text style={[styles.checkResultText, { color: '#4CAF50' }]}>{t('otaReady', 'OTA update ready')}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.updateNowButton}
                      accessibilityLabel="Restart to apply OTA update"
                      onPress={() => { void otaUpdate.applyUpdate(); }}
                    >
                      <Text style={styles.updateNowText}>{t('otaRestart', 'Restart')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : otaUpdate.state === 'error' ? (
                  <TouchableOpacity style={styles.checkResult} onPress={() => { void otaUpdate.checkForUpdate(true); }}>
                    <MaterialIcons name="error-outline" size={16} color={colors.text.secondary} />
                    <Text style={styles.checkResultText}>{t('otaError', 'OTA check failed — tap to retry')}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.checkButton}
                    accessibilityLabel="Check for OTA updates"
                    onPress={() => { void otaUpdate.checkForUpdate(true); }}
                  >
                    <MaterialIcons name="cloud-sync" size={16} color={colors.primary} />
                    <Text style={styles.checkButtonText}>{t('otaCheck', 'Check for OTA updates')}</Text>
                  </TouchableOpacity>
                )}
                <Text style={styles.otaHint}>{t('otaHint', 'Downloads app updates without opening Google Play.')}</Text>
              </View>
            )}

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
                <Text style={styles.secondaryButtonText}>{t('close', 'Close')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={onExpand}>
                <Text style={styles.primaryButtonText}>{t('expandDetails', 'Expand details')}</Text>
                <MaterialIcons name="open-in-full" size={14} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (isDark: boolean, colors: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      backgroundColor: colors.background.paper,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 18,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      maxHeight: '72%',
    },
    content: {
      flexGrow: 0,
    },
    contentContainer: {
      paddingBottom: 2,
    },
    dragHandle: {
      width: 34,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
      alignSelf: 'center',
      marginBottom: 12,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text.primary,
    },
    closeButton: {
      padding: 4,
      borderRadius: 8,
    },
    versionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    versionNumber: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text.primary,
    },
    versionBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    versionBadgeText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: 0.5,
    },
    releaseText: {
      fontSize: 12,
      color: colors.text.secondary,
      marginBottom: 6,
    },
    notesText: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.text.primary,
      marginBottom: 12,
    },
    buildInfoCard: {
      backgroundColor: colors.background.default,
      borderWidth: 1,
      borderColor: colors.divider,
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
    },
    buildLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 8,
    },
    buildText: {
      fontSize: 12,
      color: colors.text.secondary,
      marginBottom: 4,
    },
    buildRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },
    linkContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    linkText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
      textDecorationLine: 'underline',
      textDecorationColor: colors.primary,
    },
    linkIcon: {
      marginLeft: 4,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 8,
    },
    statusText: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    updateCheckSection: {
      marginBottom: 12,
    },
    otaSection: {
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      paddingTop: 10,
      marginBottom: 12,
    },
    otaSectionTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 4,
    },
    otaHint: {
      fontSize: 11,
      color: colors.text.secondary,
      marginTop: 2,
    },
    checkButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.primary,
      alignSelf: 'flex-start',
    },
    checkButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    checkResult: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
    },
    checkResultText: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    updateAvailableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    updateNowButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
    },
    updateNowText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 10,
      marginTop: 2,
    },
    secondaryButton: {
      borderWidth: 1,
      borderColor: colors.divider,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.background.default,
    },
    secondaryButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.primary,
    },
    primaryButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: '#FFFFFF',
    },
  });
