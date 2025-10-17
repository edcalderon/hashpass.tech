import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../../../hooks/useTheme';
import { useEvent } from '../../../../contexts/EventContext';
import { useAuth } from '../../../../hooks/useAuth';
import { MaterialIcons } from '@expo/vector-icons';
import { matchmakingService, CreateMeetingRequestData } from '../../../../lib/matchmaking';
import { useToastHelpers } from '../../../../contexts/ToastContext';
import { supabase } from '../../../../lib/supabase';
import { passSystemService } from '../../../../lib/pass-system';
import SpeakerAvatar from '../../../../components/SpeakerAvatar';
import PassesDisplay from '../../../../components/PassesDisplay';

interface Speaker {
  id: string;
  name: string;
  title: string;
  company: string;
  bio?: string;
  image?: string;
  linkedin?: string;
  twitter?: string;
  tags?: string[];
  availability?: any;
  social?: {
    linkedin?: string;
    twitter?: string;
  };
}

// UserTicket interface removed - now using pass system

export default function SpeakerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isDark, colors } = useTheme();
  const { event } = useEvent();
  const { user } = useAuth();
  const router = useRouter();
  const { showSuccess, showError, showWarning, showInfo } = useToastHelpers();
  
  const styles = getStyles(isDark, colors);

  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  // userTicket removed - now using pass system
  const [isRequestingMeeting, setIsRequestingMeeting] = useState(false);
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingRequest, setMeetingRequest] = useState<any>(null);
  const [loadingRequestStatus, setLoadingRequestStatus] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancellingRequest, setIsCancellingRequest] = useState(false);
  const [cancelledRequests, setCancelledRequests] = useState<any[]>([]);
  const [loadingCancelledRequests, setLoadingCancelledRequests] = useState(false);
  
  // Debug modal state changes
  useEffect(() => {
    console.log('🔍 Modal state changed:', showMeetingModal);
  }, [showMeetingModal]);
  const [meetingMessage, setMeetingMessage] = useState('');
  const [selectedIntentions, setSelectedIntentions] = useState<string[]>(['none']);
  const [requestLimits, setRequestLimits] = useState<{
    ticketType: 'general' | 'business' | 'vip';
    totalRequests: number;
    remainingRequests: number;
    nextRequestAllowedAt?: string;
    canSendRequest: boolean;
    requestLimit: number;
    reason?: string;
  } | null>(null);
  const [showTicketComparison, setShowTicketComparison] = useState(false);

  // Mock user ticket data removed - now using pass system

  // mockUserTicket removed - now using pass system

  const loadSpeaker = async () => {
    try {
      // First try to fetch from the database with timeout
      console.log('🔍 Attempting to load speaker from database...');
      
      const dbPromise = supabase
        .from('bsl_speakers')
        .select('*')
        .eq('id', id)
        .single();

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database timeout')), 5000)
      );

      try {
        const { data: dbSpeaker, error: dbError } = await Promise.race([dbPromise, timeoutPromise]) as any;

        if (dbSpeaker && !dbError) {
          // Use real data from database
          setSpeaker({
            id: dbSpeaker.id,
            name: dbSpeaker.name,
            title: dbSpeaker.title,
            company: dbSpeaker.company || '',
            bio: dbSpeaker.bio || `Experienced professional in ${dbSpeaker.title}.`,
            image: dbSpeaker.imageurl || `https://blockchainsummit.la/wp-content/uploads/2025/09/foto-${dbSpeaker.name.toLowerCase().replace(/\s+/g, '-')}.png`,
            linkedin: dbSpeaker.linkedin || `https://linkedin.com/in/${dbSpeaker.name.toLowerCase().replace(/\s+/g, '-')}`,
            twitter: dbSpeaker.twitter || `https://twitter.com/${dbSpeaker.name.toLowerCase().replace(/\s+/g, '-')}`,
            tags: dbSpeaker.tags || ['Blockchain', 'FinTech', 'Innovation'],
            availability: dbSpeaker.availability || {
              monday: { start: '09:00', end: '17:00' },
              tuesday: { start: '09:00', end: '17:00' },
              wednesday: { start: '09:00', end: '17:00' },
              thursday: { start: '09:00', end: '17:00' },
              friday: { start: '09:00', end: '17:00' }
            }
          });
          console.log('✅ Loaded speaker from database:', dbSpeaker.name);
          return;
        }
      } catch (dbError) {
        console.log('⚠️ Database unavailable or timeout, falling back to event config...', dbError instanceof Error ? dbError.message : String(dbError));
      }

      // Fallback to event config (JSON) - always available
      console.log('📋 Loading speaker from event config (JSON fallback)...');
      const foundSpeaker = event.speakers?.find(s => s.id === id);
      
      if (foundSpeaker) {
        setSpeaker({
          id: foundSpeaker.id,
          name: foundSpeaker.name,
          title: foundSpeaker.title,
          company: foundSpeaker.company,
          bio: `Experienced professional in ${foundSpeaker.title} at ${foundSpeaker.company}.`,
          image: `https://blockchainsummit.la/wp-content/uploads/2025/09/foto-${foundSpeaker.name.toLowerCase().replace(/\s+/g, '-')}.png`,
          linkedin: `https://linkedin.com/in/${foundSpeaker.name.toLowerCase().replace(/\s+/g, '-')}`,
          twitter: `https://twitter.com/${foundSpeaker.name.toLowerCase().replace(/\s+/g, '-')}`,
          tags: ['Blockchain', 'FinTech', 'Innovation'],
          availability: {
            monday: { start: '09:00', end: '17:00' },
            tuesday: { start: '09:00', end: '17:00' },
            wednesday: { start: '09:00', end: '17:00' },
            thursday: { start: '09:00', end: '17:00' },
            friday: { start: '09:00', end: '17:00' }
          }
        });
        console.log('✅ Loaded speaker from event config (JSON fallback):', foundSpeaker.name);
      } else {
        console.error('❌ Speaker not found in database or event config:', id);
        showError('Speaker Not Found', 'The requested speaker could not be found.');
      }
    } catch (error) {
      console.error('❌ Error loading speaker:', error);
      // Even if there's an error, try the JSON fallback
      console.log('🔄 Attempting JSON fallback after error...');
      const foundSpeaker = event.speakers?.find(s => s.id === id);
      if (foundSpeaker) {
        setSpeaker({
          id: foundSpeaker.id,
          name: foundSpeaker.name,
          title: foundSpeaker.title,
          company: foundSpeaker.company,
          bio: `Experienced professional in ${foundSpeaker.title} at ${foundSpeaker.company}.`,
          image: `https://blockchainsummit.la/wp-content/uploads/2025/09/foto-${foundSpeaker.name.toLowerCase().replace(/\s+/g, '-')}.png`,
          linkedin: `https://linkedin.com/in/${foundSpeaker.name.toLowerCase().replace(/\s+/g, '-')}`,
          twitter: `https://twitter.com/${foundSpeaker.name.toLowerCase().replace(/\s+/g, '-')}`,
          tags: ['Blockchain', 'FinTech', 'Innovation'],
          availability: {
            monday: { start: '09:00', end: '17:00' },
            tuesday: { start: '09:00', end: '17:00' },
            wednesday: { start: '09:00', end: '17:00' },
            thursday: { start: '09:00', end: '17:00' },
            friday: { start: '09:00', end: '17:00' }
          }
        });
        console.log('✅ Emergency fallback successful:', foundSpeaker.name);
      } else {
        showError('Error', 'Failed to load speaker information from all sources.');
      }
    }
  };

  useEffect(() => {
    if (!id) return;
    
    loadSpeaker();
    
    // User ticket removed - now using pass system
    
    // Load user request limits
    loadRequestLimits();
  }, [id, event.speakers]);

  useEffect(() => {
    if (user && speaker) {
      loadMeetingRequestStatus();
      loadCancelledRequests();
      loadRequestLimits();
    }
  }, [user, speaker]);

  const loadMeetingRequestStatus = async () => {
    if (!user || !speaker) return;

    setLoadingRequestStatus(true);
    try {
      console.log('🔄 Loading meeting request status for user:', user.id, 'speaker:', speaker.id);
      const request = await passSystemService.getMeetingRequestStatus(user.id, speaker.id);
      console.log('🔄 Meeting request status result:', request);
      setMeetingRequest(request);
    } catch (error) {
      console.error('❌ Error in loadMeetingRequestStatus:', error);
    } finally {
      setLoadingRequestStatus(false);
    }
  };

  const loadCancelledRequests = async () => {
    if (!user || !speaker) return;

    setLoadingCancelledRequests(true);
    try {
      console.log('🔄 Loading cancelled requests for user:', user.id, 'speaker:', speaker.id);
      
      const { data, error } = await supabase
        .from('meeting_requests')
        .select('*')
        .eq('requester_id', user.id)
        .eq('speaker_id', speaker.id)
        .eq('status', 'cancelled')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error loading cancelled requests:', error);
        return;
      }

      console.log('🔄 Cancelled requests result:', data);
      setCancelledRequests(data || []);
    } catch (error) {
      console.error('❌ Error in loadCancelledRequests:', error);
    } finally {
      setLoadingCancelledRequests(false);
    }
  };

  const handleCancelRequest = () => {
    if (!user || !meetingRequest) return;
    setShowCancelModal(true);
  };

  const confirmCancelRequest = async () => {
    if (!user || !meetingRequest || isCancellingRequest) return;

    setIsCancellingRequest(true);

    try {
      console.log('🔄 Attempting to cancel request:', meetingRequest.id);
      console.log('🔄 User ID:', user.id);
      
      // First, let's check the current request details
      console.log('🔍 Current meeting request details:', meetingRequest);
      console.log('🔍 User ID from auth:', user.id);
      console.log('🔍 Requester ID from request:', meetingRequest.requester_id);
      console.log('🔍 IDs match?', user.id === meetingRequest.requester_id);
      
      // Update the meeting request status to cancelled
      // Handle both UUID and numeric ID formats
      let { data, error: updateError } = await supabase
        .from('meeting_requests')
        .update({ 
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', meetingRequest.id)
        .eq('requester_id', user.id.toString()) // Convert to string to handle type mismatches
        .select('*');

      console.log('🔄 Update response - data:', data);
      console.log('🔄 Update response - error:', updateError);

      if (updateError) {
        console.error('❌ Database update error:', updateError);
        throw updateError;
      }

      if (!data || data.length === 0) {
        console.error('❌ No rows updated - trying fallback approach');
        
        // Try fallback: update without requester_id check (in case of type mismatch)
        console.log('🔄 Trying fallback update without requester_id check...');
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('meeting_requests')
          .update({ 
            status: 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq('id', meetingRequest.id.toString()) // Convert to string
          .select('*');

        console.log('🔄 Fallback response - data:', fallbackData);
        console.log('🔄 Fallback response - error:', fallbackError);

        if (fallbackError) {
          console.error('❌ Fallback update also failed:', fallbackError);
          throw fallbackError;
        }

        if (!fallbackData || fallbackData.length === 0) {
          console.error('❌ Fallback update also returned no rows');
          throw new Error('Request not found or you do not have permission to cancel it');
        }

        console.log('✅ Fallback update successful:', fallbackData[0]);
        // Use fallback data for success flow
        data = fallbackData;
      }

      console.log('✅ Request cancelled successfully:', data[0]);

      // Close the modal first
      setShowCancelModal(false);
      
      // Show success message
      showSuccess(
        'Request Cancelled',
        'Your meeting request has been cancelled successfully.'
      );
      
      // Refresh the request status to update UI
      console.log('🔄 Refreshing request status...');
      await loadMeetingRequestStatus();
      
      // Refresh cancelled requests history
      console.log('🔄 Refreshing cancelled requests...');
      await loadCancelledRequests();
      
      // Refresh request limits to update available requests
      console.log('🔄 Refreshing request limits...');
      await loadRequestLimits();
      
      console.log('✅ All updates completed successfully');
      
    } catch (error: any) {
      console.error('❌ Error cancelling request:', error);
      
      // Show specific error messages based on error type
      let errorMessage = 'Failed to cancel the meeting request. Please try again.';
      
      if (error.message?.includes('permission')) {
        errorMessage = 'You do not have permission to cancel this request.';
      } else if (error.message?.includes('not found')) {
        errorMessage = 'Request not found. It may have already been cancelled.';
      } else if (error.code === 'PGRST301') {
        errorMessage = 'You are not authorized to perform this action.';
      } else if (error.code === '23505') {
        errorMessage = 'This request has already been processed.';
      }
      
      showError(
        'Cancellation Failed',
        errorMessage
      );
    } finally {
      setIsCancellingRequest(false);
    }
  };




  const loadRequestLimits = async () => {
    if (!user || !speaker) return;
    
    try {
      console.log('🔄 Loading request limits for user:', user.id, 'speaker:', speaker.id);
      
      // Use the pass system's can_make_meeting_request function
    const { data, error } = await supabase.rpc('can_make_meeting_request', {
      p_user_id: user.id.toString(), // Convert to TEXT to avoid type casting issues
      p_speaker_id: speaker.id,
      p_boost_amount: 0
    });

      if (error) {
        console.error('❌ Error calling can_make_meeting_request:', error);
        throw error;
      }

      console.log('🔄 can_make_meeting_request result:', data);

      if (data && data.length > 0) {
        const result = data[0];
        setRequestLimits({
          ticketType: result.pass_type || 'business',
          totalRequests: 0, // This will be calculated from pass info
          remainingRequests: result.remaining_requests || 0,
          canSendRequest: result.can_request || false,
          requestLimit: result.remaining_requests || 0,
          reason: result.reason || 'Unknown reason',
        });
      } else {
        // No pass found or other issue
        setRequestLimits({
          ticketType: 'business',
          totalRequests: 0,
          remainingRequests: 0,
          canSendRequest: false,
          requestLimit: 0,
          reason: 'No active pass found',
        });
      }
    } catch (error) {
      console.error('❌ Error loading request limits:', error);
      // Set default limits to prevent meeting requests if database is unavailable
      setRequestLimits({
        ticketType: 'business',
        totalRequests: 0,
        remainingRequests: 0,
        canSendRequest: false,
        requestLimit: 0,
        reason: 'Error loading request limits',
      });
    }
  };

  // Check meeting availability when speaker or ticket changes

  const getTicketAccessLevel = (ticketType: string) => {
    switch (ticketType) {
      case 'general':
        return {
          level: 1,
          name: 'General Access',
          canRequestMeeting: true, // Updated: General can now send 1 request
          canVideoChat: false,
          canAccessVIP: false,
          description: 'Conferences only + 1 meeting request during event'
        };
      case 'business':
        return {
          level: 2,
          name: 'Business Access',
          canRequestMeeting: true,
          canVideoChat: true,
          canAccessVIP: false,
          description: 'Conferences + Networking & B2B sessions + 3 meeting requests'
        };
      case 'vip':
        return {
          level: 3,
          name: 'VIP Access',
          canRequestMeeting: true,
          canVideoChat: true,
          canAccessVIP: true,
          description: 'All access + VIP networking with speakers + unlimited meeting requests'
        };
      default:
        return {
          level: 0,
          name: 'No Access',
          canRequestMeeting: false,
          canVideoChat: false,
          canAccessVIP: false,
          description: 'No access to matchmaking features'
        };
    }
  };

  const handleRequestMeeting = async () => {
    console.log('🔵 handleRequestMeeting called');
    console.log('User:', user?.id);
    console.log('Speaker:', speaker?.id);
    
    if (!user) {
      console.log('❌ No user found');
      showWarning('Login Required', 'Please log in to request a meeting');
      return;
    }

    if (!speaker) {
      console.log('❌ Missing speaker');
      showError('Missing Information', 'Missing speaker information');
      return;
    }

    // Show the meeting request modal directly
    // Pass validation is now handled by PassDisplay component
    console.log('🟡 Showing meeting request modal...');
    setShowMeetingModal(true);
    console.log('🟢 Modal should now be visible');
  };

  const submitMeetingRequestDirectly = async () => {
    console.log('🔵 submitMeetingRequestDirectly called');
    
    if (!user || !speaker) {
      console.log('❌ Missing required data:', { user: !!user, speaker: !!speaker });
      return;
    }

    console.log('🔵 User data:', { id: user.id, email: user.email });
    console.log('🔵 Speaker data:', { id: speaker.id, name: speaker.name });

    setIsRequestingMeeting(true);

    try {
      const requestData: CreateMeetingRequestData = {
        requester_id: user.id,
        speaker_id: speaker.id,
        speaker_name: speaker.name,
        requester_name: user.email || 'Anonymous',
        requester_company: 'Your Company',
        requester_title: 'Your Title',
        requester_ticket_type: 'general', // Default ticket type, will be validated by pass system
        meeting_type: 'networking',
        message: '', // No message
        note: '', // No note
        boost_amount: 0 // No boost system yet
      };

      console.log('🔵 Request data to send:', requestData);
      
      // Test if we can create a simple meeting request
      try {
        await matchmakingService.createMeetingRequest(requestData);
        console.log('✅ Meeting request created successfully');
      } catch (error) {
        console.error('❌ Error creating meeting request:', error);
        
        // If database is not available, show a mock success message
        if (error instanceof Error && (error.message.includes('Database table not found') || 
            error.message.includes('Could not find the table') ||
            error.message.includes('406 Not Acceptable'))) {
          console.log('🟡 Database not available, showing mock success');
          showInfo(
            'Request Sent! (Demo Mode)', 
            'Your meeting request has been sent to the speaker. This is a demo - the database is not available.'
          );
          return;
        }
        
        throw error;
      }
      
      showSuccess(
        'Request Sent! 🎉',
        'Your meeting request has been sent to the speaker. They will review it and respond soon.'
      );

      // Reload request limits to update the UI
      await loadRequestLimits();
      
    } catch (error) {
      console.error('Error sending meeting request:', error);
      
      // Show specific error messages based on the error type
      if (error instanceof Error) {
        if (error.message.includes('Invalid data format') || error.message.includes('Invalid speaker or user ID format')) {
          showError('Data Format Error', error.message);
        } else if (error.message.includes('Invalid request data')) {
          showError('Invalid Request', error.message);
        } else if (error.message.includes('Database table not found')) {
          showError('Database Error', error.message);
        } else if (error.message.includes('not authorized')) {
          showError('Authorization Error', error.message);
        } else if (error.message.includes('already exists')) {
          showError('Duplicate Request', error.message);
        } else if (error.message.includes('Speaker not found in database')) {
          showError('Speaker Not Found', error.message);
        } else {
          showError('Request Failed', error.message);
        }
      } else {
        showError('Request Failed', 'Failed to send meeting request. Please try again.');
      }
    } finally {
      setIsRequestingMeeting(false);
    }
  };

  const getIntentionText = (intentionId: string): string => {
    const intentions = {
      'coffee': '☕ Just to grab a coffee and chat',
      'pitch': '💡 I want to pitch you my startup idea',
      'consultation': '🔍 Quick 5-minute consultation',
      'networking': '🤝 General networking and connection',
      'collaboration': '🚀 Explore potential collaboration',
      'advice': '💭 Seek advice on my career/project',
      'fun': '😄 Just for fun and interesting conversation',
      'learning': '📚 Learn from your experience',
      'none': '⚪ No specific intention'
    };
    return intentions[intentionId as keyof typeof intentions] || '';
  };

  const getSelectedIntentionsText = (): string => {
    if (selectedIntentions.length === 0) return '';
    if (selectedIntentions.includes('none')) return '⚪ No specific intention';
    
    return selectedIntentions.map(id => getIntentionText(id)).join('; ');
  };

  const submitMeetingRequest = async () => {
    if (!user || !speaker) return;

    setIsRequestingMeeting(true);

    try {
      const meetingData: CreateMeetingRequestData = {
        requester_id: user.id,
        speaker_id: speaker.id,
        speaker_name: speaker.name,
        requester_name: user.email || 'Anonymous',
        requester_company: 'Your Company', // Would come from user profile
        requester_title: 'Your Title', // Would come from user profile
        requester_ticket_type: 'business', // Default to business for now, will be replaced by pass system
        meeting_type: 'networking',
        message: meetingMessage || '', // Allow empty message
        note: getSelectedIntentionsText(),
        boost_amount: 0, // No boost system yet
      };

      const meetingRequest = await matchmakingService.createMeetingRequest(meetingData);
      
      // Always close modal and reset form on success
      setShowMeetingModal(false);
      setMeetingMessage('');
      setSelectedIntentions([]);
      
          // Refresh request limits and meeting request status after sending
          await loadRequestLimits();
          await loadMeetingRequestStatus();
      
      // Check if this is a demo response
      if (meetingRequest && meetingRequest.id && meetingRequest.id.startsWith('demo-')) {
        showSuccess(
          'Demo Request Sent! 🎉', 
          `Your demo request has been sent to ${speaker.name}. This is a demonstration - the speaker is not in the database.`
        );
      } else {
        showSuccess(
          'Meeting Request Sent! 🎉', 
          `Your request has been sent to ${speaker.name}. You will be notified when they respond.`
        );
      }
    } catch (error) {
      console.error('Error creating meeting request:', error);
      
      // Close modal and reset form even on error
      setShowMeetingModal(false);
      setMeetingMessage('');
      setSelectedIntentions([]);
      
      // Show specific error messages based on the error type
      if (error instanceof Error) {
        if (error.message.includes('Invalid data format') || error.message.includes('Invalid speaker or user ID format')) {
          showError('Data Format Error', error.message);
        } else if (error.message.includes('Invalid request data')) {
          showError('Invalid Request', error.message);
        } else if (error.message.includes('Database table not found') || error.message.includes('404')) {
          showError('Database Error', 'The meeting requests table is not set up yet. Please contact support.');
        } else if (error.message.includes('not authorized')) {
          showError('Authorization Error', error.message);
        } else if (error.message.includes('already exists')) {
          showError('Duplicate Request', error.message);
        } else if (error.message.includes('Speaker not found in database')) {
          showError('Speaker Not Found', error.message);
        } else if (error.message.includes('Cannot create meeting request')) {
          showError('Pass Validation Failed', error.message);
        } else {
          showError('Request Failed', error.message);
        }
      } else {
        showError('Request Failed', 'Failed to send meeting request. Please try again.');
      }
    } finally {
      setIsRequestingMeeting(false);
    }
  };



  const handleLinkedIn = () => {
    if (speaker?.social?.linkedin) {
      // In a real app, you'd open the LinkedIn URL
      Alert.alert('LinkedIn', `Opening ${speaker.name}'s LinkedIn profile...`);
    }
  };

  if (!speaker) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading speaker details...</Text>
      </View>
    );
  }

  const access = getTicketAccessLevel('business'); // Default to business pass

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Speaker Header Card */}
      <View style={styles.speakerCard}>
        <View style={styles.avatarContainer}>
          <SpeakerAvatar
            imageUrl={speaker.image}
            name={speaker.name}
            size={80}
            showBorder={true}
          />
        </View>
        
        <View style={styles.speakerInfo}>
          <Text style={styles.speakerName}>{speaker.name}</Text>
          <Text style={styles.speakerTitle}>{speaker.title}</Text>
          <Text style={styles.speakerCompany}>{speaker.company}</Text>
        </View>
      </View>

      {/* About Section - First */}
      {speaker.bio && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="person" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>About</Text>
          </View>
          <Text style={styles.bioText}>{speaker.bio}</Text>
        </View>
      )}

        {/* Your Request Status - Show if there's an existing request */}
        {meetingRequest && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="assignment" size={24} color={colors.primary} />
              <Text style={styles.sectionTitle}>Your Request Status</Text>
            </View>
          
          <View style={[
            styles.requestStatusCard,
            {
              backgroundColor: meetingRequest.status === 'approved' ? `${colors.primary}10` : 
                              meetingRequest.status === 'declined' ? `${colors.error}10` : 
                              `${colors.warning}10`,
              borderColor: meetingRequest.status === 'approved' ? colors.primary : 
                          meetingRequest.status === 'declined' ? colors.error.main : 
                          '#FF9500'
            }
          ]}>
            <View style={styles.requestStatusHeader}>
              <Text style={[
                styles.requestStatusTitle,
                {
                  color: meetingRequest.status === 'approved' ? colors.primary : 
                         meetingRequest.status === 'declined' ? colors.error.main : 
                         '#FF9500'
                }
              ]}>
                {meetingRequest.status === 'approved' ? '✅ Meeting Request Approved' :
                 meetingRequest.status === 'declined' ? '❌ Meeting Request Declined' :
                 '⏳ Meeting Request Pending'}
              </Text>
            </View>
            
            <View style={styles.requestDetails}>
              <View style={styles.requestDetailRow}>
                <Text style={styles.requestDetailLabel}>Request ID:</Text>
                <Text style={styles.requestDetailValue}>{meetingRequest.id}</Text>
              </View>
              
              <View style={styles.requestDetailRow}>
                <Text style={styles.requestDetailLabel}>Sent:</Text>
                <Text style={styles.requestDetailValue}>
                  {new Date(meetingRequest.created_at).toLocaleDateString()}
                </Text>
              </View>
              
              {meetingRequest.message && (
                <View style={styles.requestDetailRow}>
                  <Text style={styles.requestDetailLabel}>Message:</Text>
                  <Text style={styles.requestDetailValue}>{meetingRequest.message}</Text>
                </View>
              )}
              
            </View>

            {meetingRequest.status === 'pending' && (
              <View style={styles.requestStatusMessage}>
                <Text style={styles.requestStatusText}>
                  Your request is waiting for {speaker.name}'s response. You will be notified when they reply.
                </Text>
                
                {/* Request Priority & Boost Info */}
                <View style={styles.requestPriorityInfo}>
                  <View style={styles.priorityBadge}>
                    <MaterialIcons 
                      name={meetingRequest.requester_ticket_type === 'vip' ? 'star' : 
                            meetingRequest.requester_ticket_type === 'business' ? 'business' : 'person'} 
                      size={14} 
                      color={meetingRequest.requester_ticket_type === 'vip' ? '#FFD700' : 
                             meetingRequest.requester_ticket_type === 'business' ? '#4CAF50' : colors.text.secondary} 
                    />
                    <Text style={[
                      styles.priorityText,
                      { color: meetingRequest.requester_ticket_type === 'vip' ? '#FFD700' : 
                               meetingRequest.requester_ticket_type === 'business' ? '#4CAF50' : colors.text.secondary }
                    ]}>
                      {meetingRequest.requester_ticket_type?.toUpperCase() || 'GENERAL'}
                    </Text>
                  </View>
                  
                </View>

                {/* Action Buttons */}
                <View style={styles.requestActions}>
                  
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={handleCancelRequest}
                  >
                    <MaterialIcons name="close" size={16} color="white" />
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {meetingRequest.status === 'approved' && (
              <View style={[styles.requestStatusMessage, { borderColor: colors.primary }]}>
                <Text style={styles.requestStatusText}>
                  🎉 Great! {speaker.name} has approved your meeting request. Check your notifications for meeting details.
                </Text>
              </View>
            )}

            {meetingRequest.status === 'declined' && (
              <View style={[styles.requestStatusMessage, { borderColor: colors.error.main }]}>
                <Text style={styles.requestStatusText}>
                  {speaker.name} has declined your meeting request. You can try requesting a meeting with other speakers.
                </Text>
              </View>
            )}

          </View>
        </View>
      )}

      {/* Cancelled Requests History */}
      {cancelledRequests.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="history" size={24} color={colors.text.secondary} />
            <Text style={styles.sectionTitle}>Request History</Text>
          </View>
          
          <View style={styles.cancelledRequestsList}>
            {cancelledRequests.map((request, index) => (
              <View key={request.id} style={styles.cancelledRequestCard}>
                <View style={styles.cancelledRequestHeader}>
                  <View style={styles.cancelledRequestStatus}>
                    <MaterialIcons name="cancel" size={16} color={colors.error.main} />
                    <Text style={styles.cancelledRequestStatusText}>Cancelled</Text>
                  </View>
                  <Text style={styles.cancelledRequestDate}>
                    {new Date(request.created_at).toLocaleDateString()}
                  </Text>
                </View>
                
                {request.message && (
                  <Text style={styles.cancelledRequestMessage} numberOfLines={2}>
                    {request.message}
                  </Text>
                )}
                
                <View style={styles.cancelledRequestDetails}>
                  {request.boost_amount > 0 && (
                    <View style={styles.cancelledRequestBoost}>
                      <MaterialIcons name="flash-on" size={14} color="#FF6B35" />
                      <Text style={styles.cancelledRequestBoostText}>
                        +{request.boost_amount} BOOST
                      </Text>
                    </View>
                  )}
                  
                  <Text style={styles.cancelledRequestId}>
                    ID: {request.id.substring(0, 8)}...
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Pass Display */}
      <PassesDisplay
        mode="speaker"
        speakerId={speaker.id}
        showRequestButton={true}
        onRequestPress={handleRequestMeeting}
        onPassInfoLoaded={(passInfo) => {
          console.log('Pass info loaded:', passInfo);
        }}
        onRequestLimitsLoaded={(limits) => {
          console.log('Request limits loaded:', limits);
        }}
      />

      {/* Social Links */}
      {speaker.social && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="link" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>Connect</Text>
          </View>
          <View style={styles.socialLinks}>
            {speaker.social.linkedin && (
              <TouchableOpacity style={styles.socialButton} onPress={handleLinkedIn}>
                <MaterialIcons name="link" size={24} color="#0077B5" />
                <Text style={styles.socialButtonText}>LinkedIn</Text>
              </TouchableOpacity>
            )}
            {speaker.social.twitter && (
              <TouchableOpacity style={styles.socialButton}>
                <MaterialIcons name="chat" size={24} color="#1DA1F2" />
                <Text style={styles.socialButtonText}>Twitter</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Matchmaking Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialIcons name="people" size={24} color={colors.primary} />
          <Text style={styles.sectionTitle}>Matchmaking & Networking</Text>
        </View>
        <Text style={styles.sectionSubtitle}>
          Con la funcionalidad de Matchmaking no pierdas oportunidades de negocios: organiza citas con expositores u otros participantes y gestiona tu calendario de reuniones one-to-one
        </Text>
        

        {/* Request Limits Display - Always Show */}
        <View style={styles.requestLimitsInfo}>
          <View style={styles.requestLimitsHeader}>
            <MaterialIcons name="schedule" size={20} color="#60A5FA" />
            <Text style={styles.requestLimitsTitle}>Your Request Status</Text>
          </View>
          
          <View style={styles.requestLimitsContent}>
            <View style={styles.requestLimitsRow}>
              <Text style={styles.requestLimitsLabel}>Ticket Type:</Text>
              <Text style={[styles.requestLimitsValue, { 
                color: requestLimits?.ticketType === 'vip' ? '#FFD700' : 
                       requestLimits?.ticketType === 'business' ? '#60A5FA' : '#999'
              }]}>
                {requestLimits?.ticketType?.toUpperCase() || 'BUSINESS'}
              </Text>
            </View>
            
            <View style={styles.requestLimitsRow}>
              <Text style={styles.requestLimitsLabel}>Requests Used:</Text>
              <Text style={styles.requestLimitsValue}>
                {requestLimits ? `${requestLimits.totalRequests} / ${requestLimits.requestLimit === 999999 ? '∞' : requestLimits.requestLimit}` : '0 / 1'}
              </Text>
            </View>
            
            <View style={styles.requestLimitsRow}>
              <Text style={styles.requestLimitsLabel}>Remaining:</Text>
              <Text style={[styles.requestLimitsValue, { 
                color: (requestLimits?.remainingRequests || 1) > 0 ? '#4CAF50' : '#F44336'
              }]}>
                {requestLimits ? (requestLimits.remainingRequests === 999999 ? '∞' : requestLimits.remainingRequests) : '1'}
              </Text>
            </View>
            
            {requestLimits?.nextRequestAllowedAt && (
              <View style={styles.requestLimitsRow}>
                <Text style={styles.requestLimitsLabel}>Next Request:</Text>
                <Text style={styles.requestLimitsValue}>
                  {new Date(requestLimits.nextRequestAllowedAt).toLocaleTimeString()}
                </Text>
              </View>
            )}
          </View>
          
          {requestLimits && !requestLimits.canSendRequest && (
            <View style={styles.requestLimitsWarning}>
              <MaterialIcons name="warning" size={16} color="#FF9800" />
              <Text style={styles.requestLimitsWarningText}>
                {requestLimits.remainingRequests === 0 
                  ? 'You have reached your request limit. Use $VOI boost for additional requests.'
                  : 'Please wait before sending your next request.'
                }
              </Text>
            </View>
          )}
        </View>


        {/* Action buttons are now handled by PassDisplay component */}

      </View>

      {/* Meeting Request Modal */}
      <Modal
        visible={showMeetingModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Request Meeting with {speaker?.name}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowMeetingModal(false)}
            >
              <MaterialIcons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.inputGroup}>
              <View style={styles.inputLabelRow}>
                <Text style={styles.inputLabel}>Message (Optional)</Text>
                <Text style={styles.inputHint}>💡 Including a message increases approval chances by 3x</Text>
              </View>
              <TextInput
                style={styles.textInput}
                placeholder="Tell the speaker why you'd like to meet (optional but recommended)..."
                placeholderTextColor={colors.text.secondary}
                value={meetingMessage}
                onChangeText={setMeetingMessage}
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Meeting Intention (Optional)</Text>
              <Text style={styles.inputHint}>💡 Select up to 3 intentions for the meeting (or choose "No specific intention")</Text>
              
              <View style={styles.intentionChecklist}>
                {[
                  { id: 'coffee', text: 'Just to grab a coffee and chat', emoji: '☕' },
                  { id: 'pitch', text: 'I want to pitch you my startup idea', emoji: '💡' },
                  { id: 'consultation', text: 'Quick 5-minute consultation', emoji: '🔍' },
                  { id: 'networking', text: 'General networking and connection', emoji: '🤝' },
                  { id: 'collaboration', text: 'Explore potential collaboration', emoji: '🚀' },
                  { id: 'advice', text: 'Seek advice on my career/project', emoji: '💭' },
                  { id: 'fun', text: 'Just for fun and interesting conversation', emoji: '😄' },
                  { id: 'learning', text: 'Learn from your experience', emoji: '📚' },
                  { id: 'none', text: 'No specific intention', emoji: '⚪' }
                ].map((intention) => (
                  <TouchableOpacity
                    key={intention.id}
                    style={[
                      styles.intentionOption,
                      selectedIntentions.includes(intention.id) && styles.intentionOptionSelected
                    ]}
                    onPress={() => {
                      if (intention.id === 'none') {
                        // If "No Intention" is selected, clear all others
                        setSelectedIntentions(['none']);
                      } else {
                        // Remove 'none' if it was selected
                        let newSelections = selectedIntentions.filter(id => id !== 'none');
                        
                        if (newSelections.includes(intention.id)) {
                          // Remove if already selected
                          newSelections = newSelections.filter(id => id !== intention.id);
                        } else {
                          // Add if not selected and under limit
                          if (newSelections.length < 3) {
                            newSelections.push(intention.id);
                          }
                        }
                        setSelectedIntentions(newSelections);
                      }
                    }}
                  >
                    <View style={styles.intentionOptionContent}>
                      <Text style={styles.intentionEmoji}>{intention.emoji}</Text>
                      <Text style={[
                        styles.intentionText,
                        selectedIntentions.includes(intention.id) && styles.intentionTextSelected
                      ]}>
                        {intention.text}
                      </Text>
                    </View>
                    {selectedIntentions.includes(intention.id) && (
                      <MaterialIcons name="check-circle" size={20} color="#007AFF" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowMeetingModal(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.submitButton,
                isRequestingMeeting && styles.disabledButton
              ]}
              onPress={submitMeetingRequest}
              disabled={isRequestingMeeting}
            >
              <Text style={styles.submitButtonText}>
                {isRequestingMeeting ? 'Sending...' : 'Send Request'}
              </Text>
            </TouchableOpacity>
      </View>
    </View>
      </Modal>

      {/* Cancel Request Confirmation Modal */}
      <Modal
        visible={showCancelModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowCancelModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.cancelModalContent}>
            {/* Close X Button */}
            <TouchableOpacity
              style={styles.cancelModalCloseX}
              onPress={() => setShowCancelModal(false)}
            >
              <MaterialIcons name="close" size={24} color={colors.text.secondary} />
            </TouchableOpacity>

            <View style={styles.cancelModalHeader}>
              <MaterialIcons name="warning" size={28} color={colors.error.main} />
              <Text style={styles.cancelModalTitle}>Cancel Meeting Request</Text>
            </View>
            
            <Text style={styles.cancelModalMessage}>
              Are you sure you want to cancel this meeting request?
            </Text>
            
            <View style={styles.cancelModalWarningBox}>
              <MaterialIcons name="info" size={20} color={colors.error.main} />
              <Text style={styles.cancelModalWarning}>
                Your request quota will NOT be restored after cancellation.
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.cancelModalConfirmButton,
                isCancellingRequest && styles.cancelModalConfirmButtonDisabled
              ]}
              onPress={confirmCancelRequest}
              disabled={isCancellingRequest}
            >
              <MaterialIcons 
                name={isCancellingRequest ? "hourglass-empty" : "cancel"} 
                size={20} 
                color="white" 
              />
              <Text style={styles.cancelModalConfirmText}>
                {isCancellingRequest ? 'Cancelling Request...' : 'Yes, Cancel Request'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background.default,
  },
  loadingText: {
    fontSize: 16,
    color: colors.text.secondary,
  },
  speakerCard: {
    flexDirection: 'row',
    backgroundColor: colors.background.paper,
    margin: 16,
    padding: 20,
    borderRadius: 16,
    shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  avatarContainer: {
    marginRight: 16,
  },
  speakerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  speakerName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 4,
  },
  speakerTitle: {
    fontSize: 16,
    color: colors.text.secondary,
    marginBottom: 2,
  },
  speakerCompany: {
    fontSize: 14,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  section: {
    margin: 16,
    marginTop: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text.primary,
    marginLeft: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
    marginBottom: 16,
  },
  bioText: {
    fontSize: 16,
    color: colors.text.primary,
    lineHeight: 24,
  },
  socialLinks: {
    flexDirection: 'row',
    gap: 12,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.default,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  socialButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
  },
  ticketInfo: {
    backgroundColor: colors.background.default,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.divider,
    marginBottom: 16,
  },
  requestLimitsInfo: {
    backgroundColor: colors.background.default,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.divider,
    marginBottom: 16,
  },
  requestLimitsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  requestLimitsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginLeft: 8,
  },
  requestLimitsContent: {
    gap: 8,
  },
  requestLimitsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  requestLimitsLabel: {
    fontSize: 14,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  requestLimitsValue: {
    fontSize: 14,
    color: colors.text.primary,
    fontWeight: '600',
  },
  requestLimitsWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  requestLimitsWarningText: {
    fontSize: 12,
    color: '#FF9800',
    marginLeft: 8,
    flex: 1,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ticketHeaderInfo: {
    flex: 1,
    marginLeft: 8,
  },
  ticketName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  ticketPrice: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.secondary,
    marginTop: 2,
  },
  ticketDescription: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 8,
  },
  currentTicketNote: {
    fontSize: 12,
    color: colors.text.secondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
  ticketComparisonToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0, 122, 255, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 122, 255, 0.2)',
  },
  ticketComparisonToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  ticketComparisonContent: {
    marginTop: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  comparisonSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 16,
    textAlign: 'center',
    lineHeight: 20,
  },
  ticketComparisonGrid: {
    gap: 16,
  },
  ticketComparisonCard: {
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  activeComparisonTicket: {
    borderColor: '#007AFF',
    backgroundColor: 'rgba(0, 122, 255, 0.05)',
    borderWidth: 2,
  },
  ticketComparisonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  ticketComparisonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  ticketComparisonPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: '#007AFF',
  },
  ticketComparisonDescription: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  ticketComparisonFeatures: {
    gap: 8,
  },
  ticketComparisonFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ticketComparisonFeatureText: {
    fontSize: 14,
    color: colors.text.primary,
    flex: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#007AFF',
  },
  disabledButton: {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    borderColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#007AFF',
  },
  disabledButtonText: {
    color: '#999',
  },
  accessInfo: {
    backgroundColor: colors.background.default,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  accessInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  accessLevels: {
    gap: 8,
  },
  accessLevelItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  accessLevelName: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text.primary,
  },
  accessLevelDesc: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  availabilityWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFEAA7',
  },
  availabilityWarningText: {
    fontSize: 14,
    color: '#856404',
    marginLeft: 8,
    flex: 1,
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.background.paper,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
  },
  closeButton: {
    padding: 4,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text.primary,
    marginBottom: 8,
  },
  inputLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  characterCount: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  textInput: {
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text.primary,
    borderWidth: 1,
    borderColor: colors.divider,
    textAlignVertical: 'top',
  },
  textInputError: {
    borderColor: '#F44336',
    backgroundColor: 'rgba(244, 67, 54, 0.05)',
  },
  inputHint: {
    fontSize: 12,
    color: colors.text.secondary,
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 16,
  },
  intentionChecklist: {
    marginTop: 12,
    gap: 8,
  },
  intentionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: colors.background.paper,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  intentionOptionSelected: {
    borderColor: '#007AFF',
    backgroundColor: 'rgba(0, 122, 255, 0.05)',
  },
  intentionOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  intentionEmoji: {
    fontSize: 16,
    marginRight: 12,
  },
  intentionText: {
    fontSize: 14,
    color: colors.text.primary,
    flex: 1,
  },
  intentionTextSelected: {
    color: '#007AFF',
    fontWeight: '500',
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.background.paper,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: 12,
  },
  submitButton: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  // Request Status Styles
  requestStatusCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  requestStatusHeader: {
    marginBottom: 12,
  },
  requestStatusTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  requestDetails: {
    marginBottom: 12,
  },
  requestDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  requestDetailLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
    flex: 1,
  },
  requestDetailValue: {
    fontSize: 12,
    color: colors.text.primary,
    flex: 2,
    textAlign: 'right',
  },
  requestStatusMessage: {
    padding: 12,
    backgroundColor: colors.background.paper,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  requestStatusText: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 16,
  },
  // Request Priority & Boost Info Styles
  requestPriorityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 16,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.default,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '700',
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  // Action Buttons Styles
  requestActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.error.main,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.error.main,
    shadowColor: colors.error.main,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'white',
    marginLeft: 6,
    letterSpacing: 0.5,
  },
  // Cancel Modal Styles - Enhanced Design
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cancelModalContent: {
    backgroundColor: colors.background.paper,
    borderRadius: 24,
    padding: 0,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 16,
    borderWidth: 1,
    borderColor: colors.divider,
    position: 'relative',
  },
  cancelModalCloseX: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.background.default,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
  },
  cancelModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 32,
    paddingTop: 24,
    paddingBottom: 20,
  },
  cancelModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.primary,
    marginLeft: 16,
    letterSpacing: 0.5,
  },
  cancelModalMessage: {
    fontSize: 17,
    color: colors.text.primary,
    marginBottom: 20,
    lineHeight: 26,
    paddingHorizontal: 32,
    textAlign: 'center',
    fontWeight: '500',
  },
  cancelModalWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${colors.error.main}08`,
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginHorizontal: 32,
    marginBottom: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${colors.error.main}20`,
  },
  cancelModalWarning: {
    fontSize: 15,
    color: colors.error.main,
    fontWeight: '600',
    marginLeft: 12,
    flex: 1,
    lineHeight: 22,
  },
  cancelModalConfirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 32,
    marginHorizontal: 32,
    marginBottom: 32,
    borderRadius: 16,
    backgroundColor: colors.error.main,
    shadowColor: colors.error.main,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  cancelModalConfirmButtonDisabled: {
    backgroundColor: colors.text.secondary,
    shadowOpacity: 0.2,
  },
  cancelModalConfirmText: {
    fontSize: 17,
    fontWeight: '700',
    color: 'white',
    marginLeft: 8,
    letterSpacing: 0.5,
  },
  // Cancelled Requests History Styles
  cancelledRequestsList: {
    gap: 12,
  },
  cancelledRequestCard: {
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  cancelledRequestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cancelledRequestStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cancelledRequestStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.error.main,
    marginLeft: 4,
  },
  cancelledRequestDate: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  cancelledRequestMessage: {
    fontSize: 14,
    color: colors.text.primary,
    marginBottom: 8,
    lineHeight: 18,
  },
  cancelledRequestDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cancelledRequestBoost: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF6B3510',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  cancelledRequestBoostText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FF6B35',
    marginLeft: 4,
  },
  cancelledRequestId: {
    fontSize: 10,
    color: colors.text.secondary,
    fontFamily: 'monospace',
  },
});



