// Networking related types

export interface Meeting {
  id: string;
  meeting_request_id: string;
  speaker_id: string;
  requester_id: string;
  speaker_name: string;
  requester_name: string;
  meeting_type: string;
  status: 'scheduled' | 'confirmed' | 'tentative' | 'unconfirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  scheduled_at?: string;
  duration_minutes: number;
  location?: string;
  meeting_link?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  participants?: string[];
  type?: 'keynote' | 'panel' | 'meeting';
  duration?: number;
}

export interface MeetingRequest {
  id: string;
  speaker_id: string;
  speaker_name: string;
  speaker_image?: string;
  requester_name: string;
  requester_company: string;
  requester_title: string;
  requester_ticket_type: string;
  meeting_type: string;
  message: string;
  note: string;
  status: 'requested' | 'pending' | 'accepted' | 'rejected' | 'declined' | 'cancelled' | 'expired' | 'completed';
  scheduled_at?: string;
  created_at: string;
  updated_at: string;
  duration_minutes?: number;
  location?: string;
  meeting_link?: string;
  boost_amount?: number;
  expires_at?: string;
  speaker_response?: string;
  speaker_response_at?: string;
}

export interface TimeSlot {
  id: string;
  startTime: Date;
  endTime: Date;
  meeting?: Meeting;
  isPast: boolean;
  isNow: boolean;
  isFuture: boolean;
}

export interface DaySchedule {
  date: Date;
  timeSlots: TimeSlot[];
  hasMeetings: boolean;
  dayName?: string;
  isToday?: boolean;
  dateFormatted?: string;
  slots?: any[];
}

export interface SystemStats {
  totalUsers: number;
  totalSpeakers: number;
  totalMeetingRequests: number;
  pendingRequests: number;
  acceptedRequests: number;
  declinedRequests: number;
  cancelledRequests: number;
  blockedUsers: number;
  averageResponseTime: number;
  topSpeakers: Array<{
    speaker_id: string;
    name: string;
    meeting_count: number;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: string;
  }>;
  requestsByDay?: Array<{
    date: string;
    count: number;
  }>;
}

export interface NetworkingStats {
  totalRequests: number;
  pendingRequests: number;
  acceptedRequests: number;
  declinedRequests: number;
  cancelledRequests: number;
  blockedUsers: number;
  scheduledMeetings: number;
}

export interface StatsState {
  data: NetworkingStats;
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  retryCount: number;
}

export interface QuickAccessItem {
  id: string;
  title: string;
  icon: string;
  color: string;
  route: string;
  subtitle?: string;
}

export interface TimeSlot {
  id: string;
  startTime: Date;
  endTime: Date;
  meeting?: Meeting;
  isPast: boolean;
  isNow: boolean;
  isFuture: boolean;
}

export interface DaySchedule {
  date: Date;
  timeSlots: TimeSlot[];
  hasMeetings: boolean;
  dayName?: string;
  isToday?: boolean;
}

// Networking tips
export interface NetworkingTip {
  icon: string;
  color: string;
  title: string;
  description: string;
}

export const networkingTips: NetworkingTip[] = [
  {
    icon: 'edit',
    color: '#FFC107',
    title: 'Be Specific',
    description: 'Include clear intentions in your meeting requests'
  },
  {
    icon: 'schedule',
    color: '#4CAF50',
    title: 'Follow Up',
    description: 'Send follow-up messages for pending requests'
  },
  {
    icon: 'people',
    color: '#2196F3',
    title: 'Network Smart',
    description: 'Focus on quality connections over quantity'
  },
  {
    icon: 'star',
    color: '#9C27B0',
    title: 'Be Professional',
    description: 'Maintain professionalism in all interactions'
  }
];
