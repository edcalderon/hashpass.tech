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
  // Explicit day number ('1' | '2' | '3') for multi-day events -- see the
  // "Group agenda by day" effect in app/events/[eventSlug]/agenda.tsx, which
  // falls back to positionally slicing the flat item list into groups of 4
  // when this is absent, silently misplacing most sessions once an event
  // has more than a handful of items.
  day?: string;
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
// Default fallback offset (BSL's original Medellín/Bogotá hub, UTC-5) for
// events that don't specify their own. Real per-event offset should be
// passed in explicitly (derived from event.eventStartDate's trailing
// +/-HH:MM) — Chile, for example, is UTC-4, not UTC-5.
export const EVENT_TZ_OFFSET = '-05:00';

export const endsWithZ = (s: string): boolean => s.endsWith('Z');
export const hasOtherOffset = (s: string): boolean => /[+-]\d{2}:?\d{0,2}$/.test(s);

export const parseEventISO = (s: string, eventTzOffset: string = EVENT_TZ_OFFSET): Date => {
  if (!s) return new Date(NaN);
  if (endsWithZ(s) || hasOtherOffset(s)) return new Date(s);
  // If no timezone is specified, assume it's in the event's timezone
  return new Date(`${s}${eventTzOffset}`);
};

// Extracts the wall-clock hour/minute a Date represents in a *fixed* offset,
// independent of the viewer's device/browser timezone. Date.getHours() /
// .getMinutes() report the runtime's local timezone, not the event's real
// location — that mismatch is what made agenda times render up to an hour
// off (e.g. showing Colombia's -05:00 wall clock for a Chile, -04:00 event)
// depending on where the viewer's device/server happened to be.
const clockPartsAtOffset = (date: Date, offset: string) => {
  const match = offset.match(/^([+-])(\d{2}):?(\d{2})$/);
  const offsetMinutes = match
    ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '-' ? -1 : 1)
    : -300;
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  return { hour: shifted.getUTCHours(), minute: shifted.getUTCMinutes() };
};

export const formatTimeRange = (
  item: { time?: string | null; duration_minutes?: number; type?: string },
  eventTzOffset: string = EVENT_TZ_OFFSET,
): string => {
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
      const startTime = parseEventISO(timeStr, eventTzOffset);
      if (!isNaN(startTime.getTime())) {
        // Calculate end time
        const duration = item.duration_minutes || getDefaultDurationMinutes(item.type);
        const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

        // Format time in 12-hour format with AM/PM, in the event's own
        // fixed timezone (not the viewer's device/browser timezone).
        const formatTime = (d: Date) => {
          const { hour, minute } = clockPartsAtOffset(d, eventTzOffset);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const displayHour = hour % 12 || 12;
          return `${displayHour}:${minute.toString().padStart(2, '0')} ${ampm}`;
        };

        return `${formatTime(startTime)} - ${formatTime(endTime)}`;
      }
    } catch (parseError) {
      // If parseEventISO fails, try standard Date parsing
      const date = new Date(timeStr);
      if (!isNaN(date.getTime())) {
        // Calculate end time
        const duration = item.duration_minutes || getDefaultDurationMinutes(item.type);
        const endDate = new Date(date.getTime() + duration * 60 * 1000);

        // Format time in 12-hour format with AM/PM, in the event's own
        // fixed timezone (not the viewer's device/browser timezone).
        const formatTime = (d: Date) => {
          const { hour, minute } = clockPartsAtOffset(d, eventTzOffset);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const displayHour = hour % 12 || 12;
          return `${displayHour}:${minute.toString().padStart(2, '0')} ${ampm}`;
        };

        return `${formatTime(date)} - ${formatTime(endDate)}`;
      }
    }

    // If all parsing attempts fail, return the original time string
    return timeStr;
  } catch (e) {
    console.error('Error formatting time range:', e, 'Item:', item);
    return item.time || 'Time TBD';
  }
};
