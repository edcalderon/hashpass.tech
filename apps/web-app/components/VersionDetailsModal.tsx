import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Linking, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '../hooks/useTheme';
import { versionService } from '../lib/services/version-service';
import { t } from '@lingui/macro';

interface VersionDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  status?: 'healthy' | 'degraded' | 'unhealthy' | 'checking' | 'unknown';
  showStatusIndicator?: boolean;
}

export default function VersionDetailsModal({ 
  visible, 
  onClose,
  status,
  showStatusIndicator = false
}: VersionDetailsModalProps) {
  const { isDark, colors } = useTheme();
  const router = useRouter();
  const styles = getStyles(isDark, colors);

  const versionInfo = versionService.getCurrentVersion();
  const buildInfo = versionService.getBuildInfo();
  const versionHistory = versionService.getVersionHistory();
  const badgeInfo = versionService.getVersionBadgeInfo(versionInfo.releaseType);

  const getStatusColor = (): string => {
    if (!status) return '#9E9E9E';
    switch (status) {
      case 'healthy':
        return '#4CAF50'; // Green
      case 'degraded':
        return '#FF9800'; // Orange
      case 'unhealthy':
        return '#F44336'; // Red
      case 'checking':
        return '#9E9E9E'; // Gray
      default:
        return '#9E9E9E'; // Gray
    }
  };

  const getStatusText = (): string => {
    if (!status) return 'Unknown';
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

  const handleStatusClick = () => {
    onClose();
    router.push('/status' as any);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{t({ id: 'version.title', message: 'Version Information' })}</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
          >
            <MaterialIcons name="close" size={24} color={colors.text.primary} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
          {/* Current Version */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t({ id: 'version.current', message: 'Current Version' })}</Text>
            <View style={styles.versionCard}>
              <View style={styles.versionHeader}>
                <Text style={styles.versionNumber}>v{versionInfo.version}</Text>
                <View style={[styles.versionBadge, { backgroundColor: badgeInfo.color }]}>
                  <Text style={styles.versionBadgeText}>{badgeInfo.text}</Text>
                </View>
              </View>
              <Text style={styles.versionDate}>{t({ id: 'version.released', message: 'Released:' })} {versionInfo.releaseDate}</Text>
              <Text style={styles.versionNotes}>{versionInfo.notes}</Text>
              
              {buildInfo && (
                <View style={styles.buildInfo}>
                  <Text style={styles.buildLabel}>{t({ id: 'version.buildInfo', message: 'Build Information:' })}</Text>
                  <Text style={styles.buildText}>{t({ id: 'version.buildId', message: 'Build ID:' })} {buildInfo.buildId}</Text>
                  <Text style={styles.buildText}>{t({ id: 'version.buildTime', message: 'Build Time:' })} {new Date(buildInfo.buildTime).toLocaleString()}</Text>
                  <View style={styles.buildRow}>
                    <Text style={styles.buildText}>{t({ id: 'version.gitCommit', message: 'Git Commit:' })} </Text>
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
                  <Text style={styles.buildText}>{t({ id: 'version.branch', message: 'Branch:' })} {buildInfo.gitBranch}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Features */}
          {versionInfo.features.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t({ id: 'version.features', message: 'New Features' })}</Text>
              {versionInfo.features.map((feature, index) => (
                <View key={index} style={styles.featureItem}>
                  <MaterialIcons name="check-circle" size={16} color="#34A853" />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Bug Fixes */}
          {versionInfo.bugfixes.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t({ id: 'version.bugfixes', message: 'Bug Fixes' })}</Text>
              {versionInfo.bugfixes.map((fix, index) => (
                <View key={index} style={styles.featureItem}>
                  <MaterialIcons name="bug-report" size={16} color="#FF9500" />
                  <Text style={styles.featureText}>{fix}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Breaking Changes */}
          {versionInfo.breakingChanges.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t({ id: 'version.breakingChanges', message: 'Breaking Changes' })}</Text>
              {versionInfo.breakingChanges.map((change, index) => (
                <View key={index} style={styles.featureItem}>
                  <MaterialIcons name="warning" size={16} color="#FF3B30" />
                  <Text style={styles.featureText}>{change}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Version History */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t({ id: 'version.history', message: 'Version History' })}</Text>
            {versionHistory.slice(0, 5).map((version) => {
              const tagUrl = buildInfo?.gitRepoUrl 
                ? `${buildInfo.gitRepoUrl}/releases/tag/v${version.version}`
                : null;
              
              return (
                <View key={version.version} style={styles.historyItem}>
                  <View style={styles.historyHeader}>
                    <View style={styles.historyVersionContainer}>
                      {tagUrl ? (
                        <TouchableOpacity
                          onPress={() => Linking.openURL(tagUrl)}
                          style={styles.historyLinkContainer}
                        >
                          <Text style={styles.historyVersion}>v{version.version}</Text>
                          <MaterialIcons name="open-in-new" size={14} color={colors.primary} style={styles.historyLinkIcon} />
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.historyVersion}>v{version.version}</Text>
                      )}
                    </View>
                    <Text style={styles.historyDate}>{version.releaseDate}</Text>
                  </View>
                  <Text style={styles.historyNotes}>{version.notes}</Text>
                </View>
              );
            })}
          </View>

          {/* System Status */}
          {status && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t({ id: 'version.status', message: 'System Status' })}</Text>
              <TouchableOpacity
                style={styles.statusCard}
                onPress={handleStatusClick}
                activeOpacity={0.7}
              >
                <View style={styles.statusHeader}>
                  <View style={styles.statusIndicatorContainer}>
                    {status === 'checking' ? (
                      <ActivityIndicator size="small" color={getStatusColor()} />
                    ) : (
                      <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
                    )}
                    <Text style={styles.statusText}>{getStatusText()}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color={colors.text.secondary} />
                </View>
                <Text style={styles.statusSummary}>
                  {t({ id: 'version.statusSummary', message: 'Click to view detailed system status and service health information.' })}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  versionCard: {
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  versionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  versionNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.primary,
  },
  versionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  versionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  versionDate: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 8,
  },
  versionNotes: {
    fontSize: 14,
    color: colors.text.primary,
    lineHeight: 20,
    marginBottom: 12,
  },
  buildInfo: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  buildLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  buildText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  buildRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  linkText: {
    fontSize: 12,
    color: colors.primary,
    fontFamily: 'monospace',
    textDecorationLine: 'underline',
  },
  linkIcon: {
    marginLeft: 2,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    color: colors.text.primary,
    lineHeight: 20,
  },
  historyItem: {
    backgroundColor: colors.background.paper,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  historyVersionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyVersion: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  historyLinkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyLinkIcon: {
    marginLeft: 2,
  },
  historyDate: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  historyNotes: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  statusCard: {
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 3,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 1,
  },
  statusSummary: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
  },
});

