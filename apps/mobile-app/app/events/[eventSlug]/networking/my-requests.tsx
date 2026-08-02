import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { useRouter, Stack, useLocalSearchParams } from 'expo-router';
import { useTheme } from '../../../../hooks/useTheme';
import { useAuth } from '../../../../hooks/useAuth';
import { useEvent } from '@contexts/EventContext';
import { MaterialIcons } from '@expo/vector-icons';
import { useToastHelpers } from '@contexts/ToastContext';
import SpeakerAvatar from '../../../../components/SpeakerAvatar';
import LoadingScreen from '../../../../components/LoadingScreen';
import { MeetingRequest } from '@/types/networking';
import * as Haptics from 'expo-haptics';
import { CopilotStep, walkthroughable } from '@lib/copilot-shim';
import UnifiedSearchAndFilter from '../../../../components/UnifiedSearchAndFilter';
import { useNotifications } from '@contexts/NotificationContext';
import { lukasRewardService } from '../../../../lib/lukas-reward-service';
import { useBalance } from '@contexts/BalanceContext';
import { useTranslation } from '../../../../i18n/i18n';
import { apiClient, eventApiPath } from '@/lib/api-client';
import { resolveActiveEventId } from '@/lib/event-path';

type MeetingRequestWithDirection = MeetingRequest & {
  _direction?: 'sent' | 'incoming';
  speaker_image?: string | null;
  requester_avatar?: string;
  requester_full_name?: string;
  requester_email?: string;
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
  const { dbUserId } = useAuth();
  const { event } = useEvent();
  const params = useLocalSearchParams<{ eventSlug?: string | string[]; requestId?: string | string[] }>();
  const routeEventSlug = Array.isArray(params.eventSlug) ? params.eventSlug[0] : params.eventSlug;
  const requestedRequestId = Array.isArray(params.requestId) ? params.requestId[0] : params.requestId;
  const eventId = resolveActiveEventId(routeEventSlug || event?.id);
  const meetingRequestsPath = eventApiPath(eventId, 'meetings/requests');
  const meetingRequestSlotsPath = eventApiPath(eventId, 'meetings/requests/slots');
  const router = useRouter();
  const { showSuccess, showError, showWarning } = useToastHelpers();
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
  const [confirmedMeetingStatus, setConfirmedMeetingStatus] = useState<'confirmed' | 'tentative'>('confirmed');
  // Track current slot loading context to reload after acceptance
  const [currentSlotContext, setCurrentSlotContext] = useState<{
    speakerId: string;
    durationMinutes: number;
    requesterId?: string;
  } | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [showHoldModal, setShowHoldModal] = useState(false);
  const [holdTime, setHoldTime] = useState(1); // Hours
  const [expirationCountdown, setExpirationCountdown] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);
  const openedRequestId = useRef<string | null>(null);

  useEffect(() => {
    if (dbUserId) {
      loadMyRequests();
    } else {
      setLoading(false);
    }

    const timeout = setTimeout(() => {
      if (loading && requests.length === 0) {
        console.warn('⚠️ My requests loading timeout (requests still empty), setting loading to false');
        setLoading(false);
      }
    }, 10000);

    return () => clearTimeout(timeout);
  }, [dbUserId]);

  // Deep links from the speaker card must use the route event (not a stale
  // event context) and open the matching request once its event-scoped list
  // finishes loading.
  useEffect(() => {
    if (!requestedRequestId || loading || openedRequestId.current === requestedRequestId) return;

    const request = requests.find((item) => String(item.id) === String(requestedRequestId));
    if (request) {
      setActiveTab(request._direction === 'incoming' ? 'incoming' : 'sent');
      setSelectedRequest(request as MeetingRequest);
      setShowDetailModal(true);
      openedRequestId.current = requestedRequestId;
    }
  }, [requestedRequestId, loading, requests]);

  const loadMyRequests = useCallback(async () => {
    if (!dbUserId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const response = await apiClient.request(meetingRequestsPath, { skipEventSegment: true });
      if (!response.success) throw new Error(response.error);
      const meetingRequests = (response.data as any)?.data || [];
      setRequests(meetingRequests.map((request: any) => request._direction === 'incoming'
        ? { ...request, requester_avatar: generateUserAvatarUrl(request.requester_name || 'User'), requester_full_name: request.requester_name || 'User' }
        : request));
    } catch (error) {
      console.error('❌ Error loading my requests:', error);
      showError(t('requestView.loadErrorTitle'), t('requestView.loadErrorMessage'));
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [dbUserId, showError, meetingRequestsPath]);

  // The API owns event isolation and provider access. Refresh through that
  // boundary rather than opening a client Supabase channel for this screen.
  useEffect(() => {
    if (!dbUserId) return;
    const interval = setInterval(() => {
      void loadMyRequests();
      void refreshNotifications();
    }, 30000);
    return () => clearInterval(interval);
  }, [dbUserId, loadMyRequests, refreshNotifications]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadMyRequests();
      // Refresh notifications after reloading requests
      refreshNotifications();
    } catch (error) {
      console.error('❌ Error refreshing requests:', error);
      showError(t('requestView.refreshErrorTitle'), t('requestView.refreshErrorMessage'));
    } finally {
      setRefreshing(false);
    }
  };

  // Manual reload handler (for header button) - Force refresh with haptic feedback
  const handleManualReload = useCallback(async () => {
    try {
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
    } catch (error) {
      console.error('❌ Error in manual reload:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showError(t('requestView.refreshErrorTitle'), t('requestView.refreshErrorMessage'));
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
    if (!selectedRequest || !dbUserId) return;
    
    try {
      setShowCancelConfirm(false);
      
      const response = await apiClient.request(meetingRequestsPath, {
        skipEventSegment: true, method: 'PATCH', body: { requestId: selectedRequest.id, action: 'cancel' },
      });
      if (!response.success) throw new Error(response.error);
      const data = (response.data as any)?.data;

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
      showError(t('requestView.cancelFailedTitle'), error?.message || t('requestView.cancelFailedMessage'));
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
        const priority: Record<string, number> = {
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
      const priority: Record<string, number> = {
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
      
      const response = await apiClient.request(meetingRequestSlotsPath, {
        skipEventSegment: true, params: { speakerId: speakerIdString, durationMinutes, requesterId },
      });
      if (!response.success) throw new Error(response.error);
      const data = (response.data as any)?.data || [];
      setAvailableSlots(sortSlotsByPriority(data));
      if (showPicker) setShowSlotPicker(true);
      // The empty state is already shown inline in the slot picker modal
      // (with a retry button), so no separate toast is needed here.
    } catch (error: any) {
      console.error('❌ Error loading slots:', error);
      if (showPicker) {
        showError(t('requestView.slotPicker.loadErrorTitle'), t('requestView.slotPicker.loadErrorMessage'));
      }
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleAcceptRequest = async (request: MeetingRequest, slotTime?: string) => {
    if (!dbUserId) return;
    
    try {
      const speakerIdString = String(request.speaker_id);
      if (!slotTime) {
        await loadAvailableSlots(speakerIdString, request.duration_minutes || 15, (request as MeetingRequestWithDirection).requester_id);
        return;
      }
      const response = await apiClient.request(meetingRequestsPath, {
        skipEventSegment: true, method: 'PATCH', body: { requestId: request.id, action: 'accept', slotTime },
      });
      if (!response.success) { showError(t('requestView.acceptFailedTitle'), response.error); return; }
      const data = (response.data as any)?.data;

      // Check if RPC returned success: false (this is not a Supabase error, but a business logic error)
      if (data && typeof data === 'object' && 'success' in data && !data.success) {
        const errorMessage = data.error || t('requestView.acceptFailedMessage');
        console.error('❌ Request acceptance failed:', errorMessage);
        showError(t('requestView.slotConflictTitle'), errorMessage);
        // Close slot picker if open
        setShowSlotPicker(false);
        return;
      }

      if (data?.success) {
        // Show confirmation modal with meeting details
        setConfirmedMeetingId(data.meeting_id);
        setConfirmedMeetingStatus(data.status === 'tentative' ? 'tentative' : 'confirmed');
        setShowSlotPicker(false);
        setShowSlotConfirmation(true);
        
        // Refresh LUKAS balance after reward (for both speaker and requester)
        // Wait for database trigger to complete, then refresh multiple times to ensure update
        const refreshBalanceWithRetry = async (attempts = 3, delay = 2000) => {
          for (let i = 0; i < attempts; i++) {
            try {
              await new Promise(resolve => setTimeout(resolve, delay));
              await refreshBalance();

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
        
        if (data.status === 'tentative') {
          showWarning(
            t('requestView.slotConflictActionTitle'),
            t('requestView.slotConflictActionMessage')
          );
        } else {
          showSuccess(t('requestView.acceptedTitle'), t('requestView.acceptedMessage'));
        }
      } else {
        // Fallback for unexpected response format
        console.error('❌ Unexpected response format:', data);
        showError(t('requestView.acceptFailedTitle'), t('requestView.unexpectedResponseMessage'));
      }
    } catch (error: any) {
      console.error('❌ Error accepting request:', error);
      const errorMessage = error?.message || error?.error || t('requestView.acceptFailedMessage');
      showError(t('requestView.acceptFailedTitle'), errorMessage);
    }
  };

  const handleDeclineRequest = async (request: MeetingRequest, reason?: string) => {
    if (!dbUserId) return;

    try {
      const trimmedReason = reason?.trim();
      const response = await apiClient.request(meetingRequestsPath, {
        skipEventSegment: true,
        method: 'PATCH',
        body: {
          requestId: request.id,
          action: 'decline',
          ...(trimmedReason ? { response: trimmedReason } : {}),
        },
      });
      if (!response.success) throw new Error(response.error);
      const data = (response.data as any)?.data;

      if (data?.success) {
        showSuccess(t('requestView.declinedTitle'), t('requestView.declinedMessage'));

        // Force reload to ensure UI is updated
        setTimeout(async () => {
          await loadMyRequests();
        }, 500);

        setShowDetailModal(false);
      } else {
        throw new Error(data?.error || t('requestView.declineFailedMessage'));
      }
    } catch (error: any) {
      console.error('❌ Error declining request:', error);
      showError(t('requestView.declineFailedTitle'), error.message || t('requestView.declineFailedMessage'));
    }
  };

  const handleBlockUser = async (request: MeetingRequest) => {
    if (!dbUserId) return;
    
    try {
      const requestWithId = request as MeetingRequestWithDirection;
      const requesterId = requestWithId.requester_id || (request as any).requester_id;
      const response = await apiClient.request(meetingRequestsPath, {
        skipEventSegment: true,
        method: 'PATCH',
        body: {
          requestId: request.id,
          action: 'block',
          requesterId,
          reason: 'User has been blocked',
        },
      });
      if (!response.success) throw new Error(response.error);
      const data = (response.data as any)?.data;

      if (data?.success) {
        showSuccess(t('requestView.userBlockedTitle'), t('requestView.userBlockedMessage'));

        // Force reload to ensure UI is updated
        setTimeout(async () => {
          await loadMyRequests();
        }, 500);

        setShowDetailModal(false);
      } else {
        throw new Error(data?.error || t('requestView.blockFailedMessage'));
      }
    } catch (error: any) {
      console.error('❌ Error blocking user:', error);
      showError(t('requestView.blockFailedTitle'), error.message || t('requestView.blockFailedMessage'));
    }
  };

  // Countdown timer effect for expiration
  useEffect(() => {
    if (!selectedRequest?.expires_at) {
      setExpirationCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const expiresAtMs = Date.parse(selectedRequest.expires_at!);
      if (!Number.isFinite(expiresAtMs)) {
        setExpirationCountdown(null);
        return;
      }

      const diffMs = expiresAtMs - Date.now();
      
      if (diffMs <= 0) {
        setExpirationCountdown({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
      
      setExpirationCountdown({ days, hours, minutes, seconds });
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
            
            {Boolean(displaySubtitle) && (
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

        {Boolean(request.message || request.note) && (
          <View style={styles.cardContent}>
            {Boolean(request.message) && (
              <Text style={styles.messageText} numberOfLines={2}>
                {request.message}
              </Text>
            )}
            {Boolean(request.note) && (
              <View style={styles.noteContainer}>
                <Text style={styles.noteLabel}>{t('requestView.intentions')}:</Text>
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
                  <Text style={styles.speakerDetailTitle}>
                    {selectedRequest.speaker_title || t('requestView.speaker')}
                  </Text>
                  {Boolean(selectedRequest.speaker_company) && (
                    <Text style={[styles.speakerDetailTitle, { marginTop: 2 }]}>
                      {selectedRequest.speaker_company}
                    </Text>
                  )}
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
                    {Boolean(selectedRequest.requester_ticket_type) && (
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
                  {Boolean(selectedRequest.requester_title) && (
                    <Text style={[styles.speakerDetailTitle, { marginTop: 4 }]}>
                      {selectedRequest.requester_title}
                    </Text>
                  )}
                  {Boolean(selectedRequest.requester_company) && (
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
                      {String(expirationCountdown.days).padStart(2, '0')}
                    </Text>
                    <Text style={styles.countdownLabel}>{t('requestView.days')}</Text>
                  </View>
                  <Text style={styles.countdownSeparator}>:</Text>
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

            {Boolean(selectedRequest.message) && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>{t('requestView.message')}</Text>
                <Text style={styles.detailValue}>{selectedRequest.message}</Text>
              </View>
            )}

            {Boolean(selectedRequest.note) && (
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

            {Boolean(selectedRequest.speaker_response) && (
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>{t('requestView.response')}</Text>
                <Text style={styles.detailValue}>{selectedRequest.speaker_response}</Text>
                {Boolean(selectedRequest.speaker_response_at) && (
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
                      pathname: `/events/${eventId}/networking/meeting-detail` as any,
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
                      onPress={() => setShowDeclineModal(true)}
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
          headerBackTitle: tCommon('back'),
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
            {t('requestView.tabs.sent')}
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
            {t('requestView.tabs.incoming')}
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
          searchPlaceholder={t('requestView.searchPlaceholder')}
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
              {activeTab === 'sent' ? t('requestView.emptyState.noSentTitle') : t('requestView.emptyState.noIncomingTitle')}
            </Text>
            <Text style={styles.emptyDescription}>
              {activeTab === 'sent'
                ? t('requestView.emptyState.noSentDescription')
                : t('requestView.emptyState.noIncomingDescription')}
            </Text>
            {activeTab === 'sent' && (
              <TouchableOpacity
                style={styles.browseButton}
                onPress={() => router.push(`/events/${eventId}/speakers` as any)}
              >
                <MaterialIcons name="search" size={20} color="white" />
                <Text style={styles.browseButtonText}>{t('requestView.emptyState.browseSpeakers')}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <MaterialIcons name="filter-list" size={64} color={isDark ? '#666666' : '#999999'} />
            <Text style={styles.emptyTitle}>{t('requestView.emptyState.noResultsTitle')}</Text>
            <Text style={styles.emptyDescription}>
              {t('requestView.emptyState.noResultsDescription')}
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
                {t('requestView.slotPicker.title')}
              </Text>
              <Text style={[styles.slotPickerSubtitle, { color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666') }]}>
                {t('requestView.slotPicker.subtitle')}
              </Text>
            </View>

            {loadingSlots ? (
              <View style={styles.slotPickerLoadingContainer}>
                <MaterialIcons name="hourglass-empty" size={32} color={colors.text?.secondary || (isDark ? '#888888' : '#999999')} />
                <Text style={[styles.slotPickerLoadingText, { color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666') }]}>
                  {t('requestView.slotPicker.loading')}
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
                  {t('requestView.slotPicker.emptyTitle')}
                </Text>
                <Text style={[styles.slotPickerEmptySubtext, { color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666') }]}>
                  {t('requestView.slotPicker.emptySubtitle')}
                </Text>
                <TouchableOpacity
                  style={[styles.slotPickerTryAgainButton, { backgroundColor: colors.primary || '#007AFF' }]}
                  onPress={() => {
                    if (currentSlotContext) {
                      loadAvailableSlots(
                        currentSlotContext.speakerId,
                        currentSlotContext.durationMinutes,
                        currentSlotContext.requesterId,
                        true
                      );
                    }
                  }}
                  disabled={loadingSlots || !currentSlotContext}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="refresh" size={18} color="white" />
                  <Text style={styles.slotPickerTryAgainButtonText}>{t('requestView.slotPicker.tryAgain')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.slotPickerScheduleLinkButton}
                  onPress={() => {
                    // Close the whole modal stack (slot picker sits on top of
                    // the request detail drawer), not just the slot picker —
                    // otherwise the detail drawer is still open underneath
                    // when the user comes back to this screen.
                    setShowSlotPicker(false);
                    setShowDetailModal(false);
                    setSelectedSlot(null);
                    setCurrentSlotContext(null);
                    // The Modal's exit needs to actually unmount (its content
                    // renders via a web portal outside this screen's tree)
                    // before pushing a new route, or the push can land behind
                    // the still-closing overlay with no visible effect.
                    setTimeout(() => {
                      router.push(`/events/${eventId}/networking/my-schedule` as any);
                    }, 50);
                  }}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="event-note" size={16} color={colors.primary || '#007AFF'} />
                  <Text style={[styles.slotPickerScheduleLinkButtonText, { color: colors.primary || '#007AFF' }]}>
                    {t('requestView.slotPicker.goToSchedule')}
                  </Text>
                </TouchableOpacity>
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
                                    {t('requestView.slotPicker.interested')}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text style={[
                              styles.slotPickerDurationText,
                              { color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666') }
                            ]}>
                              {slot.duration_minutes || 15} {t('requestView.minutesLabel')}
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
                      <Text style={styles.slotPickerConfirmButtonText}>{t('requestView.slotPicker.scheduling')}</Text>
                    </>
                  ) : (
                    <>
                      <MaterialIcons name="check-circle" size={20} color="white" />
                      <Text style={styles.slotPickerConfirmButtonText}>{t('requestView.slotPicker.confirmSelection')}</Text>
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
              {confirmedMeetingStatus === 'tentative'
                ? t('requestView.successModal.titleTentative')
                : t('requestView.successModal.title')}
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
                    {selectedRequest.requester_name || t('requestView.successModal.defaultUserName')}
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
                    {selectedRequest.duration_minutes || 15} {t('requestView.minutesLabel')}
                  </Text>
                </View>
              </View>
            )}

            {/* Subtle Info Message */}
            <Text style={[styles.successModalMessage, { color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666') }]}>
              {confirmedMeetingStatus === 'tentative'
                ? t('requestView.successModal.conflictMessage')
                : t('requestView.successModal.addedToBothCalendars')}
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
                    pathname: `/events/${eventId}/networking/meeting-detail` as any,
                    params: {
                      meetingId: confirmedMeetingId,
                      speakerName: selectedRequest?.speaker_name || '',
                      requesterName: selectedRequest?.requester_name || '',
                      status: confirmedMeetingStatus,
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
              <Text style={styles.successActionButtonText}>{t('requestView.successModal.viewMeeting')}</Text>
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
                {t('requestView.cancelModal.title')}
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
                {t('requestView.cancelModal.confirmMessage')}
              </Text>
            </View>

            {/* Disclaimer - Compact */}
            <View style={styles.cancelModalDisclaimer}>
              <View style={styles.cancelModalDisclaimerItem}>
                <MaterialIcons name="check-circle" size={14} color={colors.warning?.main || '#FF9800'} />
                <Text style={[styles.cancelModalDisclaimerText, { color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666') }]}>
                  {t('requestView.cancelModal.limitRestored')}
                </Text>
              </View>
              <View style={styles.cancelModalDisclaimerItem}>
                <MaterialIcons name="cancel" size={14} color={colors.error?.main || '#F44336'} />
                <Text style={[styles.cancelModalDisclaimerText, { color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666') }]}>
                  {t('requestView.cancelModal.boostNotRefunded')}
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
                  {t('requestView.cancelModal.keepRequest')}
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
                <Text style={styles.actionButtonText}>{t('requestView.cancelRequest')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Decline Reason Modal */}
      <Modal
        visible={showDeclineModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowDeclineModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[
            styles.cancelModalContent,
            {
              backgroundColor: colors.background?.paper || (isDark ? '#1e1e1e' : '#ffffff'),
              borderColor: colors.divider || (isDark ? '#333333' : '#e0e0e0'),
            }
          ]}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowDeclineModal(false)}
            >
              <MaterialIcons name="close" size={24} color={colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666')} />
            </TouchableOpacity>

            <View style={styles.cancelModalHeader}>
              <View style={[
                styles.warningIconContainer,
                {
                  backgroundColor: isDark ? 'rgba(255, 152, 0, 0.15)' : 'rgba(255, 152, 0, 0.1)',
                }
              ]}>
                <MaterialIcons
                  name="cancel"
                  size={24}
                  color={colors.warning?.main || '#FF9800'}
                />
              </View>
              <Text style={[styles.cancelModalTitle, { color: colors.text?.primary || (isDark ? '#FFFFFF' : '#000000') }]}>
                {t('requestView.declineModal.title')}
              </Text>
            </View>

            <Text style={[styles.cancelModalWarningText, { color: colors.text?.secondary || (isDark ? '#B0B0B0' : '#666666'), marginBottom: 8 }]}>
              {t('requestView.declineModal.description')}
            </Text>

            <TextInput
              style={[
                styles.declineReasonInput,
                {
                  color: colors.text?.primary || (isDark ? '#FFFFFF' : '#1a1a1a'),
                  borderColor: colors.divider || (isDark ? '#404040' : '#e0e0e0'),
                  backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                }
              ]}
              placeholder={t('requestView.declineModal.placeholder')}
              placeholderTextColor={colors.text?.secondary || (isDark ? '#888888' : '#999999')}
              value={declineReason}
              onChangeText={setDeclineReason}
              multiline
              numberOfLines={3}
              maxLength={280}
            />

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
                onPress={() => setShowDeclineModal(false)}
              >
                <Text style={[
                  styles.actionButtonText,
                  { color: colors.text?.primary || (isDark ? '#FFFFFF' : '#1a1a1a') }
                ]}>
                  {t('requestView.declineModal.goBack')}
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
                onPress={() => {
                  if (selectedRequest) {
                    handleDeclineRequest(selectedRequest, declineReason);
                  }
                  setShowDeclineModal(false);
                  setDeclineReason('');
                }}
              >
                <MaterialIcons name="cancel" size={20} color="white" />
                <Text style={styles.actionButtonText}>{t('requestView.decline')}</Text>
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
  detailRowLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  slotPickerTryAgainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  slotPickerTryAgainButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 15,
  },
  slotPickerScheduleLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  slotPickerScheduleLinkButtonText: {
    fontWeight: '600',
    fontSize: 14,
    textDecorationLine: 'underline',
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
  declineReasonInput: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
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
