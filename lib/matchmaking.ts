import { supabase } from './supabase';
import { passSystemService, PassRequestLimits } from './pass-system';

export interface MeetingRequest {
  id: string;
  requester_id: string;
  speaker_id: string;
  speaker_name: string;
  requester_name: string;
  requester_company?: string;
  requester_title?: string;
  requester_ticket_type: 'general' | 'business' | 'vip';
  
  // Meeting Details
  preferred_date?: string;
  preferred_time?: string;
  duration_minutes: number;
  meeting_type: 'networking' | 'business' | 'mentorship' | 'collaboration';
  
  // Request Content
  message: string;
  note?: string;
  boost_amount: number;
  boost_transaction_hash?: string;
  
  // Status and Timing
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'completed' | 'cancelled';
  priority_score: number;
  
  // Availability Window
  availability_window_start?: string;
  availability_window_end?: string;
  
  // Response Details
  speaker_response?: string;
  speaker_response_at?: string;
  meeting_scheduled_at?: string;
  meeting_location?: string;
  
  // Metadata
  created_at: string;
  updated_at: string;
  expires_at: string;
}

export interface SpeakerAvailability {
  id: string;
  speaker_id: string;
  speaker_name: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  max_meetings_per_slot: number;
  current_meetings_count: number;
  is_available: boolean;
  requires_vip_ticket: boolean;
  requires_business_ticket: boolean;
  allows_general_ticket: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateMeetingRequestData {
  requester_id: string;
  speaker_id: string;
  speaker_name: string;
  requester_name: string;
  requester_company?: string;
  requester_title?: string;
  requester_ticket_type: 'general' | 'business' | 'vip';
  preferred_date?: string;
  preferred_time?: string;
  duration_minutes?: number;
  meeting_type: 'networking' | 'business' | 'mentorship' | 'collaboration';
  message: string;
  note?: string;
  boost_amount?: number;
  boost_transaction_hash?: string;
}

export interface BoostTransaction {
  amount: number;
  token_symbol: string;
  transaction_hash: string;
  block_number?: number;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface UserRequestLimits {
  id: string;
  user_id: string;
  event_id: string;
  ticket_type: 'general' | 'business' | 'vip';
  total_requests_sent: number;
  successful_requests: number;
  rejected_requests: number;
  last_request_at?: string;
  next_request_allowed_at?: string;
  total_boosts_used: number;
  total_boost_amount: number;
}

export interface SpeedDatingChat {
  id: string;
  meeting_request_id: string;
  user_id: string;
  speaker_id: string;
  chat_duration_minutes: number;
  started_at: string;
  ended_at?: string;
  status: 'active' | 'ended' | 'cancelled';
}

export interface ChatMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  message: string;
  message_type: 'text' | 'image' | 'file' | 'system';
  is_read: boolean;
  read_at?: string;
  created_at: string;
}

class MatchmakingService {
  // Create a new meeting request
  async createMeetingRequest(data: CreateMeetingRequestData): Promise<MeetingRequest> {
    console.log('🔵 Creating meeting request with data:', data);
    
    // Validate UUID format for requester_id (must be from auth.users)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (!uuidRegex.test(data.requester_id)) {
      console.error('❌ Invalid requester_id format:', data.requester_id);
      throw new Error(`Invalid requester_id format: ${data.requester_id}. Must be a valid UUID.`);
    }
    
    // For speaker_id, we now use the original text format from BSL_Speakers
    // No conversion needed since the database now accepts text IDs
    const speakerId = data.speaker_id;
    console.log('🔵 Using speaker_id as-is:', speakerId);
    
    // Check if user can make meeting request (pass validation)
    console.log('🔵 Checking pass validation...');
    const passLimits = await passSystemService.canMakeMeetingRequest(
      data.requester_id,
      speakerId,
      data.boost_amount || 0
    );
    
    if (!passLimits.can_request) {
      console.error('❌ Pass validation failed:', passLimits.reason);
      throw new Error(`Cannot create meeting request: ${passLimits.reason}`);
    }
    
    console.log('✅ Pass validation passed:', {
      passType: passLimits.pass_type,
      remainingRequests: passLimits.remaining_requests,
      remainingBoost: passLimits.remaining_boost
    });
    
    const insertData = {
      ...data,
      speaker_id: speakerId, // Use the converted speaker ID
      duration_minutes: data.duration_minutes || 15,
      boost_amount: data.boost_amount || 0,
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(), // 3 days
    };
    
    console.log('🔵 Insert data:', insertData);
    
    try {
      // Use the RPC function with TEXT input (compatible with current function)
      const { data: result, error } = await supabase
        .rpc('insert_meeting_request', {
          p_requester_id: data.requester_id.toString(), // Pass as TEXT string
          p_speaker_id: speakerId,
          p_speaker_name: data.speaker_name,
          p_requester_name: data.requester_name,
          p_requester_company: data.requester_company || null,
          p_requester_title: data.requester_title || null,
          p_requester_ticket_type: data.requester_ticket_type,
          p_meeting_type: data.meeting_type,
          p_message: data.message || '',
          p_note: data.note || null,
          p_boost_amount: data.boost_amount || 0,
          p_duration_minutes: data.duration_minutes || 15
        })
        .single();

      if (error) {
        // Handle specific error cases
        if (error.message.includes('Could not find the table')) {
          throw new Error('Database table not found. Please try again later.');
        } else if (error.code === 'PGRST301') {
          throw new Error('You are not authorized to perform this action.');
        } else if (error.code === '23505') {
          throw new Error('A meeting request already exists for this speaker.');
        } else if (error.code === '22P02') {
          throw new Error('Invalid data format. Please refresh the page and try again.');
        } else if (error.code === '400' || error.message.includes('400')) {
          throw new Error('Invalid request data. Please check your information and try again.');
        } else if (error.message.includes('invalid input syntax for type uuid')) {
          throw new Error('Invalid speaker or user ID format. Please refresh the page and try again.');
        } else if (error.code === '23503' || error.message.includes('Key is not present in table')) {
          console.log('🟡 Speaker not found in database, showing demo mode');
          // Return a mock success response for demo speakers
          return {
            id: `demo-${Date.now()}`,
            requester_id: insertData.requester_id,
            speaker_id: insertData.speaker_id,
            speaker_name: insertData.speaker_name,
            requester_name: insertData.requester_name,
            requester_company: insertData.requester_company,
            requester_title: insertData.requester_title,
            requester_ticket_type: insertData.requester_ticket_type,
            meeting_type: insertData.meeting_type,
            message: insertData.message,
            note: insertData.note,
            boost_amount: insertData.boost_amount,
            duration_minutes: insertData.duration_minutes,
            expires_at: insertData.expires_at,
            status: 'pending',
            priority_score: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        }
        
        throw new Error(`Failed to create meeting request: ${error.message}`);
      }

      // Handle the JSON response from the function
      if (result && typeof result === 'object' && 'success' in result) {
        if ((result as any).success === false) {
          console.error('❌ Function returned error:', (result as any).error);
          throw new Error(`Failed to create meeting request: ${(result as any).error}`);
        }
        
        if ((result as any).success === true && (result as any).request_id) {
          console.log('✅ Meeting request created successfully with ID:', (result as any).request_id);
          
          // Fetch the created request from the database to get all fields
          const { data: createdRequest, error: fetchError } = await supabase
            .from('meeting_requests')
            .select('*')
            .eq('id', (result as any).request_id)
            .single();
          
          if (fetchError) {
            console.error('❌ Error fetching created request:', fetchError);
            throw new Error(`Failed to fetch created meeting request: ${fetchError.message}`);
          }
          
          return createdRequest as MeetingRequest;
        }
      }
      
      // Fallback: if result is not in expected format, treat as success
      console.log('✅ Meeting request created successfully (fallback):', result);
      return result as MeetingRequest;
    } catch (error) {
      console.error('❌ Error in createMeetingRequest:', error);
      throw error;
    }
  }

  // Get meeting requests for a user (as requester or speaker)
  async getMeetingRequests(userId: string): Promise<MeetingRequest[]> {
    const { data, error } = await supabase
      .from('meeting_requests')
      .select('*')
      .or(`requester_id.eq.${userId},speaker_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch meeting requests: ${error.message}`);
    }

    return data || [];
  }

  // Get user's pass information
  async getUserPassInfo(userId: string) {
    return await passSystemService.getUserPassInfo(userId);
  }

  // Check if user can make meeting request
  async canMakeMeetingRequest(userId: string, speakerId: string, boostAmount: number = 0) {
    return await passSystemService.canMakeMeetingRequest(userId, speakerId, boostAmount);
  }

  // Create default pass for user
  async createDefaultPass(userId: string, passType: 'general' | 'business' | 'vip' = 'general') {
    return await passSystemService.createDefaultPass(userId, passType);
  }

  // Get pending meeting requests for a speaker
  async getPendingRequestsForSpeaker(speakerId: string): Promise<MeetingRequest[]> {
    const { data, error } = await supabase
      .from('meeting_requests')
      .select('*')
      .eq('speaker_id', speakerId)
      .eq('status', 'pending')
      .order('priority_score', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch pending requests: ${error.message}`);
    }

    return data || [];
  }

  // Update meeting request status
  async updateMeetingRequestStatus(
    requestId: string, 
    status: MeetingRequest['status'],
    speakerResponse?: string,
    meetingScheduledAt?: string,
    meetingLocation?: string
  ): Promise<MeetingRequest> {
    const updateData: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (speakerResponse) {
      updateData.speaker_response = speakerResponse;
      updateData.speaker_response_at = new Date().toISOString();
    }

    if (meetingScheduledAt) {
      updateData.meeting_scheduled_at = meetingScheduledAt;
    }

    if (meetingLocation) {
      updateData.meeting_location = meetingLocation;
    }

    const { data, error } = await supabase
      .from('meeting_requests')
      .update(updateData)
      .eq('id', requestId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update meeting request: ${error.message}`);
    }

    return data;
  }

  // Get speaker availability
  async getSpeakerAvailability(speakerId: string, date?: string): Promise<SpeakerAvailability[]> {
    let query = supabase
      .from('speaker_availability')
      .select('*')
      .eq('speaker_id', speakerId)
      .eq('is_available', true)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (date) {
      query = query.eq('date', date);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch speaker availability: ${error.message}`);
    }

    return data || [];
  }

  // Create speaker availability slots
  async createSpeakerAvailability(availability: Omit<SpeakerAvailability, 'id' | 'created_at' | 'updated_at'>): Promise<SpeakerAvailability> {
    const { data, error } = await supabase
      .from('speaker_availability')
      .insert([availability])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create speaker availability: ${error.message}`);
    }

    return data;
  }

  // Update speaker availability
  async updateSpeakerAvailability(
    availabilityId: string, 
    updates: Partial<SpeakerAvailability>
  ): Promise<SpeakerAvailability> {
    const { data, error } = await supabase
      .from('speaker_availability')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', availabilityId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update speaker availability: ${error.message}`);
    }

    return data;
  }

  // Check if user can request meeting based on ticket type, availability, and request limits
  async canRequestMeeting(
    speakerId: string, 
    ticketType: 'general' | 'business' | 'vip',
    preferredDate?: string,
    preferredTime?: string
  ): Promise<{ canRequest: boolean; reason?: string; availableSlots?: SpeakerAvailability[] }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { canRequest: false, reason: 'User not authenticated' };
      }

      // Check request limits using database function
      const { data: canSend, error: limitError } = await supabase.rpc('can_send_meeting_request', {
        p_user_id: user.id,
        p_event_id: 'bsl2025',
        p_ticket_type: ticketType
      });

      if (limitError) {
        console.error('Error checking request limits:', limitError);
        return { canRequest: false, reason: 'Unable to verify request limits' };
      }

      if (!canSend) {
        // Get user's current request limits for detailed error message
        const { data: limits } = await supabase
          .from('user_request_limits')
          .select('*')
          .eq('user_id', user.id)
          .eq('event_id', 'bsl2025')
          .single();

        if (limits) {
          const requestLimit = ticketType === 'general' ? 1 : ticketType === 'business' ? 3 : 999999;
          if (limits.total_requests_sent >= requestLimit) {
            return {
              canRequest: false,
              reason: `You have reached your ${ticketType} ticket limit of ${requestLimit} request${requestLimit > 1 ? 's' : ''}. Use $VOI boost for additional requests.`
            };
          }
          
          if (limits.next_request_allowed_at && new Date(limits.next_request_allowed_at) > new Date()) {
            const nextAllowed = new Date(limits.next_request_allowed_at);
            return {
              canRequest: false,
              reason: `You can send your next request in ${Math.ceil((nextAllowed.getTime() - Date.now()) / (1000 * 60))} minutes.`
            };
          }
        }
      }

      // Check if user already has a pending request to this speaker
      const { data: existingRequests } = await supabase
        .from('meeting_requests')
        .select('id')
        .eq('requester_id', user.id)
        .eq('speaker_id', speakerId)
        .eq('status', 'pending');

      if (existingRequests && existingRequests.length > 0) {
        return {
          canRequest: false,
          reason: 'You already have a pending meeting request with this speaker'
        };
      }

      // Get speaker availability
      const availability = await this.getSpeakerAvailability(speakerId, preferredDate);
      
      if (availability.length === 0) {
        return {
          canRequest: false,
          reason: 'Speaker has no available time slots'
        };
      }

      // Filter availability based on ticket type
      const accessibleSlots = availability.filter(slot => {
        if (slot.requires_vip_ticket && ticketType !== 'vip') return false;
        if (slot.requires_business_ticket && !['business', 'vip'].includes(ticketType)) return false;
        if (!slot.allows_general_ticket && ticketType === 'general') return false;
        return true;
      });

      if (accessibleSlots.length === 0) {
        return {
          canRequest: false,
          reason: `Your ${ticketType} ticket doesn't provide access to this speaker's available time slots`
        };
      }

      // Check if specific time slot is available
      if (preferredDate && preferredTime) {
        const specificSlot = accessibleSlots.find(slot => 
          slot.date === preferredDate && 
          slot.start_time <= preferredTime && 
          slot.end_time >= preferredTime &&
          slot.current_meetings_count < slot.max_meetings_per_slot
        );

        if (!specificSlot) {
          return {
            canRequest: false,
            reason: 'The requested time slot is not available',
            availableSlots: accessibleSlots
          };
        }
      }

      return {
        canRequest: true,
        availableSlots: accessibleSlots
      };
    } catch (error) {
      return {
        canRequest: false,
        reason: 'Unable to verify availability'
      };
    }
  }

  // Get meeting statistics for a speaker
  async getSpeakerMeetingStats(speakerId: string): Promise<{
    totalRequests: number;
    pendingRequests: number;
    acceptedRequests: number;
    declinedRequests: number;
    averageResponseTime: number;
  }> {
    const { data, error } = await supabase
      .from('meeting_requests')
      .select('status, created_at, speaker_response_at')
      .eq('speaker_id', speakerId);

    if (error) {
      throw new Error(`Failed to fetch meeting stats: ${error.message}`);
    }

    const stats = {
      totalRequests: data.length,
      pendingRequests: data.filter(r => r.status === 'pending').length,
      acceptedRequests: data.filter(r => r.status === 'accepted').length,
      declinedRequests: data.filter(r => r.status === 'declined').length,
      averageResponseTime: 0,
    };

    // Calculate average response time
    const respondedRequests = data.filter(r => r.speaker_response_at);
    if (respondedRequests.length > 0) {
      const totalResponseTime = respondedRequests.reduce((sum, request) => {
        const responseTime = new Date(request.speaker_response_at!).getTime() - new Date(request.created_at).getTime();
        return sum + responseTime;
      }, 0);
      stats.averageResponseTime = totalResponseTime / respondedRequests.length / (1000 * 60 * 60); // in hours
    }

    return stats;
  }

  // Expire old meeting requests (should be called periodically)
  async expireOldRequests(): Promise<number> {
    const { data, error } = await supabase.rpc('expire_old_meeting_requests');

    if (error) {
      throw new Error(`Failed to expire old requests: ${error.message}`);
    }

    return data || 0;
  }

  // Create boost transaction
  async createBoostTransaction(
    meetingRequestId: string,
    transaction: BoostTransaction
  ): Promise<void> {
    const { error } = await supabase
      .from('boost_transactions')
      .insert([{
        meeting_request_id: meetingRequestId,
        amount: transaction.amount,
        token_symbol: transaction.token_symbol,
        transaction_hash: transaction.transaction_hash,
        block_number: transaction.block_number,
        status: transaction.status,
      }]);

    if (error) {
      throw new Error(`Failed to create boost transaction: ${error.message}`);
    }
  }

  // Verify boost transaction
  async verifyBoostTransaction(transactionHash: string): Promise<boolean> {
    // In a real implementation, this would verify the transaction on the blockchain
    // For now, we'll simulate verification
    try {
      // Simulate blockchain verification delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update transaction status
      const { error } = await supabase
        .from('boost_transactions')
        .update({ 
          status: 'confirmed',
          confirmation_count: 1,
          confirmed_at: new Date().toISOString()
        })
        .eq('transaction_hash', transactionHash);

      if (error) {
        console.error('Error updating boost transaction:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error verifying boost transaction:', error);
      return false;
    }
  }

  // Get user request limits
  async getUserRequestLimits(userId: string, eventId: string = 'bsl2025'): Promise<UserRequestLimits | null> {
    try {
      const { data, error } = await supabase
        .from('user_request_limits')
        .select('*')
        .eq('user_id', userId)
        .eq('event_id', eventId);

      if (error) {
        // If table doesn't exist, return null instead of throwing error
        if (error.message.includes('Could not find the table') || error.message.includes('schema cache')) {
          console.warn('user_request_limits table not found, using default limits');
          return null;
        }
        throw new Error(`Failed to fetch user request limits: ${error.message}`);
      }

      // Return the first row if exists, otherwise null
      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      // Handle any other errors gracefully
      console.warn('Error fetching user request limits:', error);
      return null;
    }
  }

  // Get speed dating chat for a meeting request
  async getSpeedDatingChat(meetingRequestId: string): Promise<SpeedDatingChat | null> {
    const { data, error } = await supabase
      .from('speed_dating_chats')
      .select('*')
      .eq('meeting_request_id', meetingRequestId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to fetch speed dating chat: ${error.message}`);
    }

    return data;
  }

  // Get chat messages for a speed dating chat
  async getChatMessages(chatId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch chat messages: ${error.message}`);
    }

    return data || [];
  }

  // Send a message in speed dating chat
  async sendChatMessage(
    chatId: string, 
    senderId: string, 
    message: string, 
    messageType: 'text' | 'image' | 'file' = 'text'
  ): Promise<ChatMessage> {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert([{
        chat_id: chatId,
        sender_id: senderId,
        message,
        message_type: messageType
      }])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to send chat message: ${error.message}`);
    }

    return data;
  }

  // End speed dating chat
  async endSpeedDatingChat(chatId: string): Promise<SpeedDatingChat> {
    const { data, error } = await supabase
      .from('speed_dating_chats')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', chatId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to end speed dating chat: ${error.message}`);
    }

    return data;
  }

  // Mark chat message as read
  async markChatMessageAsRead(messageId: string): Promise<void> {
    const { error } = await supabase
      .from('chat_messages')
      .update({
        is_read: true,
        read_at: new Date().toISOString()
      })
      .eq('id', messageId);

    if (error) {
      throw new Error(`Failed to mark message as read: ${error.message}`);
    }
  }

  // Get user's active speed dating chats
  async getUserActiveChats(userId: string): Promise<SpeedDatingChat[]> {
    const { data, error } = await supabase
      .from('speed_dating_chats')
      .select('*')
      .or(`user_id.eq.${userId},speaker_id.eq.${userId}`)
      .eq('status', 'active')
      .order('started_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch active chats: ${error.message}`);
    }

    return data || [];
  }

  // Get request limits summary for user
  async getRequestLimitsSummary(userId: string, eventId: string = 'bsl2025'): Promise<{
    ticketType: 'general' | 'business' | 'vip';
    totalRequests: number;
    remainingRequests: number;
    nextRequestAllowedAt?: string;
    canSendRequest: boolean;
    requestLimit: number;
  }> {
    try {
      const limits = await this.getUserRequestLimits(userId, eventId);
      
      // Default values for new users or when table doesn't exist
      const ticketType = limits?.ticket_type || 'general';
      const totalRequests = limits?.total_requests_sent || 0;
      const requestLimit = ticketType === 'general' ? 1 : ticketType === 'business' ? 3 : 999999;
      const remainingRequests = Math.max(0, requestLimit - totalRequests);
      const nextRequestAllowedAt = limits?.next_request_allowed_at;
      const canSendRequest = remainingRequests > 0 && (!nextRequestAllowedAt || new Date(nextRequestAllowedAt) <= new Date());

      return {
        ticketType,
        totalRequests,
        remainingRequests,
        nextRequestAllowedAt,
        canSendRequest,
        requestLimit
      };
    } catch (error) {
      console.warn('Error getting request limits summary:', error);
      // Return default values when there's an error
      return {
        ticketType: 'general',
        totalRequests: 0,
        remainingRequests: 1,
        canSendRequest: true,
        requestLimit: 1
      };
    }
  }
}

export const matchmakingService = new MatchmakingService();
