import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { versionService } from '../lib/services/version-service';
import { apiClient } from '../lib/api-client';
import VersionDetailsModal from './VersionDetailsModal';
import VersionQuickSheet from './VersionQuickSheet';

interface VersionDisplayProps {
  showInSidebar?: boolean;
  compact?: boolean;
}

type StatusState = 'healthy' | 'degraded' | 'unhealthy' | 'checking' | 'unknown';

export default function VersionDisplay({ showInSidebar = false, compact = false }: VersionDisplayProps) {
  const { isDark, colors } = useTheme();
  const [showQuickDetails, setShowQuickDetails] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [status, setStatus] = useState<StatusState>('checking');
  const styles = getStyles(isDark, colors);

  const versionInfo = versionService.getCurrentVersion();
  const badgeInfo = versionService.getVersionBadgeInfo(versionInfo.releaseType);

  useEffect(() => {
    checkStatus();
    // Check status every 30 seconds
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkStatus = async () => {
    try {
      setStatus('checking');
      const response = await apiClient.get('/status', { skipEventSegment: true });

      if (response.success) {
        setStatus(response.data.status || 'unknown');
      } else {
        setStatus('unhealthy');
      }
    } catch (error) {
      console.error('Status check failed:', error);
      setStatus('unhealthy');
    }
  };

  const VersionBadge = () => (
    <View style={[styles.versionBadge, { backgroundColor: badgeInfo.color }]}>
      <Text style={styles.versionBadgeText}>{badgeInfo.text}</Text>
    </View>
  );

  const openQuickDetails = () => setShowQuickDetails(true);
  const closeQuickDetails = () => setShowQuickDetails(false);
  const expandToFullDetails = () => {
    setShowQuickDetails(false);
    setShowDetails(true);
  };

  if (compact) {
    return (
      <>
        <TouchableOpacity
          style={styles.compactContainer}
          onPress={openQuickDetails}
        >
          <Text style={styles.compactText}>v{versionInfo.version}</Text>
          <VersionBadge />
        </TouchableOpacity>
        <VersionQuickSheet
          visible={showQuickDetails}
          onClose={closeQuickDetails}
          onExpand={expandToFullDetails}
          status={status}
          showStatusIndicator={true}
        />
        <VersionDetailsModal
          visible={showDetails}
          onClose={() => setShowDetails(false)}
          status={status}
          showStatusIndicator={true}
        />
      </>
    );
  }

  if (showInSidebar) {
    return (
      <>
        <View style={styles.sidebarContainer}>
          <TouchableOpacity
            style={styles.sidebarVersionContainer}
            onPress={openQuickDetails}
          >
            <View style={styles.sidebarVersionInfo}>
              <Text style={styles.sidebarVersionText}>v{versionInfo.version}</Text>
              <VersionBadge />
            </View>
            <MaterialIcons name="info-outline" size={16} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
        <VersionQuickSheet
          visible={showQuickDetails}
          onClose={closeQuickDetails}
          onExpand={expandToFullDetails}
          status={status}
          showStatusIndicator={true}
        />
        <VersionDetailsModal
          visible={showDetails}
          onClose={() => setShowDetails(false)}
          status={status}
          showStatusIndicator={true}
        />
      </>
    );
  }

  return (
    <>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.versionContainer}
          onPress={openQuickDetails}
        >
          <View style={styles.versionInfo}>
            <Text style={styles.versionText}>v{versionInfo.version}</Text>
            <VersionBadge />
          </View>
          <MaterialIcons name="info-outline" size={20} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>
      <VersionQuickSheet
        visible={showQuickDetails}
        onClose={closeQuickDetails}
        onExpand={expandToFullDetails}
        showStatusIndicator={false}
      />
      <VersionDetailsModal
        visible={showDetails}
        onClose={() => setShowDetails(false)}
        showStatusIndicator={false}
      />
    </>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sidebarContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  versionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  sidebarVersionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  versionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sidebarVersionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  versionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginRight: 8,
  },
  sidebarVersionText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.secondary,
    marginRight: 6,
  },
  compactText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.secondary,
    marginRight: 6,
  },
  versionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  versionBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
