import React from 'react';
import { View, Text, StyleSheet, Image, ScrollView, useColorScheme, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTheme } from '../hooks/useTheme';
import { supabase } from '../lib/supabase';

interface MeetingDetailProps {
  meetingId: string;
  onClose?: () => void;
  showHeader?: boolean;
}

interface MeetingInfo {
  id: string;
  status: string;
  scheduled_time: string;
  duration_minutes: number;
  speaker_name: string;
  speaker_image: string;
  speaker_company: string;
  speaker_title: string;
  requester_name: string;
  requester_company: string;
  note: string;
  created_at: string;
  location?: string;
  meeting_link?: string;
}

export default function MeetingDetail({ meetingId, onClose, showHeader = true }: MeetingDetailProps) {
  const { colors } = useTheme();
  const [meeting, setMeeting] = React.useState<MeetingInfo | null>(null);
  const [loading, setLoading] = React.useState(true);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'accepted':
        return '#4CAF50';
      case 'pending':
      case 'requested':
        return '#FF9800';
      case 'rejected':
      case 'cancelled':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  React.useEffect(() => {
    const loadMeeting = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('meeting_requests')
          .select('*')
          .eq('id', meetingId)
          .single();

        if (error) throw error;
        setMeeting(data as MeetingInfo);
      } catch (error) {
        console.error('Error loading meeting:', error);
      } finally {
        setLoading(false);
      }
    };

    loadMeeting();

    // Set up real-time subscription
    const subscription = supabase
      .channel(`meeting_${meetingId}`)
      .on('postgres_changes', 
        { 
          event: 'UPDATE',
          schema: 'public',
          table: 'meeting_requests',
          filter: `id=eq.${meetingId}`
        },
        (payload) => {
          setMeeting(payload.new as MeetingInfo);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [meetingId]);

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background?.default }]}>
        <MaterialIcons name="hourglass-empty" size={32} color={colors.text?.secondary} />
        <Text style={[styles.loadingText, { color: colors.text?.secondary }]}>
          Loading meeting details...
        </Text>
      </View>
    );
  }

  if (!meeting) {
    return (
      <View style={[styles.errorContainer, { backgroundColor: colors.background?.default }]}>
        <MaterialIcons name="error-outline" size={32} color={colors.text?.secondary} />
        <Text style={[styles.errorText, { color: colors.text?.secondary }]}>
          Could not load meeting details
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background?.default }]}>
      {showHeader && (
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text?.primary }]}>Meeting Details</Text>
          {onClose && (
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <MaterialIcons name="close" size={24} color={colors.text?.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <ScrollView style={styles.scrollView}>
        <View style={[styles.card, { backgroundColor: colors.background.paper }]}>
          <View style={styles.speakerInfo}>
            <Image 
              source={{ uri: meeting.speaker_image }} 
              style={styles.avatar}
              defaultSource={require('../../assets/images/avatar-placeholder.png')}
            />
            <View style={styles.speakerDetails}>
              <Text style={[styles.speakerName, { color: colors.text?.primary }]}>
                {meeting.speaker_name}
              </Text>
              <Text style={[styles.speakerTitle, { color: colors.text?.secondary }]}>
                {meeting.speaker_title}
              </Text>
              <Text style={[styles.speakerCompany, { color: colors.text?.secondary }]}>
                {meeting.speaker_company}
              </Text>
            </View>
          </View>

          <View style={styles.detailsSection}>
            <View style={styles.detailRow}>
              <MaterialIcons 
                name="event" 
                size={20} 
                color={colors.text?.secondary}
                style={styles.detailIcon}
              />
              <Text style={[styles.detailText, { color: colors.text?.primary }]}>
                {meeting.scheduled_time 
                  ? format(new Date(meeting.scheduled_time), 'EEEE, MMMM d, yyyy')
                  : 'Not scheduled yet'}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <MaterialIcons 
                name="schedule" 
                size={20} 
                color={colors.text?.secondary}
                style={styles.detailIcon}
              />
              <Text style={[styles.detailText, { color: colors.text?.primary }]}>
                {meeting.scheduled_time 
                  ? `${format(new Date(meeting.scheduled_time), 'h:mm a')} • ${meeting.duration_minutes || 30} min`
                  : 'Flexible timing'}
              </Text>
            </View>

            {meeting.location && (
              <View style={styles.detailRow}>
                <MaterialIcons 
                  name="location-on" 
                  size={20} 
                  color={colors.text?.secondary}
                  style={styles.detailIcon}
                />
                <Text style={[styles.detailText, { color: colors.primary }]}>
                  {meeting.location}
                </Text>
              </View>
            )}

            {meeting.meeting_link && (
              <View style={styles.detailRow}>
                <MaterialIcons 
                  name="videocam" 
                  size={20} 
                  color={colors.text?.secondary}
                  style={styles.detailIcon}
                />
                <Text style={[styles.detailText, { color: colors.primary }]}>
                  {meeting.meeting_link}
                </Text>
              </View>
            )}
          </View>

          {meeting.note && (
            <View style={styles.notesSection}>
              <Text style={[styles.sectionTitle, { color: colors.text?.primary }]}>
                Meeting Notes
              </Text>
              <Text style={[styles.notesText, { color: colors.text?.secondary }]}>
                {meeting.note}
              </Text>
            </View>
          )}

          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(meeting.status) }]}>
            <Text style={styles.statusText}>
              {meeting.status.charAt(0).toUpperCase() + meeting.status.slice(1)}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
  closeButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  card: {
    margin: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  speakerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginRight: 16,
  },
  speakerDetails: {
    flex: 1,
  },
  speakerName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },
  speakerTitle: {
    fontSize: 14,
    marginBottom: 2,
  },
  speakerCompany: {
    fontSize: 14,
    opacity: 0.8,
  },
  detailsSection: {
    marginTop: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailIcon: {
    marginRight: 12,
    width: 24,
    textAlign: 'center',
  },
  detailText: {
    flex: 1,
    fontSize: 15,
  },
  notesSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  notesText: {
    fontSize: 15,
    lineHeight: 22,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 16,
  },
  statusText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center',
  },
});
