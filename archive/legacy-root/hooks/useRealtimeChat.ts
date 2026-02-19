import { supabase } from '../lib/supabase';
import { useCallback, useEffect, useState, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { memoryManager } from '../lib/memory-manager';

interface UseRealtimeChatProps {
  roomName: string;
  username: string;
  userId?: string;
  otherParticipantId?: string;
}

export interface ChatMessage {
  id: string;
  content: string;
  user: {
    name: string;
    id: string;
    avatar?: string;
  };
  createdAt: string;
  messageType?: 'text' | 'system' | 'meeting_update';
}

const EVENT_MESSAGE_TYPE = 'message';
const EVENT_PRESENCE_TYPE = 'presence';
const PRESENCE_INTERVAL = 30000; // 30 seconds

export function useRealtimeChat({ roomName, username, userId, otherParticipantId }: UseRealtimeChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [channel, setChannel] = useState<ReturnType<typeof supabase.channel> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [presence, setPresence] = useState<{ [userId: string]: { isOnline: boolean; lastSeen: Date } }>({});
  const presenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const newChannel = supabase.channel(roomName);
    channelRef.current = newChannel;
    
    // Register with memory manager for cleanup
    if (userId) {
      const subscriptionId = `chat-${roomName}-${userId}`;
      memoryManager.registerSubscription(subscriptionId, () => {
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
      });
    }

    // Send presence update helper
    const sendPresenceUpdate = (isOnline: boolean) => {
      if (!newChannel || !userId) return;
      
      newChannel.send({
        type: 'broadcast',
        event: EVENT_PRESENCE_TYPE,
        payload: {
          userId,
          username,
          isOnline,
          lastSeen: new Date().toISOString(),
        },
      });
    };

    newChannel
      .on('broadcast', { event: EVENT_MESSAGE_TYPE }, async (payload) => {
        const newMessage = payload.payload as ChatMessage;
        setMessages((current) => [...current, newMessage]);
        
        // Trigger notification for incoming messages (if not from current user)
        // This handles realtime messages that may not go through the database trigger
        if (userId && newMessage.user.id !== userId && newMessage.user.id !== username) {
          try {
            // Extract meetingId from roomName if possible, or we need to pass it
            // For now, we'll rely on the database trigger, but this ensures realtime notifications
            // The database trigger should handle notifications when messages are stored
            console.log('[RealtimeChat] Incoming message received, notification should be handled by database trigger');
          } catch (error) {
            console.error('[RealtimeChat] Error handling incoming message notification:', error);
          }
        }
      })
      .on('broadcast', { event: EVENT_PRESENCE_TYPE }, (payload) => {
        const presenceData = payload.payload as { userId: string; isOnline: boolean; lastSeen: string };
        setPresence((current) => ({
          ...current,
          [presenceData.userId]: {
            isOnline: presenceData.isOnline,
            lastSeen: new Date(presenceData.lastSeen),
          },
        }));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          setChannel(newChannel);
          // Send initial presence
          if (userId) {
            sendPresenceUpdate(true);
            
            // Set up periodic presence updates
            presenceIntervalRef.current = setInterval(() => {
              sendPresenceUpdate(true);
            }, PRESENCE_INTERVAL);
          }
        } else {
          setIsConnected(false);
          if (presenceIntervalRef.current) {
            clearInterval(presenceIntervalRef.current);
            presenceIntervalRef.current = null;
          }
          // Send offline presence
          if (userId) {
            sendPresenceUpdate(false);
          }
        }
      });

    // Handle app state changes
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        // App came to foreground
        if (userId && newChannel) {
          sendPresenceUpdate(true);
        }
      } else if (nextAppState.match(/inactive|background/)) {
        // App went to background
        if (userId && newChannel) {
          sendPresenceUpdate(false);
        }
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
      if (presenceIntervalRef.current) {
        clearInterval(presenceIntervalRef.current);
        presenceIntervalRef.current = null;
      }
      if (userId && newChannel) {
        sendPresenceUpdate(false);
      }
      supabase.removeChannel(newChannel);
      channelRef.current = null;
      
      // Unregister from memory manager
      if (userId) {
        memoryManager.unregisterSubscription(`chat-${roomName}-${userId}`);
      }
    };
  }, [roomName, username, userId]);

  const sendMessage = useCallback(
    async (content: string, messageType: 'text' | 'system' | 'meeting_update' = 'text') => {
      if (!channel || !isConnected) return;

      const message: ChatMessage = {
        id: crypto.randomUUID(),
        content,
        user: {
          name: username,
          id: username, // In our case, username is the user ID
        },
        createdAt: new Date().toISOString(),
        messageType,
      };

      // Update local state immediately for the sender
      setMessages((current) => [...current, message]);

      await channel.send({
        type: 'broadcast',
        event: EVENT_MESSAGE_TYPE,
        payload: message,
      });
    },
    [channel, isConnected, username]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, sendMessage, isConnected, clearMessages, presence };
}
