import React from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { versionService } from '../lib/services/version-service';

type StatusState = 'healthy' | 'degraded' | 'unhealthy' | 'checking' | 'unknown';

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

  const versionInfo = versionService.getCurrentVersion();
  const badgeInfo = versionService.getVersionBadgeInfo(versionInfo.releaseType);
  const buildInfo = versionService.getBuildInfo();

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
              <Text style={styles.title}>Version</Text>
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

            <Text style={styles.releaseText}>Released: {versionInfo.releaseDate}</Text>
            <Text style={styles.notesText}>{versionInfo.notes}</Text>

            <View style={styles.buildInfoCard}>
              <Text style={styles.buildLabel}>Build Information</Text>
              <Text style={styles.buildText}>Build ID: {buildInfo.buildId}</Text>
              <Text style={styles.buildText}>Build Time: {new Date(buildInfo.buildTime).toLocaleString()}</Text>
              <View style={styles.buildRow}>
                <Text style={styles.buildText}>Git Commit: </Text>
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
              <Text style={styles.buildText}>Branch: {buildInfo.gitBranch}</Text>
            </View>

            {showStatusIndicator && status && (
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: getStatusColor(status) }]} />
                <Text style={styles.statusText}>{getStatusText(status)}</Text>
              </View>
            )}

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={onClose}>
                <Text style={styles.secondaryButtonText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryButton} onPress={onExpand}>
                <Text style={styles.primaryButtonText}>Expand details</Text>
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
