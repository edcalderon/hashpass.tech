import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, Modal } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../../../hooks/useTheme';
import { useEvent } from '../../../../contexts/EventContext';
import { useAuth } from '../../../../hooks/useAuth';
import { MaterialIcons } from '@expo/vector-icons';
import { matchmakingService, CreateMeetingRequestData } from '../../../../lib/matchmaking';
import { useToastHelpers } from '../../../../contexts/ToastContext';
import { useBalance } from '../../../../contexts/BalanceContext';
import { supabase } from '../../../../lib/supabase';
import { passSystemService } from '../../../../lib/pass-system';
import SpeakerAvatar from '../../../../components/SpeakerAvatar';
import PassesDisplay from '../../../../components/PassesDisplay';
import { getSpeakerAvatarUrl, getSpeakerLinkedInUrl, getSpeakerTwitterUrl } from '../../../../lib/string-utils';
import LoadingScreen from '../../../../components/LoadingScreen';
import { CopilotStep, walkthroughable } from 'react-native-copilot';
import { useTranslation } from '../../../../i18n/i18n';

// Helper function to generate user avatar URL
const generateUserAvatarUrl = (name: string): string => {
  const seed = name.toLowerCase().replace(/\s+/g, '-');
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
};

const CopilotView = walkthroughable(View);

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
  user_id?: string;
  isActive?: boolean; // Has user_id = active
  isOnline?: boolean; // User is currently online (last_seen within last 5 minutes)
}

// UserTicket interface removed - now using pass system

export default function SpeakerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isDark, colors } = useTheme();
  const { event } = useEvent();
  const { user, isLoggedIn } = useAuth();
  const { t } = useTranslation('networking');
  const router = useRouter();
  const { showSuccess, showError, showWarning, showInfo } = useToastHelpers();
  const { refreshBalance } = useBalance();
  
  const styles = getStyles(isDark, colors);

  const [speaker, setSpeaker] = useState<Speaker | null>(null);
  const [loading, setLoading] = useState(true);
  // userTicket removed - now using pass system
  const [isRequestingMeeting, setIsRequestingMeeting] = useState(false);
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingRequests, setMeetingRequests] = useState<any[]>([]);
  const [loadingRequestStatus, setLoadingRequestStatus] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCurrentUserSpeaker, setIsCurrentUserSpeaker] = useState(false);
  const [isCancellingRequest, setIsCancellingRequest] = useState(false);
  const [cancelledRequests, setCancelledRequests] = useState<any[]>([]);
  const [loadingCancelledRequests, setLoadingCancelledRequests] = useState(false);
  const [selectedRequestToCancel, setSelectedRequestToCancel] = useState<any>(null);
  const [showRequestDetailModal, setShowRequestDetailModal] = useState(false);
  const [selectedRequestDetail, setSelectedRequestDetail] = useState<any>(null);
  const [passRefreshTrigger, setPassRefreshTrigger] = useState(0);
  const [userPassType, setUserPassType] = useState<'general' | 'business' | 'vip'>('general');
  
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

  const checkIfCurrentUserIsSpeaker = async () => {
    if (!user) {
      setIsCurrentUserSpeaker(false);
      return;
    }

    try {
      // Use helper function to find speaker by UUID or slug
      const { data: speakerData, error } = await supabase
        .rpc('get_speaker_by_id_or_slug', { p_id: id } as any)
        .maybeSingle() as any;
      
      // Check if this speaker's user_id matches current user
      if (!error && speakerData && typeof speakerData === 'object' && 'user_id' in speakerData && speakerData.user_id === user.id) {
        setIsCurrentUserSpeaker(true);
      } else {
        setIsCurrentUserSpeaker(false);
      }
    } catch (error) {
      console.log('Error checking if user is speaker:', error);
      setIsCurrentUserSpeaker(false);
    }
  };

  const loadSpeaker = async () => {
    try {
      // First try to fetch from the database with timeout
      console.log('🔍 Attempting to load speaker from database...');
      
      // Try to get speaker by UUID or slug using helper function
      // Use maybeSingle() to handle cases where speaker is not found (returns null instead of error)
      const dbPromise = supabase
        .rpc('get_speaker_by_id_or_slug', { p_id: id } as any)
        .maybeSingle() as any;

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Database timeout')), 5000)
      );

      try {
        const { data: dbSpeaker, error: dbError } = await Promise.race([dbPromise, timeoutPromise]) as any;

        // Handle case where speaker is not found (maybeSingle returns null)
        if (dbError) {
          console.log('⚠️ Database error:', dbError);
          throw dbError;
        }

        if (dbSpeaker && dbSpeaker.id) {
          // Check if speaker is active (has user_id) using RPC function
          // Pass UUID as TEXT for compatibility
          let isActive = false;
          let isOnline = false;
          
          try {
            const { data: activeData, error: activeError } = await supabase
              .rpc('is_speaker_active', { p_speaker_id: dbSpeaker.id.toString() } as any) as any;
            
            if (!activeError) {
              isActive = activeData === true;
            } else {
              // Fallback: check user_id directly
              isActive = !!dbSpeaker.user_id;
            }
            
            // Check if speaker is online using RPC function
            if (isActive) {
              const { data: onlineData, error: onlineError } = await supabase
                .rpc('is_speaker_online', { p_speaker_id: dbSpeaker.id.toString() } as any) as any;
              
              if (!onlineError) {
                isOnline = onlineData === true;
              }
            }
          } catch (statusCheckError) {
            console.log('⚠️ Could not check speaker status:', statusCheckError);
            // Fallback: check user_id directly
            isActive = !!dbSpeaker.user_id;
          }
          
          // Use real data from database
          // Convert UUID to string for compatibility
          setSpeaker({
            id: dbSpeaker.id.toString(),
            name: dbSpeaker.name,
            title: dbSpeaker.title,
            company: dbSpeaker.company || '',
            bio: dbSpeaker.bio || `Experienced professional in ${dbSpeaker.title}.`,
            image: dbSpeaker.cloudinaryAvatarUrl || dbSpeaker.imageurl || getSpeakerAvatarUrl(dbSpeaker.name),
            linkedin: dbSpeaker.linkedin || getSpeakerLinkedInUrl(dbSpeaker.name),
            twitter: dbSpeaker.twitter || getSpeakerTwitterUrl(dbSpeaker.name),
            tags: dbSpeaker.tags || ['Blockchain', 'FinTech', 'Innovation'],
            availability: dbSpeaker.availability || {
              monday: { start: '09:00', end: '17:00' },
              tuesday: { start: '09:00', end: '17:00' },
              wednesday: { start: '09:00', end: '17:00' },
              thursday: { start: '09:00', end: '17:00' },
              friday: { start: '09:00', end: '17:00' }
            },
            user_id: dbSpeaker.user_id,
            isActive,
            isOnline
          });
          console.log('✅ Loaded speaker from database:', dbSpeaker.name, { isActive, isOnline });
          setLoading(false);
          return;
        }
      } catch (dbError) {
        console.log('⚠️ Database unavailable or timeout, falling back to event config...', dbError instanceof Error ? dbError.message : String(dbError));
      }

      // Fallback to event config (JSON) - always available
      console.log('📋 Loading speaker from event config (JSON fallback)...');
      const foundSpeaker = event?.speakers?.find(s => s.id === id);
      
      if (foundSpeaker) {
        setSpeaker({
          id: foundSpeaker.id,
          name: foundSpeaker.name,
          title: foundSpeaker.title,
          company: foundSpeaker.company,
          bio: `Experienced professional in ${foundSpeaker.title} at ${foundSpeaker.company}.`,
          image: getSpeakerAvatarUrl(foundSpeaker.name),
          linkedin: getSpeakerLinkedInUrl(foundSpeaker.name),
          twitter: getSpeakerTwitterUrl(foundSpeaker.name),
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
      const foundSpeaker = event?.speakers?.find(s => s.id === id);
      if (foundSpeaker) {
        setSpeaker({
          id: foundSpeaker.id,
          name: foundSpeaker.name,
          title: foundSpeaker.title,
          company: foundSpeaker.company,
          bio: `Experienced professional in ${foundSpeaker.title} at ${foundSpeaker.company}.`,
          image: getSpeakerAvatarUrl(foundSpeaker.name),
          linkedin: getSpeakerLinkedInUrl(foundSpeaker.name),
          twitter: getSpeakerTwitterUrl(foundSpeaker.name),
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
    checkIfCurrentUserIsSpeaker();
    
    // User ticket removed - now using pass system
    
    // Load user request limits
    loadRequestLimits();
  }, [id, event?.speakers]);

  useEffect(() => {
    if (user && speaker) {
      loadMeetingRequestStatus();
      loadCancelledRequests();
      loadRequestLimits();
    }
  }, [user, speaker]);

  // Real-time subscription for meeting requests
  useEffect(() => {
    if (!user || !speaker) return;

    console.log('🔄 Setting up real-time subscription for meeting requests...');
    
    const subscription = supabase
      .channel('meeting_requests_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to all changes (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'meeting_requests',
          filter: `requester_id=eq.${user.id}`
        },
        (payload) => {
          console.log('🔄 Real-time update received:', payload);
          
          if (payload.eventType === 'INSERT') {
            // Add new request to UI
            const newRequest = payload.new;
            if (newRequest.speaker_id === speaker.id) {
              setMeetingRequests(prev => [newRequest, ...(Array.isArray(prev) ? prev : [])]);
              console.log('✅ New meeting request added to UI');
            }
          } else if (payload.eventType === 'UPDATE') {
            // Update existing request in UI
            const updatedRequest = payload.new;
            if (updatedRequest.speaker_id === speaker.id) {
              setMeetingRequests(prev => 
                (Array.isArray(prev) ? prev : []).map(req => 
                  req.id === updatedRequest.id ? updatedRequest : req
                )
              );
              console.log('✅ Meeting request updated in UI');
            }
          } else if (payload.eventType === 'DELETE') {
            // Remove deleted request from UI
            const deletedRequest = payload.old;
            if (deletedRequest.speaker_id === speaker.id) {
              setMeetingRequests(prev => 
                (Array.isArray(prev) ? prev : []).filter(req => req.id !== deletedRequest.id)
              );
              console.log('✅ Meeting request removed from UI');
            }
          }
        }
      )
      .subscribe();

    return () => {
      console.log('🔄 Cleaning up real-time subscription...');
      subscription.unsubscribe();
    };
  }, [user, speaker]);

  const loadMeetingRequestStatus = async () => {
    if (!user || !speaker) return;

    setLoadingRequestStatus(true);
    try {
      console.log('🔄 Loading meeting requests for user:', user.id, 'speaker:', speaker.id);
      
      // Use the new function to get all meeting requests for this speaker
      const { data, error } = await supabase
        .rpc('get_meeting_requests_for_speaker', {
          p_user_id: user.id.toString(),
          p_speaker_id: speaker.id
        } as any) as any;

      if (error) {
        console.error('❌ Error loading meeting requests:', error);
        console.error('❌ Error details:', error.details);
        console.error('❌ Error hint:', error.hint);
        
        // Fallback to direct query
        console.log('🔄 Trying fallback query...');
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('meeting_requests')
          .select('*')
          .eq('requester_id', user.id)
          .eq('speaker_id', speaker.id)
          .order('created_at', { ascending: false });

        if (fallbackError) {
          console.error('❌ Fallback query also failed:', fallbackError);
          setMeetingRequests([]);
        } else {
          console.log('✅ Fallback query result:', fallbackData);
          setMeetingRequests(fallbackData || []);
        }
      } else {
        console.log('✅ Meeting requests result:', data);
        // Handle both direct array and wrapped response
        const allRequests = Array.isArray(data) ? data : (data?.requests || []);
        console.log('📊 Number of requests found:', allRequests.length);
        
        // Filter to show only the current user's requests when viewing a speaker profile
        // (not when the user is the speaker themselves)
        const userRequests = allRequests.filter((req: any) => req.requester_id === user.id);
        console.log('📊 Number of user requests:', userRequests.length);
        setMeetingRequests(userRequests);
      }
    } catch (error) {
      console.error('❌ Error in loadMeetingRequestStatus:', error);
      setMeetingRequests([]);
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

  const handleCancelRequest = (request: any) => {
    if (!user || !request) return;
    setSelectedRequestToCancel(request);
    setShowCancelModal(true);
  };

  const handleRequestCardPress = async (request: any) => {
    console.log('🔍 Opening request details:', request);
    
    // If speaker is viewing, fetch requester details
    if (isCurrentUserSpeaker && request.requester_id !== user?.id) {
      try {
        // Note: profiles table doesn't exist, so we use requester_name and generate avatars
        const requesterName = request.requester_name || 'User';
        
        // Enhance request with requester details
        const enhancedRequest = {
          ...request,
          requester_avatar: generateUserAvatarUrl(requesterName),
          requester_full_name: requesterName,
          requester_email: request.requester_name || '',
        };
        
        setSelectedRequestDetail(enhancedRequest);
      } catch (error) {
        console.error('Error fetching requester details:', error);
        setSelectedRequestDetail(request);
      }
    } else {
      setSelectedRequestDetail(request);
    }
    
    setShowRequestDetailModal(true);
  };
  
  const handleAcceptRequest = async (request: any, slotTime?: string) => {
    if (!user || !isCurrentUserSpeaker) return;
    
    // If no slot provided, show slot picker first (similar to my-requests.tsx)
    if (!slotTime) {
      // For now, just accept without slot selection
      // TODO: Add slot picker UI
      showInfo('Info', 'Slot selection will be added soon. Accepting request without slot.');
      return;
    }
    
    try {
      // Get speaker's bsl_speakers.id (TEXT) for the function
      const { data: speakerData } = await supabase
        .from('bsl_speakers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!speakerData) {
        showError('Error', 'You are not a speaker');
        return;
      }

      const { data, error } = await supabase
        .rpc('accept_meeting_request', {
          p_request_id: request.id,
          p_speaker_id: speakerData.id, // Use bsl_speakers.id (TEXT), not user_id
          p_slot_start_time: slotTime,
          p_speaker_response: null
        } as any) as any;

      if (error) {
        console.error('❌ RPC error:', error);
        showError('Accept Failed', error.message || 'Failed to accept meeting request');
        return;
      }

      // Check if RPC returned success: false (this is not a Supabase error, but a business logic error)
      if (data && typeof data === 'object' && 'success' in data && !data.success) {
        const errorMessage = data.error || 'Failed to accept request';
        console.error('❌ Request acceptance failed:', errorMessage);
        showError('Slot Conflict', errorMessage);
        return;
      }

      if (data?.success) {
        showSuccess('Request Accepted', 'The meeting request has been accepted');
        setShowRequestDetailModal(false);
        await loadMeetingRequestStatus();
        
        // Refresh LUKAS balance after reward
        // Wait for database trigger to complete, then refresh multiple times to ensure update
        const refreshBalanceWithRetry = async (attempts = 3, delay = 2000) => {
          for (let i = 0; i < attempts; i++) {
            try {
              await new Promise(resolve => setTimeout(resolve, delay));
              await refreshBalance();
              console.log(`💰 Balance refresh attempt ${i + 1}/${attempts} after meeting acceptance`);
              
              // Also trigger the event directly for immediate UI update
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('balance:refresh'));
              }
            } catch (error) {
              console.error(`Error refreshing LUKAS balance (attempt ${i + 1}):`, error);
            }
          }
        };
        
        // Start refreshing after initial delay
        refreshBalanceWithRetry();
      } else {
        // Fallback for unexpected response format
        console.error('❌ Unexpected response format:', data);
        showError('Accept Failed', 'Unexpected response from server. Please try again.');
      }
    } catch (error: any) {
      console.error('❌ Error accepting request:', error);
      const errorMessage = error?.message || error?.error || 'Failed to accept meeting request';
      showError('Accept Failed', errorMessage);
    }
  };

  const handleDeclineRequest = async (request: any) => {
    if (!user || !isCurrentUserSpeaker) return;
    
    try {
      // Get speaker's bsl_speakers.id (TEXT) for the function
      const { data: speakerData } = await supabase
        .from('bsl_speakers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!speakerData) {
        showError('Error', 'You are not a speaker');
        return;
      }

      const { data, error } = await supabase
        .rpc('decline_meeting_request', {
          p_request_id: request.id,
          p_speaker_id: speakerData.id, // Use bsl_speakers.id (TEXT), not user_id
          p_speaker_response: null
        } as any) as any;

      if (error) throw error;

      if (data?.success) {
        showSuccess('Request Declined', 'The meeting request has been declined');
        setShowRequestDetailModal(false);
        await loadMeetingRequestStatus();
      } else {
        throw new Error(data?.error || 'Failed to decline request');
      }
    } catch (error: any) {
      console.error('❌ Error declining request:', error);
      showError('Decline Failed', error.message || 'Failed to decline meeting request');
    }
  };

  const handleBlockUser = async (request: any) => {
    if (!user || !isCurrentUserSpeaker) return;
    
    try {
      // Get speaker's bsl_speakers.id (TEXT) for the function
      const { data: speakerData } = await supabase
        .from('bsl_speakers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!speakerData) {
        showError('Error', 'You are not a speaker');
        return;
      }

      const { data, error } = await supabase
        .rpc('block_user_and_decline_request', {
          p_request_id: request.id,
          p_speaker_id: speakerData.id, // Use bsl_speakers.id (TEXT), not user_id
          p_user_id: request.requester_id,
          p_reason: 'User has been blocked'
        } as any) as any;

      if (error) throw error;

      if (data?.success) {
        showSuccess('User Blocked', 'The user has been blocked and their request declined');
        setShowRequestDetailModal(false);
        await loadMeetingRequestStatus();
      } else {
        throw new Error(data?.error || 'Failed to block user');
      }
    } catch (error: any) {
      console.error('❌ Error blocking user:', error);
      showError('Block Failed', error.message || 'Failed to block user');
    }
  };

  const confirmCancelRequest = async () => {
    if (!user || !selectedRequestToCancel || isCancellingRequest) return;

    setIsCancellingRequest(true);

    try {
      console.log('🔄 Attempting to cancel request:', selectedRequestToCancel.id);
      console.log('🔄 User ID:', user.id);
      
      // Use the new RPC function to cancel the meeting request
      // Note: Function expects UUID, not string
      const { data: cancelResult, error: cancelError } = await supabase
        .rpc('cancel_meeting_request', {
          p_request_id: selectedRequestToCancel.id,
          p_user_id: user.id
        } as any) as any;

      console.log('🔄 Cancel response - data:', cancelResult);
      console.log('🔄 Cancel response - error:', cancelError);

      if (cancelError) {
        console.error('❌ Cancel function error:', cancelError);
        throw cancelError;
      }

      if (!cancelResult || !cancelResult.success) {
        const errorMessage = cancelResult?.error || 'Failed to cancel meeting request';
        console.error('❌ Cancel failed:', errorMessage);
        throw new Error(errorMessage);
      }

      console.log('✅ Request cancelled successfully:', cancelResult);

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
      
      // Trigger pass display refresh
      setPassRefreshTrigger(prev => prev + 1);
      
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
      
      // Use the new function that counts actual meeting requests
      const { data, error } = await supabase.rpc('get_user_meeting_request_counts', {
        p_user_id: user.id
      } as any) as any;

      if (error) {
        console.error('❌ Error calling get_user_meeting_request_counts:', error);
        throw error;
      }

      console.log('🔄 get_user_meeting_request_counts result:', data);

      if (data) {
        setRequestLimits({
          ticketType: data.pass_type || 'general',
          totalRequests: data.total_requests || 0,
          remainingRequests: data.remaining_requests || 0,
          canSendRequest: (data.remaining_requests || 0) > 0,
          requestLimit: data.max_requests || 0,
          reason: data.remaining_requests > 0 ? 'Request allowed' : 'No remaining requests',
        });
        
        // Update userPassType from the data
        if (data.pass_type) {
          setUserPassType(data.pass_type as 'general' | 'business' | 'vip');
        }
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
    
    if (!speaker) {
      console.log('❌ Missing speaker');
      showError('Missing Information', 'Missing speaker information');
      return;
    }

    // Show the meeting request modal directly - authentication will be checked on submit
    // This allows users to fill out the form (message and intentions) before being prompted to login
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
      let createdRequest;
      try {
        createdRequest = await matchmakingService.createMeetingRequest(requestData);
        console.log('✅ Meeting request created successfully', createdRequest);
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
      
      // Trigger pass display refresh
      setPassRefreshTrigger(prev => prev + 1);

      // Redirect to meeting request details
      if (createdRequest?.id) {
        // Small delay to ensure the success message is visible
        setTimeout(() => {
          router.push({
            pathname: '/events/bsl2025/networking/my-requests' as any,
            params: {
              requestId: createdRequest.id,
              highlightRequest: 'true'
            }
          });
        }, 500);
      }
      
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
    if (!speaker) {
      showError('Missing Information', 'Missing speaker information');
      return;
    }

    // Check for authentication - prompt login if not authenticated
    if (!isLoggedIn || !user) {
      console.log('❌ No active session found, redirecting to login...');
      // Check session directly to be sure
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Close the modal and redirect to auth page with return URL
        setShowMeetingModal(false);
        const currentPath = `/events/bsl2025/speakers/${id}`;
        router.replace(`/(shared)/auth?returnTo=${encodeURIComponent(currentPath)}`);
        return;
      }
      // If we have a session but no user in context, redirect to login to refresh
      if (!user) {
        setShowMeetingModal(false);
        const currentPath = `/events/bsl2025/speakers/${id}`;
        router.replace(`/(shared)/auth?returnTo=${encodeURIComponent(currentPath)}`);
        return;
      }
    }

    // At this point, user must exist
    if (!user) {
      setShowMeetingModal(false);
      const currentPath = `/events/bsl2025/speakers/${id}`;
      router.replace(`/(shared)/auth?returnTo=${encodeURIComponent(currentPath)}`);
      return;
    }

    // Check if user has a pass
    try {
      const passInfo = await passSystemService.getUserPassInfo(user.id);
      if (!passInfo) {
        console.log('❌ User has no pass, redirecting to login...');
        // Close the modal and redirect to auth page
        setShowMeetingModal(false);
        const currentPath = `/events/bsl2025/speakers/${id}`;
        router.replace(`/(shared)/auth?returnTo=${encodeURIComponent(currentPath)}`);
        return;
      }
    } catch (error) {
      console.error('❌ Error checking pass:', error);
      // If error checking pass, close modal and redirect to login
      setShowMeetingModal(false);
      const currentPath = `/events/bsl2025/speakers/${id}`;
      router.replace(`/(shared)/auth?returnTo=${encodeURIComponent(currentPath)}`);
      return;
    }

    setIsRequestingMeeting(true);

    try {
      const meetingData: CreateMeetingRequestData = {
        requester_id: user.id,
        speaker_id: speaker.id,
        speaker_name: speaker.name,
        requester_name: user.email || 'Anonymous',
        requester_company: 'Your Company', // Would come from user profile
        requester_title: 'Your Title', // Would come from user profile
        requester_ticket_type: userPassType, // Use actual pass type from user's pass
        meeting_type: 'networking',
        message: meetingMessage || '', // Allow empty message
        note: getSelectedIntentionsText(),
        boost_amount: 0, // No boost system yet
      };

      const meetingRequest = await matchmakingService.createMeetingRequest(meetingData);
      
      // OPTIMISTIC UPDATE: Add the new request to UI immediately
      if (meetingRequest && meetingRequest.id) {
        const newRequest = {
          id: meetingRequest.id,
          requester_id: user.id,
          speaker_id: speaker.id,
          speaker_name: speaker.name,
          requester_name: user.email || 'Anonymous',
          requester_company: 'Your Company',
          requester_title: 'Your Title',
          requester_ticket_type: 'business',
          meeting_type: 'networking',
          message: meetingMessage || '',
          note: getSelectedIntentionsText(),
          boost_amount: 0,
          duration_minutes: 15,
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };
        
        // Add to the beginning of the array
        setMeetingRequests(prev => [newRequest, ...(Array.isArray(prev) ? prev : [])]);
      }
      
      // Always close modal and reset form on success
      setShowMeetingModal(false);
      setMeetingMessage('');
      setSelectedIntentions([]);
      
      // Refresh request limits and meeting request status after sending (for data consistency)
      await loadRequestLimits();
      await loadMeetingRequestStatus();
      
      // Check if this is a demo response
      if (selectedRequestToCancel && selectedRequestToCancel.id && selectedRequestToCancel.id.startsWith('demo-')) {
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

      // Redirect to meeting request details
      if (meetingRequest?.id) {
        // Small delay to ensure the success message is visible
        setTimeout(() => {
          router.push({
            pathname: '/events/bsl2025/networking/my-requests' as any,
            params: {
              requestId: meetingRequest.id,
              highlightRequest: 'true'
            }
          });
        }, 500);
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
      Alert.alert(t('speakerView.linkedin'), t('speakerView.openingLinkedIn', { speakerName: speaker.name }));
    }
  };

  const handleSpeakerDashboard = () => {
    // Check if current user is this speaker
    if (user && speaker && isCurrentUserSpeaker) {
      router.push('/events/bsl2025/speakers/dashboard');
    } else {
      Alert.alert(
        t('speakerView.speakerDashboard'),
        t('speakerView.speakerDashboardOnly'),
        [{ text: 'OK' }]
      );
    }
  };

  if (loading || !speaker) {
    return (
      <LoadingScreen
        icon="person"
        message={t('speakerView.loadingSpeakerDetails')}
        fullScreen={true}
      />
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
            size={150}
            showBorder={true}
            isOnline={speaker.isOnline}
          />
          {/* Floating status badge near avatar */}
          {speaker.isActive !== undefined && (
            <View style={styles.floatingStatusBadge}>
              <View style={[
                styles.statusIndicator,
                speaker.isActive ? styles.activeIndicator : styles.inactiveIndicator
              ]} />
              <Text style={[
                styles.statusBadgeText,
                speaker.isActive ? styles.activeBadgeText : styles.inactiveBadgeText
              ]}>
                {speaker.isActive ? (speaker.isOnline ? t('speakerView.online') : t('speakerView.active')) : t('speakerView.inactive')}
              </Text>
            </View>
          )}
        </View>
        
        <View style={styles.speakerInfo}>
          <Text style={styles.speakerName}>{speaker.name}</Text>
          {speaker.title && <Text style={styles.speakerTitle}>{speaker.title}</Text>}
          {speaker.company && <Text style={styles.speakerCompany}>{speaker.company}</Text>}
        </View>
      </View>

      {/* Speaker Dashboard Access - Only for the speaker themselves */}
      {user && isCurrentUserSpeaker && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.dashboardButton}
            onPress={handleSpeakerDashboard}
          >
            <View style={styles.dashboardButtonContent}>
              <MaterialIcons name="dashboard" size={24} color="white" />
              <View style={styles.dashboardButtonText}>
              <Text style={styles.dashboardButtonTitle}>{t('speakerView.speakerDashboard')}</Text>
              <Text style={styles.dashboardButtonSubtitle}>{t('speakerView.manageMeetingRequests')}</Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="white" />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* About Section - First */}
      {speaker.bio && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="person" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>{t('speakerView.about')}</Text>
          </View>
          <Text style={styles.bioText}>{speaker.bio}</Text>
        </View>
      )}

        {/* Meeting Requests Status - Show requests sent to this speaker */}
        {meetingRequests.length > 0 && !isCurrentUserSpeaker && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="assignment" size={24} color={colors.primary} />
              <Text style={styles.sectionTitle}>
                {meetingRequests.length > 1 ? t('speakerView.yourMeetingRequestsPlural') : t('speakerView.yourMeetingRequests')} ({meetingRequests.length})
              </Text>
              <TouchableOpacity 
                onPress={loadMeetingRequestStatus}
                disabled={loadingRequestStatus}
                style={styles.refreshButton}
              >
                <MaterialIcons 
                  name="refresh" 
                  size={20} 
                  color={loadingRequestStatus ? colors.text.secondary : colors.primary} 
                />
              </TouchableOpacity>
            </View>
            
            {/* Show scroll hint when there are many requests */}
            {meetingRequests.length > 2 && (
              <View style={styles.scrollHint}>
                <MaterialIcons name="keyboard-arrow-down" size={16} color={colors.text.secondary} />
                <Text style={styles.scrollHintText}>{t('speakerView.scrollToSeeAll')}</Text>
              </View>
            )}
          
          {/* Scrollable container for meeting requests */}
          <ScrollView 
            style={styles.meetingRequestsScrollContainer}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
            contentContainerStyle={styles.scrollContentContainer}
          >
            {meetingRequests.map((request, index) => (
            <TouchableOpacity 
              key={request.id} 
              style={[
                styles.simpleRequestCard,
                {
                  backgroundColor: request.status === 'approved' ? `${colors.primary}10` : 
                                  request.status === 'declined' ? `${colors.error}10` : 
                                  `${colors.warning}10`,
                  borderColor: request.status === 'approved' ? colors.primary : 
                              request.status === 'declined' ? colors.error.main : 
                              '#FF9500'
                }
              ]}
              onPress={() => handleRequestCardPress(request)}
            >
              <View style={styles.simpleRequestHeader}>
                <View style={styles.simpleRequestInfo}>
                  <Text style={[
                    styles.simpleRequestStatus,
                    {
                      color: request.status === 'approved' ? colors.primary : 
                             request.status === 'declined' ? colors.error.main : 
                             '#FF9500'
                    }
                  ]}>
                    {request.status === 'approved' ? t('speakerView.approved') :
                     request.status === 'declined' ? t('speakerView.declined') :
                     t('speakerView.pendingStatus')}
                  </Text>
                  <Text style={styles.simpleRequestDate}>
                    {new Date(request.created_at).toLocaleDateString()}
                  </Text>
                </View>
                
                <View style={styles.simpleRequestActions}>
                  {request.status === 'pending' && request.requester_id === user?.id && (
                    <TouchableOpacity
                      style={styles.simpleCancelButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        handleCancelRequest(request);
                      }}
                    >
                      <MaterialIcons name="close" size={16} color={colors.error.main} />
                    </TouchableOpacity>
                  )}
                  <MaterialIcons name="chevron-right" size={20} color={colors.text.secondary} />
                </View>
              </View>
              
              {request.message && request.requester_id === user?.id && (
                <Text style={styles.simpleRequestMessage} numberOfLines={2}>
                  {request.message}
                </Text>
              )}
              
              {request.note && request.requester_id === user?.id && (
                <View style={styles.simpleRequestIntentions}>
                  <Text style={styles.simpleRequestIntentionsLabel}>{t('requestView.intentions')}:</Text>
                  <Text style={styles.simpleRequestIntentionsText} numberOfLines={1}>
                    {request.note.split('; ').slice(0, 2).join(', ')}
                    {request.note.split('; ').length > 2 && '...'}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Cancelled Requests History */}
      {cancelledRequests.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="history" size={24} color={colors.text.secondary} />
            <Text style={styles.sectionTitle}>{t('speakerView.requestHistory')} ({cancelledRequests.length})</Text>
          </View>
          
          {/* Scrollable container for cancelled requests */}
          <ScrollView 
            style={styles.cancelledRequestsScrollContainer}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
            contentContainerStyle={styles.scrollContentContainer}
          >
            {cancelledRequests.map((request, index) => (
              <View key={request.id} style={styles.cancelledRequestCard}>
                <View style={styles.cancelledRequestHeader}>
                  <View style={styles.cancelledRequestStatus}>
                    <MaterialIcons name="cancel" size={16} color={colors.error.main} />
                    <Text style={styles.cancelledRequestStatusText}>{t('speakerView.cancelled')}</Text>
                  </View>
                  <Text style={styles.cancelledRequestDate}>
                    {new Date(request.created_at).toLocaleDateString()}
                  </Text>
                </View>
                
                {request.message && request.requester_id === user?.id && (
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
          </ScrollView>
        </View>
      )}

      {/* Pass Display */}
      <CopilotStep text="To request a meeting with this speaker, click the 'Request Meeting' button below. You can optionally add a message to increase your chances of approval. Your pass type determines how many requests you can make." order={101} name="networkingRequestMeeting">
        <CopilotView>
          <PassesDisplay
            mode="speaker"
            speakerId={speaker.id}
            showRequestButton={true}
            onRequestPress={handleRequestMeeting}
            refreshTrigger={passRefreshTrigger}
            onPassInfoLoaded={(passInfo) => {
              console.log('Pass info loaded:', passInfo);
              if (passInfo && passInfo.pass_type) {
                setUserPassType(passInfo.pass_type as 'general' | 'business' | 'vip');
              }
            }}
            onRequestLimitsLoaded={(limits) => {
              console.log('Request limits loaded:', limits);
            }}
          />
        </CopilotView>
      </CopilotStep>

      {/* Social Links */}
      {speaker.social && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="link" size={24} color={colors.primary} />
            <Text style={styles.sectionTitle}>{t('speakerView.connect')}</Text>
          </View>
          <View style={styles.socialLinks}>
            {speaker.social.linkedin && (
              <TouchableOpacity style={styles.socialButton} onPress={handleLinkedIn}>
                <MaterialIcons name="link" size={24} color="#0077B5" />
                <Text style={styles.socialButtonText}>{t('speakerView.linkedin')}</Text>
              </TouchableOpacity>
            )}
            {speaker.social.twitter && (
              <TouchableOpacity style={styles.socialButton}>
                <MaterialIcons name="chat" size={24} color="#1DA1F2" />
                <Text style={styles.socialButtonText}>{t('speakerView.twitter')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Matchmaking Section */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialIcons name="people" size={24} color={colors.primary} />
          <Text style={styles.sectionTitle}>{t('speakerView.matchmakingNetworking')}</Text>
        </View>
        <Text style={styles.sectionSubtitle}>
          {t('speakerView.matchmakingDescription')}
        </Text>
        

        {/* Request Limits Display - Always Show */}
        <View style={styles.requestLimitsInfo}>
          <View style={styles.requestLimitsHeader}>
            <MaterialIcons name="schedule" size={20} color="#60A5FA" />
            <Text style={styles.requestLimitsTitle}>{t('speakerView.yourRequestStatus')}</Text>
          </View>
          
          <View style={styles.requestLimitsContent}>
            <View style={styles.requestLimitsRow}>
              <Text style={styles.requestLimitsLabel}>{t('speakerView.ticketType')}</Text>
              <Text style={[styles.requestLimitsValue, { 
                color: requestLimits?.ticketType === 'vip' ? '#FFD700' : 
                       requestLimits?.ticketType === 'business' ? '#60A5FA' : '#999'
              }]}>
                {requestLimits?.ticketType?.toUpperCase() || 'BUSINESS'}
              </Text>
            </View>
            
            <View style={styles.requestLimitsRow}>
              <Text style={styles.requestLimitsLabel}>{t('speakerView.requestsUsed')}</Text>
              <Text style={styles.requestLimitsValue}>
                {requestLimits ? `${requestLimits.totalRequests} / ${requestLimits.requestLimit === 999999 ? '∞' : requestLimits.requestLimit}` : '0 / 1'}
              </Text>
            </View>
            
            <View style={styles.requestLimitsRow}>
              <Text style={styles.requestLimitsLabel}>{t('speakerView.remaining')}</Text>
              <Text style={[styles.requestLimitsValue, { 
                color: (requestLimits?.remainingRequests || 1) > 0 ? '#4CAF50' : '#F44336'
              }]}>
                {requestLimits ? (requestLimits.remainingRequests === 999999 ? '∞' : requestLimits.remainingRequests) : '1'}
              </Text>
            </View>
            
            {requestLimits?.nextRequestAllowedAt && (
              <View style={styles.requestLimitsRow}>
                <Text style={styles.requestLimitsLabel}>{t('speakerView.nextRequest')}</Text>
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
                  ? t('speakerView.requestLimitReached')
                  : t('speakerView.pleaseWaitNextRequest')
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
            <Text style={styles.modalTitle}>{t('meetingRequestModal.title', { speakerName: speaker?.name || '' })}</Text>
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
                <Text style={styles.inputLabel}>{t('meetingRequestModal.messageLabel')}</Text>
                <Text style={styles.inputHint}>{t('meetingRequestModal.messageHint')}</Text>
              </View>
              <TextInput
                style={styles.textInput}
                placeholder={t('meetingRequestModal.messagePlaceholder')}
                placeholderTextColor={colors.text.secondary}
                value={meetingMessage}
                onChangeText={setMeetingMessage}
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>{t('meetingRequestModal.intentionLabel')}</Text>
              <Text style={styles.inputHint}>{t('meetingRequestModal.intentionHint')}</Text>
              
              <View style={styles.intentionChecklist}>
                {[
                  { id: 'coffee', emoji: '☕' },
                  { id: 'pitch', emoji: '💡' },
                  { id: 'consultation', emoji: '🔍' },
                  { id: 'networking', emoji: '🤝' },
                  { id: 'collaboration', emoji: '🚀' },
                  { id: 'advice', emoji: '💭' },
                  { id: 'fun', emoji: '😄' },
                  { id: 'learning', emoji: '📚' },
                  { id: 'none', emoji: '⚪' }
                ].map((intention) => {
                  const text = t(`meetingRequestModal.intentions.${intention.id}`);
                  return (
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
                        {text}
                      </Text>
                    </View>
                    {selectedIntentions.includes(intention.id) && (
                      <MaterialIcons name="check-circle" size={20} color="#007AFF" />
                    )}
                  </TouchableOpacity>
                  );
                })}
              </View>
            </View>

          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowMeetingModal(false)}
            >
              <Text style={styles.cancelButtonText}>{t('meetingRequestModal.cancel')}</Text>
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
                {isRequestingMeeting ? t('meetingRequestModal.sending') : t('meetingRequestModal.sendRequest')}
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
              <MaterialIcons name="warning" size={24} color={colors.error.main} />
              <Text style={styles.cancelModalTitle}>{t('meetingRequestModal.cancelTitle')}</Text>
            </View>
            
            <Text style={styles.cancelModalMessage}>
              {t('meetingRequestModal.cancelMessage')}
            </Text>
            
            <View style={styles.cancelModalWarningBox}>
              <MaterialIcons name="info" size={20} color={colors.error.main} />
              <Text style={styles.cancelModalWarning}>
                {t('meetingRequestModal.cancelWarning')}
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
                {isCancellingRequest ? t('meetingRequestModal.cancelling') : t('meetingRequestModal.confirmCancel')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Request Detail Modal */}
      <Modal
        visible={showRequestDetailModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowRequestDetailModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setShowRequestDetailModal(false)}
            >
              <MaterialIcons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {selectedRequestDetail?.requester_id === user?.id 
                ? t('requestView.yourMeetingDetails')
                : t('requestView.meetingDetails')}
            </Text>
            <View style={styles.modalHeaderSpacer} />
          </View>

          {selectedRequestDetail && (
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {/* Request Status */}
              <View style={[
                styles.detailStatusCard,
                {
                  backgroundColor: selectedRequestDetail.status === 'approved' ? `${colors.primary}10` : 
                                  selectedRequestDetail.status === 'declined' ? `${colors.error}10` : 
                                  `${colors.warning}10`,
                  borderColor: selectedRequestDetail.status === 'approved' ? colors.primary : 
                              selectedRequestDetail.status === 'declined' ? colors.error.main : 
                              '#FF9500'
                }
              ]}>
                <View style={styles.detailStatusHeader}>
                  <MaterialIcons 
                    name={selectedRequestDetail.status === 'approved' ? 'check-circle' : 
                          selectedRequestDetail.status === 'declined' ? 'cancel' : 
                          'schedule'} 
                    size={24} 
                    color={selectedRequestDetail.status === 'approved' ? colors.primary : 
                           selectedRequestDetail.status === 'declined' ? colors.error.main : 
                           '#FF9500'} 
                  />
                  <Text style={[
                    styles.detailStatusTitle,
                    {
                      color: selectedRequestDetail.status === 'approved' ? colors.primary : 
                             selectedRequestDetail.status === 'declined' ? colors.error.main : 
                             '#FF9500'
                    }
                  ]}>
                    {selectedRequestDetail.requester_id === user?.id
                      ? (selectedRequestDetail.status === 'approved' ? t('requestView.yourMeetingRequestApproved') :
                         selectedRequestDetail.status === 'declined' ? t('requestView.yourMeetingRequestDeclined') :
                         t('requestView.yourMeetingRequestPending'))
                      : (selectedRequestDetail.status === 'approved' ? t('requestView.meetingRequestApproved') :
                         selectedRequestDetail.status === 'declined' ? t('requestView.meetingRequestDeclined') :
                         t('requestView.meetingRequestPending'))}
                  </Text>
                </View>
              </View>

              {/* Speaker Information */}
              <View style={styles.detailInfoSection}>
                <Text style={styles.detailSectionTitle}>{t('requestView.speaker')}</Text>
                <View style={styles.speakerDetailCard}>
                  <SpeakerAvatar
                    name={selectedRequestDetail.speaker_name}
                    imageUrl={speaker?.image || getSpeakerAvatarUrl(selectedRequestDetail.speaker_name)}
                    size={60}
                    showBorder={true}
                  />
                  <View style={styles.speakerDetailInfo}>
                    <Text style={styles.speakerDetailName}>{selectedRequestDetail.speaker_name}</Text>
                    {speaker?.title && (
                      <Text style={styles.speakerDetailTitle}>{speaker.title}</Text>
                    )}
                    {speaker?.company && (
                      <Text style={styles.speakerDetailCompany}>{speaker.company}</Text>
                    )}
                  </View>
                </View>
              </View>

              {/* Request Information */}
              <View style={styles.detailInfoSection}>
                <Text style={styles.detailSectionTitle}>{t('requestView.requestInformation')}</Text>
                
                <View style={styles.detailInfoRow}>
                  <Text style={styles.detailInfoLabel}>{t('requestView.requestId')}</Text>
                  <Text style={styles.detailInfoValue}>{selectedRequestDetail.id}</Text>
                </View>
                
                <View style={styles.detailInfoRow}>
                  <Text style={styles.detailInfoLabel}>{t('requestView.meetingType')}</Text>
                  <Text style={styles.detailInfoValue}>{selectedRequestDetail.meeting_type}</Text>
                </View>
                
                <View style={styles.detailInfoRow}>
                  <Text style={styles.detailInfoLabel}>{t('requestView.duration')}</Text>
                  <Text style={styles.detailInfoValue}>{selectedRequestDetail.duration_minutes} {t('requestView.minutesLabel')}</Text>
                </View>
                
                <View style={styles.detailInfoRow}>
                  <Text style={styles.detailInfoLabel}>{t('requestView.sent')}</Text>
                  <Text style={styles.detailInfoValue}>
                    {new Date(selectedRequestDetail.created_at).toLocaleString()}
                  </Text>
                </View>
                
                <View style={styles.detailInfoRow}>
                  <Text style={styles.detailInfoLabel}>{t('requestView.expires')}</Text>
                  <Text style={styles.detailInfoValue}>
                    {new Date(selectedRequestDetail.expires_at).toLocaleString()}
                  </Text>
                </View>
              </View>

              {/* Message - Show for both requester and speaker */}
              {selectedRequestDetail.message && (
                <View style={styles.detailInfoSection}>
                  <Text style={styles.detailSectionTitle}>
                    {selectedRequestDetail.requester_id === user?.id ? t('requestView.yourMessage') : t('requestView.message')}
                  </Text>
                  <Text style={styles.detailMessage}>{selectedRequestDetail.message}</Text>
                </View>
              )}

              {/* Note/Intentions - Show for both requester and speaker */}
              {selectedRequestDetail.note && (
                <View style={styles.detailInfoSection}>
                  <Text style={styles.detailSectionTitle}>{t('requestView.intentions')}</Text>
                  <View style={styles.detailIntentionsContainer}>
                    {selectedRequestDetail.note.split('; ').map((intention: string, index: number) => (
                      <View key={index} style={styles.detailIntentionItem}>
                        <Text style={styles.detailIntentionText}>{intention.trim()}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Status-specific content */}
              {selectedRequestDetail.status === 'pending' && (
                <View style={styles.detailInfoSection}>
                  <Text style={styles.detailSectionTitle}>{t('speakerView.whatsNext')}</Text>
                  <Text style={styles.detailMessage}>
                    {t('speakerView.waitingForResponse', { speakerName: selectedRequestDetail.speaker_name })}
                  </Text>
                </View>
              )}

              {selectedRequestDetail.status === 'approved' && (
                <View style={styles.detailInfoSection}>
                  <Text style={styles.detailSectionTitle}>{t('speakerView.greatNews')}</Text>
                  <Text style={styles.detailMessage}>
                    {t('speakerView.requestApproved', { speakerName: selectedRequestDetail.speaker_name })}
                  </Text>
                </View>
              )}

              {selectedRequestDetail.status === 'declined' && (
                <View style={styles.detailInfoSection}>
                  <Text style={styles.detailSectionTitle}>{t('speakerView.requestDeclinedTitle')}</Text>
                  <Text style={styles.detailMessage}>
                    {t('speakerView.requestDeclinedMessage', { speakerName: selectedRequestDetail.speaker_name })}
                  </Text>
                </View>
              )}

              {/* Action Buttons */}
              {selectedRequestDetail.status === 'pending' && (
                <>
                  {selectedRequestDetail.requester_id === user?.id ? (
                    // Requester view - show cancel button
                    <View style={styles.detailActions}>
                      <TouchableOpacity
                        style={styles.detailCancelButton}
                        onPress={() => {
                          setShowRequestDetailModal(false);
                          handleCancelRequest(selectedRequestDetail);
                        }}
                      >
                        <MaterialIcons name="close" size={20} color="white" />
                        <Text style={styles.detailCancelButtonText}>{t('speakerView.cancelRequest')}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : isCurrentUserSpeaker ? (
                    // Speaker view - show accept/decline/block buttons
                    <View style={styles.detailActions}>
                      <TouchableOpacity
                        style={[styles.detailActionButton, styles.detailAcceptButton]}
                        onPress={() => handleAcceptRequest(selectedRequestDetail)}
                      >
                        <MaterialIcons name="check-circle" size={20} color="white" />
                        <Text style={styles.detailActionButtonText}>{t('requestView.accept')}</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        style={[styles.detailActionButton, styles.detailDeclineButton]}
                        onPress={() => handleDeclineRequest(selectedRequestDetail)}
                      >
                        <MaterialIcons name="cancel" size={20} color="white" />
                        <Text style={styles.detailActionButtonText}>{t('requestView.decline')}</Text>
                      </TouchableOpacity>
                      
                      <TouchableOpacity
                        style={[styles.detailActionButton, styles.detailBlockButton]}
                        onPress={() => handleBlockUser(selectedRequestDetail)}
                      >
                        <MaterialIcons name="block" size={20} color="white" />
                        <Text style={styles.detailActionButtonText}>{t('requestView.blockUser')}</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </>
              )}
            </ScrollView>
          )}
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
    position: 'relative',
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
  floatingStatusBadge: {
    position: 'absolute',
    bottom: -6,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.paper,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.divider,
    shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    gap: 6,
    alignSelf: 'center',
    minWidth: 70,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeIndicator: {
    backgroundColor: '#22c55e',
  },
  inactiveIndicator: {
    backgroundColor: '#9ca3af',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  activeBadgeText: {
    color: '#22c55e',
  },
  inactiveBadgeText: {
    color: '#9ca3af',
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
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text.primary,
    marginLeft: 8,
    flex: 1,
  },
  refreshButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.background.paper,
    borderWidth: 1,
    borderColor: colors.divider,
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
  meetingRequestsScrollContainer: {
    maxHeight: 400, // Maximum height for the scrollable area
    paddingRight: 4, // Add some padding for the scroll indicator
  },
  scrollContentContainer: {
    paddingBottom: 8, // Add some bottom padding for better scrolling experience
  },
  scrollHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    paddingVertical: 4,
    backgroundColor: colors.background.paper,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  scrollHintText: {
    fontSize: 12,
    color: colors.text.secondary,
    marginLeft: 4,
    fontStyle: 'italic',
  },
  // Simple Request Card Styles
  simpleRequestCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 4,
  },
  simpleRequestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  simpleRequestInfo: {
    flex: 1,
  },
  simpleRequestStatus: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  simpleRequestDate: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  simpleRequestActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  simpleCancelButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: `${colors.error.main}10`,
  },
  simpleRequestMessage: {
    fontSize: 14,
    color: colors.text.primary,
    lineHeight: 18,
  },
  simpleRequestIntentions: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  simpleRequestIntentionsLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
    marginBottom: 2,
  },
  simpleRequestIntentionsText: {
    fontSize: 12,
    color: colors.text.primary,
    lineHeight: 16,
  },
  // Detail Modal Styles
  detailStatusCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  detailStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailStatusTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 12,
  },
  detailInfoSection: {
    marginBottom: 24,
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  speakerDetailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.paper,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  speakerDetailInfo: {
    flex: 1,
    marginLeft: 16,
  },
  speakerDetailName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  speakerDetailTitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 2,
  },
  speakerDetailCompany: {
    fontSize: 14,
    color: colors.text.secondary,
  },
  detailInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingVertical: 4,
  },
  detailInfoLabel: {
    fontSize: 14,
    color: colors.text.secondary,
    flex: 1,
  },
  detailInfoValue: {
    fontSize: 14,
    color: colors.text.primary,
    flex: 2,
    textAlign: 'right',
    fontWeight: '500',
  },
  detailMessage: {
    fontSize: 14,
    color: colors.text.primary,
    lineHeight: 20,
    backgroundColor: colors.background.paper,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  detailIntentionsContainer: {
    gap: 8,
  },
  detailIntentionItem: {
    backgroundColor: colors.background.paper,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.divider,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  detailIntentionText: {
    fontSize: 14,
    color: colors.text.primary,
    lineHeight: 18,
  },
  detailActions: {
    marginTop: 20,
    marginBottom: 20,
    gap: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  detailCancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error.main,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
    flex: 1,
  },
  detailCancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  detailActionButton: {
    flex: 1,
    minWidth: '30%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  detailAcceptButton: {
    backgroundColor: colors.success?.main || '#4CAF50',
  },
  detailDeclineButton: {
    backgroundColor: colors.error.main,
  },
  detailBlockButton: {
    backgroundColor: colors.warning?.main || '#FF9800',
  },
  detailActionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  nameRowWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  ticketBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  vipBadge: {
    backgroundColor: colors.warning?.main || '#FF9800',
  },
  ticketBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modalCloseButton: {
    padding: 8,
    borderRadius: 8,
  },
  modalHeaderSpacer: {
    width: 40, // Same width as close button to center the title
  },
  // Speaker Dashboard Button Styles
  dashboardButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
  },
  dashboardButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dashboardButtonText: {
    flex: 1,
    marginLeft: 12,
  },
  dashboardButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  dashboardButtonSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
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
    borderRadius: 20,
    padding: 0,
    width: '100%',
    maxWidth: 420,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
    borderWidth: 1,
    borderColor: colors.divider,
    position: 'relative',
  },
  cancelModalCloseX: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background.default,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
  },
  cancelModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: 24,
    paddingBottom: 16,
    gap: 12,
  },
  cancelModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
    flex: 1,
    letterSpacing: 0.3,
  },
  cancelModalMessage: {
    fontSize: 14,
    color: colors.text.primary,
    marginBottom: 16,
    lineHeight: 20,
    paddingHorizontal: 20,
    textAlign: 'left',
    fontWeight: '500',
  },
  cancelModalWarningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: `${colors.error.main}08`,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${colors.error.main}20`,
    gap: 10,
  },
  cancelModalWarning: {
    fontSize: 13,
    color: colors.error.main,
    fontWeight: '600',
    flex: 1,
    lineHeight: 18,
  },
  cancelModalConfirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    backgroundColor: colors.error.main,
    shadowColor: colors.error.main,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  cancelModalConfirmButtonDisabled: {
    backgroundColor: colors.text.secondary,
    shadowOpacity: 0.2,
  },
  cancelModalConfirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: 'white',
    marginLeft: 8,
    letterSpacing: 0.3,
  },
  // Cancelled Requests History Styles
  cancelledRequestsList: {
    gap: 12,
  },
  cancelledRequestsScrollContainer: {
    maxHeight: 300, // Maximum height for the cancelled requests scrollable area
    paddingRight: 4, // Add some padding for the scroll indicator
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



