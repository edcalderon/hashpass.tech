// Agenda related types
export type AgendaType = 'keynote' | 'panel' | 'break' | 'meal' | 'registration';

export interface AgendaItem {
  id: string;
  time: string;
  title: string;
  description?: string;
  speakers?: string[];
  type: AgendaType;
  location?: string;
}

// Helper function to get color based on agenda type
export const getAgendaTypeColor = (type: string): string => {
  switch (type) {
    case 'keynote': return '#007AFF';
    case 'panel': return '#34A853';
    case 'break': return '#FF9500';
    case 'meal': return '#FF3B30';
    case 'registration': return '#8E8E93';
    default: return '#8E8E93';
  }
};

// Helper function to get icon name based on agenda type
export const getAgendaTypeIcon = (type: string): string => {
  switch (type) {
    case 'keynote': return 'mic';
    case 'panel': return 'group';
    case 'break': return 'coffee';
    case 'meal': return 'restaurant';
    case 'registration': return 'person-add';
    default: return 'event';
  }
};

// Helper to get default duration in minutes for different agenda types
export const getDefaultDurationMinutes = (type?: string): number => {
  if (type === 'panel') return 60;
  if (type === 'keynote') return 30;
  if (type === 'break') return 15;
  if (type === 'meal') return 60;
  return 30; // Default duration
};

// Time/Date related helpers
export const formatClock = (d: Date): string => {
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
};

// Timezone handling
export const EVENT_TZ_OFFSET = '-05:00';

export const endsWithZ = (s: string): boolean => s.endsWith('Z');
export const hasOtherOffset = (s: string): boolean => /[+-]\d{2}:?\d{0,2}$/.test(s);

export const parseEventISO = (s: string): Date => {
  if (!s) return new Date(NaN);
  if (endsWithZ(s) || hasOtherOffset(s)) return new Date(s);
  // If no timezone is specified, assume it's in the event's timezone
  return new Date(`${s}${EVENT_TZ_OFFSET}`);
};

export const formatTimeRange = (item: { time?: string | null; duration_minutes?: number; type?: string }): string => {
  try {
    // Handle null, undefined, or empty time
    if (!item.time || typeof item.time !== 'string' || !item.time.trim()) {
      return 'Time TBD';
    }

    const timeStr = item.time.trim();
    
    // If the time is already in format "HH:MM - HH:MM", format it with AM/PM
    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      const formatTime = (h: number, m: number) => {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayHours = h % 12 || 12; // Convert 0 to 12 for 12 AM
        return `${displayHours}:${m.toString().padStart(2, '0')} ${ampm}`;
      };
      
      const startHour = parseInt(timeMatch[1], 10);
      const startMinute = parseInt(timeMatch[2], 10);
      const endHour = parseInt(timeMatch[3], 10);
      const endMinute = parseInt(timeMatch[4], 10);
      
      // Validate parsed values
      if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute)) {
        return timeStr; // Return original if parsing fails
      }
      
      return `${formatTime(startHour, startMinute)} - ${formatTime(endHour, endMinute)}`;
    }

    // Try to parse as ISO date string (e.g., "2025-11-12T08:00:00Z")
    // First try using parseEventISO which handles timezone offsets
    try {
      const startTime = parseEventISO(timeStr);
      if (!isNaN(startTime.getTime())) {
        // Calculate end time
        const duration = item.duration_minutes || getDefaultDurationMinutes(item.type);
        const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
        
        // Format time in 12-hour format with AM/PM
        const formatTime = (d: Date) => {
          let hours = d.getHours();
          const minutes = d.getMinutes();
          const ampm = hours >= 12 ? 'PM' : 'AM';
          hours = hours % 12;
          hours = hours || 12; // Convert 0 to 12 for 12 AM
          return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
        };
        
        return `${formatTime(startTime)} - ${formatTime(endTime)}`;
      }
    } catch (parseError) {
      // If parseEventISO fails, try standard Date parsing
      const date = new Date(timeStr);
      if (!isNaN(date.getTime())) {
        // Event is in UTC-5, so we need to convert from UTC to local time
        // by adding 5 hours (since the time is stored in UTC but represents local time)
        const localOffset = 5 * 60 * 60 * 1000; // +5 hours in milliseconds
        const localDate = new Date(date.getTime() + localOffset);
        
        // Calculate end time
        const duration = item.duration_minutes || getDefaultDurationMinutes(item.type);
        const endDate = new Date(localDate.getTime() + duration * 60 * 1000);
        
        // Format time in 12-hour format with AM/PM
        const formatTime = (d: Date) => {
          let hours = d.getHours();
          const minutes = d.getMinutes();
          const ampm = hours >= 12 ? 'PM' : 'AM';
          hours = hours % 12;
          hours = hours || 12; // Convert 0 to 12 for 12 AM
          return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
        };
        
        return `${formatTime(localDate)} - ${formatTime(endDate)}`;
      }
    }

    // If all parsing attempts fail, return the original time string
    return timeStr;
  } catch (e) {
    console.error('Error formatting time range:', e, 'Item:', item);
    return item.time || 'Time TBD';
  }
};
