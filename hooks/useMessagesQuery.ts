import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ChatMessage } from './useRealtimeChat';

interface UseMessagesQueryProps {
  meetingId: string;
  userId: string;
}

export function useMessagesQuery({ meetingId, userId }: UseMessagesQueryProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMessages();
  }, [meetingId, userId]);

  const loadMessages = async () => {
    // Don't load messages if userId is empty or invalid
    if (!userId || userId.trim() === '') {
      console.warn('No valid userId provided to useMessagesQuery');
      setLoading(false);
      setError('User not authenticated');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .rpc('get_meeting_chat_messages', {
          p_meeting_id: meetingId,
          p_user_id: userId,
        });

      if (queryError) {
        setError(queryError.message);
        return;
      }

      if (data && data.success) {
        // Convert database messages to ChatMessage format
        const chatMessages: ChatMessage[] = (data.messages || []).map((msg: any) => ({
          id: msg.id,
          content: msg.message,
          user: {
            name: msg.sender_type === 'speaker' ? 'Speaker' : 'You',
            id: msg.sender_id,
          },
          createdAt: msg.created_at,
          messageType: msg.message_type || 'text',
        }));

        setMessages(chatMessages);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  const storeMessages = async (newMessages: ChatMessage[]) => {
    // Don't store messages if userId is empty or invalid
    if (!userId || userId.trim() === '') {
      console.warn('Cannot store messages: no valid userId provided');
      return;
    }

    try {
      // Store the latest message in the database
      const latestMessage = newMessages[newMessages.length - 1];
      
      const { error } = await supabase
        .rpc('send_meeting_chat_message', {
          p_meeting_id: meetingId,
          p_sender_id: userId,
          p_message: latestMessage.content,
          p_message_type: latestMessage.messageType || 'text',
        });

      if (error) {
        console.error('Error storing message:', error);
      }
    } catch (err) {
      console.error('Error storing messages:', err);
    }
  };

  return {
    data: messages,
    loading,
    error,
    refetch: loadMessages,
    storeMessages,
  };
}
