import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../../hooks/useTheme';
import { useAuth } from '../../../../hooks/useAuth';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../../../lib/supabase';
import { useToastHelpers } from '../../../../contexts/ToastContext';
import SpeakerAvatar from '../../../../components/SpeakerAvatar';
import LoadingScreen from '../../../../components/LoadingScreen';
import { MeetingRequest } from '@/types/networking';
import * as Haptics from 'expo-haptics';
import { CopilotStep, walkthroughable } from 'react-native-copilot';
import UnifiedSearchAndFilter from '../../../../components/UnifiedSearchAndFilter';
import { useNotifications } from '../../../../contexts/NotificationContext';
import { useRealtimeMeetingRequests, RequestWithDirection } from '../../../../hooks/useRealtimeMeetingRequests';
import { lukasRewardService } from '../../../../lib/lukas-reward-service';
import { useBalance } from '../../../../contexts/BalanceContext';
import { useTranslation } from '../../../../i18n/i18n';

// Extended type for internal use with direction tracking - now imported from hook
type MeetingRequestWithDirection = RequestWithDirection & {
  requester_id?: string;
};

const CopilotView = walkthroughable(View);
const CopilotTouchableOpacity = walkthroughable(TouchableOpacity);

// Helper function to generate user avatar URL
const generateUserAvatarUrl = (name: string): string => {
  const seed = name.toLowerCase().replace(/\s+/g, '-');
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
};

export default function MyRequestsView() {
  const { isDark, colors } = useTheme();
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { showSuccess, showError } = useToastHelpers();
  const { notifications, refreshNotifications } = useNotifications();
  const { refreshBalance } = useBalance();
  const { t } = useTranslation('networking');
  const { t: tCommon } = useTranslation('common');
  const styles = getStyles(isDark, colors);

  const [requests, setRequests] = useState<MeetingRequestWithDirection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<MeetingRequest | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'sent' | 'incoming'>('sent');
  const [filteredRequests, setFilteredRequests] = useState<MeetingRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSlotPicker, setShowSlotPicker] = useState(false);
  const [showSlotConfirmation, setShowSlotConfirmation] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [confirmedMeetingId, setConfirmedMeetingId] = useState<string | null>(null);
  // Track current slot loading context to reload after acceptance
  const [currentSlotContext, setCurrentSlotContext] = useState<{
    speakerId: string;
    durationMinutes: number;
    requesterId?: string;
  } | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [holdTime, setHoldTime] = useState(1); // Hours
  const [expirationCountdown, setExpirationCountdown] = useState<{ hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    console.log('🔄 useEffect triggered, user:', user ? 'present' : 'null');
    if (user) {
      console.log('🔄 User found, calling loadMyRequests...');
      loadMyRequests();
    } else {
      console.log('⚠️ No user found, setting loading to false');
      setLoading(false);
    }
    
    const timeout = setTimeout(() => {
      if (loading && requests.length === 0) {
        console.warn('⚠️ My requests loading timeout (requests still empty), setting loading to false');
        setLoading(false);
      }
    }, 10000);

    return () => clearTimeout(timeout);
  }, [user]);

  // Auto-open detail modal when requestId is provided in params
  useEffect(() => {
    if (params.requestId && !loading && requests.length > 0) {
      const requestId = params.requestId as string;
      const request = requests.find(r => r.id === requestId);
      
      if (request) {
        // Set the correct tab based on request direction
        if (request._direction === 'incoming') {
          setActiveTab('incoming');
        } else {
          setActiveTab('sent');
        }
        
        // Open the detail modal
        setSelectedRequest(request as MeetingRequest);
        setShowDetailModal(true);
        
        // Clear the params to prevent reopening on re-render
        // Note: We can't directly modify params, but this will only run once
      }
    }
  }, [params.requestId, loading, requests]);

  // Real-time subscription handler callbacks
  const handleRequestInserted = useCallback((newRequest: MeetingRequestWithDirection) => {
    console.log('📥 New request inserted:', newRequest.id, 'direction:', newRequest._direction);
    
    setRequests(prev => {
      const exists = prev.some(r => r.id === newRequest.id);
      if (exists) {
        console.log('⚠️ Request already exists, skipping:', newRequest.id);
        return prev;
      }
      
      console.log('✅ Adding new request to state:', newRequest.id, 'direction:', newRequest._direction);
      
      // Show notification for incoming requests
      if (newRequest._direction === 'incoming') {
        try {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch (e) {
          console.log('Error with haptic feedback:', e);
        }
        
        // Show toast notification
        const requesterName = newRequest.requester_full_name || newRequest.requester_name || 'Someone';
        showSuccess(
          'New Meeting Request!',
          `${requesterName} wants to meet with you`
        );
        
        // Refresh notifications
        refreshNotifications();
      }
      
      // Add to state (prepend so newest appears first)
      return [newRequest, ...prev];
    });
  }, [showSuccess, refreshNotifications]);

  const handleRequestUpdated = useCallback((updatedRequest: MeetingRequestWithDirection, oldStatus?: string) => {
    console.log('🔄 Request updated:', updatedRequest.id, 'from', oldStatus, 'to', updatedRequest.status);
    
    setRequests(prev => {
      const requestIndex = prev.findIndex(req => req.id === updatedRequest.id);
      
      if (requestIndex >= 0) {
        // Request exists, update it
        const existingRequest = prev[requestIndex];
        console.log('✅ Updating existing request in state:', updatedRequest.id, 'status:', existingRequest.status, '->', updatedRequest.status);
        
        const updated = [...prev];
        updated[requestIndex] = {
          ...updatedRequest,
          // Preserve direction and enrichment data
          _direction: existingRequest._direction || updatedRequest._direction,
          speaker_image: updatedRequest.speaker_image !== undefined ? updatedRequest.speaker_image : existingRequest.speaker_image,
          requester_avatar: updatedRequest.requester_avatar || existingRequest.requester_avatar,
          requester_full_name: updatedRequest.requester_full_name || existingRequest.requester_full_name,
          requester_email: updatedRequest.requester_email || existingRequest.requester_email,
        };
        
        return updated;
      } else {
        // Request not found, add it (might be a new request or state was cleared)
        console.warn('⚠️ Request not found in state, adding it:', updatedRequest.id);
        return [updatedRequest, ...prev];
      }
    });

    // Show success message if status changed to accepted
    if (oldStatus && oldStatus !== updatedRequest.status && updatedRequest.status === 'accepted') {
      showSuccess('Request Accepted!', 'Your meeting request has been accepted');
    }

    // Refresh notifications when status changes
    if (oldStatus && oldStatus !== updatedRequest.status) {
      refreshNotifications();
    }
  }, [showSuccess, refreshNotifications]);

  const handleRequestDeleted = useCallback((requestId: string) => {
    console.log('🗑️ Request deleted:', requestId);
    setRequests(prev => prev.filter(req => req.id !== requestId));
  }, []);

  const handleRealtimeError = useCallback((error: Error) => {
    console.error('❌ Real-time subscription error:', error);
    showError('Connection Error', 'Failed to receive real-time updates. Please refresh the page.');
  }, [showError]);

  // Setup real-time subscriptions using the dedicated hook
  useRealtimeMeetingRequests({
    userId: user?.id || '',
    onRequestInserted: handleRequestInserted,
    onRequestUpdated: handleRequestUpdated,
    onRequestDeleted: handleRequestDeleted,
    onError: handleRealtimeError,
  });

  // OLD SUBSCRIPTION CODE REMOVED - Now using useRealtimeMeetingRequests hook above

  const loadMyRequests = useCallback(async () => {
    if (!user) {
      console.log('No user found, skipping requests load');
      setLoading(false);
      return;
    }

    try {
      console.log('🔄 Starting loadMyRequests...');
      setLoading(true);

      // Fetch SENT requests
      const { data: sentData, error: sentError } = await supabase
        .from('meeting_requests')
        .select('*')
        .eq('requester_id', user.id)
        .order('created_at', { ascending: false });

      if (sentError) {
        console.error('Error loading sent requests:', sentError);
      }

      // Fetch INCOMING requests (if user is a speaker)
      // Note: meeting_requests.speaker_id is UUID (user_id from bsl_speakers), not bsl_speakers.id
      // So we use user.id directly
      let incomingData: any[] = [];
      try {
        // Check if user is a speaker
        const { data: speakerRows, error: speakerErr } = await supabase
          .from('bsl_speakers')
          .select('id, user_id')
          .eq('user_id', user.id);
        
        if (!speakerErr && speakerRows && speakerRows.length > 0) {
          // meeting_requests.speaker_id stores the user_id (UUID), not bsl_speakers.id
          const { data: inc, error: incErr } = await supabase
            .from('meeting_requests')
            .select('*')
            .eq('speaker_id', user.id) // Use user.id directly since speaker_id is UUID (user_id)
            .order('created_at', { ascending: false });
          
          incomingData = inc || [];
          
          // Fetch requester info for incoming requests
          if (incomingData.length > 0) {
            // Note: profiles table doesn't exist, so we use requester_name and generate avatars
            incomingData = incomingData.map(request => {
              const requesterName = request.requester_name || 'User';
              return {
                ...request,
                requester_avatar: generateUserAvatarUrl(requesterName),
                requester_full_name: requesterName,
                requester_email: request.requester_name || '',
              };
            });
          }
        }
      } catch (e) {
        console.warn('Failed to load incoming requests:', e);
      }

      // Fetch speaker images for sent requests
      // Note: request.speaker_id is UUID (user_id), so we need to find bsl_speakers by user_id
      let sentWithImages = sentData || [];
      if (sentWithImages.length > 0) {
        sentWithImages = await Promise.all(
          sentWithImages.map(async (request) => {
            try {
              const { data: speakerData } = await supabase
                .from('bsl_speakers')
                .select('imageurl')
                .eq('user_id', request.speaker_id)
                .single();

              return {
                ...request,
                speaker_image: speakerData?.imageurl || null
              };
            } catch (error) {
              return request;
            }
          })
        );
      }

      // Merge and annotate direction
      const merged = [
        ...(sentWithImages || []).map((r: any) => ({ ...r, _direction: 'sent' })),
        ...(incomingData || []).map((r: any) => ({ ...r, _direction: 'incoming' })),
      ];

      setRequests(merged as any);
    } catch (error) {
      console.error('❌ Error loading my requests:', error);
      showError('Error Loading Requests', 'Failed to load your meeting requests');
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [user, showError]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      console.log('🔄 Manual refresh triggered');
      await loadMyRequests();
      // Refresh notifications after reloading requests
      refreshNotifications();
      console.log('✅ Manual refresh completed');
    } catch (error) {
      console.error('❌ Error refreshing requests:', error);
      showError('Refresh Error', 'Failed to refresh requests. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  // Manual reload handler (for header button) - Force refresh with haptic feedback
  const handleManualReload = useCallback(async () => {
    try {
      console.log('🔄 Manual reload triggered');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setRefreshing(true);
      
      // Force reload by clearing state first, then loading fresh data
      setRequests([]);
      
      await loadMyRequests();
      refreshNotifications();
      
      // Additional haptic feedback on success
      setTimeout(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }, 300);
      
      console.log('✅ Manual reload completed');
    } catch (error) {
      console.error('❌ Error in manual reload:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showError('Refresh Error', 'Failed to refresh requests. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, [loadMyRequests, refreshNotifications, showError]);

  const handleRequestPress = (request: MeetingRequest) => {
    setSelectedRequest(request);
    setShowDetailModal(true);
  };

  const handleCancelRequest = async (request: MeetingRequest) => {
    // Show confirmation modal first
    setShowCancelConfirm(true);
  };

  const confirmCancelRequest = async () => {
    if (!selectedRequest || !user) return;
    
    try {
      setShowCancelConfirm(false);
      
      const { data, error } = await supabase
        .rpc('cancel_meeting_request', {
          p_request_id: selectedRequest.id,
          p_user_id: user.id
        });

      if (error) {
        console.error('❌ Cancel request error:', error);
        throw error;
      }

      if (data?.success) {
        showSuccess(t('requestView.requestCancelled'), t('requestView.requestCancelledMessage'));
        
        // Force reload to ensure UI is updated
        setTimeout(async () => {
          await loadMyRequests();
        }, 500);
        
        setShowDetailModal(false);
        setSelectedRequest(null);
      } else {
        throw new Error(data?.error || data?.message || 'Failed to cancel request');
      }
    } catch (error: any) {
      console.error('❌ Error cancelling request:', error);
      showError('Cancellation Failed', error?.message || 'Failed to cancel meeting request. Please try again.');
    }
  };

  // Helper function to remove duplicates and sort slots prioritizing "interested" status
  const sortSlotsByPriority = (slots: any[]) => {
    // Remove duplicates based on slot_time, keeping the one with highest priority (interested > available > tentative)
    const uniqueSlots = new Map<string, any>();
    
    slots.forEach(slot => {
      const slotTime = slot.slot_time;
      const existingSlot = uniqueSlots.get(slotTime);
      
      if (!existingSlot) {
        uniqueSlots.set(slotTime, slot);
      } else {
        // If duplicate, keep the one with higher priority
        const priority = {
          'interested': 1,
          'available': 2,
          'tentative': 3
        };
        const existingPriority = priority[existingSlot.slot_status || 'available'] || 4;
        const newPriority = priority[slot.slot_status || 'available'] || 4;
        
        if (newPriority < existingPriority) {
          uniqueSlots.set(slotTime, slot);
        }
      }
    });
    
    // Sort the unique slots
    return Array.from(uniqueSlots.values()).sort((a, b) => {
      const aStatus = a.slot_status || 'available';
      const bStatus = b.slot_status || 'available';
      
      // Priority: interested > available > tentative
      const priority = {
        'interested': 1,
        'available': 2,
        'tentative': 3
      };
      
      const aPriority = priority[aStatus] || 4;
      const bPriority = priority[bStatus] || 4;
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      
      // If same priority, sort by time
      return new Date(a.slot_time).getTime() - new Date(b.slot_time).getTime();
    });
  };

  const loadAvailableSlots = async (
    speakerId: string, 
    durationMinutes: number = 15, 
    requesterId?: string,
    showPicker: boolean = true
  ) => {
    try {
      setLoadingSlots(true);
      
      // Ensure speakerId is a string (UUID as TEXT for the function)
      const speakerIdString = String(speakerId).trim();
      if (!speakerIdString || speakerIdString === 'undefined' || speakerIdString === 'null') {
        console.error('❌ Invalid speaker ID:', speakerId);
        throw new Error('Invalid speaker ID provided');
      }
      
      // Store context for potential reload after acceptance (only if showing picker)
      if (showPicker) {
        setCurrentSlotContext({ speakerId: speakerIdString, durationMinutes, requesterId });
      }
      
      // Call without requester_id for now (migration not applied yet)
      // Once migration is applied, this will automatically work with requester conflict checking
      // TODO: After migration is applied, we can add requester_id parameter
      const rpcParams: any = {
        p_speaker_id: speakerIdString,
        p_date: null,
        p_duration_minutes: durationMinutes,
      };
      
      // Note: requesterId parameter is accepted but not used until migration is applied
      // This prevents errors while migration is pending
      if (requesterId) {
        console.log('⚠️ Requester conflict checking will be enabled after migration is applied');
        // Try to include requester_id if migration is applied
        try {
          rpcParams.p_requester_id = requesterId;
        } catch (e) {
          // Fallback: if migration not applied, continue without requester_id
          console.log('⚠️ Migration not applied, skipping requester_id parameter');
        }
      }
      
      console.log('🔍 Loading available slots with params:', {
        speakerId,
        durationMinutes,
        requesterId,
        rpcParams
      });

      const { data, error } = await supabase
        .rpc('get_speaker_available_slots', rpcParams);

      if (error) {
        console.error('❌ RPC error loading slots:', error);
        // If error is about missing parameter, try without requester_id
        if (error.code === 'PGRST202' && requesterId) {
          console.log('⚠️ Migration not applied, retrying without requester_id');
          const { data: retryData, error: retryError } = await supabase
            .rpc('get_speaker_available_slots', {
              p_speaker_id: speakerId,
              p_date: null,
              p_duration_minutes: durationMinutes,
            });
          
          if (retryError) {
            console.error('❌ Retry RPC error:', retryError);
            throw retryError;
          }
          
          console.log('✅ Retry successful, received slots:', retryData?.length || 0);
          setAvailableSlots(sortSlotsByPriority(retryData || []));
          if (showPicker) {
            setShowSlotPicker(true);
          }
          
          if (showPicker && (!retryData || retryData.length === 0)) {
            console.warn('⚠️ No slots returned after retry');
            showError('No Available Slots', 'No available slots found. Please mark some time slots as available in your schedule.');
          }
          return;
        }
        throw error;
      }

      console.log('✅ RPC successful, received slots:', data?.length || 0, 'slots');
      if (data && data.length > 0) {
        console.log('📅 First few slots:', data.slice(0, 3).map(s => ({
          slot_time: s.slot_time,
          date: s.date,
          start_time: s.start_time,
          is_available: s.is_available
        })));
      } else {
        console.warn('⚠️ Empty slots array returned from RPC');
        
        // If requester_id was included and we got empty results, try without it
        // This handles the case where requester conflicts filter out all slots
        if (requesterId && rpcParams.p_requester_id) {
          console.log('🔄 Empty results with requester_id, retrying without requester conflict check...');
          const { data: retryData, error: retryError } = await supabase
            .rpc('get_speaker_available_slots', {
              p_speaker_id: speakerIdString,
              p_date: null,
              p_duration_minutes: durationMinutes,
            });
          
          if (!retryError && retryData && retryData.length > 0) {
            console.log('✅ Found', retryData.length, 'slots without requester conflict check');
            setAvailableSlots(sortSlotsByPriority(retryData));
            if (showPicker) {
              setShowSlotPicker(true);
            }
            return; // Success, exit early
          } else if (retryError) {
            console.error('❌ Retry error:', retryError);
          }
        }
        
        // Check if speaker exists and has agenda status
        const { data: speakerCheck } = await supabase
          .from('bsl_speakers')
          .select('id, user_id')
          .eq('id', speakerIdString)
          .single();
        
        if (speakerCheck) {
          console.log('👤 Speaker found with ID:', speakerCheck.id, 'user_id:', speakerCheck.user_id);
          // Check if speaker has any agenda status entries
          const { data: agendaCheck } = await supabase
            .from('user_agenda_status')
            .select('slot_status, slot_time')
            .eq('user_id', speakerCheck.user_id)
            .limit(10);
          
          console.log('📋 Speaker agenda status entries:', agendaCheck?.length || 0);
          if (agendaCheck && agendaCheck.length > 0) {
            console.log('📋 Sample agenda entries:', agendaCheck.map(a => ({
              slot_time: a.slot_time,
              slot_status: a.slot_status,
              is_future: new Date(a.slot_time) > new Date()
            })));
            
            // Check specifically for available/interested slots
            const availableSlots = agendaCheck.filter(a => 
              ['available', 'interested'].includes(a.slot_status) && 
              new Date(a.slot_time) > new Date()
            );
            console.log('✅ Available/interested future slots:', availableSlots.length);
            
            if (availableSlots.length > 0 && (!data || data.length === 0)) {
              console.warn('⚠️ Speaker has available slots but RPC returned empty. Possible requester conflict filtering.');
            }
          } else {
            console.warn('⚠️ Speaker has no agenda status entries');
          }
        } else {
          console.error('❌ Speaker not found with ID:', speakerIdString);
        }
      }

      // Sort slots to prioritize "interested" status
      setAvailableSlots(sortSlotsByPriority(data || []));
      if (showPicker) {
        setShowSlotPicker(true);
      }
      
      // Show warning if no slots available (only if showing picker)
      if (showPicker && (!data || data.length === 0)) {
        showError('No Available Slots', 'No available slots found. Please mark some time slots as available in your schedule.');
      }
    } catch (error: any) {
      console.error('❌ Error loading slots:', error);
      if (showPicker) {
        showError('Error', 'Failed to load available slots');
      }
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleAcceptRequest = async (request: MeetingRequest, slotTime?: string) => {
    if (!user) return;
    
    try {
      // Get speaker_id for current user (bsl_speakers.id expected by RPCs and slots RPC)
      const { data: speakerData } = await supabase
        .from('bsl_speakers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!speakerData) {
        showError('Error', 'You are not a speaker');
        return;
      }

      // Ensure speaker ID is converted to string (UUID as TEXT)
      const speakerIdString = String(speakerData.id);
      console.log('🎤 Speaker ID for slot loading:', speakerIdString, 'type:', typeof speakerIdString);

      // If no slot provided, show slot picker first using bsl_speakers.id (TEXT)
      // Pass requester_id to check for conflicts with requester's existing meetings
      if (!slotTime) {
        await loadAvailableSlots(
          speakerIdString, 
          request.duration_minutes || 15,
          request.requester_id || undefined
        );
        return;
      }
      
      const { data, error } = await supabase
        .rpc('accept_meeting_request', {
          p_request_id: request.id,
          p_speaker_id: speakerData.id, // Use bsl_speakers.id (TEXT), not user_id
          p_slot_start_time: slotTime,
          p_speaker_response: null
        });

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
        // Close slot picker if open
        setShowSlotPicker(false);
        return;
      }

      if (data?.success) {
        // Show confirmation modal with meeting details
        setConfirmedMeetingId(data.meeting_id);
        setShowSlotPicker(false);
        setShowSlotConfirmation(true);
        
        // Refresh LUKAS balance after reward (for both speaker and requester)
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
        
        // Reload available slots to reflect the newly accepted meeting
        // This ensures slots are up-to-date if user opens slot picker again
        if (currentSlotContext) {
          console.log('🔄 Reloading available slots after acceptance...');
          setTimeout(async () => {
            // Reload slots in background without showing picker
            await loadAvailableSlots(
              currentSlotContext.speakerId,
              currentSlotContext.durationMinutes,
              currentSlotContext.requesterId,
              false // Don't show picker
            );
          }, 500);
        }
        
        // Force reload to ensure UI is updated
        setTimeout(async () => {
          await loadMyRequests();
        }, 500);
        
        showSuccess('Request Accepted! 🎉', 'The meeting has been scheduled successfully. You earned 1 LUKAS! 💎');
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

  const handleDeclineRequest = async (request: MeetingRequest) => {
    if (!user) return;
    
    try {
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
          p_speaker_id: request.speaker_id,
          p_speaker_response: null
        });

      if (error) throw error;

      if (data?.success) {
        showSuccess('Request Declined', 'The meeting request has been declined');
        
        // Force reload to ensure UI is updated
        setTimeout(async () => {
          await loadMyRequests();
        }, 500);
        
        setShowDetailModal(false);
      } else {
        throw new Error(data?.error || 'Failed to decline request');
      }
    } catch (error: any) {
      console.error('❌ Error declining request:', error);
      showError('Decline Failed', error.message || 'Failed to decline meeting request');
    }
  };

  const handleBlockUser = async (request: MeetingRequest) => {
    if (!user) return;
    
    try {
      const { data: speakerData } = await supabase
        .from('bsl_speakers')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!speakerData) {
        showError('Error', 'You are not a speaker');
        return;
      }

      const requestWithId = request as MeetingRequestWithDirection;
      const { data, error } = await supabase
        .rpc('block_user_and_decline_request', {
          p_request_id: request.id,
          p_speaker_id: request.speaker_id,
          p_user_id: requestWithId.requester_id || (request as any).requester_id,
          p_reason: 'User has been blocked'
        });

      if (error) throw error;

      if (data?.success) {
        showSuccess('User Blocked', 'The user has been blocked and their request declined');
        
        // Force reload to ensure UI is updated
        setTimeout(async () => {
          await loadMyRequests();
        }, 500);
        
        setShowDetailModal(false);
      } else {
        throw new Error(data?.error || 'Failed to block user');
      }
    } catch (error: any) {
      console.error('❌ Error blocking user:', error);
      showError('Block Failed', error.message || 'Failed to block user');
    }
  };

  // Countdown timer effect for expiration
  useEffect(() => {
    if (!selectedRequest?.expires_at) {
      setExpirationCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const expires = new Date(selectedRequest.expires_at!);
      const diffMs = expires.getTime() - now.getTime();
      
      if (diffMs <= 0) {
        setExpirationCountdown({ hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      
      // Cap hours at 6 (maximum boost time) to prevent display issues
      // If it's more than 6 hours, something is wrong with the data
      const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
      const hours = Math.min(totalHours, 6); // Cap at 6 hours max
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
      
      setExpirationCountdown({ hours, minutes, seconds });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [selectedRequest?.expires_at, showDetailModal]);

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffMs = expires.getTime() - now.getTime();
    
    if (diffMs <= 0) return 'Expired';
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    }
    return `${minutes}m remaining`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
      case 'requested': return '#FF9800';
      case 'accepted': return '#4CAF50';
      case 'rejected':
      case 'declined': return '#F44336';
      case 'cancelled': return '#9E9E9E';
      case 'expired': return '#9E9E9E';
      default: return '#9E9E9E';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
      case 'requested': return 'schedule';
      case 'accepted': return 'check-circle';
      case 'rejected':
      case 'declined': return 'cancel';
      case 'cancelled': return 'block';
      case 'expired': return 'schedule';
      default: return 'help';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Filter requests by active tab
  const tabFilteredRequests = useMemo(() => {
    return requests.filter((r: any) => r._direction === activeTab);
  }, [requests, activeTab]);

  // Custom filter logic for UnifiedSearchAndFilter
  const customFilterLogic = (data: MeetingRequestWithDirection[], filters: { [key: string]: any }, query: string) => {
    let filtered = [...data];

    // Apply status filter
    if (filters.status && filters.status !== 'all') {
      filtered = filtered.filter(request => {
        if (filters.status === 'requested') {
          return request.status === 'pending' || request.status === 'requested';
        } else if (filters.status === 'rejected') {
          return request.status === 'rejected' || request.status === 'declined';
        }
        return request.status === filters.status;
      });
    }

    // Apply search query
    if (query.trim()) {
      const lowercaseQuery = query.toLowerCase();
      filtered = filtered.filter(request => {
        const searchableText = [
          request.speaker_name,
          request.requester_name,
          request.message,
          request.note,
          request.requester_company,
        ].join(' ').toLowerCase();
        return searchableText.includes(lowercaseQuery);
      });
    }

    // Sort by date (newest first)
    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return filtered;
  };

  const filterGroups = [
    {
      key: 'status',
      label: 'Status',
      type: 'chips' as const,
      options: [
        { key: 'all', label: 'All' },
        { key: 'requested', label: 'Requested' },
        { key: 'accepted', label: 'Accepted' },
        { key: 'rejected', label: 'Rejected' },
        { key: 'cancelled', label: 'Cancelled' },
      ],
    },
  ];

  const renderRequestCard = (request: MeetingRequest) => {
    const direction = (request as any)._direction || 'sent';
    const isIncoming = direction === 'incoming';
    const isAccepted = request.status === 'accepted';
    
    // For incoming requests, show requester info; for sent, show speaker info
    const displayName = isIncoming 
      ? ((request as any).requester_full_name || request.requester_name)
      : request.speaker_name;
    const displayAvatar = isIncoming
      ? ((request as any).requester_avatar)
      : (request.speaker_image || null);
    const displaySubtitle = isIncoming
      ? ((request as any).requester_email || request.requester_company || '')
      : (request.requester_company || '');
    
    return (
      <TouchableOpacity
        key={request.id}
        style={[
          styles.requestCard,
          isAccepted && styles.requestCardAccepted
        ]}
        onPress={() => handleRequestPress(request)}
        activeOpacity={0.7}
      >
        {isAccepted && (
          <View style={styles.acceptedGradientOverlay} />
        )}
        <View style={styles.cardHeader}>
          <View style={styles.avatarContainer}>
            <SpeakerAvatar
              name={displayName}
              imageUrl={displayAvatar}
              size={56}
              showBorder={true}
            />
            {isIncoming && (
              <View style={styles.incomingBadge}>
                <MaterialIcons name="inbox" size={12} color="white" />
              </View>
            )}
            {isAccepted && (
              <View style={styles.acceptedCheckBadge}>
                <MaterialIcons name="check-circle" size={20} color="white" />
              </View>
            )}
          </View>
          
          <View style={styles.cardHeaderContent}>
            <View style={styles.nameRow}>
              <Text style={[
                styles.displayName,
                isAccepted && styles.displayNameAccepted
              ]} numberOfLines={1}>
                {displayName}
              </Text>
              <View style={[
                styles.statusBadge, 
                { backgroundColor: getStatusColor(request.status) },
                isAccepted && styles.statusBadgeAccepted
              ]}>
                <MaterialIcons name={getStatusIcon(request.status) as any} size={14} color="white" />
                <Text style={styles.statusText}>
                  {request.status === 'pending' ? 'PENDING' : request.status.toUpperCase()}
                </Text>
              </View>
            </View>
            
            {displaySubtitle && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {displaySubtitle}
              </Text>
            )}
            
            <View style={styles.dateRow}>
              <Text style={styles.dateText}>
                {formatDate(request.created_at)}
              </Text>
              {request.expires_at && (
                <View style={[
                  styles.expirationBadge,
                  new Date(request.expires_at) < new Date() && styles.expirationBadgeExpired
                ]}>
                  <MaterialIcons 
                    name="schedule" 
                    size={12} 
                    color={new Date(request.expires_at) < new Date() ? '#F44336' : '#FF9800'} 
                  />
                  <Text style={[
                    styles.expirationText,
                    new Date(request.expires_at) < new Date() && styles.expirationTextExpired
                  ]}>
                    {getTimeRemaining(request.expires_at)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {(request.message || request.note) && (
          <View style={styles.cardContent}>
            {request.message && (
              <Text style={styles.messageText} numberOfLines={2}>
                {request.message}
              </Text>
            )}
            {request.note && (
              <View style={styles.noteContainer}>
                <Text style={styles.noteLabel}>Intentions:</Text>
                <Text style={styles.noteText} numberOfLines={2}>
                  {request.note}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.cardFooter}>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <MaterialIcons 
                name="schedule" 
                size={16} 
                color={isDark ? '#B0B0B0' : '#666666'} 
              />
              <Text style={styles.metaText}>{request.duration_minutes} min</Text>
            </View>
            {request.boost_amount && request.boost_amount > 0 && (
              <View style={styles.metaItem}>
                <MaterialIcons name="bolt" size={16} color="#FFC107" />
                <Text style={styles.metaText}>{request.boost_amount} BOOST</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderDetailModal = () => (
    <Modal
      visible={showDetailModal}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{t('requestView.title')}</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setShowDetailModal(false)}
          >
            <MaterialIcons name="close" size={24} color={colors.text?.primary || (isDark ? '#ffffff' : '#000000')} />
          </TouchableOpacity>
        </View>

        {selectedRequest && (
          <ScrollView 
            style={styles.modalContent}
            contentContainerStyle={styles.modalContentContainer}
          >
            {/* Speaker Info */}
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>{t('requestView.speaker')}</Text>
              <View style={styles.speakerDetail}>
                <SpeakerAvatar
                  name={selectedRequest.speaker_name}
                  imageUrl={selectedRequest.speaker_image || null}
                  size={60}
                  showBorder={true}
                />
                <View style={styles.speakerDetailInfo}>
                  <Text style={styles.speakerDetailName}>
                    {selectedRequest.speaker_name}
                  </Text>
                  <Text style={styles.speakerDetailTitle}>{t('requestView.speaker')}</Text>
                </View>
              </View>
            </View>

            {/* Requester Info */}
            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>{t('requestView.requester')}</Text>
              <View style={styles.speakerDetail}>
                <SpeakerAvatar
                  name={(selectedRequest as any).requester_full_name || selectedRequest.requester_name}
                  imageUrl={(selectedRequest as any).requester_avatar || null}
                  size={60}
                  showBorder={true}
                />
                <View style={styles.speakerDetailInfo}>
                  <View style={styles.nameRowWithBadge}>
                    <Text style={styles.speakerDetailName}>
                      {(selectedRequest as any).requester_full_name || selectedRequest.requester_name}
                    </Text>
                    {selectedRequest.requester_ticket_type && (
                      <View style={[
                        styles.ticketBadge,
                        selectedRequest.requester_ticket_type.toLowerCase() === 'vip' && styles.vipBadge
                      ]}>
                        <MaterialIcons 
                          name={selectedRequest.requester_ticket_type.toLowerCase() === 'vip' ? 'star' : 'person'} 
                          size={12} 
                          color="white" 
                        />
                        <Text style={styles.ticketBadgeText}>
                          {selectedRequest.requester_ticket_type.toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.speakerDetailTitle}>{t('requestView.requester')}</Text>
                  {selectedRequest.requester_title && (
                    <Text style={[styles.speakerDetailTitle, { marginTop: 4 }]}>
                      {selectedRequest.requester_title}
                    </Text>
                  )}
                  {selectedRequest.requester_company && (
                    <Text style={[styles.speakerDetailTitle, { marginTop: 2 }]}>
                      {selectedRequest.requester_company}
                    </Text>
                  )}
                </View>
              </View>
            </View>

            {/* Expiration Countdown Timer */}
            {selectedRequest.expires_at && expirationCountdown && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>{t('requestView.expiresIn')}</Text>
                <View style={styles.countdownContainer}>
                  <View style={styles.countdownUnit}>
                    <Text style={styles.countdownValue}>
                      {String(expirationCountdown.hours).padStart(2, '0')}
                    </Text>
                    <Text style={styles.countdownLabel}>{t('requestView.hours')}</Text>
                  </View>
                  <Text style={styles.countdownSeparator}>:</Text>
                  <View style={styles.countdownUnit}>
                    <Text style={styles.countdownValue}>
                      {String(expirationCountdown.minutes).padStart(2, '0')}
                    </Text>
                    <Text style={styles.countdownLabel}>{t('requestView.minutes')}</Text>
                  </View>
                  <Text style={styles.countdownSeparator}>:</Text>
                  <View style={styles.countdownUnit}>
                    <Text style={styles.countdownValue}>
                      {String(expirationCountdown.seconds).padStart(2, '0')}
                    </Text>
                    <Text style={styles.countdownLabel}>{t('requestView.seconds')}</Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>{t('requestView.status')}</Text>
              <View style={[styles.statusDetail, { backgroundColor: getStatusColor(selectedRequest.status) }]}>
                <MaterialIcons name={getStatusIcon(selectedRequest.status) as any} size={20} color="white" />
                <Text style={styles.statusDetailText}>
                  {selectedRequest.status === 'pending' ? t('requestView.pending') : selectedRequest.status.toUpperCase()}
                </Text>
              </View>
            </View>

            {selectedRequest.message && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>{t('requestView.message')}</Text>
                <Text style={styles.detailValue}>{selectedRequest.message}</Text>
              </View>
            )}

            {selectedRequest.note && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>{t('requestView.intentions')}</Text>
                <Text style={styles.detailValue}>{selectedRequest.note}</Text>
              </View>
            )}

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>{t('requestView.meetingDetailsLabel')}</Text>
              <View style={styles.meetingDetails}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailRowLabel}>{t('requestView.duration')}</Text>
                  <Text style={styles.detailRowValue}>{selectedRequest.duration_minutes} {t('requestView.minutesLabel')}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailRowLabel}>{t('requestView.type')}</Text>
                  <Text style={styles.detailRowValue}>{selectedRequest.meeting_type}</Text>
                </View>
                {selectedRequest.boost_amount && selectedRequest.boost_amount > 0 && (
                  <View style={styles.detailRow}>
                    <View style={styles.detailRowLabelContainer}>
                      <MaterialIcons name="bolt" size={16} color="#FFC107" />
                      <Text style={styles.detailRowLabel}>{t('requestView.boost')}</Text>
                    </View>
                    <Text style={styles.detailRowValue}>{selectedRequest.boost_amount} BOOST</Text>
                  </View>
                )}
                {selectedRequest.expires_at && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailRowLabel}>{t('requestView.expires')}</Text>
                    <Text style={[
                      styles.detailRowValue,
                      new Date(selectedRequest.expires_at) < new Date() && styles.expiredText
                    ]}>
                      {formatDate(selectedRequest.expires_at)} ({getTimeRemaining(selectedRequest.expires_at)})
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailLabel}>{t('requestView.timeline')}</Text>
              <View style={styles.timeline}>
                <View style={styles.timelineItem}>
                  <Text style={styles.timelineDate}>{formatDate(selectedRequest.created_at)}</Text>
                  <Text style={styles.timelineText}>{t('requestView.requestSent')}</Text>
                </View>
                {selectedRequest.expires_at && (
                  <View style={styles.timelineItem}>
                    <Text style={styles.timelineDate}>{formatDate(selectedRequest.expires_at)}</Text>
                    <Text style={styles.timelineText}>{t('requestView.expiresLabel')}</Text>
                  </View>
                )}
                {selectedRequest.updated_at !== selectedRequest.created_at && (
                  <View style={styles.timelineItem}>
                    <Text style={styles.timelineDate}>{formatDate(selectedRequest.updated_at)}</Text>
                    <Text style={styles.timelineText}>{t('requestView.statusUpdated')}</Text>
                  </View>
                )}
              </View>
            </View>

            {selectedRequest.speaker_response && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>{t('requestView.response')}</Text>
                <Text style={styles.detailValue}>{selectedRequest.speaker_response}</Text>
                {selectedRequest.speaker_response_at && (
                  <Text style={styles.responseDate}>
                    {formatDate(selectedRequest.speaker_response_at)}
                  </Text>
                )}
              </View>
            )}

            {/* Link to Meeting if Accepted */}
            {selectedRequest.status === 'accepted' && selectedRequest.meeting_id && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>{t('requestView.meeting')}</Text>
                <TouchableOpacity
                  style={[styles.meetingLinkButton, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    router.push({
                      pathname: "/events/bsl2025/networking/meeting-detail" as any,
                      params: {
                        meetingId: selectedRequest.meeting_id,
                        speakerName: selectedRequest.speaker_name,
                        requesterName: (selectedRequest as any).requester_full_name || selectedRequest.requester_name,
                        status: 'confirmed',
                        scheduledAt: selectedRequest.meeting_scheduled_at || '',
                        location: selectedRequest.location || 'TBD',
                        duration: selectedRequest.duration_minutes || 15,
                        isSpeaker: (selectedRequest as any)._direction === 'incoming' ? 'true' : 'false'
                      }
                    });
                    setShowDetailModal(false);
                  }}
                >
                  <MaterialIcons name="event" size={20} color="white" />
                  <Text style={styles.meetingLinkButtonText}>{t('requestView.viewMeetingDetails')}</Text>
                  <MaterialIcons name="chevron-right" size={20} color="white" />
                </TouchableOpacity>
              </View>
            )}

            {/* Action Buttons */}
            {(selectedRequest.status === 'requested' || selectedRequest.status === 'pending') && (
              <>
                {(selectedRequest as any)._direction === 'sent' ? (
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => handleCancelRequest(selectedRequest)}
                  >
                    <MaterialIcons name="cancel" size={20} color="white" />
                    <Text style={styles.cancelButtonText}>{t('requestView.cancelRequest')}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.actionButtonsContainer}>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.acceptButton]}
                      onPress={() => handleAcceptRequest(selectedRequest)}
                      disabled={loadingSlots}
                    >
                      <MaterialIcons name="check-circle" size={20} color="white" />
                      <Text style={styles.actionButtonText}>
                        {loadingSlots ? tCommon('loading.loadingSlots') : t('requestView.accept')}
                      </Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.actionButton, styles.holdButton]}
                      onPress={() => setShowHoldModal(true)}
                    >
                      <MaterialIcons name="schedule" size={20} color="white" />
                      <Text style={styles.actionButtonText}>{t('requestView.holdRequest')}</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.actionButton, styles.declineButton]}
                      onPress={() => handleDeclineRequest(selectedRequest)}
                    >
                      <MaterialIcons name="cancel" size={20} color="white" />
                      <Text style={styles.actionButtonText}>{t('requestView.decline')}</Text>
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[styles.actionButton, styles.blockButton]}
                      onPress={() => handleBlockUser(selectedRequest)}
                    >
                      <MaterialIcons name="block" size={20} color="white" />
                      <Text style={styles.actionButtonText}>{t('requestView.blockUser')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </ScrollView>
        )}
      </View>

      {/* Hold Request Confirmation Modal */}
      <Modal
        visible={showHoldModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowHoldModal(false)}
      >
        <View style={styles.holdModalOverlay}>
          <View style={styles.holdModalContent}>
            <Text style={styles.holdModalTitle}>{t('requestView.holdModalTitle')}</Text>
            <Text style={styles.holdModalDescription}>
              {t('requestView.holdModalDescription')}
            </Text>
            
            <View style={styles.holdSliderContainer}>
              <Text style={styles.holdSliderLabel}>
                {t('requestView.holdDuration')} {holdTime} {holdTime === 1 ? t('requestView.hour') : t('requestView.hours')}
              </Text>
              <View style={styles.holdSliderTrack}>
                <View style={[styles.holdSliderFill, { width: `${(holdTime / 6) * 100}%` }]} />
                <View style={[styles.holdSliderThumb, { left: `${((holdTime - 1) / 5) * 100}%` }]} />
              </View>
              <View style={styles.holdSliderMarks}>
                {[1, 2, 3, 4, 5, 6].map((hour) => (
                  <TouchableOpacity
                    key={hour}
                    style={styles.holdSliderMark}
                    onPress={() => setHoldTime(hour)}
                  >
                    <View style={[
                      styles.holdSliderMarkDot,
                      holdTime >= hour && styles.holdSliderMarkDotActive
                    ]} />
                    <Text style={[
                      styles.holdSliderMarkLabel,
                      holdTime >= hour && styles.holdSliderMarkLabelActive
                    ]}>
                      {hour}h
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.holdCostContainer}>
              <Text style={styles.holdCostLabel}>{t('requestView.cost')}</Text>
              <Text style={styles.holdCostValue}>{holdTime * 50} {t('requestView.boostPoints')}</Text>
            </View>

            <View style={styles.holdModalButtons}>
              <TouchableOpacity
                style={[styles.holdModalButton, styles.holdModalButtonCancel]}
                onPress={() => setShowHoldModal(false)}
              >
                <Text style={styles.holdModalButtonCancelText}>{t('meetingRequestModal.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.holdModalButton, styles.holdModalButtonConfirm]}
                onPress={() => {
                  // TODO: Implement hold request function
                  setShowHoldModal(false);
                  showSuccess(t('requestView.requestHeld'), t('requestView.requestHeldMessage', { hours: holdTime }));
                }}
              >
                <MaterialIcons name="check" size={20} color="white" />
                <Text style={styles.holdModalButtonConfirmText}>{t('requestView.confirmHold')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );

  if (loading) {
    return (
      <LoadingScreen
        icon="send"
        message={tCommon('loading.loadingRequests')}
        fullScreen={true}
      />
    );
  }

  const sentCount = requests.filter((r: any) => r._direction === 'sent').length;
  const incomingCount = requests.filter((r: any) => r._direction === 'incoming').length;

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: t('requestView.yourRequest'),
          headerBackTitle: 'Back',
          headerRight: () => (
            <TouchableOpacity
              onPress={handleManualReload}
              style={{ marginRight: 16, padding: 8 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons 
                name="refresh" 
                size={24} 
                color={colors.primary || (isDark ? '#ffffff' : '#000000')} 
              />
            </TouchableOpacity>
          ),
        }} 
      />
      
      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'sent' && styles.activeTab]}
          onPress={() => setActiveTab('sent')}
        >
          <MaterialIcons 
            name="send" 
            size={18} 
            color={activeTab === 'sent' ? colors.primary : (isDark ? '#888' : '#666')} 
          />
          <Text style={[styles.tabText, activeTab === 'sent' && styles.activeTabText]}>
            Sent
          </Text>
          {sentCount > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{sentCount}</Text>
            </View>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.tab, activeTab === 'incoming' && styles.activeTab]}
          onPress={() => setActiveTab('incoming')}
        >
          <MaterialIcons 
            name="inbox" 
            size={18} 
            color={activeTab === 'incoming' ? colors.primary : (isDark ? '#888' : '#666')} 
          />
          <Text style={[styles.tabText, activeTab === 'incoming' && styles.activeTabText]}>
            Incoming
          </Text>
          {incomingCount > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{incomingCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Filter Section */}
      {tabFilteredRequests.length > 0 && (
        <UnifiedSearchAndFilter
          data={tabFilteredRequests}
          onFilteredData={setFilteredRequests}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search requests..."
          searchFields={['speaker_name', 'requester_name', 'message', 'note', 'requester_company']}
          filterGroups={filterGroups}
          showResultsCount={true}
          customFilterLogic={customFilterLogic}
        />
      )}

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {filteredRequests.length > 0 ? (
          filteredRequests.map(renderRequestCard)
        ) : tabFilteredRequests.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons 
              name={activeTab === 'sent' ? 'send' : 'inbox'} 
              size={64} 
              color={isDark ? '#666666' : '#999999'} 
            />
            <Text style={styles.emptyTitle}>
              {activeTab === 'sent' ? 'No Sent Requests' : 'No Incoming Requests'}
            </Text>
            <Text style={styles.emptyDescription}>
              {activeTab === 'sent'
                ? "You haven't sent any meeting requests yet. Start networking by requesting meetings with speakers."
                : "You don't have any incoming meeting requests at the moment."}
            </Text>
            {activeTab === 'sent' && (
              <TouchableOpacity
                style={styles.browseButton}
                onPress={() => router.push('/events/bsl2025/speakers' as any)}
              >
                <MaterialIcons name="search" size={20} color="white" />
                <Text style={styles.browseButtonText}>Browse Speakers</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <MaterialIcons name="filter-list" size={64} color={isDark ? '#666666' : '#999999'} />
            <Text style={styles.emptyTitle}>No Results</Text>
            <Text style={styles.emptyDescription}>
              No requests match your current filters. Try adjusting your search or filters.
            </Text>
          </View>
        )}
      </ScrollView>

      {renderDetailModal()}

      {/* Slot Picker Modal */}
      <Modal
        visible={showSlotPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowSlotPicker(false);
          setSelectedSlot(null);
          // Clear slot context when picker is closed
          setCurrentSlotContext(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[
            styles.slotPickerModalContent,
            {
              backgroundColor: colors.background?.paper || (isDark ? '#1a1a1a' : '#ffffff'),
              borderColor: colors.divider || (isDark ? '#333333' : '#e0e0e0'),
            }
          ]}>
            {/* Close X Button */}
            <TouchableOpacity
              style={styles.slotPickerCloseButton}
              onPress={() => {
                setShowSlotPicker(false);
                setSelectedSlot(null);
                // Clear slot context when picker is closed
                setCurrentSlotContext(null);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons name="close" size={24} color={colors.text?.primary || (isDark ? '#FFFFFF' : '#000000')} />
            </TouchableOpacity>
            
            {/* Header */}
            <View style={styles.slotPickerHeader}>
              <View style={[
                styles.slotPickerIconContainer,
                { backgroundColor: (colors.primary || '#007AFF') + '15' }
              ]}>
                <MaterialIcons
                  name="schedule"
                  size={28}
                  color={colors.primary || '#007AFF'}
                />
              </View>
              <Text style={[styles.slotPickerTitle, { color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000') }]}>
                Select Time Slot
              </Text>
              <Text style={[styles.slotPickerSubtitle, { color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666') }]}>
                Choose an available time slot for the meeting
              </Text>
            </View>

            {loadingSlots ? (
              <View style={styles.slotPickerLoadingContainer}>
                <MaterialIcons name="hourglass-empty" size={32} color={colors.text?.secondary || (isDark ? '#888888' : '#999999')} />
                <Text style={[styles.slotPickerLoadingText, { color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666') }]}>
                  Loading available slots...
                </Text>
              </View>
            ) : availableSlots.length === 0 ? (
              <View style={styles.slotPickerEmptyContainer}>
                <View style={[
                  styles.slotPickerEmptyIconContainer,
                  { backgroundColor: (colors.text?.secondary || '#999999') + '15' }
                ]}>
                  <MaterialIcons 
                    name="schedule" 
                    size={48} 
                    color={colors.text?.secondary || (isDark ? '#888888' : '#999999')} 
                  />
                </View>
                <Text style={[styles.slotPickerEmptyText, { color: colors.text?.primary || (isDark ? '#E0E0E0' : '#333333') }]}>
                  No available slots found
                </Text>
                <Text style={[styles.slotPickerEmptySubtext, { color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666') }]}>
                  Please mark some time slots as available in your schedule
                </Text>
              </View>
            ) : (
              <ScrollView 
                style={styles.slotPickerList}
                showsVerticalScrollIndicator={true}
                contentContainerStyle={styles.slotPickerListContent}
              >
                {availableSlots.map((slot, index) => {
                  const slotDate = new Date(slot.slot_time);
                  const isSelected = selectedSlot === slot.slot_time;
                  const isInterested = slot.slot_status === 'interested';
                  const formattedDate = slotDate.toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric'
                  });
                  const formattedTime = slotDate.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                  });

                  // Pink color for interested slots
                  const interestedPink = '#E91E63';
                  const interestedPinkLight = '#E91E6315';

                  return (
                    <TouchableOpacity
                      key={slot.slot_time || index}
                      style={[
                        styles.slotPickerItem,
                        isSelected && styles.slotPickerItemSelected,
                        isInterested && styles.slotPickerItemInterested,
                        {
                          backgroundColor: isSelected && isInterested
                            ? interestedPinkLight // Keep interested background when selected
                            : isSelected 
                            ? (colors.success?.main || '#4CAF50') + '15'
                            : isInterested
                            ? interestedPinkLight
                            : (colors.background?.default || (isDark ? '#2a2a2a' : '#f8f8f8')),
                          borderColor: isSelected && isInterested
                            ? interestedPink // Keep interested border when selected
                            : isSelected 
                            ? (colors.success?.main || '#4CAF50')
                            : isInterested
                            ? interestedPink
                            : (colors.divider || (isDark ? '#404040' : '#e5e5e5')),
                          borderWidth: isInterested ? 2 : (isSelected ? 2 : 1),
                          // Make interested slots bigger
                          marginBottom: isInterested ? 16 : 12,
                          transform: isInterested ? [{ scale: 1.05 }] : [],
                        }
                      ]}
                      onPress={() => setSelectedSlot(slot.slot_time)}
                      activeOpacity={0.7}
                    >
                      <View style={[
                        styles.slotPickerItemContent,
                        isInterested && { 
                          padding: 20,
                          paddingRight: 60 // Add extra padding for priority icon
                        }
                      ]}>
                        {/* Priority Heart Icon for Interested Slots */}
                        {isInterested && (
                          <View style={[
                            styles.slotPickerPriorityIcon,
                            { backgroundColor: interestedPink }
                          ]}>
                            <MaterialIcons name="favorite" size={24} color="white" />
                          </View>
                        )}
                        <View style={styles.slotPickerItemLeft}>
                          <View style={[
                            styles.slotPickerTimeBadge,
                            isSelected && isInterested && {
                              backgroundColor: interestedPink, // Keep interested color when selected
                            },
                            isSelected && !isInterested && {
                              backgroundColor: colors.success?.main || '#4CAF50',
                            },
                            isInterested && !isSelected && {
                              backgroundColor: interestedPink,
                            }
                          ]}>
                            <MaterialIcons 
                              name={isInterested ? "favorite" : "access-time"} 
                              size={16} 
                              color={(isSelected || isInterested) ? 'white' : (colors.text?.secondary || '#666666')} 
                            />
                            <Text style={[
                              styles.slotPickerTimeText,
                              (isSelected || isInterested) && styles.slotPickerTimeTextSelected
                            ]}>
                              {formattedTime}
                            </Text>
                          </View>
                          <View style={styles.slotPickerItemInfo}>
                            <View style={styles.slotPickerItemInfoRow}>
                              <Text style={[
                                styles.slotPickerDateText,
                                isSelected && !isInterested && { color: colors.success?.main || '#4CAF50' },
                                isInterested && { color: interestedPink } // Always show interested color
                              ]}>
                                {formattedDate}
                              </Text>
                              {isInterested && (
                                <View style={[
                                  styles.slotPickerInterestedBadge,
                                  { backgroundColor: interestedPink }
                                ]}>
                                  <MaterialIcons name="favorite" size={12} color="white" />
                                  <Text style={styles.slotPickerInterestedBadgeText}>
                                    Interested
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={[
                              styles.slotPickerDurationText,
                              { color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666') }
                            ]}>
                              {slot.duration_minutes || 15} minutes
                            </Text>
                          </View>
                        </View>
                        {isSelected && (
                          <View style={[
                            styles.slotPickerCheckContainer,
                            { backgroundColor: isInterested ? interestedPink : (colors.success?.main || '#4CAF50') }
                          ]}>
                            <MaterialIcons name="check" size={20} color="white" />
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {selectedSlot && (
              <View style={[
                styles.slotPickerFooter,
                { borderTopColor: colors.divider || (isDark ? '#404040' : '#e5e5e5') }
              ]}>
                <TouchableOpacity
                  style={[
                    styles.slotPickerConfirmButton,
                    { backgroundColor: colors.success?.main || '#4CAF50' },
                    loadingSlots && styles.slotPickerConfirmButtonDisabled
                  ]}
                  onPress={() => {
                    if (selectedRequest && selectedSlot) {
                      handleAcceptRequest(selectedRequest, selectedSlot);
                    }
                  }}
                  disabled={loadingSlots}
                  activeOpacity={0.8}
                >
                  {loadingSlots ? (
                    <>
                      <MaterialIcons name="hourglass-empty" size={20} color="white" />
                      <Text style={styles.slotPickerConfirmButtonText}>Scheduling...</Text>
                    </>
                  ) : (
                    <>
                      <MaterialIcons name="check-circle" size={20} color="white" />
                      <Text style={styles.slotPickerConfirmButtonText}>Confirm Selection</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Modern Success Modal */}
      <Modal
        visible={showSlotConfirmation}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setShowSlotConfirmation(false);
          setShowDetailModal(false);
          setSelectedSlot(null);
          setConfirmedMeetingId(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[
            styles.successModalContent,
            {
              backgroundColor: colors.background?.paper || (isDark ? '#1a1a1a' : '#ffffff'),
              borderColor: colors.divider || (isDark ? '#333333' : '#e0e0e0'),
            }
          ]}>
            {/* Success Icon */}
            <View style={[
              styles.successIconContainer,
              { backgroundColor: `${colors.success?.main || '#4CAF50'}15` }
            ]}>
              <MaterialIcons
                name="check-circle"
                size={48}
                color={colors.success?.main || '#4CAF50'}
              />
            </View>

            {/* Title */}
            <Text style={[styles.successModalTitle, { color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000') }]}>
              Meeting Scheduled
            </Text>

            {/* Meeting Summary */}
            {selectedRequest && selectedSlot && (
              <View style={styles.successMeetingSummary}>
                <View style={styles.successMeetingRow}>
                  <MaterialIcons
                    name="person"
                    size={20}
                    color={colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666')}
                  />
                  <Text style={[styles.successMeetingText, { color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000') }]}>
                    {selectedRequest.requester_name || 'User'}
                  </Text>
                </View>

                <View style={styles.successMeetingRow}>
                  <MaterialIcons
                    name="schedule"
                    size={20}
                    color={colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666')}
                  />
                  <Text style={[styles.successMeetingText, { color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666') }]}>
                    {new Date(selectedSlot).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })} • {new Date(selectedSlot).toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true
                    })}
                  </Text>
                </View>

                <View style={styles.successMeetingRow}>
                  <MaterialIcons
                    name="access-time"
                    size={20}
                    color={colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666')}
                  />
                  <Text style={[styles.successMeetingText, { color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666') }]}>
                    {selectedRequest.duration_minutes || 15} minutes
                  </Text>
                </View>
              </View>
            )}

            {/* Subtle Info Message */}
            <Text style={[styles.successModalMessage, { color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666') }]}>
              Added to both calendars
            </Text>

            {/* Action Button */}
            <TouchableOpacity
              style={[
                styles.successActionButton,
                {
                  backgroundColor: colors.primary || '#007AFF',
                }
              ]}
              onPress={() => {
                if (confirmedMeetingId) {
                  setShowSlotConfirmation(false);
                  setShowDetailModal(false);
                  setSelectedSlot(null);
                  router.push({
                    pathname: '/events/bsl2025/networking/meeting-detail' as any,
                    params: {
                      meetingId: confirmedMeetingId,
                      speakerName: selectedRequest?.speaker_name || '',
                      requesterName: selectedRequest?.requester_name || '',
                      status: 'tentative',
                      scheduledAt: selectedSlot || '',
                      duration: selectedRequest?.duration_minutes || 15,
                      isSpeaker: 'true'
                    }
                  });
                  setConfirmedMeetingId(null);
                }
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.successActionButtonText}>View Meeting</Text>
            </TouchableOpacity>

            {/* Close Button */}
            <TouchableOpacity
              style={styles.successCloseButton}
              onPress={() => {
                setShowSlotConfirmation(false);
                setShowDetailModal(false);
                setSelectedSlot(null);
                setConfirmedMeetingId(null);
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <MaterialIcons 
                name="close" 
                size={20} 
                color={colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666')} 
              />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Cancel Confirmation Modal */}
      <Modal
        visible={showCancelConfirm}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowCancelConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[
            styles.cancelModalContent,
            {
              backgroundColor: colors.background?.paper || (isDark ? '#1e1e1e' : '#ffffff'),
              borderColor: colors.divider || (isDark ? '#333333' : '#e0e0e0'),
            }
          ]}>
            {/* Close X Button */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowCancelConfirm(false)}
            >
              <MaterialIcons name="close" size={24} color={colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666')} />
            </TouchableOpacity>
            
            {/* Header */}
            <View style={styles.cancelModalHeader}>
              <View style={[
                styles.warningIconContainer,
                {
                  backgroundColor: isDark ? 'rgba(255, 152, 0, 0.15)' : 'rgba(255, 152, 0, 0.1)',
                }
              ]}>
                <MaterialIcons
                  name="warning"
                  size={24}
                  color={colors.warning?.main || '#FF9800'}
                />
              </View>
              <Text style={[styles.cancelModalTitle, { color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000') }]}>
                Cancel Meeting Request?
              </Text>
            </View>

            {/* Warning Message */}
            <View style={[
              styles.cancelModalWarningBox,
              {
                backgroundColor: isDark ? 'rgba(255, 152, 0, 0.1)' : 'rgba(255, 152, 0, 0.05)',
                borderColor: isDark ? 'rgba(255, 152, 0, 0.3)' : 'rgba(255, 152, 0, 0.2)',
              }
            ]}>
              <MaterialIcons
                name="info"
                size={18}
                color={colors.warning?.main || '#FF9800'}
              />
              <Text style={[styles.cancelModalWarningText, { color: colors.text?.primary || (isDark ? '#FFFFFF' : '#1a1a1a') }]}>
                Are you sure you want to cancel this meeting request?
              </Text>
            </View>

            {/* Disclaimer - Compact */}
            <View style={styles.cancelModalDisclaimer}>
              <View style={styles.cancelModalDisclaimerItem}>
                <MaterialIcons name="check-circle" size={14} color={colors.warning?.main || '#FF9800'} />
                <Text style={[styles.cancelModalDisclaimerText, { color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666') }]}>
                  Request limit restored
                </Text>
              </View>
              <View style={styles.cancelModalDisclaimerItem}>
                <MaterialIcons name="close-circle" size={14} color={colors.error?.main || '#F44336'} />
                <Text style={[styles.cancelModalDisclaimerText, { color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666') }]}>
                  Boost points not refunded
                </Text>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.cancelConfirmButton,
                  {
                    backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
                    borderColor: colors.divider || (isDark ? '#404040' : '#e0e0e0'),
                  }
                ]}
                onPress={() => setShowCancelConfirm(false)}
              >
                <Text style={[
                  styles.actionButtonText,
                  { color: colors.text?.primary || (isDark ? '#FFFFFF' : '#1a1a1a') }
                ]}>
                  Keep Request
                </Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.confirmCancelButton,
                  {
                    backgroundColor: colors.error?.main || '#F44336',
                  }
                ]}
                onPress={confirmCancelRequest}
              >
                <MaterialIcons name="cancel" size={20} color="white" />
                <Text style={styles.actionButtonText}>Cancel Request</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background?.default || (isDark ? '#000000' : '#ffffff'),
  },
  content: {
    flex: 1,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.background?.paper || (isDark ? '#1a1a1a' : '#f5f5f5'),
    borderBottomWidth: 1,
    borderBottomColor: isDark ? '#333333' : '#e0e0e0',
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: colors.primary || '#007AFF',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '500',
    color: isDark ? '#888888' : '#666666',
  },
  activeTabText: {
    color: colors.primary || '#007AFF',
    fontWeight: '600',
  },
  tabBadge: {
    backgroundColor: colors.primary || '#007AFF',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  requestCard: {
    backgroundColor: colors.card?.default || (isDark ? '#1e1e1e' : '#ffffff'),
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: isDark ? '#333333' : '#e5e5e5',
    shadowColor: isDark ? '#000000' : '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.1,
    shadowRadius: 8,
    elevation: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  requestCardAccepted: {
    borderWidth: 2,
    borderColor: '#4CAF50',
    backgroundColor: isDark ? 'rgba(76, 175, 80, 0.1)' : 'rgba(76, 175, 80, 0.05)',
    shadowColor: '#4CAF50',
    shadowOpacity: isDark ? 0.4 : 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  acceptedGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: '#4CAF50',
  },
  acceptedCheckBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#4CAF50',
    borderRadius: 14,
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.card?.default || (isDark ? '#1e1e1e' : '#ffffff'),
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  displayNameAccepted: {
    color: '#4CAF50',
    fontWeight: '700',
  },
  statusBadgeAccepted: {
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  incomingBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#2196F3',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.card?.default || (isDark ? '#1e1e1e' : '#ffffff'),
  },
  cardHeaderContent: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  displayName: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
    flex: 1,
    marginRight: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666'),
    marginBottom: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  dateText: {
    fontSize: 12,
    color: colors.text?.secondary || (isDark ? '#888888' : '#999999'),
  },
  expirationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255, 152, 0, 0.2)' : 'rgba(255, 152, 0, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  expirationBadgeExpired: {
    backgroundColor: isDark ? 'rgba(244, 67, 54, 0.2)' : 'rgba(244, 67, 54, 0.1)',
  },
  expirationText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FF9800',
  },
  expirationTextExpired: {
    color: '#F44336',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: isDark ? '#333333' : '#e5e5e5',
  },
  messageText: {
    fontSize: 14,
    color: colors.text?.primary || (isDark ? '#E0E0E0' : '#333333'),
    lineHeight: 20,
    marginBottom: 8,
  },
  noteContainer: {
    marginTop: 8,
  },
  noteLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.secondary || (isDark ? '#BB86FC' : '#6200EE'),
    marginBottom: 4,
  },
  noteText: {
    fontSize: 13,
    color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666'),
    fontStyle: 'italic',
    lineHeight: 18,
  },
  cardFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: isDark ? '#333333' : '#e5e5e5',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666'),
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginTop: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666'),
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  browseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary || '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  browseButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background?.default || (isDark ? '#000000' : '#ffffff'),
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider || (isDark ? '#333333' : '#e0e0e0'),
    position: 'relative',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    color: colors.text?.primary || (isDark ? '#ffffff' : '#000000'),
  },
  closeButton: {
    position: 'absolute',
    right: 20,
    padding: 8,
    zIndex: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    flex: 1,
  },
  cancelModalContent: {
    backgroundColor: colors.background?.paper || (isDark ? '#1e1e1e' : '#ffffff'),
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
    borderColor: colors.divider || (isDark ? '#333333' : '#e0e0e0'),
    position: 'relative',
  },
  modalContentContainer: {
    padding: 20,
  },
  detailSection: {
    marginBottom: 20,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666'),
    marginBottom: 8,
  },
  detailValue: {
    fontSize: 16,
    color: colors.text?.primary || (isDark ? '#E0E0E0' : '#333333'),
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
    color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666'),
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
    borderWidth: 1,
    borderColor: isDark ? '#404040' : '#e5e5e5',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  detailRowLabel: {
    fontSize: 14,
    color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666'),
  },
  detailRowValue: {
    fontSize: 14,
    color: colors.text?.primary || (isDark ? '#E0E0E0' : '#333333'),
    fontWeight: '500',
  },
  timeline: {
    backgroundColor: colors.card?.default || (isDark ? '#2a2a2a' : '#f5f5f5'),
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: isDark ? '#404040' : '#e5e5e5',
  },
  timelineItem: {
    marginBottom: 8,
  },
  timelineDate: {
    fontSize: 12,
    color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666'),
    fontWeight: '600',
  },
  timelineText: {
    fontSize: 14,
    color: colors.text?.primary || (isDark ? '#E0E0E0' : '#333333'),
    marginTop: 2,
  },
  responseDate: {
    fontSize: 12,
    color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666'),
    marginTop: 4,
    fontStyle: 'italic',
  },
  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F44336',
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
    gap: 8,
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtonsContainer: {
    marginTop: 20,
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  declineButton: {
    backgroundColor: '#FF9800',
  },
  blockButton: {
    backgroundColor: '#F44336',
  },
  holdButton: {
    backgroundColor: '#9C27B0', // Magic violet
    shadowColor: '#9C27B0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
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
    backgroundColor: isDark ? '#424242' : '#757575',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  vipBadge: {
    backgroundColor: '#FFD700',
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  ticketBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  countdownContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  countdownUnit: {
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255, 152, 0, 0.2)' : 'rgba(255, 152, 0, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 60,
  },
  countdownValue: {
    color: '#FF9800',
    fontSize: 24,
    fontWeight: 'bold',
    lineHeight: 28,
  },
  countdownLabel: {
    color: isDark ? '#FFB74D' : '#F57C00',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  countdownSeparator: {
    color: '#FF9800',
    fontSize: 20,
    fontWeight: 'bold',
  },
  holdModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  holdModalContent: {
    backgroundColor: colors.background?.paper || (isDark ? '#1a1a1a' : '#ffffff'),
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },
  holdModalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
    marginBottom: 8,
    textAlign: 'center',
  },
  holdModalDescription: {
    fontSize: 14,
    color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666'),
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 20,
  },
  holdSliderContainer: {
    marginBottom: 24,
  },
  holdSliderLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
    marginBottom: 16,
    textAlign: 'center',
  },
  holdSliderTrack: {
    height: 8,
    backgroundColor: isDark ? '#333333' : '#e0e0e0',
    borderRadius: 4,
    position: 'relative',
    marginBottom: 32,
  },
  holdSliderFill: {
    height: '100%',
    backgroundColor: '#9C27B0',
    borderRadius: 4,
  },
  holdSliderThumb: {
    width: 24,
    height: 24,
    backgroundColor: '#9C27B0',
    borderRadius: 12,
    position: 'absolute',
    top: -8,
    shadowColor: '#9C27B0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  holdSliderMarks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  holdSliderMark: {
    alignItems: 'center',
    gap: 4,
  },
  holdSliderMarkDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: isDark ? '#404040' : '#c0c0c0',
  },
  holdSliderMarkDotActive: {
    backgroundColor: '#9C27B0',
    shadowColor: '#9C27B0',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 4,
  },
  holdSliderMarkLabel: {
    fontSize: 11,
    color: colors.text?.secondary || (isDark ? '#888888' : '#999999'),
    fontWeight: '500',
  },
  holdSliderMarkLabelActive: {
    color: '#9C27B0',
    fontWeight: '700',
  },
  holdCostContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: isDark ? 'rgba(156, 39, 176, 0.1)' : 'rgba(156, 39, 176, 0.05)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  holdCostLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
  },
  holdCostValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#9C27B0',
  },
  holdModalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  holdModalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  holdModalButtonCancel: {
    backgroundColor: isDark ? '#2a2a2a' : '#f5f5f5',
    borderWidth: 1,
    borderColor: colors.divider || (isDark ? '#404040' : '#e0e0e0'),
  },
  holdModalButtonCancelText: {
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
    fontSize: 16,
    fontWeight: '600',
  },
  holdModalButtonConfirm: {
    backgroundColor: '#9C27B0',
    shadowColor: '#9C27B0',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  holdModalButtonConfirmText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  expiredText: {
    color: '#F44336',
    fontWeight: '600',
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666'),
    marginBottom: 20,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666'),
  },
  emptySlotsContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptySlotsText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#E0E0E0' : '#333333'),
    marginTop: 16,
  },
  emptySlotsSubtext: {
    fontSize: 14,
    color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666'),
    marginTop: 8,
    textAlign: 'center',
  },
  slotsList: {
    maxHeight: 400,
  },
  slotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginBottom: 12,
    backgroundColor: colors.card?.default || (isDark ? '#2a2a2a' : '#f5f5f5'),
    borderRadius: 12,
    borderWidth: 2,
    borderColor: isDark ? '#404040' : '#e5e5e5',
  },
  slotItemSelected: {
    borderColor: '#4CAF50',
    backgroundColor: isDark ? 'rgba(76, 175, 80, 0.1)' : 'rgba(76, 175, 80, 0.05)',
  },
  slotInfo: {
    flex: 1,
  },
  slotDate: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#E0E0E0' : '#333333'),
    marginBottom: 4,
  },
  slotDateSelected: {
    color: '#4CAF50',
  },
  slotTime: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text?.primary || (isDark ? '#E0E0E0' : '#333333'),
    marginBottom: 4,
  },
  slotTimeSelected: {
    color: '#4CAF50',
  },
  slotDuration: {
    fontSize: 12,
    color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666'),
  },
  slotDurationSelected: {
    color: '#4CAF50',
  },
  modalFooter: {
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: isDark ? '#404040' : '#e5e5e5',
    marginTop: 20,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  // Success Modal Styles
  successModalContent: {
    width: '90%',
    maxWidth: 400,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 16,
    position: 'relative',
  },
  successIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  successModalTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 24,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  successMeetingSummary: {
    width: '100%',
    marginBottom: 20,
    gap: 12,
  },
  successMeetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  successMeetingText: {
    fontSize: 15,
    fontWeight: '500',
    flex: 1,
  },
  successModalMessage: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: '500',
  },
  successActionButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  successActionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  successCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
  },
  meetingLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 12,
    marginTop: 8,
  },
  meetingLinkButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  // Slot Picker Modal Styles
  slotPickerModalContent: {
    width: '90%',
    maxWidth: 500,
    maxHeight: '85%',
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 16,
  },
  slotPickerCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotPickerHeader: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  slotPickerIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  slotPickerTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  slotPickerSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  slotPickerLoadingContainer: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotPickerLoadingText: {
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  slotPickerEmptyContainer: {
    padding: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotPickerEmptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  slotPickerEmptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  slotPickerEmptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  slotPickerList: {
    maxHeight: 400,
    marginHorizontal: -24,
    paddingHorizontal: 24,
  },
  slotPickerListContent: {
    paddingBottom: 16,
  },
  slotPickerItem: {
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  slotPickerItemSelected: {
    shadowColor: '#4CAF50',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  slotPickerItemInterested: {
    shadowColor: '#E91E63',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  slotPickerPriorityIcon: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E91E63',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 10,
  },
  slotPickerItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    position: 'relative',
  },
  slotPickerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 16,
  },
  slotPickerTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
  },
  slotPickerTimeText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
  },
  slotPickerTimeTextSelected: {
    color: 'white',
  },
  slotPickerItemInfo: {
    flex: 1,
  },
  slotPickerItemInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  slotPickerInterestedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  slotPickerInterestedBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  slotPickerDateText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
    marginBottom: 4,
  },
  slotPickerDurationText: {
    fontSize: 13,
    fontWeight: '500',
  },
  slotPickerCheckContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotPickerFooter: {
    paddingTop: 20,
    marginTop: 20,
    borderTopWidth: 1,
  },
  slotPickerConfirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 10,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  slotPickerConfirmButtonDisabled: {
    opacity: 0.6,
  },
  slotPickerConfirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  eventDetails: {
    marginBottom: 20,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  eventInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  eventInfoText: {
    fontSize: 14,
  },
  messageBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 24,
    gap: 12,
  },
  messageTextConfirmation: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  warningIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000'),
    flex: 1,
    letterSpacing: 0.3,
  },
  cancelModalWarningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 10,
  },
  cancelModalWarningText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  cancelModalDisclaimer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  cancelModalDisclaimerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: '45%',
  },
  cancelModalDisclaimerText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    marginTop: 12,
  },
  disclaimerTextContainer: {
    flex: 1,
    gap: 10,
  },
  disclaimerItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  disclaimerBullet: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
    minWidth: 12,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },
  cancelConfirmButton: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
});
