import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
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

interface VersionStatusIndicatorProps {
  compact?: boolean;
  showVersion?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export default function VersionStatusIndicator({
  compact = false,
  showVersion = true,
  size = 'medium'
}: VersionStatusIndicatorProps) {
  const { isDark, colors } = useTheme();
  const [status, setStatus] = useState<VersionStatusState>('checking');
  const styles = getStyles(isDark, colors, size);

  const versionInfo = versionService.getCurrentVersion();

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

  const getStatusColor = (): string => {
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

  if (compact) {
    return (
      <VersionInfoDrawer status={status} showStatusIndicator={true}>
        {(openDrawer: () => void) => (
          <TouchableOpacity
            style={styles.compactContainer}
            onPress={openDrawer}
            activeOpacity={0.7}
          >
            <View style={[styles.statusLight, { backgroundColor: getStatusColor() }]} />
            {showVersion && (
              <Text style={styles.compactVersionText}>v{versionInfo.version}</Text>
            )}
          </TouchableOpacity>
        )}
      </VersionInfoDrawer>
    );
  }

  return (
    <VersionInfoDrawer status={status} showStatusIndicator={true}>
      {(openDrawer: () => void) => (
        <TouchableOpacity
          style={styles.container}
          onPress={openDrawer}
          activeOpacity={0.7}
        >
          <View style={styles.content}>
            {showVersion && (
              <Text style={styles.versionText}>v{versionInfo.version}</Text>
            )}
            <View style={styles.statusContainer}>
              {status === 'checking' ? (
                <ActivityIndicator size="small" color={getStatusColor()} />
              ) : (
                <View style={[styles.statusLight, { backgroundColor: getStatusColor() }]} />
              )}
            </View>
          </View>
        </TouchableOpacity>
      )}
    </VersionInfoDrawer>
  );
}

const getStyles = (isDark: boolean, colors: any, size: 'small' | 'medium' | 'large') => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  versionText: {
    fontSize: size === 'small' ? 10 : size === 'large' ? 14 : 12,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  compactVersionText: {
    fontSize: 10,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLight: {
    width: size === 'small' ? 8 : size === 'large' ? 12 : 10,
    height: size === 'small' ? 8 : size === 'large' ? 12 : 10,
    borderRadius: size === 'small' ? 4 : size === 'large' ? 6 : 5,
    boxShadow: '0px 0px 3px rgba(0, 0, 0, 0.40)',
  },
});
