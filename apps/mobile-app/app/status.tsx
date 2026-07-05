import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Platform } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useRouter } from 'expo-router';
import LoadingScreen from '../components/LoadingScreen';
import ExternalStatusPreview from '../components/ExternalStatusPreview';
import { apiClient } from '@/lib/api-client';
import { useTranslation } from '../i18n/i18n';
import { MaterialIcons } from '../lib/vector-icons';

const EXTERNAL_STATUS_URL = 'https://hashpass.status.cig.technology/';
const STATUS_REQUEST_TIMEOUT_MS = 30000;

type StatusTab = 'internal' | 'external';

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isString = (value: unknown): value is string => typeof value === 'string';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isNumber = (value: unknown): value is number => typeof value === 'number';
const isAbortLikeError = (value: unknown): value is boolean => {
  const message = value instanceof Error ? value.message : String(value || '');
  return /aborted|cancelled|canceled/i.test(message);
};

const hasValidHealthCheckShape = (value: unknown): value is HealthCheck => {
  if (!isRecord(value)) {
    return false;
  }

  const services = isRecord(value.services) ? value.services : null;
  const checks = isRecord(value.checks) ? value.checks : null;
  const database = isRecord(services?.database) ? services.database : null;
  const email = isRecord(services?.email) ? services.email : null;
  const api = isRecord(services?.api) ? services.api : null;
  const agenda = isRecord(checks?.agenda) ? checks.agenda : null;
  const speakers = isRecord(checks?.speakers) ? checks.speakers : null;
  const bookings = isRecord(checks?.bookings) ? checks.bookings : null;
  const passes = isRecord(checks?.passes) ? checks.passes : null;

  return (
    isString(value.status) &&
    isString(value.timestamp) &&
    isRecord(services) &&
    database !== null &&
    isString(database.status) &&
    isRecord(database.tables) &&
    email !== null &&
    isString(email.status) &&
    isBoolean(email.configured) &&
    api !== null &&
    isString(api.status) &&
    isRecord(api.endpoints) &&
    isRecord(checks) &&
    agenda !== null &&
    isBoolean(agenda.hasData) &&
    (isString(agenda.lastUpdated) || agenda.lastUpdated === null) &&
    isNumber(agenda.itemCount) &&
    speakers !== null &&
    isNumber(speakers.count) &&
    isBoolean(speakers.accessible) &&
    bookings !== null &&
    isNumber(bookings.count) &&
    isBoolean(bookings.accessible) &&
    passes !== null &&
    isNumber(passes.count) &&
    isBoolean(passes.accessible)
  );
};

export default function StatusPage() {
  const { isDark, colors } = useTheme();
  const { t } = useTranslation('status');
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StatusTab>('internal');
  const [healthCheck, setHealthCheck] = useState<HealthCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const styles = getStyles(isDark, colors);

  const fetchStatus = async () => {
    try {
      setError(null);
      
      // Use apiClient with skipEventSegment to access global /api/status endpoint
      const result = await apiClient.request('status', {
        skipEventSegment: true,
        skipAuth: true,
        timeout: STATUS_REQUEST_TIMEOUT_MS,
      });

      if (!result.success) {
        if (isAbortLikeError(result.error)) {
          return;
        }
        throw new Error(result.error || 'Failed to fetch status');
      }

      if (!hasValidHealthCheckShape(result.data)) {
        throw new Error('Invalid status payload received');
      }

      setHealthCheck(result.data);
    } catch (err: any) {
      if (isAbortLikeError(err)) {
        return;
      }
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

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        activeTab === 'internal'
          ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          : undefined
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

      <View style={styles.tabContainer}>
        <View style={styles.tabsWrapper}>
          <TouchableOpacity
            style={styles.tab}
            onPress={() => setActiveTab('internal')}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'internal' }}
          >
            <Text style={[styles.tabText, activeTab === 'internal' && styles.activeTabText]}>
              {t('internalTab', 'Internal Service Info')}
            </Text>
            {activeTab === 'internal' && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tab}
            onPress={() => setActiveTab('external')}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'external' }}
          >
            <Text style={[styles.tabText, activeTab === 'external' && styles.activeTabText]}>
              {t('externalTab', 'External Monitor')}
            </Text>
            {activeTab === 'external' && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        </View>
        <View style={styles.tabDivider} />
      </View>

      {activeTab === 'internal' ? (
        <>
          {loading && !healthCheck && (
            <View style={styles.section}>
              <LoadingScreen
                message={t('loadingStatus', 'Loading internal service status...')}
                subtitle={t('loadingStatusSubtitle', 'Fetching the latest health checks.')}
              />
            </View>
          )}

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
        </>
      ) : (
        <View style={styles.section}>
          <ExternalStatusPreview url={EXTERNAL_STATUS_URL} />
        </View>
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
      boxShadow: isDark
        ? '0px 2px 8px rgba(0, 0, 0, 0.30)'
        : '0px 2px 8px rgba(0, 0, 0, 0.10)',
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
    tabContainer: {
      backgroundColor: colors.background.paper,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
      paddingTop: 8,
    },
    tabsWrapper: {
      flexDirection: 'row',
      paddingHorizontal: 20,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      position: 'relative',
    },
    tabText: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.text.secondary,
      textAlign: 'center',
    },
    activeTabText: {
      color: colors.primary,
      fontWeight: '700',
    },
    tabIndicator: {
      position: 'absolute',
      left: '14%',
      right: '14%',
      bottom: 0,
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.primary,
    },
    tabDivider: {
      height: 1,
      backgroundColor: colors.divider,
      marginHorizontal: 20,
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
      boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.20)',
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
      boxShadow: isDark
        ? '0px 2px 10px rgba(0, 0, 0, 0.30)'
        : '0px 2px 10px rgba(0, 0, 0, 0.10)',
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
      boxShadow: isDark
        ? '0px 2px 10px rgba(0, 0, 0, 0.30)'
        : '0px 2px 10px rgba(0, 0, 0, 0.10)',
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
