import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { versionService } from '../lib/services/version-service';
import VersionDetailsModal from './VersionDetailsModal';

interface VersionStatusIndicatorProps {
  compact?: boolean;
  showVersion?: boolean;
  size?: 'small' | 'medium' | 'large';
}

type StatusState = 'healthy' | 'degraded' | 'unhealthy' | 'checking' | 'unknown';

export default function VersionStatusIndicator({ 
  compact = false, 
  showVersion = true,
  size = 'medium'
}: VersionStatusIndicatorProps) {
  const { isDark, colors } = useTheme();
  const [status, setStatus] = useState<StatusState>('checking');
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [showModal, setShowModal] = useState(false);
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
      setLastCheck(new Date());
    } catch (error) {
      console.error('Status check failed:', error);
      setStatus('unhealthy');
      setLastCheck(new Date());
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

  const getStatusIcon = () => {
    switch (status) {
      case 'healthy':
        return 'check-circle';
      case 'degraded':
        return 'warning';
      case 'unhealthy':
        return 'error';
      case 'checking':
        return 'sync';
      default:
        return 'help-outline';
    }
  };

  const handlePress = () => {
    setShowModal(true);
  };

  if (compact) {
    return (
      <>
        <TouchableOpacity
          style={styles.compactContainer}
          onPress={handlePress}
          activeOpacity={0.7}
        >
          <View style={[styles.statusLight, { backgroundColor: getStatusColor() }]} />
          {showVersion && (
            <Text style={styles.compactVersionText}>v{versionInfo.version}</Text>
          )}
        </TouchableOpacity>
        <VersionDetailsModal 
          visible={showModal}
          onClose={() => setShowModal(false)}
          status={status}
          showStatusIndicator={true}
        />
      </>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={styles.container}
        onPress={handlePress}
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
      <VersionDetailsModal 
        visible={showModal}
        onClose={() => setShowModal(false)}
        status={status}
        showStatusIndicator={true}
      />
    </>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 3,
  },
});

