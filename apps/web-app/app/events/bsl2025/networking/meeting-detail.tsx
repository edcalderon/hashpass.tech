import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import { MaterialIcons } from '@expo/vector-icons';
import { format, parseISO } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useToastHelpers } from '@/contexts/ToastContext';
import SpeakerAvatar from '@/components/SpeakerAvatar';
import LoadingScreen from '@/components/LoadingScreen';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/i18n/i18n';

// Helper function to generate user avatar URL
const generateUserAvatarUrl = (name: string): string => {
  const seed = name.toLowerCase().replace(/\s+/g, '-');
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
};

export default function MeetingDetailScreen() {
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { showError } = useToastHelpers();
  const { t } = useTranslation('networking');
  const params = useLocalSearchParams();
  const [loading, setLoading] = useState(true);
  const [meeting, setMeeting] = useState<any>(null);
  const [isSpeaker, setIsSpeaker] = useState(params.isSpeaker === 'true');
  const styles = getStyles(isDark, colors);

  useEffect(() => {
    const loadMeetingDetails = async () => {
      try {
        setLoading(true);
        
        if (!params.meetingId) {
          showError(t('meetings.detail.error'), t('meetings.detail.failedToLoad'));
          setLoading(false);
          return;
        }

        // Load meeting details from database
        const { data: meetingData, error: meetingError } = await supabase
          .from('meetings')
          .select('*, speaker_id, requester_id, speaker_name, requester_name, meeting_request_id')
          .eq('id', params.meetingId)
          .single();
        
        // Also try to get requester details from meeting_requests if available
        let requesterTitle: string | undefined;
        let requesterCompany: string | undefined;
        
        if (meetingData?.meeting_request_id) {
          const { data: requestData } = await supabase
            .from('meeting_requests')
            .select('requester_title, requester_company, requester_name')
            .eq('id', meetingData.meeting_request_id)
            .single();
          
          if (requestData) {
            requesterTitle = requestData.requester_title;
            requesterCompany = requestData.requester_company;
          }
        }

        if (meetingError || !meetingData) {
          // Fallback to params if database query fails
          setMeeting({
            id: params.meetingId,
            speaker_name: params.speakerName,
            speaker_image: params.speakerImage,
            speaker_company: params.speakerCompany,
            status: params.status,
            message: params.message,
            scheduled_at: params.scheduledAt,
            location: params.location,
            duration: params.duration,
            notes: params.message,
            requester_name: params.requesterName || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User',
            speaker_id: params.speakerId,
            requester_id: params.requesterId || user?.id
          });
          setLoading(false);
          return;
        }

        // Determine if current user is speaker or requester
        const isRequester = meetingData.requester_id === user?.id;
        setIsSpeaker(!isRequester);

        // Load speaker details
        let speakerImage = params.speakerImage;
        let speakerCompany = params.speakerCompany;
        
        if (meetingData.speaker_id) {
          const { data: speakerData } = await supabase
            .from('bsl_speakers')
            .select('name, imageurl, company')
            .eq('id', meetingData.speaker_id)
            .single();
          
          if (speakerData) {
            speakerImage = speakerData.imageurl || speakerImage;
            speakerCompany = speakerData.company || speakerCompany;
          }
        }

        // Get requester information - always show real name, not "You"
        const requesterName = meetingData.requester_name || params.requesterName || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
        const requesterAvatar = generateUserAvatarUrl(requesterName);

        setMeeting({
          id: meetingData.id,
          speaker_name: meetingData.speaker_name || params.speakerName,
          speaker_image: speakerImage,
          speaker_company: speakerCompany,
          status: meetingData.status || params.status,
          message: params.message || meetingData.notes,
          scheduled_at: meetingData.scheduled_at || params.scheduledAt,
          location: meetingData.location || params.location,
          duration: meetingData.duration_minutes || params.duration || 15,
          notes: params.message || meetingData.notes,
          requester_name: requesterName, // Always show real name
          requester_avatar: requesterAvatar,
          requester_id: meetingData.requester_id,
          speaker_id: meetingData.speaker_id,
          requester_title: requesterTitle || params.requesterTitle,
          requester_company: requesterCompany || params.requesterCompany
        });
      } catch (error) {
        console.error('Error loading meeting details:', error);
        showError(t('meetings.detail.error'), t('meetings.detail.failedToLoad'));
      } finally {
        setLoading(false);
      }
    };

    loadMeetingDetails();
  }, [params.meetingId, user?.id]);

  const handleBack = () => {
    router.back();
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'confirmed': return '#4CAF50';
      case 'scheduled': return '#4CAF50';
      case 'tentative': return '#FF9800';
      case 'in_progress': return '#2196F3';
      case 'completed': return '#4CAF50';
      case 'cancelled': return '#F44336';
      case 'no_show': return '#9E9E9E';
      case 'unconfirmed': return '#FF9800';
      // Legacy meeting_request statuses
      case 'requested': return '#FF9800';
      case 'accepted': return '#4CAF50';
      case 'rejected': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'confirmed': return 'check-circle';
      case 'scheduled': return 'event';
      case 'tentative': return 'schedule';
      case 'in_progress': return 'play-circle';
      case 'completed': return 'check-circle';
      case 'cancelled': return 'cancel';
      case 'no_show': return 'block';
      case 'unconfirmed': return 'schedule';
      // Legacy meeting_request statuses
      case 'requested': return 'schedule';
      case 'accepted': return 'check-circle';
      case 'rejected': return 'cancel';
      default: return 'help';
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Helper function to shorten meeting ID
  const shortenMeetingId = (id: string | undefined): string => {
    if (!id) return '';
    // Take first 8 characters and last 4 characters
    if (id.length > 12) {
      return `${id.substring(0, 8)}...${id.substring(id.length - 4)}`;
    }
    return id;
  };

  if (loading) {
    return (
      <LoadingScreen
        icon="info"
        message={t('meetings.detail.loading')}
        fullScreen={true}
      />
    );
  }

  if (!meeting) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{t('meetings.detail.notFound')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'Meeting Details',
          headerShown: false,
          presentation: 'modal',
          animation: 'slide_from_bottom',
          headerBackVisible: false,
          gestureEnabled: true,
          gestureDirection: 'vertical',
        }} 
      />
      
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>{t('meetings.detail.title')}</Text>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="close" size={24} color={colors.text?.primary || (isDark ? '#ffffff' : '#000000')} />
        </TouchableOpacity>
      </View>

      {meeting && (
        <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>{t('meetings.detail.speaker')}</Text>
            <View style={styles.speakerDetail}>
              <SpeakerAvatar
                name={meeting.speaker_name}
                imageUrl={meeting.speaker_image}
                size={60}
                showBorder={true}
              />
              <View style={styles.speakerDetailInfo}>
                <Text style={styles.speakerDetailName}>{meeting.speaker_name}</Text>
                <Text style={styles.speakerDetailTitle}>{t('meetings.detail.speaker')}</Text>
                {meeting.speaker_company && (
                  <Text style={[styles.speakerDetailTitle, { marginTop: 2 }]}>
                    {meeting.speaker_company}
                  </Text>
                )}
              </View>
            </View>
          </View>

          {/* Requester Info */}
          {meeting.requester_name && (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>{t('meetings.detail.requester')}</Text>
              <View style={styles.speakerDetail}>
                <SpeakerAvatar
                  name={meeting.requester_name}
                  imageUrl={meeting.requester_avatar || undefined}
                  size={60}
                  showBorder={true}
                />
                <View style={styles.speakerDetailInfo}>
                  <Text style={styles.speakerDetailName}>{meeting.requester_name}</Text>
                  <Text style={styles.speakerDetailTitle}>{t('meetings.detail.requester')}</Text>
                  {meeting.requester_title && (
                    <Text style={[styles.speakerDetailTitle, { marginTop: 2 }]}>
                      {meeting.requester_title}
                    </Text>
                  )}
                  {meeting.requester_company && (
                    <Text style={[styles.speakerDetailTitle, { marginTop: 2 }]}>
                      {meeting.requester_company}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          )}

          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>{t('meetings.detail.status')}</Text>
            <View style={[styles.statusDetail, { backgroundColor: getStatusColor(meeting.status) }]}>
              <MaterialIcons name={getStatusIcon(meeting.status) as any} size={20} color="white" />
              <Text style={styles.statusDetailText}>
                {meeting.status?.toUpperCase() || 'UNKNOWN'}
              </Text>
            </View>
          </View>

          {meeting.message && (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>{t('meetings.detail.message')}</Text>
              <Text style={styles.detailValue}>
                {meeting.message || t('meetings.detail.noMessage')}
              </Text>
            </View>
          )}

          {meeting.notes && (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>{t('meetings.detail.intentions')}</Text>
              <Text style={styles.detailValue}>{meeting.notes}</Text>
            </View>
          )}

          <View style={styles.detailSection}>
            <Text style={styles.detailLabel}>{t('meetings.detail.meetingDetails')}</Text>
            <View style={styles.meetingDetails}>
              {meeting.scheduled_at && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailRowLabel}>{t('meetings.detail.scheduled')}</Text>
                  <Text style={styles.detailRowValue}>
                    {format(parseISO(meeting.scheduled_at), 'EEEE, MMMM d, yyyy \a\t h:mm a')}
                  </Text>
                </View>
              )}
              <View style={styles.detailRow}>
                <Text style={styles.detailRowLabel}>{t('meetings.detail.duration')}</Text>
                <Text style={styles.detailRowValue}>{meeting.duration || 30} {t('meetings.detail.minutes')}</Text>
              </View>
              {meeting.location && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailRowLabel}>{t('meetings.detail.location')}</Text>
                  <Text style={styles.detailRowValue}>{meeting.location}</Text>
                </View>
              )}
            </View>
          </View>

          {meeting.scheduled_at && (
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>{t('meetings.detail.timeline')}</Text>
              <View style={styles.timeline}>
                {meeting.scheduled_at && (
                  <View style={styles.timelineItem}>
                    <Text style={styles.timelineDate}>{formatDate(meeting.scheduled_at)}</Text>
                    <Text style={styles.timelineText}>{t('meetings.detail.meetingScheduled')}</Text>
                  </View>
                )}
              </View>
            </View>
          )}

          <View style={styles.actions}>
            <TouchableOpacity 
              style={[styles.actionButton, styles.primaryButton]}
              onPress={() => {
                // Handle join meeting action
              }}
            >
              <MaterialIcons name="video-call" size={20} color="white" />
              <Text style={styles.buttonText}>{t('meetings.detail.joinMeeting')}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.actionButton, styles.secondaryButton]}
              onPress={() => {
                router.push({
                  pathname: "/events/bsl2025/networking/meeting-chat",
                  params: { 
                    meetingId: meeting.id,
                    title: `${t('meetings.detail.chatWith')} ${isSpeaker ? meeting.requester_name : meeting.speaker_name}`,
                    speakerName: meeting.speaker_name,
                    speakerImage: meeting.speaker_image
                  }
                });
              }}
            >
              <MaterialIcons name="chat" size={20} color={colors.primary} />
              <Text style={[styles.buttonText, styles.secondaryButtonText]}>{t('meetings.detail.messageButton')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background?.default || (isDark ? '#000000' : '#ffffff'),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? '#404040' : '#e0e0e0',
    backgroundColor: colors.card?.default || (isDark ? '#1e1e1e' : '#ffffff'),
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
  },
  modalHeaderSpacer: {
    width: 40,
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  errorText: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: colors.error?.main || '#ff4444',
  },
  detailSection: {
    marginBottom: 20,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'),
    marginBottom: 8,
  },
  detailValue: {
    fontSize: 16,
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
    lineHeight: 22,
  },
  speakerDetail: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  speakerDetailInfo: {
    marginLeft: 16,
  },
  speakerDetailName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
  },
  speakerDetailTitle: {
    fontSize: 14,
    color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'),
    marginTop: 2,
  },
  statusDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  statusDetailText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  meetingDetails: {
    backgroundColor: colors.card?.default || (isDark ? '#2a2a2a' : '#f5f5f5'),
    padding: 12,
    borderRadius: 8,
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? '#404040' : 'transparent',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  detailRowLabel: {
    fontSize: 14,
    color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'),
  },
  detailRowValue: {
    fontSize: 14,
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
    fontWeight: '500',
  },
  timeline: {
    backgroundColor: colors.card?.default || (isDark ? '#2a2a2a' : '#f5f5f5'),
    padding: 12,
    borderRadius: 8,
    borderWidth: isDark ? 1 : 0,
    borderColor: isDark ? '#404040' : 'transparent',
  },
  timelineItem: {
    marginBottom: 8,
  },
  timelineDate: {
    fontSize: 12,
    color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'),
    fontWeight: '600',
  },
  timelineText: {
    fontSize: 14,
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  buttonText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  secondaryButtonText: {
    color: colors.primary,
  },
  closeButton: {
    padding: 8,
  },
});
