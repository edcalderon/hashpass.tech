import { supabase } from '../lib/supabase';
import { useCallback, useEffect, useState, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { memoryManager } from '@hashpass/utils';
import {
  ensureChatKeyPair,
  fetchParticipantPublicKey,
  encryptChatMessage,
  decryptChatMessage,
} from '../lib/chat-encryption';

interface UseRealtimeChatProps {
  meetingId: string;
  /** Presence-only broadcast channel name -- kept separate from the
   * DB-backed message flow below, since online/offline presence is
   * genuinely ephemeral and has no reason to be persisted. */
  roomName: string;
  username: string;
  /** Real Supabase auth uuid (dbUserId), required for encryption and every
   * chat RPC -- never Better Auth's own user.id. */
  userId: string;
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
  /** True when this row's ciphertext could not be decrypted with the keys
   * currently available on this device (e.g. the sender rotated their key
   * -- new device/reinstall -- after this message was sent). content is a
   * user-facing placeholder in that case, not the real (unrecoverable) text. */
  decryptionFailed?: boolean;
}

const EVENT_PRESENCE_TYPE = 'presence';
const EVENT_MESSAGE_AVAILABLE = 'meeting-chat-message-available';
const PRESENCE_INTERVAL = 30000; // 30 seconds

export function useRealtimeChat({ meetingId, roomName, username, userId, otherParticipantId }: UseRealtimeChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isMessageChannelConnected, setIsMessageChannelConnected] = useState(false);
  const [presence, setPresence] = useState<{ [userId: string]: { isOnline: boolean; lastSeen: Date } }>({});
  const [keysReady, setKeysReady] = useState(false);
  const [otherKeyMissing, setOtherKeyMissing] = useState(false);

  const myPrivateKeyRef = useRef<Uint8Array | null>(null);
  const otherPublicKeyRef = useRef<Uint8Array | null>(null);
  const presenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const refreshMessagesRef = useRef<() => void>(() => undefined);

  const decryptRow = useCallback((row: any): ChatMessage => {
    const priv = myPrivateKeyRef.current;
    const otherPub = otherPublicKeyRef.current;
    const content = priv && otherPub
      ? decryptChatMessage({ ciphertext: row.ciphertext, nonce: row.nonce }, priv, otherPub)
      : null;

    return {
      id: row.id,
      content: content ?? '[Unable to decrypt this message]',
      user: { name: row.sender_id === userId ? username : 'them', id: row.sender_id },
      createdAt: row.created_at,
      messageType: row.message_type || 'text',
      decryptionFailed: content === null,
    };
  }, [userId, username]);

  // --- Key setup: my own device keypair (generated on first use) plus the
  // other participant's published public key. Sending requires both; the
  // other participant's key can be legitimately absent if they've never
  // opened chat on any device yet. ---
  const setupKeys = useCallback(async () => {
    if (!userId) return;
    try {
      myPrivateKeyRef.current = await ensureChatKeyPair(userId);
      if (otherParticipantId) {
        const theirKey = await fetchParticipantPublicKey(otherParticipantId);
        otherPublicKeyRef.current = theirKey;
        setOtherKeyMissing(!theirKey);
      } else {
        setOtherKeyMissing(true);
      }
      setKeysReady(true);
    } catch (err) {
      console.error('[useRealtimeChat] Failed to set up chat keys:', err);
      setError(err instanceof Error ? err.message : 'Failed to set up secure chat');
    }
  }, [userId, otherParticipantId]);

  useEffect(() => {
    setupKeys();
  }, [setupKeys]);

  // --- Message history + realtime delivery, both backed by the same
  // meeting_chat_messages table. A message is only ever visible here once
  // it has actually persisted -- this is what makes delivery asynchronous
  // (a reconnecting client just re-fetches) rather than requiring both
  // participants to be connected at the same instant. ---
  useEffect(() => {
    if (!keysReady || !meetingId || !userId) return;

    let cancelled = false;

    const loadHistory = async (showLoading = false) => {
      try {
        if (showLoading) setLoading(true);
        setError(null);
        const { data, error: rpcError } = await supabase.rpc('get_meeting_chat_messages', {
          p_meeting_id: meetingId,
          p_user_id: userId,
        });
        if (rpcError) throw new Error(rpcError.message);
        if (!data?.success) throw new Error(data?.error || 'Failed to load messages');
        if (cancelled) return;
        const rows = (data.messages || []) as any[];
        setMessages(rows.map(decryptRow));
      } catch (err) {
        if (!cancelled) {
          console.error('[useRealtimeChat] Failed to load chat history:', err);
          setError(err instanceof Error ? err.message : 'Failed to load messages');
        }
      } finally {
        if (!cancelled && showLoading) setLoading(false);
      }
    };

    refreshMessagesRef.current = () => {
      void loadHistory();
    };

    void loadHistory(true);

    const dbChannel = supabase
      .channel(`meeting_chat_messages:${meetingId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'meeting_chat_messages', filter: `meeting_id=eq.${meetingId}` },
        (payload: any) => {
          const decrypted = decryptRow(payload.new);
          setMessages((current) => (current.some((m) => m.id === decrypted.id) ? current : [...current, decrypted]));
        }
      )
      .subscribe((status: string) => {
        if (cancelled) return;
        setIsMessageChannelConnected(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') void loadHistory();
      });

    // Reconcile in the background as a safety net for an interrupted socket
    // or a local Supabase instance that is applying its realtime publication.
    // Normal delivery is still the immediate postgres_changes subscription.
    const reconciliationInterval = setInterval(() => {
      void loadHistory();
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(reconciliationInterval);
      refreshMessagesRef.current = () => undefined;
      setIsMessageChannelConnected(false);
      supabase.removeChannel(dbChannel);
    };
  }, [keysReady, meetingId, userId, decryptRow]);

  // --- Presence: unchanged ephemeral broadcast, deliberately not persisted. ---
  useEffect(() => {
    const newChannel = supabase.channel(roomName);
    presenceChannelRef.current = newChannel;

    if (userId) {
      const subscriptionId = `chat-presence-${roomName}-${userId}`;
      memoryManager.registerSubscription(subscriptionId, () => {
        if (presenceChannelRef.current) {
          supabase.removeChannel(presenceChannelRef.current);
          presenceChannelRef.current = null;
        }
      });
    }

    const sendPresenceUpdate = (isOnline: boolean) => {
      if (!newChannel || !userId) return;
      newChannel.send({
        type: 'broadcast',
        event: EVENT_PRESENCE_TYPE,
        payload: { userId, username, isOnline, lastSeen: new Date().toISOString() },
      });
    };

    newChannel
      .on('broadcast', { event: EVENT_PRESENCE_TYPE }, (payload: { payload: unknown }) => {
        const presenceData = payload.payload as { userId: string; isOnline: boolean; lastSeen: string };
        setPresence((current) => ({
          ...current,
          [presenceData.userId]: { isOnline: presenceData.isOnline, lastSeen: new Date(presenceData.lastSeen) },
        }));
      })
      // Postgres Changes remains the source of truth, but local Supabase
      // instances can subscribe successfully before their publication is
      // active. This broadcast is sent only after the message RPC persisted
      // a row, so it gives the peer an immediate, encrypted-history refresh
      // without exposing message content in the realtime payload.
      .on('broadcast', { event: EVENT_MESSAGE_AVAILABLE }, () => {
        refreshMessagesRef.current();
      })
      .subscribe(async (status: string) => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          if (userId) {
            sendPresenceUpdate(true);
            presenceIntervalRef.current = setInterval(() => sendPresenceUpdate(true), PRESENCE_INTERVAL);
          }
        } else {
          setIsConnected(false);
          if (presenceIntervalRef.current) {
            clearInterval(presenceIntervalRef.current);
            presenceIntervalRef.current = null;
          }
          if (userId) sendPresenceUpdate(false);
        }
      });

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        if (userId) sendPresenceUpdate(true);
      } else if (nextAppState.match(/inactive|background/)) {
        if (userId) sendPresenceUpdate(false);
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
      if (presenceIntervalRef.current) {
        clearInterval(presenceIntervalRef.current);
        presenceIntervalRef.current = null;
      }
      if (userId) sendPresenceUpdate(false);
      supabase.removeChannel(newChannel);
      presenceChannelRef.current = null;
      if (userId) memoryManager.unregisterSubscription(`chat-presence-${roomName}-${userId}`);
    };
  }, [roomName, username, userId]);

  const sendMessage = useCallback(
    async (content: string, messageType: 'text' | 'system' | 'meeting_update' = 'text') => {
      const priv = myPrivateKeyRef.current;
      const otherPub = otherPublicKeyRef.current;
      if (!priv) throw new Error('Chat keys are not ready yet');
      if (!otherPub) {
        // The other participant may have opened chat for the first time
        // since this hook last checked -- try once more before giving up.
        if (otherParticipantId) {
          const theirKey = await fetchParticipantPublicKey(otherParticipantId);
          if (theirKey) {
            otherPublicKeyRef.current = theirKey;
            setOtherKeyMissing(false);
          } else {
            throw new Error('The other participant has not set up secure chat yet');
          }
        } else {
          throw new Error('The other participant has not set up secure chat yet');
        }
      }

      const { ciphertext, nonce } = encryptChatMessage(content, priv, otherPublicKeyRef.current!);

      const { data, error: rpcError } = await supabase.rpc('send_meeting_chat_message', {
        p_meeting_id: meetingId,
        p_sender_id: userId,
        p_ciphertext: ciphertext,
        p_nonce: nonce,
        p_message_type: messageType,
      });
      if (rpcError) throw new Error(rpcError.message);
      if (!data?.success) throw new Error(data?.error || 'Failed to send message');

      // Notify the other open chat immediately. The recipient fetches the
      // persisted ciphertext through its authorized history RPC; no plaintext
      // or encryption material crosses the broadcast channel.
      try {
        await presenceChannelRef.current?.send({
          type: 'broadcast',
          event: EVENT_MESSAGE_AVAILABLE,
          payload: { meetingId, messageId: data.id },
        });
      } catch (broadcastError) {
        // Persistence already succeeded; postgres_changes and the bounded
        // reconciliation refresh will still deliver the message.
        console.warn('[useRealtimeChat] Message broadcast failed:', broadcastError);
      }

      // Optimistic append -- the sender already knows the plaintext, no
      // need to wait for the realtime echo (which is de-duped by id above
      // if it does arrive).
      setMessages((current) => (current.some((m) => m.id === data.id) ? current : [
        ...current,
        {
          id: data.id,
          content,
          user: { name: username, id: userId },
          createdAt: data.created_at,
          messageType,
        },
      ]));
    },
    [meetingId, userId, username, otherParticipantId]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    sendMessage,
    isConnected: isConnected && isMessageChannelConnected,
    clearMessages,
    presence,
    loading,
    error,
    keysReady,
    otherKeyMissing,
  };
}
