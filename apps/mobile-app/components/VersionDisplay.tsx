import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '../lib/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { versionService } from '../lib/services/version-service';
import { apiClient } from '../lib/api-client';
import VersionInfoDrawer from './VersionInfoDrawer';
import type { VersionStatusState } from './VersionInfoDrawer';

const STATUS_REQUEST_TIMEOUT_MS = 30000;

const isAbortLikeError = (value: unknown): boolean => {
  const message = value instanceof Error ? value.message : String(value || '');
  return /aborted|cancelled|canceled/i.test(message);
};

function VersionBadge({
  styles,
  badgeInfo,
}: {
  styles: ReturnType<typeof getStyles>;
  badgeInfo: { color: string; text: string };
}) {
  return (
    <View style={[styles.versionBadge, { backgroundColor: badgeInfo.color }]}>
      <Text style={styles.versionBadgeText}>{badgeInfo.text}</Text>
    </View>
  );
}

interface VersionDisplayProps {
  showInSidebar?: boolean;
  compact?: boolean;
  bottomInset?: number;
}

export default function VersionDisplay({
  showInSidebar = false,
  compact = false,
  bottomInset = 0,
}: VersionDisplayProps) {
  const { colors } = useTheme();
  const [status, setStatus] = useState<VersionStatusState>('checking');
  const styles = getStyles(colors);

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
      const response = await apiClient.get('/status', {
        skipEventSegment: true,
        skipAuth: true,
        timeout: STATUS_REQUEST_TIMEOUT_MS,
      });

      if (response.success) {
        setStatus(response.data.status || 'unknown');
      } else if (!isAbortLikeError(response.error)) {
        setStatus('unhealthy');
      } else {
        return;
      }
    } catch (error) {
      if (isAbortLikeError(error)) {
        return;
      }
      console.error('Status check failed:', error);
      setStatus('unhealthy');
    }
  };

  if (compact) {
    return (
      <VersionInfoDrawer status={status} showStatusIndicator={true}>
        {(openDrawer: () => void) => (
          <TouchableOpacity
            style={styles.compactContainer}
            onPress={openDrawer}
          >
            <Text style={styles.compactText}>v{versionInfo.version}</Text>
            <VersionBadge styles={styles} badgeInfo={badgeInfo} />
          </TouchableOpacity>
        )}
      </VersionInfoDrawer>
    );
  }

  if (showInSidebar) {
    return (
      <VersionInfoDrawer status={status} showStatusIndicator={true}>
        {(openDrawer: () => void) => (
          <View
            style={[
              styles.sidebarContainer,
              { paddingBottom: Math.max(8, bottomInset) },
            ]}
          >
            <TouchableOpacity
              style={styles.sidebarVersionContainer}
              onPress={openDrawer}
              accessibilityRole="button"
              accessibilityLabel={`Version ${versionInfo.version}, ${badgeInfo.text}`}
            >
              <View style={styles.sidebarVersionInfo}>
                <Text style={styles.sidebarVersionText}>v{versionInfo.version}</Text>
                <VersionBadge styles={styles} badgeInfo={badgeInfo} />
              </View>
              <MaterialIcons name="info-outline" size={16} color={colors.text.secondary} />
            </TouchableOpacity>
          </View>
        )}
      </VersionInfoDrawer>
    );
  }

  return (
    <VersionInfoDrawer showStatusIndicator={false}>
      {(openDrawer: () => void) => (
        <View style={styles.container}>
          <TouchableOpacity
            style={styles.versionContainer}
            onPress={openDrawer}
          >
            <View style={styles.versionInfo}>
              <Text style={styles.versionText}>v{versionInfo.version}</Text>
              <VersionBadge styles={styles} badgeInfo={badgeInfo} />
            </View>
            <MaterialIcons name="info-outline" size={20} color={colors.text.secondary} />
          </TouchableOpacity>
        </View>
      )}
    </VersionInfoDrawer>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  sidebarContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
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
    minHeight: 28,
    paddingVertical: 2,
  },
  versionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sidebarVersionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  versionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginRight: 8,
  },
  sidebarVersionText: {
    fontSize: 12,
    fontWeight: '600',
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
