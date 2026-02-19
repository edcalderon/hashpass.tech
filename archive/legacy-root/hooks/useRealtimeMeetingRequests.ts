import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { AppState, AppStateStatus } from 'react-native';
import * as Haptics from 'expo-haptics';
import { MeetingRequest } from '@/types/networking';
import { memoryManager } from '../lib/memory-manager';

export interface RequestWithDirection extends MeetingRequest {
  _direction?: 'sent' | 'incoming';
  speaker_image?: string | null;
  requester_avatar?: string;
  requester_full_name?: string;
  requester_email?: string;
}

interface UseRealtimeMeetingRequestsProps {
  userId: string;
  onRequestInserted: (request: RequestWithDirection) => void;
  onRequestUpdated: (request: RequestWithDirection, oldStatus?: string) => void;
  onRequestDeleted: (requestId: string) => void;
  onError?: (error: Error) => void;
}

export function useRealtimeMeetingRequests({
  userId,
  onRequestInserted,
  onRequestUpdated,
  onRequestDeleted,
  onError,
}: UseRealtimeMeetingRequestsProps) {
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSubscribedRef = useRef(false);

  // Helper to fetch full request data
  const fetchFullRequest = useCallback(async (requestId: string): Promise<RequestWithDirection | null> => {
    try {
      const { data, error } = await supabase
        .from('meeting_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (error) {
        console.error('Error fetching full request:', error);
        return null;
      }

      return data as RequestWithDirection;
    } catch (error) {
      console.error('Error in fetchFullRequest:', error);
      return null;
    }
  }, []);

  // Setup subscriptions
  const setupSubscriptions = useCallback(() => {
    if (!userId || isSubscribedRef.current) {
      console.log('⏭️ Skipping subscription setup:', { userId, isSubscribed: isSubscribedRef.current });
      return;
    }

    console.log('🔄 Setting up real-time subscriptions for meeting requests...');

    // Clean up existing channels
    channelsRef.current.forEach(channel => {
      supabase.removeChannel(channel);
    });
    channelsRef.current = [];

    // Channel 1: SENT requests (where user is requester)
    const sentChannel = supabase
      .channel(`meeting_requests_sent_${userId}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_requests',
          filter: `requester_id=eq.${userId}`,
        },
        async (payload) => {
          console.log('📨 SENT request event:', payload.eventType, payload.new?.id || payload.old?.id);

          try {
            if (payload.eventType === 'INSERT') {
              const newRequest = payload.new as any;
              console.log('✅ New SENT request:', newRequest.id);
              
              // Fetch speaker image
              let speakerImage = null;
              try {
                const { data: speakerData } = await supabase
                  .from('bsl_speakers')
                  .select('imageurl')
                  .eq('user_id', newRequest.speaker_id)
                  .single();
                speakerImage = speakerData?.imageurl || null;
              } catch (e) {
                console.log('Could not fetch speaker image:', e);
              }

              const enrichedRequest: RequestWithDirection = {
                ...newRequest,
                _direction: 'sent',
                speaker_image: speakerImage,
              };

              onRequestInserted(enrichedRequest);
              
              // Haptic feedback
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch (e) {
                // Ignore haptic errors
              }
            } else if (payload.eventType === 'UPDATE') {
              const updatedRequest = payload.new as any;
              const oldRequest = payload.old as any;
              const oldStatus = oldRequest?.status;
              const newStatus = updatedRequest?.status;

              console.log('🔄 SENT request UPDATE:', {
                id: updatedRequest.id,
                oldStatus,
                newStatus,
              });

              // Always fetch full request data to ensure we have the latest state
              const fullRequest = await fetchFullRequest(updatedRequest.id);
              
              if (fullRequest) {
                // Get speaker image
                let speakerImage = null;
                try {
                  const { data: speakerData } = await supabase
                    .from('bsl_speakers')
                    .select('imageurl')
                    .eq('user_id', fullRequest.speaker_id)
                    .single();
                  speakerImage = speakerData?.imageurl || null;
                } catch (e) {
                  console.log('Could not fetch speaker image for update:', e);
                }

                const enrichedRequest: RequestWithDirection = {
                  ...fullRequest,
                  _direction: 'sent',
                  speaker_image: speakerImage,
                };

                console.log('📤 Calling onRequestUpdated for SENT request:', enrichedRequest.id, 'status:', enrichedRequest.status);
                onRequestUpdated(enrichedRequest, oldStatus);

                // Enhanced haptic feedback for status changes
                if (oldStatus !== newStatus) {
                  try {
                    if (newStatus === 'accepted') {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      setTimeout(() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      }, 100);
                    } else if (newStatus === 'declined' || newStatus === 'rejected') {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    } else if (newStatus === 'cancelled' || newStatus === 'expired') {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    }
                  } catch (e) {
                    // Ignore haptic errors
                  }
                }
              } else {
                // Fallback: use payload data with enrichment
                console.warn('⚠️ Could not fetch full request, using payload data');
                const enrichedRequest: RequestWithDirection = {
                  ...updatedRequest,
                  _direction: 'sent',
                };
                onRequestUpdated(enrichedRequest, oldStatus);
              }
            } else if (payload.eventType === 'DELETE') {
              const deletedRequest = payload.old as any;
              console.log('🗑️ SENT request DELETED:', deletedRequest.id);
              onRequestDeleted(deletedRequest.id);
              
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              } catch (e) {
                // Ignore haptic errors
              }
            }
          } catch (error) {
            console.error('Error handling SENT request event:', error);
            onError?.(error as Error);
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 SENT requests subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to SENT meeting requests');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('❌ SENT requests subscription error:', status);
          // Attempt to reconnect after a delay
          setTimeout(() => {
            isSubscribedRef.current = false;
            setupSubscriptions();
          }, 3000);
        }
      });

    channelsRef.current.push(sentChannel);

    // Channel 2: INCOMING requests (where user is speaker)
    // Note: meeting_requests.speaker_id is UUID (user_id), not bsl_speakers.id
    const incomingChannel = supabase
      .channel(`meeting_requests_incoming_${userId}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meeting_requests',
          filter: `speaker_id=eq.${userId}`,
        },
        async (payload) => {
          console.log('📥 INCOMING request event:', payload.eventType, payload.new?.id || payload.old?.id);

          try {
            if (payload.eventType === 'INSERT') {
              const newRequest = payload.new as any;
              console.log('✅ New INCOMING request:', newRequest.id);

              // Generate requester avatar
              const requesterName = newRequest.requester_name || 'User';
              const requesterAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(requesterName.toLowerCase().replace(/\s+/g, '-'))}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

              const enrichedRequest: RequestWithDirection = {
                ...newRequest,
                _direction: 'incoming',
                requester_avatar: requesterAvatar,
                requester_full_name: requesterName,
                requester_email: newRequest.requester_name || '',
              };

              onRequestInserted(enrichedRequest);

              // Haptic feedback
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              } catch (e) {
                // Ignore haptic errors
              }
            } else if (payload.eventType === 'UPDATE') {
              const updatedRequest = payload.new as any;
              const oldRequest = payload.old as any;
              const oldStatus = oldRequest?.status;
              const newStatus = updatedRequest?.status;

              console.log('🔄 INCOMING request UPDATE:', {
                id: updatedRequest.id,
                oldStatus,
                newStatus,
              });

              // Always fetch full request data to ensure we have the latest state
              const fullRequest = await fetchFullRequest(updatedRequest.id);

              if (fullRequest) {
                // Generate requester avatar if needed
                const requesterName = fullRequest.requester_name || 'User';
                const requesterAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(requesterName.toLowerCase().replace(/\s+/g, '-'))}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

                const enrichedRequest: RequestWithDirection = {
                  ...fullRequest,
                  _direction: 'incoming',
                  requester_avatar: requesterAvatar,
                  requester_full_name: requesterName,
                  requester_email: fullRequest.requester_name || '',
                };

                console.log('📥 Calling onRequestUpdated for INCOMING request:', enrichedRequest.id, 'status:', enrichedRequest.status);
                onRequestUpdated(enrichedRequest, oldStatus);

                // Haptic feedback for status changes
                if (oldStatus !== newStatus) {
                  try {
                    if (newStatus === 'accepted') {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    } else if (newStatus === 'declined' || newStatus === 'rejected') {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    } else if (newStatus === 'cancelled' || newStatus === 'expired') {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    }
                  } catch (e) {
                    // Ignore haptic errors
                  }
                }
              } else {
                // Fallback: use payload data with enrichment
                console.warn('⚠️ Could not fetch full request, using payload data');
                const requesterName = updatedRequest.requester_name || 'User';
                const requesterAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(requesterName.toLowerCase().replace(/\s+/g, '-'))}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
                const enrichedRequest: RequestWithDirection = {
                  ...updatedRequest,
                  _direction: 'incoming',
                  requester_avatar: requesterAvatar,
                  requester_full_name: requesterName,
                  requester_email: updatedRequest.requester_name || '',
                };
                onRequestUpdated(enrichedRequest, oldStatus);
              }
            } else if (payload.eventType === 'DELETE') {
              const deletedRequest = payload.old as any;
              console.log('🗑️ INCOMING request DELETED:', deletedRequest.id);
              onRequestDeleted(deletedRequest.id);

              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              } catch (e) {
                // Ignore haptic errors
              }
            }
          } catch (error) {
            console.error('Error handling INCOMING request event:', error);
            onError?.(error as Error);
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 INCOMING requests subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to INCOMING meeting requests');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('❌ INCOMING requests subscription error:', status);
          // Attempt to reconnect after a delay
          setTimeout(() => {
            isSubscribedRef.current = false;
            setupSubscriptions();
          }, 3000);
        }
      });

    channelsRef.current.push(incomingChannel);

    // Channel 3: Notifications (fallback mechanism)
    const notificationChannel = supabase
      .channel(`meeting_requests_notifications_${userId}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          const notification = payload.new as any;
          console.log('🔔 Notification received:', notification.type, notification.related_id);

          // Handle meeting-related notifications
          if (
            notification.type === 'meeting_accepted' ||
            notification.type === 'meeting_declined' ||
            notification.type === 'meeting_rejected' ||
            notification.type === 'meeting_request'
          ) {
            const requestId = notification.related_id;
            if (requestId) {
              console.log('🔄 Notification triggered request update:', requestId);
              const fullRequest = await fetchFullRequest(requestId);
              if (fullRequest) {
                // Determine direction based on requester_id
                const direction = fullRequest.requester_id === userId ? 'sent' : 'incoming';
                
                // Enrich request based on direction
                let enrichedRequest: RequestWithDirection = { ...fullRequest, _direction: direction };
                
                if (direction === 'sent') {
                  // Get speaker image
                  try {
                    const { data: speakerData } = await supabase
                      .from('bsl_speakers')
                      .select('imageurl')
                      .eq('user_id', fullRequest.speaker_id)
                      .single();
                    enrichedRequest.speaker_image = speakerData?.imageurl || null;
                  } catch (e) {
                    // Ignore error
                  }
                } else {
                  // Generate requester avatar
                  const requesterName = fullRequest.requester_name || 'User';
                  enrichedRequest.requester_avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(requesterName.toLowerCase().replace(/\s+/g, '-'))}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;
                  enrichedRequest.requester_full_name = requesterName;
                  enrichedRequest.requester_email = fullRequest.requester_name || '';
                }

                console.log('🔔 Notification triggered request update:', requestId, 'direction:', direction, 'status:', enrichedRequest.status);
                onRequestUpdated(enrichedRequest);
              } else {
                console.warn('⚠️ Could not fetch request from notification:', requestId);
              }
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 Notifications subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to notifications');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('⚠️ Notifications channel error:', status);
        }
      });

    channelsRef.current.push(notificationChannel);

    // Register with memory manager for cleanup
    const subscriptionId = `meeting-requests-${userId}`;
    memoryManager.registerSubscription(subscriptionId, () => {
      channelsRef.current.forEach(channel => {
        supabase.removeChannel(channel);
      });
      channelsRef.current = [];
      isSubscribedRef.current = false;
    });

    isSubscribedRef.current = true;
  }, [userId, onRequestInserted, onRequestUpdated, onRequestDeleted, onError, fetchFullRequest]);

  // Handle app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextAppState;

      // If app came to foreground, ensure subscriptions are active
      if (previousState.match(/inactive|background/) && nextAppState === 'active') {
        console.log('📱 App came to foreground, checking subscriptions...');
        if (!isSubscribedRef.current) {
          setupSubscriptions();
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [setupSubscriptions]);

  // Setup subscriptions on mount and when userId changes
  useEffect(() => {
    if (!userId) {
      console.log('⏭️ No userId, skipping subscription setup');
      return;
    }

    setupSubscriptions();

    // Cleanup function
    return () => {
      console.log('🧹 Cleaning up real-time subscriptions...');
      channelsRef.current.forEach(channel => {
        supabase.removeChannel(channel);
      });
      channelsRef.current = [];
      isSubscribedRef.current = false;

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [userId, setupSubscriptions]);

  return {
    isSubscribed: isSubscribedRef.current,
    reconnect: () => {
      isSubscribedRef.current = false;
      setupSubscriptions();
    },
  };
}

