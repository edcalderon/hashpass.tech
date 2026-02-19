import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Platform, TouchableOpacity } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import LoadingScreen from '../components/LoadingScreen';
import { apiClient } from '@/lib/api-client';
import { useTranslation } from '../i18n/i18n';

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version?: string;
  services: {
    database: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      tables: {
        [key: string]: {
          accessible: boolean;
          recordCount?: number;
          error?: string;
        };
      };
    };
    email: {
      status: 'healthy' | 'unhealthy' | 'not_configured';
      configured: boolean;
      error?: string;
    };
    api: {
      status: 'healthy' | 'unhealthy';
      endpoints: {
        [key: string]: {
          accessible: boolean;
          error?: string;
        };
      };
    };
  };
  checks: {
    agenda: {
      hasData: boolean;
      lastUpdated: string | null;
      itemCount: number;
    };
    speakers: {
      count: number;
      accessible: boolean;
    };
    bookings: {
      count: number;
      accessible: boolean;
    };
    passes: {
      count: number;
      accessible: boolean;
    };
  };
}

export default function StatusPage() {
  const { isDark, colors } = useTheme();
  const { t } = useTranslation('status');
  const router = useRouter();
  const [healthCheck, setHealthCheck] = useState<HealthCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStatus = async () => {
    try {
      setError(null);
      
      // Use apiClient with skipEventSegment to access global /api/status endpoint
      const result = await apiClient.request<HealthCheck>('status', {
        skipEventSegment: true,
      });

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch status');
      }

      setHealthCheck(result.data);
    } catch (err: any) {
      console.error('Error fetching status:', err);
      setError(err?.message || 'Failed to fetch status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStatus();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return '#34A853';
      case 'degraded':
        return '#FF9500';
      case 'unhealthy':
        return '#FF3B30';
      case 'not_configured':
        return '#8E8E93';
      default:
        return '#8E8E93';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'check-circle';
      case 'degraded':
        return 'warning';
      case 'unhealthy':
        return 'error';
      case 'not_configured':
        return 'info';
      default:
        return 'help';
    }
  };

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    try {
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch {
      return timestamp;
    }
  };

  if (loading && !healthCheck) {
    return <LoadingScreen />;
  }

  const styles = getStyles(isDark, colors);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('title') || 'System Status'}</Text>
        <View style={styles.placeholder} />
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={24} color="#FF3B30" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!healthCheck && !error && !loading && (
        <View style={styles.errorContainer}>
          <MaterialIcons name="info-outline" size={24} color={colors.text.secondary} />
          <Text style={styles.errorText}>{t('noData') || 'No status data available'}</Text>
        </View>
      )}

      {healthCheck && (
        <>
          {/* Overall Status */}
          <View style={styles.section}>
            <View style={styles.statusHeader}>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(healthCheck.status) },
                ]}
              >
                <MaterialIcons
                  name={getStatusIcon(healthCheck.status) as any}
                  size={20}
                  color="#FFFFFF"
                />
                <Text style={styles.statusBadgeText}>
                  {healthCheck.status.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.timestamp}>
                {t('lastUpdated') || 'Last updated'}: {formatTimestamp(healthCheck.timestamp)}
              </Text>
            </View>
          </View>

          {/* Database Status */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('database') || 'Database'}</Text>
            <View
              style={[
                styles.serviceCard,
                {
                  borderLeftColor: getStatusColor(
                    healthCheck.services.database.status
                  ),
                },
              ]}
            >
              <View style={styles.serviceHeader}>
                <MaterialIcons
                  name={getStatusIcon(healthCheck.services.database.status) as any}
                  size={20}
                  color={getStatusColor(healthCheck.services.database.status)}
                />
                <Text style={styles.serviceStatus}>
                  {healthCheck.services.database.status.toUpperCase()}
                </Text>
                {healthCheck.services.database.responseTime && (
                  <Text style={styles.responseTime}>
                    {healthCheck.services.database.responseTime}ms
                  </Text>
                )}
              </View>
              <View style={styles.tablesContainer}>
                {Object.entries(healthCheck.services.database.tables).map(
                  ([tableName, table]) => (
                    <View key={tableName} style={styles.tableRow}>
                      <MaterialIcons
                        name={
                          table.accessible
                            ? ('check-circle' as any)
                            : ('error' as any)
                        }
                        size={16}
                        color={
                          table.accessible
                            ? '#34A853'
                            : '#FF3B30'
                        }
                      />
                      <Text style={styles.tableName}>{tableName}</Text>
                      {table.recordCount !== undefined && (
                        <Text style={styles.tableCount}>
                          {table.recordCount} records
                        </Text>
                      )}
                      {table.error && (
                        <Text style={styles.tableError}>{table.error}</Text>
                      )}
                    </View>
                  )
                )}
              </View>
            </View>
          </View>

          {/* Email Service */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('emailService') || 'Email Service'}</Text>
            <View
              style={[
                styles.serviceCard,
                {
                  borderLeftColor: getStatusColor(
                    healthCheck.services.email.status
                  ),
                },
              ]}
            >
              <View style={styles.serviceHeader}>
                <MaterialIcons
                  name={getStatusIcon(healthCheck.services.email.status) as any}
                  size={20}
                  color={getStatusColor(healthCheck.services.email.status)}
                />
                <Text style={styles.serviceStatus}>
                  {healthCheck.services.email.status
                    .toUpperCase()
                    .replace('_', ' ')}
                </Text>
              </View>
              <Text style={styles.serviceDetail}>
                {t('configured') || 'Configured'}: {healthCheck.services.email.configured ? (t('yes') || 'Yes') : (t('no') || 'No')}
              </Text>
            </View>
          </View>

          {/* API Endpoints */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('apiEndpoints') || 'API Endpoints'}</Text>
            <View
              style={[
                styles.serviceCard,
                {
                  borderLeftColor: getStatusColor(
                    healthCheck.services.api.status
                  ),
                },
              ]}
            >
              <View style={styles.serviceHeader}>
                <MaterialIcons
                  name={getStatusIcon(healthCheck.services.api.status) as any}
                  size={20}
                  color={getStatusColor(healthCheck.services.api.status)}
                />
                <Text style={styles.serviceStatus}>
                  {healthCheck.services.api.status.toUpperCase()}
                </Text>
              </View>
              <View style={styles.endpointsContainer}>
                {Object.entries(healthCheck.services.api.endpoints).map(
                  ([endpoint, endpointStatus]) => (
                    <View key={endpoint} style={styles.endpointRow}>
                      <MaterialIcons
                        name={
                          endpointStatus.accessible
                            ? ('check-circle' as any)
                            : ('error' as any)
                        }
                        size={16}
                        color={
                          endpointStatus.accessible
                            ? '#34A853'
                            : '#FF3B30'
                        }
                      />
                      <Text style={styles.endpointName}>{endpoint}</Text>
                    </View>
                  )
                )}
              </View>
            </View>
          </View>

          {/* System Checks */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('systemChecks') || 'System Checks'}</Text>
            <View style={styles.checksContainer}>
              <View style={styles.checkCard}>
                <Text style={styles.checkTitle}>{t('agenda') || 'Agenda'}</Text>
                <Text style={styles.checkDetail}>
                  {healthCheck.checks.agenda.hasData ? (t('hasData') || 'Has Data') : (t('noData') || 'No Data')}
                </Text>
                <Text style={styles.checkDetail}>
                  {t('items') || 'Items'}: {healthCheck.checks.agenda.itemCount}
                </Text>
                {healthCheck.checks.agenda.lastUpdated && (
                  <Text style={styles.checkDetail}>
                    {t('updated') || 'Updated'}: {formatTimestamp(healthCheck.checks.agenda.lastUpdated)}
                  </Text>
                )}
              </View>

              <View style={styles.checkCard}>
                <Text style={styles.checkTitle}>{t('speakers') || 'Speakers'}</Text>
                <Text style={styles.checkDetail}>
                  {healthCheck.checks.speakers.accessible ? (t('accessible') || 'Accessible') : (t('notAccessible') || 'Not Accessible')}
                </Text>
                <Text style={styles.checkDetail}>
                  {t('count') || 'Count'}: {healthCheck.checks.speakers.count}
                </Text>
              </View>

              <View style={styles.checkCard}>
                <Text style={styles.checkTitle}>{t('bookings') || 'Bookings'}</Text>
                <Text style={styles.checkDetail}>
                  {healthCheck.checks.bookings.accessible ? (t('accessible') || 'Accessible') : (t('notAccessible') || 'Not Accessible')}
                </Text>
                <Text style={styles.checkDetail}>
                  {t('count') || 'Count'}: {healthCheck.checks.bookings.count}
                </Text>
              </View>

              <View style={styles.checkCard}>
                <Text style={styles.checkTitle}>{t('passes') || 'Passes'}</Text>
                <Text style={styles.checkDetail}>
                  {healthCheck.checks.passes.accessible ? (t('accessible') || 'Accessible') : (t('notAccessible') || 'Not Accessible')}
                </Text>
                <Text style={styles.checkDetail}>
                  {t('count') || 'Count'}: {healthCheck.checks.passes.count}
                </Text>
              </View>
            </View>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {t('autoRefresh') || 'Status page auto-refreshes every 30 seconds'}
            </Text>
            <Text style={styles.footerText}>
              {t('pullToRefresh') || 'Pull down to refresh manually'}
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const getStyles = (isDark: boolean, colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.default,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 20,
      paddingTop: Platform.OS === 'web' ? 20 : 60,
      backgroundColor: colors.background.paper,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
      shadowColor: isDark ? '#000' : '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    backButton: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: 'transparent',
    },
    placeholder: {
      width: 40,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text.primary,
    },
    errorContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      margin: 16,
      backgroundColor: isDark ? 'rgba(255, 59, 48, 0.15)' : '#FFEBEE',
      borderRadius: 12,
      gap: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 59, 48, 0.3)' : 'rgba(255, 59, 48, 0.2)',
    },
    errorText: {
      color: colors.error.main,
      fontSize: 14,
      fontWeight: '500',
    },
    section: {
      padding: 20,
      paddingTop: 16,
    },
    statusHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
      flexWrap: 'wrap',
      gap: 12,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      gap: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 3,
    },
    statusBadgeText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 0.5,
    },
    timestamp: {
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 16,
    },
    serviceCard: {
      backgroundColor: colors.background.paper,
      borderRadius: 16,
      padding: 20,
      borderLeftWidth: 4,
      marginBottom: 16,
      shadowColor: isDark ? '#000' : '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 8,
      elevation: 2,
    },
    serviceHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    },
    serviceStatus: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    responseTime: {
      fontSize: 12,
      color: colors.text.secondary,
      marginLeft: 'auto',
      fontWeight: '500',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    serviceDetail: {
      fontSize: 14,
      color: colors.text.secondary,
      marginTop: 8,
      lineHeight: 20,
    },
    tablesContainer: {
      gap: 12,
      marginTop: 8,
    },
    tableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
    },
    tableName: {
      fontSize: 14,
      color: colors.text.primary,
      flex: 1,
      fontWeight: '500',
      fontFamily: Platform.OS === 'web' ? 'monospace' : 'monospace',
    },
    tableCount: {
      fontSize: 12,
      color: colors.text.secondary,
      fontWeight: '600',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    tableError: {
      fontSize: 12,
      color: colors.error.main,
      fontWeight: '500',
    },
    endpointsContainer: {
      gap: 12,
      marginTop: 8,
    },
    endpointRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.02)',
    },
    endpointName: {
      fontSize: 13,
      color: colors.text.primary,
      fontFamily: Platform.OS === 'web' ? 'monospace' : 'monospace',
      fontWeight: '500',
    },
    checksContainer: {
      gap: 16,
    },
    checkCard: {
      backgroundColor: colors.background.paper,
      borderRadius: 16,
      padding: 20,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
      shadowColor: isDark ? '#000' : '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.3 : 0.1,
      shadowRadius: 8,
      elevation: 2,
    },
    checkTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text.primary,
      marginBottom: 12,
    },
    checkDetail: {
      fontSize: 14,
      color: colors.text.secondary,
      marginTop: 6,
      lineHeight: 20,
    },
    footer: {
      padding: 24,
      alignItems: 'center',
      paddingBottom: 40,
    },
    footerText: {
      fontSize: 12,
      color: colors.text.secondary,
      marginTop: 4,
      fontWeight: '500',
    },
  });

