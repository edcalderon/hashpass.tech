import { supabase } from './supabase';

export type PassType = 'general' | 'business' | 'vip';
export type PassStatus = 'active' | 'used' | 'expired' | 'cancelled' | 'suspended';
export type SubpassType = 'litter_smart' | 'networking' | 'workshop' | 'exclusive';

export interface Pass {
  id: string;
  user_id: string;
  event_id: string;
  pass_type: PassType;
  status: PassStatus;
  pass_number: string;
  purchase_date: string;
  price_usd?: number;
  max_meeting_requests: number;
  used_meeting_requests: number;
  max_boost_amount: number;
  used_boost_amount: number;
  access_features: string[];
  special_perks: string[];
  created_at: string;
  updated_at: string;
}

export interface Subpass {
  id: string;
  pass_id: string;
  subpass_type: SubpassType;
  event_name: string;
  status: PassStatus;
  access_code?: string;
  venue?: string;
  start_time?: string;
  end_time?: string;
  created_at: string;
  updated_at: string;
}

export interface UserBlock {
  id: string;
  speaker_id: string;
  blocked_user_id: string;
  reason?: string;
  blocked_at: string;
}

export interface PassRequestLimits {
  can_request: boolean;
  canSendRequest?: boolean; // Alias for can_request for compatibility
  reason: string;
  pass_type: PassType | null;
  remaining_requests: number;
  remaining_boost: number;
}

export interface PassInfo {
  pass_id: string;
  pass_type: PassType;
  status: PassStatus;
  pass_number: string;
  max_requests: number;
  used_requests: number;
  remaining_requests: number;
  max_boost: number;
  used_boost: number;
  remaining_boost: number;
  access_features: string[];
  special_perks: string[];
}

export interface PassTypeLimits {
  max_requests: number;
  max_boost: number;
  daily_limit: number;
  weekly_limit: number;
  monthly_limit: number;
}

class PassSystemService {
  // Get user's pass information
  async getUserPassInfo(userId: string): Promise<PassInfo | null> {
    try {
      const { data, error } = await supabase
        .rpc('get_user_pass_info', { p_user_id: userId })
        .single();

      if (error) {
        console.error('Error getting user pass info:', error);
        return null;
      }

      return data as PassInfo;
    } catch (error) {
      console.error('Error in getUserPassInfo:', error);
      return null;
    }
  }

  // Check if user can make meeting request
  async canMakeMeetingRequest(
    userId: string,
    speakerId: string,
    boostAmount: number = 0
  ): Promise<PassRequestLimits> {
    try {
      const { data, error } = await supabase
        .rpc('can_make_meeting_request', {
          p_user_id: userId,
          p_speaker_id: speakerId,
          p_boost_amount: boostAmount
        })
        .single();

      if (error) {
        console.error('Error checking meeting request limits:', error);
        return {
          can_request: false,
          reason: 'Error checking limits',
          pass_type: null,
          remaining_requests: 0,
          remaining_boost: 0
        };
      }

      const result = data as PassRequestLimits;
      result.canSendRequest = result.can_request; // Set alias for compatibility
      return result;
    } catch (error) {
      console.error('Error in canMakeMeetingRequest:', error);
      return {
        can_request: false,
        canSendRequest: false,
        reason: 'Error checking limits',
        pass_type: null,
        remaining_requests: 0,
        remaining_boost: 0
      };
    }
  }

  // Get actual meeting request status for a user and speaker
  async getMeetingRequestStatus(
    userId: string,
    speakerId: string
  ): Promise<any | null> {
    try {
      console.log('🔍 Getting meeting request status for user:', userId, 'speaker:', speakerId);
      
      // Try direct table query first (more reliable)
      const { data, error } = await supabase
        .from('meeting_requests')
        .select('*')
        .eq('requester_id', userId)
        .eq('speaker_id', speakerId)
        .in('status', ['pending', 'approved', 'declined'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('❌ Direct query error:', error);
        return null;
      }

      console.log('🔍 Direct query result:', data);
      return data;
    } catch (error) {
      console.error('❌ Error in getMeetingRequestStatus:', error);
      return null;
    }
  }

  // Cancel a meeting request
  async cancelMeetingRequest(
    userId: string,
    requestId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .rpc('cancel_meeting_request', {
          p_user_id: userId,
          p_request_id: requestId
        })
        .single();

      if (error) {
        console.error('Error cancelling meeting request:', error);
        return false;
      }

      return data as boolean;
    } catch (error) {
      console.error('Error in cancelMeetingRequest:', error);
      return false;
    }
  }

  // Create default pass for user
  async createDefaultPass(userId: string, passType: PassType = 'general'): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .rpc('create_default_pass', {
          p_user_id: userId,
          p_pass_type: passType
        })
        .single();

      if (error) {
        console.error('Error creating default pass:', error);
        return null;
      }

      return data as string;
    } catch (error) {
      console.error('Error in createDefaultPass:', error);
      return null;
    }
  }

  // Get pass type limits
  getPassTypeLimits(passType: PassType): PassTypeLimits {
    switch (passType) {
      case 'vip':
        return {
          max_requests: 50,
          max_boost: 1000,
          daily_limit: 10,
          weekly_limit: 30,
          monthly_limit: 50
        };
      case 'business':
        return {
          max_requests: 20,
          max_boost: 500,
          daily_limit: 5,
          weekly_limit: 15,
          monthly_limit: 20
        };
      case 'general':
        return {
          max_requests: 5,
          max_boost: 100,
          daily_limit: 2,
          weekly_limit: 5,
          monthly_limit: 5
        };
      default:
        return {
          max_requests: 0,
          max_boost: 0,
          daily_limit: 0,
          weekly_limit: 0,
          monthly_limit: 0
        };
    }
  }

  // Get pass perks description
  getPassPerks(passType: PassType): { features: string[]; perks: string[] } {
    switch (passType) {
      case 'vip':
        return {
          features: ['All conferences Nov 12-14', 'Networking & B2B sessions', 'VIP networking with speakers', 'VIP lounge access', 'Priority seating'],
          perks: ['50 meeting requests', 'Concierge Service', 'Premium Swag', 'Official closing party']
        };
      case 'business':
        return {
          features: ['All conferences Nov 12-14', 'Networking & B2B sessions', 'Business lounge access'],
          perks: ['20 meeting requests', 'Networking Tools', 'Business Support', 'Official closing party']
        };
      case 'general':
        return {
          features: ['All conferences Nov 12-14', 'Access to main event areas'],
          perks: ['5 meeting requests', 'Official closing party']
        };
      default:
        return {
          features: [],
          perks: []
        };
    }
  }

  // Get pass pricing information
  getPassPricing(passType: PassType): { price: string; description: string } {
    switch (passType) {
      case 'vip':
        return {
          price: 'Premium',
          description: '+ VIP networking with speakers'
        };
      case 'business':
        return {
          price: '$249',
          description: '+ Networking & B2B sessions'
        };
      case 'general':
        return {
          price: '$99',
          description: 'Conferences only'
        };
      default:
        return {
          price: 'N/A',
          description: ''
        };
    }
  }

  // Block/unblock user
  async toggleUserBlock(
    speakerId: string,
    userId: string,
    reason?: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .rpc('toggle_user_block', {
          p_speaker_id: speakerId,
          p_user_id: userId,
          p_reason: reason
        })
        .single();

      if (error) {
        console.error('Error toggling user block:', error);
        return false;
      }

      return data as boolean;
    } catch (error) {
      console.error('Error in toggleUserBlock:', error);
      return false;
    }
  }

  // Get user's subpasses
  async getUserSubpasses(userId: string): Promise<Subpass[]> {
    try {
      const { data, error } = await supabase
        .from('subpasses')
        .select(`
          *,
          passes!inner(user_id)
        `)
        .eq('passes.user_id', userId)
        .eq('status', 'active');

      if (error) {
        console.error('Error getting user subpasses:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error in getUserSubpasses:', error);
      return [];
    }
  }

  // Create subpass for user
  async createSubpass(
    passId: string,
    subpassType: SubpassType,
    eventName: string,
    venue?: string,
    startTime?: string,
    endTime?: string
  ): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('subpasses')
        .insert({
          pass_id: passId,
          subpass_type: subpassType,
          event_name: eventName,
          venue,
          start_time: startTime,
          end_time: endTime,
          access_code: `${subpassType.toUpperCase()}-${Date.now()}`
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error creating subpass:', error);
        return null;
      }

      return data.id;
    } catch (error) {
      console.error('Error in createSubpass:', error);
      return null;
    }
  }

  // Get pass validation message
  getPassValidationMessage(limits: PassRequestLimits): string {
    if (limits.can_request) {
      return `You can make ${limits.remaining_requests} more meeting requests with your ${limits.pass_type} pass.`;
    } else {
      return limits.reason;
    }
  }

  // Format boost amount
  formatBoostAmount(amount: number): string {
    return `$${amount.toFixed(2)} VOI`;
  }

  // Get pass type display name
  getPassTypeDisplayName(passType: PassType): string {
    switch (passType) {
      case 'vip':
        return 'VIP Pass';
      case 'business':
        return 'Business Pass';
      case 'general':
        return 'General Pass';
      default:
        return 'Unknown Pass';
    }
  }

  // Get pass type color
  getPassTypeColor(passType: PassType): string {
    switch (passType) {
      case 'vip':
        return '#FFD700'; // Gold
      case 'business':
        return '#007AFF'; // Blue
      case 'general':
        return '#34A853'; // Green
      default:
        return '#8E8E93'; // Gray
    }
  }
}

export const passSystemService = new PassSystemService();
export default passSystemService;
