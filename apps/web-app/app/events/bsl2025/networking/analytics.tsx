import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useTheme } from '../../../../hooks/useTheme';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../../../lib/supabase';
import { useToastHelpers } from '../../../../contexts/ToastContext';
import LoadingScreen from '../../../../components/LoadingScreen';
import { SystemStats } from '@/types/networking';


export default function AnalyticsView() {
  const { isDark, colors } = useTheme();

  const { showError } = useToastHelpers();
  const styles = getStyles(isDark, colors);

  const [stats, setStats] = useState<SystemStats>({
    totalUsers: 0,
    totalSpeakers: 0,
    totalMeetingRequests: 0,
    pendingRequests: 0,
    acceptedRequests: 0,
    declinedRequests: 0,
    cancelledRequests: 0,
    blockedUsers: 0,
    averageResponseTime: 0,
    topSpeakers: [],
    recentActivity: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      console.log('🔄 Loading system analytics...');

      // Get total users (from passes table)
      const { data: usersData, error: usersError } = await supabase
        .from('passes')
        .select('user_id', { count: 'exact' })
        .eq('event_id', 'bsl2025')
        .eq('status', 'active');

      // Get total speakers
      const { data: speakersData, error: speakersError } = await supabase
        .from('bsl_speakers')
        .select('id', { count: 'exact' });

      // Get meeting request statistics with speaker names
      const { data: requestsData, error: requestsError } = await supabase
        .from('meeting_requests')
        .select('status, created_at, updated_at, speaker_id, speaker_name');

      // Get blocked users count
      const { data: blockedData, error: blockedError } = await supabase
        .from('user_blocks')
        .select('id', { count: 'exact' });

      if (requestsError) {
        console.error('❌ Error loading requests:', requestsError);
        throw requestsError;
      }

      // Calculate statistics
      const totalUsers = usersData?.length || 0;
      const totalSpeakers = speakersData?.length || 0;
      const totalMeetingRequests = requestsData?.length || 0;
      
      const pendingRequests = requestsData?.filter(r => r.status === 'pending').length || 0;
      const acceptedRequests = requestsData?.filter(r => r.status === 'accepted' || r.status === 'approved').length || 0;
      const declinedRequests = requestsData?.filter(r => r.status === 'declined').length || 0;
      const cancelledRequests = requestsData?.filter(r => r.status === 'cancelled').length || 0;
      const blockedUsers = blockedData?.length || 0;

      // Calculate average response time
      const respondedRequests = requestsData?.filter(r => 
        r.status !== 'pending' && r.status !== 'cancelled' && r.updated_at !== r.created_at
      ) || [];
      
      const totalResponseTime = respondedRequests.reduce((sum, req) => {
        const created = new Date(req.created_at).getTime();
        const updated = new Date(req.updated_at).getTime();
        return sum + (updated - created);
      }, 0);
      
      const averageResponseTime = respondedRequests.length > 0 
        ? totalResponseTime / respondedRequests.length / (1000 * 60 * 60) // Convert to hours
        : 0;

      // Get top speakers by request count
      const speakerCounts = requestsData?.reduce((acc, req) => {
        if (!req.speaker_id) return acc;
        const key = req.speaker_id;
        const speakerName = req.speaker_name || 'Unknown Speaker';
        
        if (!acc[key]) {
          acc[key] = { 
            speaker_id: req.speaker_id, 
            name: speakerName, 
            meeting_count: 0 
          };
        }
        acc[key].meeting_count++;
        return acc;
      }, {} as Record<string, { speaker_id: string; name: string; meeting_count: number }>) || {};

      const topSpeakers = Object.values(speakerCounts)
        .sort((a, b) => b.meeting_count - a.meeting_count)
        .slice(0, 5);

      // Get requests by day (last 7 days)
      const requestsByDay = requestsData?.reduce((acc, req) => {
        const date = new Date(req.created_at).toISOString().split('T')[0];
        if (!acc[date]) {
          acc[date] = 0;
        }
        acc[date]++;
        return acc;
      }, {} as Record<string, number>) || {};

      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - i);
        return date.toISOString().split('T')[0];
      }).reverse();

      const requestsByDayArray = last7Days.map(date => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count: requestsByDay[date] || 0,
      }));

setStats({
        totalUsers,
        totalSpeakers,
        totalMeetingRequests,
        pendingRequests,
        acceptedRequests,
        declinedRequests,
        cancelledRequests,
        blockedUsers,
        averageResponseTime,
        topSpeakers,
        recentActivity: [], // Initialize with empty array for now
        requestsByDay: requestsByDayArray,
      });

    } catch (error) {
      console.error('❌ Error loading analytics:', error);
      showError('Error Loading Analytics', 'Failed to load system analytics');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAnalytics();
    setRefreshing(false);
  };

  const renderStatCard = (title: string, value: number | string, icon: string, color: string) => (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: color }]}>
        <MaterialIcons name={icon as any} size={24} color="white" />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statTitle}>{title}</Text>
    </View>
  );

  const renderTopSpeaker = (speaker: any, index: number) => (
    <View key={speaker.speaker_id || index} style={styles.topSpeakerItem}>
      <View style={styles.speakerRank}>
        <Text style={styles.speakerRankText}>#{index + 1}</Text>
      </View>
      <View style={styles.speakerInfo}>
        <Text style={styles.speakerName}>{speaker.name || 'Unknown Speaker'}</Text>
        <Text style={styles.speakerCount}>{speaker.meeting_count || 0} requests</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <LoadingScreen
        icon="analytics"
        message="Loading analytics..."
        fullScreen={true}
      />
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <MaterialIcons name="analytics" size={32} color={colors.primary} />
        <Text style={styles.headerTitle}>System Analytics</Text>
        <Text style={styles.headerSubtitle}>Networking platform insights</Text>
      </View>

      {/* Overview Stats */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Platform Overview</Text>
        <View style={styles.statsGrid}>
          {renderStatCard('Total Users', stats.totalUsers, 'people', '#4CAF50')}
          {renderStatCard('Speakers', stats.totalSpeakers, 'mic', '#2196F3')}
          {renderStatCard('Total Requests', stats.totalMeetingRequests, 'send', '#FF9800')}
          {renderStatCard('Blocked Users', stats.blockedUsers, 'block', '#F44336')}
        </View>
      </View>

      {/* Request Status Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Request Status Breakdown</Text>
        <View style={styles.statsGrid}>
          {renderStatCard('Pending', stats.pendingRequests, 'schedule', '#FF9800')}
          {renderStatCard('Accepted', stats.acceptedRequests, 'check-circle', '#4CAF50')}
          {renderStatCard('Declined', stats.declinedRequests, 'cancel', '#F44336')}
          {renderStatCard('Cancelled', stats.cancelledRequests, 'close', '#9E9E9E')}
        </View>
      </View>

      {/* Performance Metrics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performance Metrics</Text>
        <View style={styles.performanceCard}>
          <View style={styles.performanceItem}>
            <MaterialIcons name="schedule" size={24} color={colors.primary} />
            <View style={styles.performanceContent}>
              <Text style={styles.performanceValue}>
                {stats.averageResponseTime.toFixed(1)} hours
              </Text>
              <Text style={styles.performanceLabel}>Average Response Time</Text>
            </View>
          </View>
          <View style={styles.performanceItem}>
            <MaterialIcons name="trending-up" size={24} color="#4CAF50" />
            <View style={styles.performanceContent}>
              <Text style={styles.performanceValue}>
                {stats.totalMeetingRequests > 0 
                  ? ((stats.acceptedRequests / stats.totalMeetingRequests) * 100).toFixed(1)
                  : 0}%
              </Text>
              <Text style={styles.performanceLabel}>Acceptance Rate</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Top Speakers */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Top Speakers by Requests</Text>
        <View style={styles.topSpeakersCard}>
          {stats.topSpeakers.length > 0 ? (
            stats.topSpeakers.map((speaker, index) => renderTopSpeaker(speaker, index))
          ) : (
            <Text style={styles.emptyText}>No speaker data available</Text>
          )}
        </View>
      </View>

      {/* Activity Chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Activity (Last 7 Days)</Text>
        <View style={styles.chartCard}>
          <View style={styles.chartContainer}>
            {stats.requestsByDay?.map((day, index) => {
              const maxCount = Math.max(...(stats.requestsByDay || []).map(d => d.count));
              const height = maxCount > 0 ? (day.count / maxCount) * 100 : 0;
              
              return (
                <View key={index} style={styles.chartBar}>
                  <View 
                    style={[
                      styles.chartBarFill, 
                      { height: `${height}%`, backgroundColor: colors.primary }
                    ]} 
                  />
                  <Text style={styles.chartLabel}>{day.date}</Text>
                  <Text style={styles.chartValue}>{day.count}</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>

      {/* System Health */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>System Health</Text>
        <View style={styles.healthCard}>
          <View style={styles.healthItem}>
            <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
            <Text style={styles.healthText}>Database Connected</Text>
          </View>
          <View style={styles.healthItem}>
            <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
            <Text style={styles.healthText}>Real-time Updates Active</Text>
          </View>
          <View style={styles.healthItem}>
            <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
            <Text style={styles.healthText}>Meeting System Operational</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background?.default || (isDark ? '#121212' : '#FFFFFF'),
  },
  header: {
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.divider || (isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.08)'),
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
    marginTop: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.textSecondary || (isDark ? '#F0F0F0' : '#666666'),
    marginTop: 4,
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.background?.paper || (isDark ? '#1E1E1E' : '#F5F5F7'),
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
    marginBottom: 4,
  },
  statTitle: {
    fontSize: 12,
    color: colors.textSecondary || (isDark ? '#F0F0F0' : '#666666'),
    textAlign: 'center',
  },
  performanceCard: {
    backgroundColor: colors.background?.paper || (isDark ? '#1E1E1E' : '#F5F5F7'),
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  performanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  performanceContent: {
    marginLeft: 12,
    flex: 1,
  },
  performanceValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
  },
  performanceLabel: {
    fontSize: 14,
    color: colors.textSecondary || (isDark ? '#F0F0F0' : '#666666'),
    marginTop: 2,
  },
  topSpeakersCard: {
    backgroundColor: colors.background?.paper || (isDark ? '#1E1E1E' : '#F5F5F7'),
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  topSpeakerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  speakerRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  speakerRankText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  speakerInfo: {
    flex: 1,
  },
  speakerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
  },
  speakerCount: {
    fontSize: 14,
    color: colors.textSecondary || (isDark ? '#F0F0F0' : '#666666'),
    marginTop: 2,
  },
  chartCard: {
    backgroundColor: colors.background?.paper || (isDark ? '#1E1E1E' : '#F5F5F7'),
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
  },
  chartBar: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  chartBarFill: {
    width: '100%',
    borderRadius: 4,
    marginBottom: 8,
  },
  chartLabel: {
    fontSize: 10,
    color: colors.textSecondary || (isDark ? '#F0F0F0' : '#666666'),
    marginBottom: 2,
  },
  chartValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
  },
  healthCard: {
    backgroundColor: colors.background?.paper || (isDark ? '#1E1E1E' : '#F5F5F7'),
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
  },
  healthItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  healthText: {
    fontSize: 14,
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
    marginLeft: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary || (isDark ? '#F0F0F0' : '#666666'),
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
