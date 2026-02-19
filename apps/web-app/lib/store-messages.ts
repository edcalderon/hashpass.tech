import { supabase } from './supabase';
import { ChatMessage } from '../hooks/useRealtimeChat';

export async function storeMessages(
  messages: ChatMessage[],
  meetingId: string,
  userId: string
): Promise<void> {

  try {
    // Store the latest message in the database
    const latestMessage = messages[messages.length - 1];
    
    const { error } = await supabase
      .rpc('send_meeting_chat_message', {
        p_meeting_id: meetingId,
        p_sender_id: userId,
        p_message: latestMessage.content,
        p_message_type: latestMessage.messageType || 'text',
      });

    if (error) {
      console.error('Error storing message:', error);
      throw new Error(`Failed to store message: ${error.message}`);
    }
  } catch (err) {
    console.error('Error storing messages:', err);
    throw err;
  }
}
