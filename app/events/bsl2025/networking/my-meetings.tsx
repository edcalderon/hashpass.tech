import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useTheme } from '@hooks/useTheme';
import { MaterialIcons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useAuth } from '@hooks/useAuth';
import { supabase } from '@lib/supabase';
import { useToastHelpers } from '@contexts/ToastContext';
import LoadingScreen from '@components/LoadingScreen';
import { Meeting } from '@/types/networking';
import { Stack, useRouter } from 'expo-router';
import { useTranslation } from '@/i18n/i18n';

const MeetingsPage = () => {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { showError } = useToastHelpers();
  const router = useRouter();
  const { t } = useTranslation('networking');
  const styles = getStyles(isDark, colors);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'incoming' | 'passed'>('all');

  const counts = useMemo(() => {
    const now = new Date();
    let total = meetings.length;
    let upcoming = 0;
    let past = 0;
    meetings.forEach((m) => {
      if (m?.scheduled_at) {
        const d = parseISO(m.scheduled_at);
        if (!isNaN(d.getTime())) {
          if (d.getTime() >= now.getTime()) upcoming += 1; else past += 1;
        }
      }
    });
    return { total, upcoming, past };
  }, [meetings]);

  const filtered = useMemo(() => {
    if (filter === 'all') return meetings;
    const now = new Date();
    return meetings.filter((m) => {
      if (!m?.scheduled_at) return false;
      const d = parseISO(m.scheduled_at);
      if (isNaN(d.getTime())) return false;
      return filter === 'incoming' ? d.getTime() >= now.getTime() : d.getTime() < now.getTime();
    });
  }, [meetings, filter]);

  useEffect(() => {
    loadMeetings();
  }, [user]);

  const getSpeakerIds = async () => {
    // meetings.speaker_id is bsl_speakers.id (UUID), not user_id
    // We need to get the bsl_speakers.id for the current user if they're a speaker
    if (!user) return [];
    
    const { data: speakerRows } = await supabase
      .from('bsl_speakers')
      .select('id')
      .eq('user_id', user.id);
    
    return speakerRows?.map((r: any) => r.id) || [];
  };

  const loadMeetings = async () => {
    if (!user) {
      setLoading(false);
      setMeetings([]);
      return;
    }
    try {
      setLoading(true);
      const speakerIds = await getSpeakerIds();
      
      // Query meetings where user is requester OR speaker
      // meetings.speaker_id is bsl_speakers.id (UUID)
      let allMeetings: any[] = [];
      
      // Always query by requester_id
      const { data: requesterMeetings, error: requesterError } = await supabase
        .from('meetings')
        .select('*')
        .eq('requester_id', user.id)
        .order('created_at', { ascending: false });
      
      if (requesterError) {
        console.error('Error loading requester meetings:', requesterError);
      } else {
        allMeetings = requesterMeetings || [];
      }
      
      // If user is a speaker, also query by speaker_id (bsl_speakers.id)
      if (speakerIds.length > 0) {
        const { data: speakerMeetings, error: speakerError } = await supabase
          .from('meetings')
          .select('*')
          .in('speaker_id', speakerIds)
          .order('created_at', { ascending: false });
        
        if (speakerError) {
          console.error('Error loading speaker meetings:', speakerError);
        } else {
          // Combine and deduplicate by meeting id
          const existingIds = new Set(allMeetings.map(m => m.id));
          const newMeetings = (speakerMeetings || []).filter(m => !existingIds.has(m.id));
          allMeetings = [...allMeetings, ...newMeetings];
        }
      }
      
      // Sort by created_at descending
      allMeetings.sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      });
      
      setMeetings(allMeetings);
    } catch (e) {
      console.error('Error loading meetings:', e);
      showError(t('meetings.error'), t('meetings.failedToLoad'));
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMeetings();
    setRefreshing(false);
  };

  const handleMeetingPress = (meeting: Meeting) => {
    // First, we need to fetch the speaker details to get the image and company
    const fetchSpeakerDetails = async () => {
      try {
        const { data: speaker } = await supabase
          .from('bsl_speakers')
          .select('*')
          .eq('id', meeting.speaker_id)
          .single();
          
        if (speaker) {
          router.push({
            pathname: "/events/bsl2025/networking/meeting-detail" as any, // Type assertion for now
            params: {
              meetingId: meeting.id,
              speakerName: meeting.speaker_name,
              speakerImage: speaker.imageurl,
              speakerCompany: speaker.company,
              status: meeting.status,
              message: meeting.notes || '',
              scheduledAt: meeting.scheduled_at || '',
              location: meeting.location || 'TBD',
              duration: meeting.duration_minutes || 30,
              isSpeaker: user?.id !== meeting.requester_id ? 'true' : 'false' // Convert to string for params
            }
          });
        } else {
          // Fallback if speaker not found
          router.push({
            pathname: "/events/bsl2025/networking/meeting-detail" as any,
            params: {
              meetingId: meeting.id,
              speakerName: meeting.speaker_name,
              status: meeting.status,
              message: meeting.notes || '',
              scheduledAt: meeting.scheduled_at || '',
              location: meeting.location || 'TBD',
              duration: meeting.duration_minutes || 30,
              isSpeaker: user?.id !== meeting.requester_id ? 'true' : 'false'
            }
          });
        }
      } catch (error) {
        console.error('Error fetching speaker details:', error);
        // Fallback in case of error
        router.push({
          pathname: "/events/bsl2025/networking/meeting-detail" as any,
          params: {
            meetingId: meeting.id,
            speakerName: meeting.speaker_name,
            status: meeting.status,
            message: meeting.notes || '',
            scheduledAt: meeting.scheduled_at || '',
            location: meeting.location || 'TBD',
            duration: meeting.duration_minutes || 30,
            isSpeaker: user?.id !== meeting.requester_id ? 'true' : 'false'
          }
        });
      }
    };

    fetchSpeakerDetails();
  };

  const renderMeetingItem = ({ item }: { item: Meeting }) => (
    <TouchableOpacity 
      style={styles.meetingCard}
      onPress={() => handleMeetingPress(item)}
      activeOpacity={0.8}
    >
      <View style={styles.meetingTime}>
        <Text style={styles.timeText}>
          {item.scheduled_at ? format(parseISO(item.scheduled_at), 'MMM d, h:mm a') : t('meetings.notScheduled')}
        </Text>
      </View>
      <View style={styles.meetingDetails}>
        <Text style={styles.meetingTitle}>
          {user?.id === item.requester_id ? `${t('meetings.meetingWith')} ${item.speaker_name}` : `${t('meetings.meetingWith')} ${item.requester_name}`}
        </Text>
        {item.notes && <Text style={styles.meetingDescription} numberOfLines={2}>{item.notes}</Text>}
        <View style={styles.detailRow}>
          <MaterialIcons name="location-on" size={16} color={colors.text?.secondary || (isDark ? '#cccccc' : '#666666')} style={styles.icon} />
          <Text style={styles.detailText}>{item.location || t('meetings.tbd')}</Text>
        </View>
      </View>
      <View style={[styles.statusIndicator, { 
        backgroundColor: item.status === 'confirmed' 
          ? isDark ? colors.success.dark : colors.success.light
          : isDark ? colors.warning.dark : colors.warning.light 
      }]} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: t('meetings.title'),
          headerRight: () => (
            <TouchableOpacity style={styles.addButton} onPress={onRefresh}>
              <MaterialIcons name="refresh" size={24} color={colors.primary} />
            </TouchableOpacity>
          )
        }} 
      />
      {loading ? (
        <LoadingScreen
          icon="event"
          message={t('meetings.loading')}
          fullScreen={true}
        />
      ) : meetings.length > 0 ? (
        <>
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8, gap: 8 }}>
            <TouchableOpacity onPress={() => setFilter('all')} activeOpacity={0.8}
              style={{ backgroundColor: filter==='all' ? (isDark ? 'rgba(0,122,255,0.25)' : 'rgba(0,122,255,0.15)') : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'), paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.divider }}>
              <Text style={{ color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'), fontSize: 12 }}>{t('meetings.all')} {counts.total}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFilter('incoming')} activeOpacity={0.8}
              style={{ backgroundColor: filter==='incoming' ? (isDark ? 'rgba(76, 175, 80, 0.3)' : 'rgba(76, 175, 80, 0.2)') : (isDark ? 'rgba(76, 175, 80, 0.15)' : 'rgba(76, 175, 80, 0.12)'), paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.divider }}>
              <Text style={{ color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'), fontSize: 12 }}>{t('meetings.incoming')} {counts.upcoming}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setFilter('passed')} activeOpacity={0.8}
              style={{ backgroundColor: filter==='passed' ? (isDark ? 'rgba(158, 158, 158, 0.3)' : 'rgba(158, 158, 158, 0.2)') : (isDark ? 'rgba(158, 158, 158, 0.15)' : 'rgba(158, 158, 158, 0.12)'), paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.divider }}>
              <Text style={{ color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'), fontSize: 12 }}>{t('meetings.passed')} {counts.past}</Text>
            </TouchableOpacity>
          </View>
          <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderMeetingItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContainer}
        />
        </>
      ) : (
        <View style={styles.emptyState}>
          <MaterialIcons name="event-busy" size={48} color={colors.text?.secondary || (isDark ? '#cccccc' : '#666666')} />
          <Text style={styles.emptyText}>{t('meetings.noMeetings')}</Text>
        </View>
      )}
    </View>
  );
};

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background?.default || (isDark ? '#121212' : '#ffffff'),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider || (isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'),
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
  },
  addButton: {
    padding: 8,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  meetingCard: {
    backgroundColor: colors.background?.paper || (isDark ? '#1E1E1E' : '#F5F5F7'),
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.divider || (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'),
  },
  meetingTime: {
    marginRight: 16,
    alignItems: 'center',
  },
  timeText: {
    color: colors.primary || '#007AFF',
    fontWeight: '600',
    fontSize: 14,
  },
  meetingDetails: {
    flex: 1,
  },
  meetingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
    marginBottom: 6,
  },
  meetingDescription: {
    fontSize: 14,
    color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'),
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  icon: {
    marginRight: 6,
  },
  detailText: {
    fontSize: 13,
    color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'),
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 10,
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'),
    marginBottom: 24,
  },
  primaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default MeetingsPage;
