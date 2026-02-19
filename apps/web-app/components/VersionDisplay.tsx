import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { versionService } from '../lib/services/version-service';
import VersionDetailsModal from './VersionDetailsModal';

interface VersionDisplayProps {
  showInSidebar?: boolean;
  compact?: boolean;
}

type StatusState = 'healthy' | 'degraded' | 'unhealthy' | 'checking' | 'unknown';

export default function VersionDisplay({ showInSidebar = false, compact = false }: VersionDisplayProps) {
  const { isDark, colors } = useTheme();
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
      const response = await fetch('https://api.hashpass.tech/api/status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStatus(data.status || 'unknown');
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

  if (compact) {
    return (
      <>
        <TouchableOpacity
          style={styles.compactContainer}
          onPress={() => setShowDetails(true)}
        >
          <Text style={styles.compactText}>v{versionInfo.version}</Text>
          <VersionBadge />
        </TouchableOpacity>
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
            onPress={() => setShowDetails(true)}
          >
            <View style={styles.sidebarVersionInfo}>
              <Text style={styles.sidebarVersionText}>v{versionInfo.version}</Text>
              <VersionBadge />
            </View>
            <MaterialIcons name="info-outline" size={16} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
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
          onPress={() => setShowDetails(true)}
        >
          <View style={styles.versionInfo}>
            <Text style={styles.versionText}>v{versionInfo.version}</Text>
            <VersionBadge />
          </View>
          <MaterialIcons name="info-outline" size={20} color={colors.text.secondary} />
        </TouchableOpacity>
      </View>
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
