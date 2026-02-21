import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import MeetingChat from '@/components/MeetingChat';
import LoadingScreen from '@/components/LoadingScreen';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/i18n/i18n';

export default function MeetingChatPage() {
  const router = useRouter();
  const { meetingId, title, speakerName, requesterName } = useLocalSearchParams<{ 
    meetingId: string;
    title?: string;
    speakerName?: string;
    requesterName?: string;
  }>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { t } = useTranslation('common');
  const [loading, setLoading] = useState(true);
  const [meetingInfo, setMeetingInfo] = useState<any>(null);
  const [chatTitle, setChatTitle] = useState<string>('Chat');

  useEffect(() => {
    if (meetingId) {
      loadMeetingInfo();
    } else {
      Alert.alert('Error', 'No meeting ID provided');
      router.back();
    }
  }, [meetingId]);

  const loadMeetingInfo = async () => {
    try {
      setLoading(true);
      
      // If title is provided in params, use it
      if (title) {
        setChatTitle(title);
        setMeetingInfo({ id: meetingId, title });
        setLoading(false);
        return;
      }
      
      // Otherwise, fetch meeting details to build title
      if (meetingId && user?.id) {
        const { data: meetingData, error } = await supabase
          .from('meetings')
          .select('speaker_name, requester_name, speaker_id, requester_id')
          .eq('id', meetingId)
          .single();
        
        if (meetingData && !error) {
          const isRequester = meetingData.requester_id === user.id;
          const userName = user.user_metadata?.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'You';
          const otherName = isRequester 
            ? (meetingData.speaker_name?.split(' ')[0] || 'Speaker')
            : (meetingData.requester_name?.split(' ')[0] || 'User');
          
          setChatTitle(`${userName} ↔ ${otherName}`);
          setMeetingInfo({
            id: meetingId,
            title: chatTitle,
            speakerName: meetingData.speaker_name,
            requesterName: meetingData.requester_name
          });
        } else {
          setChatTitle('Chat');
        }
      }
    } catch (error) {
      console.error('Error loading meeting info:', error);
      setChatTitle('Chat');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    router.back();
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background?.default }]}>
        <Stack.Screen 
          options={{ 
            title: t('loading.default'),
            headerBackTitle: 'Speaker Dashboard',
          }} 
        />
        <LoadingScreen
          icon="chat"
          message={t('loading.loadingData')}
          fullScreen={true}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background?.default }]}>
      <Stack.Screen 
        options={{ 
          title: chatTitle,  // Show title in navigation bar
          headerBackTitle: 'Back',
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: colors.background?.default,
          },
          headerTitleStyle: {
            fontSize: 16,
            fontWeight: '600',
          },
          headerRight: () => (
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleClose}
            >
              <MaterialIcons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          ),
        }} 
      />
      
      <MeetingChat
        meetingId={meetingId!}
        onClose={handleClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  closeButton: {
    padding: 8,
    marginRight: 8,
  },
});
