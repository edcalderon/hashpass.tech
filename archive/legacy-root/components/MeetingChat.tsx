import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
 TouchableOpacity } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useToastHelpers } from '../contexts/ToastContext';
import RealtimeChat from './RealtimeChat';

// Helper function to generate user avatar URL
const generateUserAvatarUrl = (name: string): string => {
  const seed = name.toLowerCase().replace(/\s+/g, '-');
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
};

interface Meeting {
  id: string;
  speaker_name: string;
  requester_name: string;
  status: string;
  scheduled_at: string;
  location?: string;
  meeting_link?: string;
}

interface MeetingChatProps {
  meetingId: string;
  onClose: () => void;
}

export default function MeetingChat({ meetingId, onClose }: MeetingChatProps) {
  const { isDark, colors } = useTheme();
  const { user, isLoading: authLoading } = useAuth();
  const { showError } = useToastHelpers();
  const styles = getStyles(isDark, colors);

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [otherParticipant, setOtherParticipant] = useState<{
    id: string;
    name: string;
    avatar?: string;
  } | null>(null);

  const loadMeetingInfo = useCallback(async () => {
    // Only check authentication after auth has finished loading
    if (!authLoading && !user?.id) {
      console.error('No user ID available for loading meeting info');
      showError('Error', 'User not authenticated');
      setLoading(false);
      return;
    }

    // If auth is still loading, wait
    if (authLoading) {
      return;
    }

    if (!meetingId) {
      console.error('No meeting ID provided');
      showError('Error', 'Meeting ID is required');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // Load meeting details
      const { data: meetingData, error: meetingError } = await supabase
        .from('meetings')
        .select('*, speaker_id, requester_id, speaker_name, requester_name')
        .eq('id', meetingId)
        .single();

      if (meetingError) {
        console.error('Error loading meeting:', meetingError);
        showError('Error', 'Failed to load meeting information');
        return;
      }

      if (meetingData) {
        setMeeting(meetingData);
        
        // Determine other participant
        const isRequester = meetingData.requester_id === user.id;
        let otherUserId: string | null = null;
        let otherUserName: string | null = null;
        
        if (isRequester) {
          // User is requester, other is speaker
          // Get speaker's user_id from bsl_speakers
          const { data: speakerData } = await supabase
            .from('bsl_speakers')
            .select('user_id, name, imageurl')
            .eq('id', meetingData.speaker_id)
            .single();
          
          if (speakerData?.user_id) {
            otherUserId = speakerData.user_id;
            otherUserName = meetingData.speaker_name || speakerData.name;
            
            // ALWAYS use speaker's image from bsl_speakers
            // Use imageurl from bsl_speakers, which will be handled by SpeakerAvatar component
            // SpeakerAvatar will prioritize local optimized avatars, then S3, then generate initials
            // Pass imageurl directly so SpeakerAvatar can handle the fallback chain properly
            const avatarUrl = speakerData.imageurl || null; // Pass null to let SpeakerAvatar handle fallback
            
            setOtherParticipant({
              id: otherUserId,
              name: otherUserName,
              avatar: avatarUrl, // This will be used by SpeakerAvatar component
            });
          }
        } else {
          // User is speaker, other is requester
          otherUserId = meetingData.requester_id;
          otherUserName = meetingData.requester_name;
          
          // Generate avatar for requester (we can't query auth.users directly from client)
          // In production, you might want to create an API endpoint to fetch user metadata
          const avatarUrl = generateUserAvatarUrl(otherUserName || 'User');
          
          setOtherParticipant({
            id: otherUserId,
            name: otherUserName || 'User',
            avatar: avatarUrl,
          });
        }
      }
    } catch (error) {
      console.error('Error loading meeting info:', error);
      showError('Error', 'Failed to load meeting information');
    } finally {
      setLoading(false);
    }
  }, [authLoading, user?.id, meetingId, showError]);

  useEffect(() => {
    // Wait for auth to finish loading before checking authentication
    if (!authLoading) {
      loadMeetingInfo();
    }
  }, [meetingId, authLoading, loadMeetingInfo]);

  // Update last seen when chat is viewed
  useEffect(() => {
    const updateLastSeen = async () => {
      if (!user?.id || !meetingId) return;
      
      try {
        const { error } = await supabase.rpc('update_chat_last_seen', {
          p_user_id: user.id,
          p_meeting_id: meetingId,
        });
        
        if (error) {
          console.error('Error updating chat last seen:', error);
        }
      } catch (error) {
        console.error('Error updating chat last seen:', error);
      }
    };

    // Update immediately when component mounts
    updateLastSeen();
    
    // Update every 30 seconds while chat is open
    const interval = setInterval(updateLastSeen, 30000);
    
    return () => clearInterval(interval);
  }, [user?.id, meetingId]);

  // Show loading state while auth is loading or meeting info is loading
  if (authLoading || loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading chat...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Real-time Chat Component */}
      <RealtimeChat
        roomName={`meeting_chat_${meetingId}`}
        username={user?.user_metadata?.full_name || user?.email || 'user'}
        meetingId={meetingId}
        otherParticipantId={otherParticipant?.id}
        otherParticipantName={otherParticipant?.name}
        otherParticipantAvatar={otherParticipant?.avatar}
      />
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background?.default || (isDark ? '#000000' : '#ffffff'),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background?.default || (isDark ? '#000000' : '#ffffff'),
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? '#333333' : '#f0f0f0',
    backgroundColor: colors.background?.paper || (isDark ? '#1a1a1a' : '#ffffff'),
  },
  closeButton: {
    padding: 8,
    marginRight: 8,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.text?.secondary || (isDark ? '#cccccc' : '#666666'),
    marginTop: 2,
  },
});
