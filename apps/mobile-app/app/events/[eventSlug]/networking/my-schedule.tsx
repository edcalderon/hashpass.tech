import React, { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  SafeAreaView,
  Platform,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Image as RNImage,
  Share,
  Pressable,
} from 'react-native';
import { SystemBars } from 'react-native-edge-to-edge';
import { useTheme } from '../../../../hooks/useTheme';
import { format, addDays, isSameDay, isToday, isPast, isFuture } from 'date-fns';
import { es } from 'date-fns/locale';
import { MaterialIcons } from '../../../../lib/vector-icons';
import { getTourBrandAsset } from '../../../../lib/event-branding';
import SpeakerAvatar from '../../../../components/SpeakerAvatar';
import UnifiedSearchAndFilter from '../../../../components/UnifiedSearchAndFilter';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../../../hooks/useAuth';
import { useEvent } from '@contexts/EventContext';
import { supabase } from '../../../../lib/supabase';
import { apiClient, eventApiPath, getRuntimeApiBaseUrl } from '../../../../lib/api-client';
import { useToastHelpers } from '@contexts/ToastContext';
import { useTranslation, getCurrentLocale } from '../../../../i18n/i18n';
import type { Meeting, TimeSlot, DaySchedule } from '@/types/networking';
import ScheduleConfirmationModal from '../../../../components/ScheduleConfirmationModal';
import * as Haptics from 'expo-haptics';
import { AgendaItem } from '../../../../types/events';
import { CopilotStep, walkthroughable } from '@lib/copilot-shim';

const CopilotView = walkthroughable(View);

// Constants
const WORKING_HOURS = { start: 7, end: 19 }; // 7 AM to 7 PM (covers early event sessions)
const TIME_SLOT_MINUTES = 15; // 15-minute time slots
const DEFAULT_BSL_TOUR_DATES = {
  start: new Date(2025, 10, 12), // November 12, 2025 (months are 0-indexed)
  end: new Date(2025, 10, 14)    // November 14, 2025
};

// Time parsing/formatting delegates to lib/event-time.ts, the single source
// of truth for event-local time math shared with agenda.tsx and
// ScheduleConfirmationModal — see that file's header comment for why this
// exists (three independent copies of this logic had drifted, causing the
// same session to show different times on different screens).
import {
  DEFAULT_EVENT_TZ_OFFSET as EVENT_TZ_OFFSET,
  parseEventISO as parseEventISOWithDefaultOffset,
  formatEventClock,
  toAbsoluteISO,
} from '../../../../lib/event-time';
const parseEventISO = (s: string, eventTzOffset: string = EVENT_TZ_OFFSET) => parseEventISOWithDefaultOffset(s, eventTzOffset);

const agendaTimeRange = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/;

const addDaysToDatePart = (datePart: string, days: number) => {
  const date = new Date(`${datePart}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const getAgendaDateTimeRange = (
  time: string | undefined,
  day: string | number | undefined,
  eventStartDate: string | undefined,
  durationMinutes: number,
) => {
  const match = time?.trim().match(agendaTimeRange);
  const eventDateMatch = eventStartDate?.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match || !eventDateMatch) return null;

  const [, startHour, startMinute, endHour, endMinute] = match;
  const dayMatch = String(day || '1').match(/\d+/);
  const dayOffset = Math.max(0, Number(dayMatch?.[0] || 1) - 1);
  const offset = eventStartDate?.match(/([+-]\d{2}:?\d{2})$/)?.[1] || EVENT_TZ_OFFSET;
  const startDate = addDaysToDatePart(eventDateMatch[1], dayOffset);
  const startTime = `${startDate}T${startHour.padStart(2, '0')}:${startMinute}:00${offset}`;

  if (endHour !== undefined && endMinute !== undefined) {
    const startMinutes = Number(startHour) * 60 + Number(startMinute);
    const endMinutes = Number(endHour) * 60 + Number(endMinute);
    const endDate = addDaysToDatePart(startDate, endMinutes < startMinutes ? 1 : 0);
    return {
      startTime,
      endTime: `${endDate}T${endHour.padStart(2, '0')}:${endMinute}:00${offset}`,
    };
  }

  const end = new Date(startTime);
  end.setMinutes(end.getMinutes() + durationMinutes);
  return { startTime, endTime: end.toISOString() };
};

// formatEventClock() replaces this file's old local formatEventTime() —
// same signature (date, offset, includeMinutes), now shared with
// agenda.tsx/ScheduleConfirmationModal via lib/event-time.ts.
const formatEventTime = formatEventClock;

const eventSlotStart = (date: Date, hour: number, minute: number, offset: string) =>
  new Date(`${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${offset}`);

// Helper function to add minutes to a date
const addMinutes = (date: Date, minutes: number): Date => {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
};

const MySchedule = () => {
  const { colors, isDark } = useTheme();
  const { dbUserId, user } = useAuth();
  const { event } = useEvent();
  const eventId = event?.id || 'bsl';
  const agendaApiPath = eventApiPath(eventId, 'agenda');
  const { showError, showSuccess, showWarning } = useToastHelpers();
  const { t } = useTranslation('networking');
  const navigation = useNavigation();
  const router = useRouter();
  const params = useLocalSearchParams<{ scrollTo?: string }>();
  useLayoutEffect(() => {
    navigation.setOptions({ title: t('mySchedule.title') } as any);
  }, [navigation, t]);
  const eventDates = useMemo(() => {
    const start = event?.eventStartDate ? new Date(event.eventStartDate) : DEFAULT_BSL_TOUR_DATES.start;
    const end = event?.eventEndDate ? new Date(event.eventEndDate) : DEFAULT_BSL_TOUR_DATES.end;
    return { start, end };
  }, [event?.eventStartDate, event?.eventEndDate]);
  const eventTimezoneOffset = event?.eventStartDate?.match(/([+-]\d{2}:?\d{2})$/)?.[1] || EVENT_TZ_OFFSET;
  const [selectedDate, setSelectedDate] = useState<Date>(eventDates.start);
  const [expandedHours, setExpandedHours] = useState<{[key: string]: boolean}>({});
  // Fed by UnifiedSearchAndFilter's onFilteredData -- null means "no search
  // applied yet" so hour groups render unfiltered until the component's own
  // effect populates this with the full unfiltered list.
  const [scheduleSearchResults, setScheduleSearchResults] = useState<Meeting[] | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const hourGroupRefs = useRef<{ [hour: string]: View | null }>({});
  const handledScrollToRef = useRef<string | null>(null);
  const [dbMeetings, setDbMeetings] = useState<Meeting[]>([]);
  const [loadingAgenda, setLoadingAgenda] = useState<boolean>(false);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [userAgendaStatus, setUserAgendaStatus] = useState<Record<string, 'tentative' | 'confirmed'>>({});
  const [userMeetingStatus, setUserMeetingStatus] = useState<Record<string, 'tentative' | 'confirmed'>>({});
  const [userFreeSlotStatus, setUserFreeSlotStatus] = useState<Record<string, 'available' | 'interested' | 'blocked' | 'tentative'>>({});
  const [favoriteStatus, setFavoriteStatus] = useState<Record<string, boolean>>({});
  // user_agenda_status.user_id is public.user(id) (the registry row), not
  // dbUserId (auth.users id) — those are independently generated and not
  // guaranteed to be equal. Resolved separately so this screen's queries and
  // writes against that table match its FK, mirroring how the server
  // resolves identity in resolve-notification-identity.ts.
  //
  // Looked up by email, not by `provider_ids->>supabase == dbUserId` (this
  // screen's original strategy) — that requires the Better Auth <-> Supabase
  // identity bridge to have already synced `provider_ids.supabase` for this
  // account, which self-heals on write but can still be stale/missing at
  // read time. When it's missing, this filter silently matches zero rows,
  // registryUserId stays null, and every confirm/favorite state loads as
  // empty even though the write API (POST /agenda/status, which resolves
  // identity by email exactly like this now does) already saved it
  // correctly — the write and read sides were resolving to two different
  // values for the same account. Regression: a confirmed agenda slot showed
  // as free again on this screen after being confirmed successfully.
  const [registryUserId, setRegistryUserId] = useState<string | null>(null);
  const userEmail = user?.email?.trim().toLowerCase() || '';

  useEffect(() => {
    if (!dbUserId) {
      setRegistryUserId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let registryQuery = supabase
          .from('user')
          .select('id')
        const { data, error } = await (userEmail
          ? registryQuery.eq('email', userEmail).maybeSingle()
          : registryQuery.eq('provider_ids->>supabase', dbUserId).maybeSingle());
        if (!cancelled) {
          if (error) {
            console.error('Error resolving registry user id:', error);
            setRegistryUserId(null);
          } else {
            setRegistryUserId((data as any)?.id ?? null);
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.error('Error resolving registry user id:', e);
          setRegistryUserId(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dbUserId, userEmail]);
  const [confirmationModal, setConfirmationModal] = useState<{
    visible: boolean;
    meeting: Meeting | null;
    slotStartTime: Date | null;
  }>({
    visible: false,
    meeting: null,
    slotStartTime: null,
  });
  const [daySummaryModal, setDaySummaryModal] = useState<{
    visible: boolean;
    dayStat: typeof dayStats[0] | null;
  }>({ visible: false, dayStat: null });
  const [removedAgendaIds, setRemovedAgendaIds] = useState<Set<string>>(new Set());
  const [removeSessionModal, setRemoveSessionModal] = useState<{ meeting: Meeting | null; slotStartTime: Date | null }>({ meeting: null, slotStartTime: null });
  const [isRemovingSession, setIsRemovingSession] = useState(false);
  const [excludePastSessions, setExcludePastSessions] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  // Meetings state
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState<boolean>(false);
  const [refreshingMeetings, setRefreshingMeetings] = useState<boolean>(false);
  const [showMeetingsSection, setShowMeetingsSection] = useState<boolean>(false);
  const [meetingFilter, setMeetingFilter] = useState<'all' | 'incoming' | 'passed'>('all');

  useEffect(() => {
    setSelectedDate(eventDates.start);
  }, [eventDates.start]);

  const meetingCounts = useMemo(() => {
    const now = new Date();
    let total = meetings.length;
    let upcoming = 0;
    let past = 0;
    meetings.forEach((m: any) => {
      if (m?.scheduled_at) {
        const d = parseEventISO(m.scheduled_at);
        if (!isNaN(d.getTime())) {
          if (d.getTime() >= now.getTime()) upcoming += 1; else past += 1;
        }
      }
    });
    return { total, upcoming, past };
  }, [meetings]);

  const filteredMeetings = useMemo(() => {
    if (meetingFilter === 'all') return meetings;
    const now = new Date();
    return meetings.filter((m: any) => {
      if (!m?.scheduled_at) return false;
      const d = parseEventISO(m.scheduled_at);
      if (isNaN(d.getTime())) return false;
      if (meetingFilter === 'incoming') return d.getTime() >= now.getTime();
      return d.getTime() < now.getTime(); // 'passed'
    });
  }, [meetings, meetingFilter]);

  // Load user confirmation statuses for agenda events, meetings, and free slots
  const [isReloadingStatus, setIsReloadingStatus] = useState(false);
  const loadUserScheduleStatus = useCallback(async () => {
    if (!registryUserId) {
      setUserAgendaStatus({});
      setUserMeetingStatus({});
      setUserFreeSlotStatus({});
      return;
    }
    setIsReloadingStatus(true);
    try {
      const { data, error } = await supabase
        .from('user_agenda_status')
        .select('agenda_id, meeting_id, slot_time, status, slot_status, is_favorite')
        .eq('user_id', registryUserId)
        .eq('event_id', eventId);

      if (error) {
        console.error('Error loading user schedule status:', error);
        return;
      }

      const agendaStatusMap: Record<string, 'tentative' | 'confirmed'> = {};
      const meetingStatusMap: Record<string, 'tentative' | 'confirmed'> = {};
      const freeSlotStatusMap: Record<string, 'available' | 'interested' | 'blocked' | 'tentative'> = {};
      const favoriteMap: Record<string, boolean> = {};

      (data || []).forEach((item: any) => {
        const itemId = item.agenda_id || item.meeting_id || (item.slot_time ? new Date(item.slot_time).toISOString() : null);
        if (!itemId) return;

        if (item.agenda_id) {
          // Map 'unconfirmed' to 'tentative' for backward compatibility
          const status = item.status === 'unconfirmed' ? 'tentative' : item.status;
          agendaStatusMap[item.agenda_id] = status as 'tentative' | 'confirmed';
          if (item.is_favorite) favoriteMap[item.agenda_id] = true;
        } else if (item.meeting_id) {
          const status = item.status === 'unconfirmed' ? 'tentative' : item.status;
          meetingStatusMap[item.meeting_id] = status as 'tentative' | 'confirmed';
          if (item.is_favorite) favoriteMap[item.meeting_id] = true;
        } else if (item.slot_time) {
          // Free slot - use slot_time as key (ISO string)
          const slotKey = new Date(item.slot_time).toISOString();
          freeSlotStatusMap[slotKey] = (item.slot_status || item.status) as 'available' | 'interested' | 'blocked' | 'tentative';
        }
      });

      setUserAgendaStatus(agendaStatusMap);
      setUserMeetingStatus(meetingStatusMap);
      setUserFreeSlotStatus(freeSlotStatusMap);
      setFavoriteStatus(favoriteMap);
    } catch (e) {
      console.error('Error loading user schedule status:', e);
    } finally {
      setIsReloadingStatus(false);
    }
  }, [registryUserId, eventId]);

  useEffect(() => {
    loadUserScheduleStatus();
  }, [loadUserScheduleStatus]);

  // Re-fetch whenever this screen regains focus (e.g. returning from the
  // Agenda screen after confirming/favoriting a session) — the mount-only
  // effect above left this screen showing stale 0/4 counts when it stayed
  // mounted in a tab navigator across screen switches.
  useFocusEffect(
    useCallback(() => {
      loadUserScheduleStatus();
    }, [loadUserScheduleStatus])
  );

  useEffect(() => {
    let cancelled = false;
    const fetchAgenda = async () => {
      setLoadingAgenda(true);
      try {
        // Use apiClient to ensure correct base URL from env vars
        const response = await apiClient.request(agendaApiPath, {
          skipEventSegment: true,
        });
        // apiClient returns { data, success, error }
        // Handle different response formats
        let items: any[] = [];
        if (response.success && response.data) {
          if (Array.isArray(response.data)) {
            items = response.data;
          } else if (response.data.data && Array.isArray(response.data.data)) {
            items = response.data.data;
          } else if (response.data && typeof response.data === 'object') {
            items = [];
          }
        }
        const toMinutes = (t?: string) => (t === 'panel' ? 60 : t === 'keynote' ? 30 : 30);
        const mapped: Meeting[] = items.map((it) => {
          const duration = toMinutes(it.type);
          const range = getAgendaDateTimeRange(
            it.time as string | undefined,
            it.day,
            event?.eventStartDate,
            duration,
          );
          const start = range?.startTime || (it.time as string);
          const endTime = range?.endTime || toAbsoluteISO(addMinutes(parseEventISO(start), duration));
          const agendaId = String(it.id);
          // Check user's confirmation status, default to 'tentative' for agenda events
          const userStatus = userAgendaStatus[agendaId] || 'tentative';
          return {
            id: agendaId,
            title: it.title || '',
            description: it.description || undefined,
            startTime: start,
            endTime,
            participants: Array.isArray(it.speakers) ? it.speakers : [],
            status: userStatus === 'confirmed' ? 'confirmed' : 'tentative',
            location: it.location || t('mySchedule.messages.tbd'),
            type: it.type || 'keynote',
            duration,
            isAgendaEvent: true, // Mark as agenda event
          } as Meeting & { isAgendaEvent?: boolean };
        });
        if (!cancelled) {
          setDbMeetings(mapped);
        }
      } catch (e) {
        if (!cancelled) {
          setDbMeetings([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingAgenda(false);
        }
      }
    };
    fetchAgenda();
    return () => {
      cancelled = true;
    };
  }, [userAgendaStatus, eventId, agendaApiPath, event?.eventStartDate, t]);

  // Load user meetings (requester or speaker)
  useEffect(() => {
    const loadMeetings = async () => {
      if (!dbUserId) {
        setMeetings([]);
        setLoadingMeetings(false);
        return;
      }
      try {
        setLoadingMeetings(true);
        // meetings.speaker_id is bsl_speakers.id (UUID), not user_id
        // Get the bsl_speakers.id for the current user if they're a speaker
        const { data: speakerRows } = await supabase
          .from('bsl_speakers')
          .select('id')
          .eq('user_id', dbUserId);
        
        const speakerIds = speakerRows?.map((r: any) => r.id) || [];
        
        // Query meetings where user is requester OR speaker
        let allMeetings: any[] = [];
        
        // Always query by requester_id
        const { data: requesterMeetings, error: requesterError } = await supabase
          .from('meetings')
          .select('*')
          .eq('requester_id', dbUserId)
          .eq('event_id', eventId)
          .order('created_at', { ascending: false });
        
        if (requesterError) {
          console.error('Error loading requester meetings:', requesterError);
        } else {
          allMeetings = requesterMeetings || [];
        }
        
        // If user is a speaker, also query by speaker_id (bsl_speakers.id)
        if (speakerIds.length > 0) {
          const { data: speakerMeetings, error: speakerError } = await supabase
            .from('meetings')
            .select('*')
            .in('speaker_id', speakerIds)
            .eq('event_id', eventId)
            .order('created_at', { ascending: false });
          
          if (speakerError) {
            console.error('Error loading speaker meetings:', speakerError);
          } else {
            // Combine and deduplicate by meeting id
            const existingIds = new Set(allMeetings.map(m => m.id));
            const newMeetings = ((speakerMeetings || []) as any[]).filter((m: any) => !existingIds.has(m.id));
            allMeetings = [...allMeetings, ...newMeetings];
          }
        }
        
        // Sort by created_at descending
        allMeetings.sort((a, b) => {
          const dateA = new Date(a.created_at || 0).getTime();
          const dateB = new Date(b.created_at || 0).getTime();
          return dateB - dateA;
        });
        
        setMeetings(allMeetings);
      } catch (e) {
        console.error('Error loading meetings:', e);
        showError(t('mySchedule.errors.title'), t('mySchedule.errors.failedToLoadMeetings'));
        setMeetings([]);
      } finally {
        setLoadingMeetings(false);
      }
    };
    loadMeetings();
  }, [dbUserId, eventId]);

  const refreshMeetings = async () => {
    setRefreshingMeetings(true);
    try {
      if (!dbUserId) {
        setMeetings([]);
        return;
      }
      // meetings.speaker_id is bsl_speakers.id (UUID), not user_id
      const { data: speakerRows } = await supabase
        .from('bsl_speakers')
        .select('id')
        .eq('user_id', dbUserId);
      
      const speakerIds = speakerRows?.map((r: any) => r.id) || [];
      
      let allMeetings: any[] = [];
      
      // Query by requester_id
      const { data: requesterMeetings } = await supabase
        .from('meetings')
        .select('*')
        .eq('requester_id', dbUserId)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });
      
      allMeetings = requesterMeetings || [];
      
      // If user is a speaker, also query by speaker_id
      if (speakerIds.length > 0) {
        const { data: speakerMeetings } = await supabase
          .from('meetings')
          .select('*')
          .in('speaker_id', speakerIds)
          .eq('event_id', eventId)
          .order('created_at', { ascending: false });
        
        if (speakerMeetings) {
          const existingIds = new Set(allMeetings.map(m => m.id));
          const newMeetings = (speakerMeetings as any[]).filter((m: any) => !existingIds.has(m.id));
          allMeetings = [...allMeetings, ...newMeetings];
        }
      }
      
      // Sort by created_at descending
      allMeetings.sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      });
      
      setMeetings(allMeetings);
    } finally {
      setRefreshingMeetings(false);
    }
  };

  // Generate time slots for a given date
  const generateTimeSlots = useCallback((date: Date, meetings: Meeting[]): TimeSlot[] => {
    const slots: TimeSlot[] = [];

    // Calculate total minutes in the working day
    const totalWorkingMinutes = (WORKING_HOURS.end - WORKING_HOURS.start) * 60;
    const totalSlots = totalWorkingMinutes / TIME_SLOT_MINUTES;

    // Filter meetings for this date
    const dayMeetings = meetings.filter(meeting => {
      if (!meeting.startTime) return false;
      return isSameDay(parseEventISO(meeting.startTime), date);
    });

    for (let i = 0; i < totalSlots; i++) {
      const startTime = eventSlotStart(date, WORKING_HOURS.start, 0, eventTimezoneOffset);

      const slotStart = addMinutes(startTime, i * TIME_SLOT_MINUTES);
      const slotEnd = addMinutes(slotStart, TIME_SLOT_MINUTES);

      // Check if there's a meeting at this time
      const meeting = dayMeetings.find(m => {
        if (!m.startTime || !m.endTime) return false; // Skip meetings without times
        
        const meetingStart = parseEventISO(m.startTime);
        const meetingEnd = parseEventISO(m.endTime);
        return (
          (meetingStart >= slotStart && meetingStart < slotEnd) ||
          (slotStart >= meetingStart && slotStart < meetingEnd)
        );
      });

      const isPastSlot = isPast(slotEnd);
      const isFutureSlot = isFuture(slotStart);
      const isCurrentSlot = isToday(date) && !isPastSlot && !isFutureSlot;

      slots.push({
        id: `${date.toISOString()}-slot-${i}`,
        startTime: slotStart,
        endTime: slotEnd,
        meeting,
        isNow: isCurrentSlot,
        isPast: isPastSlot,
        isFuture: isFutureSlot
      });
    }

    return slots;
  }, [eventTimezoneOffset]);

  // Combine agenda events and personal meetings, and apply user confirmation status
  const allMeetings = useMemo(() => {
    // Map personal meetings to Meeting format
    const personalMeetings: Meeting[] = meetings.map((m: any) => {
      const meetingStartTime = m.scheduled_at || m.startTime;
      const userStatus = userMeetingStatus[m.id] || 'unconfirmed';
      return {
        id: m.id,
        title: m.title || t('mySchedule.messages.meetingWith', { name: m.speaker_name || m.requester_name || t('mySchedule.messages.user') }),
        description: m.notes || m.message,
        startTime: meetingStartTime,
        endTime: m.end_time || (meetingStartTime ? toAbsoluteISO(addMinutes(parseEventISO(meetingStartTime), m.duration_minutes ?? 15)) : ''),
        participants: m.speaker_name ? [m.speaker_name] : [],
        status: userStatus as 'confirmed' | 'unconfirmed',
        location: m.location || m.meeting_location || t('mySchedule.messages.tbd'),
        type: 'meeting' as const,
        duration: m.duration_minutes || 15,
        isAgendaEvent: false,
        meeting_request_id: m.meeting_request_id,
        speaker_id: m.speaker_id,
        requester_id: m.requester_id,
        speaker_name: m.speaker_name,
        requester_name: m.requester_name,
        meeting_type: m.meeting_type,
        scheduled_at: meetingStartTime,
        duration_minutes: m.duration_minutes || 15,
        created_at: m.created_at,
        updated_at: m.updated_at,
      } as Meeting & { isAgendaEvent?: boolean };
    });

    // Combine agenda events and personal meetings
    return [
      ...dbMeetings.filter((meeting) => !(meeting as any).isAgendaEvent || !removedAgendaIds.has(meeting.id)),
      ...personalMeetings,
    ];
  }, [dbMeetings, meetings, userMeetingStatus, removedAgendaIds]);

  const schedule = useMemo(() => {
    const days: DaySchedule[] = [];
    let currentDate = new Date(eventDates.start);

    while (currentDate <= eventDates.end) {
      const slots = generateTimeSlots(currentDate, allMeetings);
      days.push({
        date: new Date(currentDate),
        dayName: format(currentDate, 'EEEE', { locale: es }),
        dateFormatted: format(currentDate, 'MMM d', { locale: es }),
        isToday: isToday(currentDate),
        slots: slots,
        timeSlots: slots, // Map slots to timeSlots to satisfy the interface
        hasMeetings: slots.some(slot => slot.meeting) // Check if any slot has a meeting
      });
      currentDate = addDays(currentDate, 1);
    }

    return days;
  }, [allMeetings, eventDates.start, eventDates.end, generateTimeSlots]);

  const visibleMeetingIds = useMemo(
    () => (scheduleSearchResults ? new Set(scheduleSearchResults.map((m) => m.id)) : null),
    [scheduleSearchResults]
  );

  // Group time slots by hour for better organization
  const groupedSlots = useMemo(() => {
    const selectedDay = schedule.find((day: DaySchedule) => isSameDay(day.date, selectedDate));
    if (!selectedDay) return {};

    const grouped: {[hour: string]: TimeSlot[]} = {};

    selectedDay.timeSlots
      .filter((slot: TimeSlot) => !slot.meeting || !visibleMeetingIds || visibleMeetingIds.has(slot.meeting.id))
      .forEach((slot: TimeSlot) => {
      const hour = formatEventTime(slot.startTime, eventTimezoneOffset, false);
      if (!grouped[hour]) {
        grouped[hour] = [];
      }
      grouped[hour].push(slot);
    });

    return grouped;
  }, [schedule, selectedDate, eventTimezoneOffset, visibleMeetingIds]);

  // When a search/filter is actively narrowing results (visibleMeetingIds
  // set and smaller than the full list), auto-expand every hour group that
  // still has a match in it -- otherwise a match inside a collapsed hour
  // group would be invisible even though it "found" something.
  useEffect(() => {
    if (!visibleMeetingIds || visibleMeetingIds.size >= allMeetings.length) return;
    setExpandedHours((prev) => {
      const next = { ...prev };
      let changed = false;
      Object.keys(groupedSlots).forEach((hour) => {
        if (!next[hour]) {
          next[hour] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [visibleMeetingIds, groupedSlots, allMeetings.length]);

  // Deep-link from the Agenda tab's "check your agenda" link: select the
  // right day, expand the matching hour group, and scroll to it so the just
  // confirmed/unconfirmed item is actually visible instead of landing on
  // whatever day/scroll position this screen happened to be at.
  useEffect(() => {
    if (!params.scrollTo || params.scrollTo === handledScrollToRef.current) return;
    if (schedule.length === 0) return;

    const target = new Date(params.scrollTo);
    if (isNaN(target.getTime())) return;

    const targetDay = schedule.find((day: DaySchedule) => isSameDay(day.date, target));
    if (!targetDay) return;

    handledScrollToRef.current = params.scrollTo;
    setSelectedDate(targetDay.date);
    const hour = formatEventTime(target, eventTimezoneOffset, false);
    setExpandedHours(prev => ({ ...prev, [hour]: true }));

    // Wait a tick for the hour group to expand and lay out before measuring.
    setTimeout(() => {
      const node = hourGroupRefs.current[hour];
      const scrollNode = scrollViewRef.current;
      if (!node || !scrollNode) return;
      (node as any).measureLayout(
        scrollNode,
        (_x: number, y: number) => scrollNode.scrollTo({ y: Math.max(0, y - 12), animated: true }),
        () => {},
      );
    }, 150);
  }, [params.scrollTo, schedule, eventTimezoneOffset]);

  // Calculate day statistics for calendar view
  const dayStats = useMemo(() => {
    return schedule.map((day: DaySchedule) => {
      let confirmedCount = 0;
      let tentativeCount = 0;
      let interestedCount = 0;
      let blockedCount = 0;
      let favoritesCount = 0;
      
      (day.slots || []).forEach((slot: TimeSlot) => {
        const slotKey = slot.startTime.toISOString();
        const freeSlotStatus = userFreeSlotStatus[slotKey] || 'available';
        
        if (slot.meeting) {
          const isAgendaEvent = (slot.meeting as any).isAgendaEvent;
          if (isAgendaEvent && removedAgendaIds.has(slot.meeting.id)) return;
          const userStatus = isAgendaEvent 
            ? (userAgendaStatus[slot.meeting.id] || 'tentative')
            : (userMeetingStatus[slot.meeting.id] || 'tentative');
          
          if (userStatus === 'confirmed') {
            confirmedCount++;
          } else {
            tentativeCount++;
          }
          
          // Count favorites for agenda events
          if (isAgendaEvent && favoriteStatus[slot.meeting.id]) {
            favoritesCount++;
          }
        } else {
          if (freeSlotStatus === 'interested') {
            interestedCount++;
          } else if (freeSlotStatus === 'blocked') {
            blockedCount++;
          }
        }
      });
      
      return {
        date: day.date,
        confirmed: confirmedCount,
        tentative: tentativeCount,
        interested: interestedCount,
        blocked: blockedCount,
        favorites: favoritesCount,
        // Total only counts actively tracked slots (confirmed, interested, blocked) - excludes tentative defaults
        total: confirmedCount + interestedCount + blockedCount,
      };
    });
  }, [schedule, userAgendaStatus, userMeetingStatus, userFreeSlotStatus, favoriteStatus, removedAgendaIds]);

  // Keep an already-open summary synchronized with removals/restores. The
  // modal stores a snapshot when opened, so without this refresh its counts
  // would only change after closing and reopening it.
  useEffect(() => {
    if (!daySummaryModal.visible || !daySummaryModal.dayStat) return;
    const currentDayStat = dayStats.find((day) => isSameDay(day.date, daySummaryModal.dayStat!.date));
    if (!currentDayStat || currentDayStat === daySummaryModal.dayStat) return;
    setDaySummaryModal((previous) => previous.dayStat
      ? { ...previous, dayStat: currentDayStat }
      : previous);
  }, [dayStats, daySummaryModal.visible, daySummaryModal.dayStat?.date]);

  // Toggle expanded state for hour group
  const toggleHourGroup = (hour: string) => {
    setExpandedHours(prev => ({
      ...prev,
      [hour]: !prev[hour]
    }));
  };

  // Handle schedule slot confirmation/unconfirmation
  const handleToggleConfirmation = async (meeting: Meeting, slotStartTime: Date) => {
    if (!registryUserId) return;

    setIsConfirming(true);
    const isAgendaEvent = (meeting as any).isAgendaEvent;
    const isFreeSlot = (meeting as any).isFreeSlot;

    // Handle free slots differently
    if (isFreeSlot) {
      const slotKey = slotStartTime.toISOString();
      const currentStatus = userFreeSlotStatus[slotKey] || 'available';
      // Toggle between available and interested for free slots
      const newStatus = currentStatus === 'available' ? 'interested' : 'available';

      try {
        const { data: existing } = await supabase
          .from('user_agenda_status')
          .select('id')
          .eq('user_id', registryUserId)
          .eq('event_id', eventId)
          .eq('slot_time', slotStartTime.toISOString())
          .is('agenda_id', null)
          .is('meeting_id', null)
          .maybeSingle();

        if (existing) {
          // Update existing entry (including when going back to available)
          const { error } = await (supabase
            .from('user_agenda_status') as any)
            .update({
              slot_status: newStatus,
              status: newStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('id', (existing as any).id);
          if (error) throw error;

          if (newStatus === 'available') {
            setUserFreeSlotStatus(prev => {
              const next = { ...prev };
              delete next[slotKey];
              return next;
            });
          } else {
            setUserFreeSlotStatus(prev => ({
              ...prev,
              [slotKey]: newStatus,
            }));
          }
        } else {
          // Insert new tracking entry
          const { error } = await (supabase
            .from('user_agenda_status') as any)
            .insert({
              user_id: registryUserId,
              slot_time: slotStartTime.toISOString(),
              event_id: eventId,
              status: newStatus,
              slot_status: newStatus,
            });
          if (error) throw error;
          
          setUserFreeSlotStatus(prev => ({
            ...prev,
            [slotKey]: newStatus,
          }));
        }

        setConfirmationModal({ visible: false, meeting: null, slotStartTime: null });
      } catch (error) {
        console.error('Error toggling free slot status:', error);
        showError(t('mySchedule.errors.title'), newStatus === 'interested' ? t('mySchedule.errors.failedToMarkInterested') : t('mySchedule.errors.failedToClearStatus'));
      } finally {
        setIsConfirming(false);
      }
      return;
    }
    
    const currentStatus = isAgendaEvent 
      ? (userAgendaStatus[meeting.id] || 'tentative')
      : (userMeetingStatus[meeting.id] || 'tentative');
    const newStatus = currentStatus === 'confirmed' ? 'tentative' : 'confirmed';
    
    try {
      if (isAgendaEvent) {
        // Handle agenda event
        const { data: existing } = await supabase
          .from('user_agenda_status')
          .select('id')
          .eq('user_id', registryUserId)
          .eq('event_id', eventId)
          .eq('agenda_id', meeting.id)
          .maybeSingle();

        if (existing) {
          const { error } = await (supabase
            .from('user_agenda_status') as any)
            .update({
              status: newStatus,
              confirmed_at: newStatus === 'confirmed' ? new Date().toISOString() : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', (existing as any).id);

          if (error) throw error;
        } else {
          const { error } = await (supabase
            .from('user_agenda_status') as any)
            .insert({
              user_id: registryUserId,
              agenda_id: meeting.id,
              event_id: eventId,
              status: newStatus,
              confirmed_at: newStatus === 'confirmed' ? new Date().toISOString() : null,
            });

          if (error) throw error;
        }

        setUserAgendaStatus(prev => ({
          ...prev,
          [meeting.id]: newStatus,
        }));

        setDbMeetings(prev => prev.map(m => 
          m.id === meeting.id 
            ? { ...m, status: newStatus as 'confirmed' | 'tentative' }
            : m
        ));
      } else {
        // Handle personal meeting
        const { data: existing } = await supabase
          .from('user_agenda_status')
          .select('id')
          .eq('user_id', registryUserId)
          .eq('event_id', eventId)
          .eq('meeting_id', meeting.id)
          .maybeSingle();

        if (existing) {
          const { error } = await (supabase
            .from('user_agenda_status') as any)
            .update({
              status: newStatus,
              confirmed_at: newStatus === 'confirmed' ? new Date().toISOString() : null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', (existing as any).id);

          if (error) throw error;
        } else {
          const { error } = await (supabase
            .from('user_agenda_status') as any)
            .insert({
              user_id: registryUserId,
              meeting_id: meeting.id,
              event_id: eventId,
              status: newStatus,
              confirmed_at: newStatus === 'confirmed' ? new Date().toISOString() : null,
            });

          if (error) throw error;
        }

        setUserMeetingStatus(prev => ({
          ...prev,
          [meeting.id]: newStatus,
        }));
      }

      // Close modal
      setConfirmationModal({ visible: false, meeting: null, slotStartTime: null });
      // A toast, not the AgendaActionResultModal, is enough here — the user
      // is already on My Schedule, so a modal offering to "check your
      // agenda" would be pointless self-navigation. That modal is reserved
      // for the main Agenda tab (agenda.tsx), where it actually links
      // somewhere new.
      if (newStatus === 'confirmed') {
        showSuccess(t('messages.addedToAgenda', 'Added to agenda'));
      } else {
        showWarning(t('messages.removedFromAgenda', 'Removed from agenda'));
      }
    } catch (error) {
      console.error('Error toggling confirmation:', error);
      showError(t('mySchedule.errors.title'), newStatus === 'confirmed' ? t('mySchedule.errors.failedToConfirm') : t('mySchedule.errors.failedToUnconfirm'));
    } finally {
      setIsConfirming(false);
    }
  };

  const requestRemoveAgendaSession = (meeting: Meeting, slotStartTime: Date) => {
    setRemoveSessionModal({ meeting, slotStartTime });
  };

  const restoreRemovedAgendaSession = async (meeting: Meeting, previousStatus: 'confirmed' | 'tentative') => {
    if (!registryUserId) return;
    try {
      const { data: existing, error: lookupError } = await supabase
        .from('user_agenda_status')
        .select('id')
        .eq('user_id', registryUserId)
        .eq('event_id', eventId)
        .eq('agenda_id', meeting.id)
        .maybeSingle();
      if (lookupError) throw lookupError;

      const payload = {
        status: previousStatus,
        confirmed_at: previousStatus === 'confirmed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };
      if (existing?.id) {
        const { error } = await (supabase.from('user_agenda_status') as any).update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from('user_agenda_status') as any).insert({
          ...payload,
          user_id: registryUserId,
          event_id: eventId,
          agenda_id: meeting.id,
        });
        if (error) throw error;
      }
      setRemovedAgendaIds((prev) => {
        const next = new Set(prev);
        next.delete(meeting.id);
        return next;
      });
      setUserAgendaStatus((prev) => ({ ...prev, [meeting.id]: previousStatus }));
      showSuccess(t('mySchedule.sessionRestored', 'Session restored to your plan'));
    } catch (error) {
      console.error('Error restoring removed agenda session:', error);
      showError(t('mySchedule.errors.title'), t('mySchedule.errors.failedToRestore', 'Could not restore this session.'));
    }
  };

  const confirmRemoveAgendaSession = async () => {
    const meeting = removeSessionModal.meeting;
    if (!meeting || !registryUserId) return;
    const previousStatus = userAgendaStatus[meeting.id] || 'tentative';
    setIsRemovingSession(true);
    try {
      const { error } = await (supabase.from('user_agenda_status') as any)
        .delete()
        .eq('user_id', registryUserId)
        .eq('event_id', eventId)
        .eq('agenda_id', meeting.id);
      if (error) throw error;
      setRemovedAgendaIds((prev) => new Set(prev).add(meeting.id));
      setRemoveSessionModal({ meeting: null, slotStartTime: null });
      showSuccess(
        t('mySchedule.sessionRemoved', 'Session removed from your plan'),
        meeting.title,
        8000,
        { label: t('common.undo', 'Undo'), onPress: () => { void restoreRemovedAgendaSession(meeting, previousStatus); } },
      );
    } catch (error) {
      console.error('Error removing agenda session:', error);
      showError(t('mySchedule.errors.title'), t('mySchedule.errors.failedToRemove', 'Could not remove this session.'));
    } finally {
      setIsRemovingSession(false);
    }
  };

  // Handle free slot blocked status
  const handleToggleFreeSlotBlocked = async (slotStartTime: Date) => {
    if (!registryUserId) return;

    setIsConfirming(true);
    const slotKey = slotStartTime.toISOString();
    const currentStatus = userFreeSlotStatus[slotKey] || 'available';
    const newStatus = currentStatus === 'blocked' ? 'available' : 'blocked';

    try {
        const { data: existing } = await supabase
          .from('user_agenda_status')
          .select('id')
          .eq('user_id', registryUserId)
          .eq('event_id', eventId)
          .eq('slot_time', slotStartTime.toISOString())
          .is('agenda_id', null)
          .is('meeting_id', null)
        .maybeSingle();

      if (existing) {
        // Update existing entry (including when going back to available)
        const { error } = await (supabase
          .from('user_agenda_status') as any)
          .update({
            slot_status: newStatus,
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', (existing as any).id);
        if (error) throw error;
        
        if (newStatus === 'available') {
          setUserFreeSlotStatus(prev => {
            const next = { ...prev };
            delete next[slotKey];
            return next;
          });
        } else {
          setUserFreeSlotStatus(prev => ({
            ...prev,
            [slotKey]: newStatus,
          }));
        }
      } else {
        const { error } = await (supabase
          .from('user_agenda_status') as any)
          .insert({
            user_id: registryUserId,
            slot_time: slotStartTime.toISOString(),
            event_id: eventId,
            status: newStatus,
            slot_status: newStatus,
          });
        if (error) throw error;

        setUserFreeSlotStatus(prev => ({
          ...prev,
          [slotKey]: newStatus,
        }));
      }

      setConfirmationModal({ visible: false, meeting: null, slotStartTime: null });
    } catch (error) {
      console.error('Error toggling free slot blocked status:', error);
      showError(t('mySchedule.errors.title'), newStatus === 'blocked' ? t('mySchedule.errors.failedToBlock') : t('mySchedule.errors.failedToUnblock'));
    } finally {
      setIsConfirming(false);
    }
  };

  // Filter groups for the search bar, same shape/pattern as agenda.tsx's
  // filterGroups. Status here is computed live from userAgendaStatus /
  // userMeetingStatus (not each Meeting's own `status` field, which is only
  // a snapshot taken when the item was mapped) so the filter always matches
  // what the card itself currently shows.
  const scheduleFilterGroups = useMemo(() => [
    {
      key: 'status',
      label: t('mySchedule.filter.status', 'Status'),
      type: 'single' as const,
      options: [
        { key: 'confirmed', label: t('mySchedule.status.confirmed'), icon: 'check-circle' },
        { key: 'tentative', label: t('mySchedule.status.tentative'), icon: 'radio-button-unchecked' },
      ],
    },
  ], [t]);

  const scheduleCustomFilterLogic = useCallback(
    (items: Meeting[], filters: { search?: string; status?: string }, searchQuery: string) => {
      let filtered = items;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter((m: any) =>
          m.title?.toLowerCase().includes(q) ||
          m.participants?.some((p: string) => p.toLowerCase().includes(q)) ||
          m.speaker_name?.toLowerCase().includes(q) ||
          m.requester_name?.toLowerCase().includes(q)
        );
      }
      if (filters.status) {
        filtered = filtered.filter((m: any) => {
          const liveStatus = m.isAgendaEvent
            ? (userAgendaStatus[m.id] || 'tentative')
            : ((userMeetingStatus[m.id] || 'tentative') === 'confirmed' ? 'confirmed' : 'tentative');
          return liveStatus === filters.status;
        });
      }
      return filtered;
    },
    [userAgendaStatus, userMeetingStatus]
  );

  const [isSharingDay, setIsSharingDay] = useState(false);
  const [shareSheet, setShareSheet] = useState<{ visible: boolean; shareUrl: string; imageUrl?: string; imageFileName?: string; mode?: 'preview' | 'share' }>({
    visible: false,
    shareUrl: '',
    imageUrl: '',
  });
  const [previewScale, setPreviewScale] = useState(1);

  // Mints (or reuses) a public share token for this event via POST
  // /schedule/share-token, then opens a share sheet with: the live-updating
  // link (app/events/[eventSlug]/schedule/live/[shareToken].tsx) and a
  // branded per-day image (app/api/.../schedule/public/:token/image),
  // day-scoped to the given date (defaults to whatever day is currently
  // selected on screen) and localized to the viewer's current app language.
  //
  // The URLs are built against the *current* site origin, not a hardcoded
  // domain: this app runs under multiple real domains (hashpass.tech,
  // bsl.hashpass.tech for the BSL tenant) plus local/dev servers during
  // testing, and a hardcoded "hashpass.tech" would generate a share link
  // that resolves to the wrong tenant's site (or nothing, locally) whenever
  // this runs anywhere else. On web, window.location.origin is ground
  // truth for what site is actually running right now; native has no
  // window, so it falls back to the public production domain.
  const resolveShareOrigin = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return 'https://hashpass.tech';
  };

  const handleShareMyDay = async (forDate: Date = selectedDate, includeImage = true, previewOnly = false, omitPast = excludePastSessions) => {
    setIsSharingDay(true);
    try {
      const response = await apiClient.request(`${eventApiPath(eventId, 'schedule')}/share-token`, {
        method: 'POST',
        skipEventSegment: true,
      });
      if (!response.success || !response.data?.shareToken) {
        throw new Error(response.error || 'Failed to create share link');
      }
      const dayNumber = Math.max(1, Math.round((forDate.getTime() - eventDates.start.getTime()) / 86_400_000) + 1);
      const locale = getCurrentLocale();
      const origin = resolveShareOrigin();
      const shareUrl = `${origin}/events/${eventId}/schedule/live/${response.data.shareToken}`;
      const apiOrigin = getRuntimeApiBaseUrl().replace(/\/$/, '');
      const imageUrl = `${apiOrigin}/${eventApiPath(eventId, 'schedule')}/public/${response.data.shareToken}/image?day=${dayNumber}&locale=${locale}${omitPast ? '&excludePast=1' : ''}`;
      setPreviewScale(1);
      setShareSheet({
        visible: true,
        shareUrl,
        mode: previewOnly ? 'preview' : 'share',
        ...(includeImage
          ? { imageUrl, imageFileName: `${eventId}-my-agenda-day${dayNumber}.png` }
          : {}),
      });
    } catch {
      showError(t('mySchedule.errors.title'), t('mySchedule.shareLinkFailed', 'Could not create the share link. Please try again.'));
    } finally {
      setIsSharingDay(false);
    }
  };

  const shareCtaMessage = (shareUrl: string) => {
    const message = t(
      'mySchedule.shareMessage',
      'Join me — this is my agenda at {eventName}, see you at the event! {url}',
      { eventName: event?.name || eventId, url: shareUrl },
    );
    return message;
  };

  const openShareIntent = async (platform: 'whatsapp' | 'x' | 'facebook') => {
    const text = encodeURIComponent(shareCtaMessage(shareSheet.shareUrl));
    const url = encodeURIComponent(shareSheet.shareUrl);
    const intentUrl = {
      whatsapp: `https://wa.me/?text=${text}`,
      x: `https://twitter.com/intent/tweet?text=${text}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    }[platform];
    if (Platform.OS === 'web') {
      window.open(intentUrl, '_blank');
    } else {
      const { Linking } = await import('react-native');
      await Linking.openURL(intentUrl);
    }
  };

  const copyToClipboard = async (value: string, successMessage: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(value);
    } else {
      const Clipboard = await import('expo-clipboard');
      await Clipboard.setStringAsync(value);
    }
    showSuccess(successMessage);
  };

  const handleDownloadImage = async () => {
    if (!shareSheet.imageUrl) return;
    if (Platform.OS === 'web') {
      // The API keeps SVG as its canonical format so it remains lightweight
      // and renders crisply everywhere. Convert it to PNG in the browser for
      // downloads, which is accepted by social apps that do not preview SVG.
      try {
        const response = await fetch(shareSheet.imageUrl);
        if (!response.ok) throw new Error(`Image request failed (${response.status})`);
        let svgText = await response.text();
        const imageRefs = [...svgText.matchAll(/href="(https?:[^\"]+)"/g)].map((match) => match[1]);
        await Promise.all(imageRefs.map(async (imageUrl) => {
          try {
            const assetResponse = await fetch(imageUrl);
            if (!assetResponse.ok) return;
            const assetBlob = await assetResponse.blob();
            const dataUrl = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(assetBlob);
            });
            svgText = svgText.split(`href="${imageUrl}"`).join(`href="${dataUrl}"`);
          } catch {
            // The SVG fallback can still render the original URL.
          }
        }));
        const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
        const objectUrl = URL.createObjectURL(svgBlob);
        const image = new Image();
        image.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('Unable to rasterize agenda image'));
          image.src = objectUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth || 1080;
        canvas.height = image.naturalHeight || 1350;
        canvas.getContext('2d')?.drawImage(image, 0, 0);
        URL.revokeObjectURL(objectUrl);
        const pngBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!pngBlob) throw new Error('Unable to create PNG');
        const pngUrl = URL.createObjectURL(pngBlob);
        const link = document.createElement('a');
        link.href = pngUrl;
        link.download = shareSheet.imageFileName || `${eventId}-my-agenda-day1.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
      } catch (error) {
        console.warn('[schedule-share] PNG conversion failed; downloading SVG', error);
        const link = document.createElement('a');
        link.href = shareSheet.imageUrl;
        link.download = (shareSheet.imageFileName || `${eventId}-my-agenda-day1.png`).replace(/\.png$/, '.svg');
        link.click();
      }
    } else {
      const { Linking } = await import('react-native');
      await Linking.openURL(shareSheet.imageUrl);
    }
  };

  // Resolves an agenda item's speaker slug/name to a display name, avatar
  // image, and navigable speaker id -- same config-lookup strategy as
  // agenda.tsx's resolveAgendaSpeaker (minus its DB-directory fallback,
  // which this screen doesn't have the infra for), so speaker chips look
  // and behave consistently between the Agenda tab and My Schedule.
  const resolveMeetingSpeaker = (value: string): { id: string | null; displayName: string; image?: string } => {
    const speakers = (event as any)?.speakers as Array<{ id: string; name: string; image?: string }> | undefined;
    if (speakers) {
      const byId = speakers.find((s) => s.id === value);
      if (byId) return { id: byId.id, displayName: byId.name, image: byId.image };
      const byName = speakers.find((s) =>
        s.name.toLowerCase().includes(value.toLowerCase()) || value.toLowerCase().includes(s.name.toLowerCase())
      );
      if (byName) return { id: byName.id, displayName: byName.name, image: byName.image };
    }
    return { id: null, displayName: value };
  };

  // Handle favorite toggle for confirmed agenda events
  const handleToggleFavorite = async (meeting: Meeting) => {
    if (!registryUserId) return;

    const isAgendaEvent = (meeting as any).isAgendaEvent;
    if (!isAgendaEvent) return; // Only for agenda events

    const currentFavorite = favoriteStatus[meeting.id] || false;
    const newFavorite = !currentFavorite;

    // Provide haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
        const { data: existing } = await supabase
          .from('user_agenda_status')
          .select('id')
          .eq('user_id', registryUserId)
          .eq('event_id', eventId)
          .eq('agenda_id', meeting.id)
          .maybeSingle();

      if (existing) {
        const { error } = await (supabase
          .from('user_agenda_status') as any)
          .update({
            is_favorite: newFavorite,
            updated_at: new Date().toISOString(),
          })
          .eq('id', (existing as any).id);
        if (error) throw error;
      } else {
        // Create entry for tentative event with favorite status
        const currentStatus = userAgendaStatus[meeting.id] || 'tentative';
        const { error } = await (supabase
          .from('user_agenda_status') as any)
          .insert({
            user_id: registryUserId,
            agenda_id: meeting.id,
            event_id: eventId,
            status: currentStatus,
            is_favorite: newFavorite,
          });
        if (error) throw error;
      }

      setFavoriteStatus(prev => ({
        ...prev,
        [meeting.id]: newFavorite,
      }));
      
      // Show appropriate message based on action
      if (newFavorite) {
        showSuccess(t('mySchedule.messages.addedToFavorites'));
      } else {
        showWarning(t('mySchedule.messages.removedFromFavorites'));
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      showError(t('mySchedule.errors.title'), newFavorite ? t('mySchedule.errors.failedToAddToFavorites') : t('mySchedule.errors.failedToRemoveFromFavorites'));
    }
  };

  // Show confirmation modal
  const showConfirmationModal = (meeting: Meeting, slotStartTime: Date) => {
    setConfirmationModal({
      visible: true,
      meeting,
      slotStartTime,
    });
  };

  // Render a single time slot
  const renderTimeSlot = (slot: TimeSlot) => {
    const isExpanded = expandedHours[formatEventTime(slot.startTime, eventTimezoneOffset, false)];

    if (slot.meeting) {
      const meeting = slot.meeting;
      const isAgendaEvent = (meeting as any).isAgendaEvent;
      // Get actual status from user schedule status
      const userStatus = isAgendaEvent 
        ? (userAgendaStatus[meeting.id] || 'tentative')
        : (userMeetingStatus[meeting.id] || 'tentative');
      const isTentative = userStatus === 'tentative';
      const isConfirmed = userStatus === 'confirmed';
      const isFav = favoriteStatus[meeting.id] || false;
      const statusColor = isConfirmed ? '#2E7D32' :
                         meeting.status === 'in_progress' ? '#F57F17' : 
                         isTentative ? '#FF9800' : '#C62828';
      const statusBgColor = `${statusColor}20`;
      
      const handlePress = () => {
        // Show confirmation modal for all slots
        showConfirmationModal(meeting, slot.startTime);
      };

      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity 
            onPress={handlePress} 
            activeOpacity={0.8} 
            style={[
              styles.meetingSlot,
              {
                flex: 1,
                backgroundColor: isDark ? colors.surface : '#F8F9FA',
                borderLeftColor: isTentative ? '#FF9800' : colors.success.main,
                shadowColor: '#000000',
                shadowOpacity: isDark ? 0.2 : 0.05,
                shadowOffset: { width: 0, height: 1 },
                shadowRadius: 2,
                elevation: isDark ? 3 : 1,
              }
            ]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.meetingTime, { color: colors.text.secondary }]}>
                {formatEventTime(slot.startTime, eventTimezoneOffset)}
              </Text>
              <View style={[styles.statusIndicator, { backgroundColor: statusBgColor }]}>
                <Text style={[styles.statusText, { color: statusColor }]}>
                  {(isConfirmed ? t('mySchedule.status.confirmed') : t('mySchedule.status.tentative')).toUpperCase()}
                </Text>
              </View>
            </View>
            <Text style={[styles.meetingTitle, { color: colors.text.primary }]}> 
              {meeting.title}
            </Text>
            <Text style={[styles.meetingLocation, { color: colors.text.secondary }]}> 
              {meeting.location}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <MaterialIcons
                  name={isConfirmed ? 'check-circle' : 'radio-button-unchecked'}
                  size={18}
                  color={isConfirmed ? colors.success.main : colors.text.secondary}
                  style={{ marginRight: 6 }}
                />
                <Text style={{ 
                  color: isConfirmed ? colors.success.main : colors.text.secondary,
                  fontSize: 13 
                }}>
                  {isConfirmed ? t('mySchedule.messages.confirmedAttendance') : t('mySchedule.messages.tapToConfirmAttendance')}
                </Text>
              </View>
                  {isAgendaEvent && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  {/* Opens the official session card in the main Agenda tab, for full details (speakers, description) this compact card doesn't show. */}
                  <TouchableOpacity
                    onPress={() => router.push(`/events/${eventId}/agenda?session=${encodeURIComponent(meeting.id)}` as any)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: 4 }}
                    accessibilityLabel={t('mySchedule.viewInAgenda', 'View in agenda')}
                  >
                    <MaterialIcons name="open-in-new" size={16} color={colors.primary} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: colors.primary }}>
                      {t('mySchedule.viewInAgenda', 'View in agenda')}
                    </Text>
                  </TouchableOpacity>
                  {/* Favorite button for agenda events (confirmed or tentative) */}
                  <TouchableOpacity
                    onPress={() => handleToggleFavorite(meeting)}
                    style={{ padding: 4 }}
                  >
                    <MaterialIcons
                      name={isFav ? 'star' : 'star-border'}
                      size={20}
                      color={isFav ? '#FFD700' : colors.text.secondary}
                    />
                  </TouchableOpacity>
                </View>
              )}
              {!isAgendaEvent && (meeting as any).meeting_request_id && (
                <TouchableOpacity
                  onPress={() => router.push({
                    pathname: `/events/${eventId}/networking/meeting-detail` as any,
                    params: {
                      meetingId: (meeting as any).meeting_request_id,
                      speakerName: (meeting as any).speaker_name,
                      status: meeting.status,
                      message: meeting.description || '',
                      scheduledAt: (meeting as any).scheduled_at || '',
                      location: meeting.location || 'TBD',
                      duration: (meeting as any).duration_minutes || 30,
                      isSpeaker: dbUserId && dbUserId !== (meeting as any).requester_id ? 'true' : 'false',
                    },
                  })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 2, padding: 4 }}
                  accessibilityLabel={t('mySchedule.viewMeetingRequest', 'View meeting request')}
                >
                  <MaterialIcons name="open-in-new" size={16} color={colors.primary} />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.primary }}>
                    {t('mySchedule.viewMeetingRequest', 'View meeting request')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {(meeting?.participants?.length ?? 0) > 0 && (
              <View style={[
                styles.participantsContainer,
                { borderTopColor: colors.divider }
              ]}>
                <MaterialIcons
                  name="people"
                  size={14}
                  color={colors.text.secondary}
                  style={styles.icon}
                />
                <View style={styles.speakerChipsRow}>
                  {meeting?.participants?.map((participant: string, index: number) => {
                    const { id: speakerId, displayName, image } = isAgendaEvent
                      ? resolveMeetingSpeaker(participant)
                      : { id: null, displayName: participant, image: undefined };
                    const chipContent = (
                      <>
                        <SpeakerAvatar name={displayName} imageUrl={image} size={20} />
                        <Text
                          style={[
                            styles.participantsText,
                            { color: speakerId ? colors.primary : colors.text.secondary },
                          ]}
                          numberOfLines={1}
                        >
                          {displayName}
                        </Text>
                      </>
                    );
                    return speakerId ? (
                      <TouchableOpacity
                        key={index}
                        style={styles.speakerChip}
                        onPress={() => router.push(`/events/${eventId}/speakers/${speakerId}` as any)}
                      >
                        {chipContent}
                      </TouchableOpacity>
                    ) : (
                      <View key={index} style={styles.speakerChip}>{chipContent}</View>
                    );
                  })}
                </View>
              </View>
            )}
          </TouchableOpacity>
          
          {/* Show + icon for TENTATIVE slots - same style as free slots */}
          {isTentative && (() => {
            const slotKey = slot.startTime.toISOString();
            const freeSlotStatus = userFreeSlotStatus[slotKey] || 'available';
            const isTracked = freeSlotStatus !== 'available';
            
            const handleTentativeSlotFreeSlotPress = () => {
              // Show modal for free slot to mark as interested/blocked/tentative
              setConfirmationModal({
                visible: true,
                meeting: {
                  id: `free-slot-${slotKey}`,
                  title: t('mySchedule.freeSlot.freeSlotAvailable'),
                  location: t('mySchedule.messages.available'),
                  startTime: slot.startTime.toISOString(),
                  endTime: slot.endTime.toISOString(),
                  status: freeSlotStatus as any,
                  type: 'meeting',
                  isFreeSlot: true,
                } as Meeting & { isFreeSlot?: boolean },
                slotStartTime: slot.startTime,
              });
            };
            
            return (
              <TouchableOpacity
                onPress={handleTentativeSlotFreeSlotPress}
                style={[
                  styles.emptySlot,
                  {
                    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                    borderColor: isTracked 
                      ? (freeSlotStatus === 'interested' ? '#F44336' : colors.text.secondary)
                      : (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'),
                    borderWidth: isTracked ? 2 : 1,
                    shadowColor: '#000000',
                    shadowOpacity: isDark ? 0.15 : 0.05,
                    shadowOffset: { width: 0, height: 1 },
                    shadowRadius: 2,
                    elevation: isDark ? 2 : 1,
                    width: 60,
                    marginBottom: 0,
                    position: 'relative',
                  }
                ]}
                activeOpacity={0.8}
              >
                <Text style={[styles.meetingTime, { 
                  color: colors.text.secondary,
                  position: 'absolute',
                  top: 4,
                  left: 4,
                }]}>
                  {formatEventTime(slot.startTime, eventTimezoneOffset)}
                </Text>
                <MaterialIcons
                  name={
                    freeSlotStatus === 'interested' ? 'favorite' :
                    freeSlotStatus === 'blocked' ? 'block' :
                    freeSlotStatus === 'tentative' ? 'schedule' :
                    'add-circle-outline'
                  }
                  size={20}
                  color={
                    freeSlotStatus === 'interested' ? '#F44336' :
                    freeSlotStatus === 'blocked' ? colors.error.main :
                    freeSlotStatus === 'tentative' ? '#FF9800' :
                    colors.primary
                  }
                />
                {isTracked && (
                  <Text style={[styles.freeSlotLabel, { 
                    color: freeSlotStatus === 'interested' ? '#F44336' :
                           freeSlotStatus === 'blocked' ? colors.error.main :
                           '#FF9800',
                    fontSize: 8,
                  }]}>
                    {freeSlotStatus === 'interested' ? t('mySchedule.status.interestedShort') :
                     freeSlotStatus === 'blocked' ? t('mySchedule.status.blockedShort') :
                     t('mySchedule.status.tentativeShort')}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })()}
        </View>
      );
    }

    // Check if this free slot has been tracked
    const slotKey = slot.startTime.toISOString();
    const freeSlotStatus = userFreeSlotStatus[slotKey] || 'available';
    const isTracked = freeSlotStatus !== 'available';
    
    const handleFreeSlotPress = () => {
      // Show modal for free slot to mark as interested/blocked/tentative
      setConfirmationModal({
        visible: true,
        meeting: {
          id: `free-slot-${slotKey}`,
          title: t('mySchedule.freeSlot.freeSlotAvailable'),
          location: t('mySchedule.messages.available'),
          startTime: slot.startTime.toISOString(),
          endTime: slot.endTime.toISOString(),
          status: freeSlotStatus as any,
          type: 'meeting',
          isFreeSlot: true,
        } as Meeting & { isFreeSlot?: boolean },
        slotStartTime: slot.startTime,
      });
    };

    return (
      <TouchableOpacity
        style={[
          styles.emptySlot,
          {
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
            borderColor: isTracked 
              ? (freeSlotStatus === 'interested' ? '#F44336' : colors.text.secondary)
              : (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'),
            borderWidth: isTracked ? 2 : 1,
            shadowColor: '#000000',
            shadowOpacity: isDark ? 0.15 : 0.05,
            shadowOffset: { width: 0, height: 1 },
            shadowRadius: 2,
            elevation: isDark ? 2 : 1,
            position: 'relative',
          }
        ]}
        onPress={handleFreeSlotPress}
      >
        <Text style={[styles.meetingTime, { 
          color: colors.text.secondary,
          position: 'absolute',
          top: 4,
          left: 4,
        }]}>
          {formatEventTime(slot.startTime, eventTimezoneOffset)}
        </Text>
        <MaterialIcons
          name={
            freeSlotStatus === 'interested' ? 'favorite' :
            freeSlotStatus === 'blocked' ? 'block' :
            freeSlotStatus === 'tentative' ? 'schedule' :
            'add-circle-outline'
          }
          size={20}
          color={
            freeSlotStatus === 'interested' ? '#F44336' :
            freeSlotStatus === 'blocked' ? colors.error.main :
            freeSlotStatus === 'tentative' ? '#FF9800' :
            colors.primary
          }
        />
        {isTracked && (
          <Text style={[styles.freeSlotLabel, { 
            color: freeSlotStatus === 'interested' ? '#F44336' :
                   freeSlotStatus === 'blocked' ? colors.error.main :
                   '#FF9800'
          }]}>
            {freeSlotStatus === 'interested' ? t('mySchedule.status.interested') :
             freeSlotStatus === 'blocked' ? t('mySchedule.status.blocked') :
             t('mySchedule.status.tentative')}
          </Text>
        )}
      </TouchableOpacity>
    );
  };

  // Render hour group
  const renderHourGroup = (hour: string, slots: TimeSlot[]) => {
    const hasMeetings = slots.some(slot => slot.meeting);
    
    // Count tracked slots: confirmed events, blocked slots, and interested slots
    let trackedCount = 0;
    slots.forEach(slot => {
      const slotKey = slot.startTime.toISOString();
      const freeSlotStatus = userFreeSlotStatus[slotKey] || 'available';
      const hasFreeSlotStatus = freeSlotStatus === 'blocked' || freeSlotStatus === 'interested';
      
      if (slot.meeting) {
        const isAgendaEvent = (slot.meeting as any).isAgendaEvent;
        const userStatus = isAgendaEvent 
          ? (userAgendaStatus[slot.meeting.id] || 'tentative')
          : (userMeetingStatus[slot.meeting.id] || 'tentative');
        
        // Count if event is confirmed OR if free slot has status (even if event is tentative)
        if (userStatus === 'confirmed' || hasFreeSlotStatus) {
          trackedCount++;
        }
      } else {
        // Free slot without meeting
        if (hasFreeSlotStatus) {
          trackedCount++;
        }
      }
    });
    
    const totalSlots = slots.length;
    const isExpanded = expandedHours[hour] ?? false;

    return (
      <View
        key={hour}
        ref={(el) => { hourGroupRefs.current[hour] = el; }}
        style={[
          styles.hourGroup,
          {
            backgroundColor: colors.background.paper,
            borderColor: colors.divider,
            shadowColor: '#000000',
            shadowOpacity: isDark ? 0.4 : 0.1,
            shadowOffset: { width: 0, height: 2 },
            shadowRadius: 4,
            elevation: isDark ? 4 : 2,
          }
        ]}>
        <TouchableOpacity
          style={[
            styles.hourHeader,
            { backgroundColor: isDark ? colors.surface : 'rgba(0, 0, 0, 0.05)' }
          ]}
          onPress={() => toggleHourGroup(hour)}
        >
          <View style={styles.hourHeaderContent}>
            <Text style={[styles.hourText, { color: colors.text.primary }]}>
              {hour}
            </Text>
            <View style={styles.slotInfo}>
              <Text style={[styles.slotCount, { color: colors.text.secondary }]}>
                {trackedCount}/{totalSlots}
              </Text>
              <MaterialIcons
                name={isExpanded ? 'expand-less' : 'expand-more'}
                size={20}
                color={colors.text.secondary}
              />
            </View>
          </View>
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.timeSlotsContainer}>
            {slots.map((slot) => (
              <View key={slot.id} style={styles.slotWrapper}>
                {renderTimeSlot(slot)}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={[
      styles.container,
      { backgroundColor: colors.background.primary }
    ]}>
      <SystemBars style={isDark ? 'light' : 'dark'} />

      {/* Sticky, floats over the Resumen de Agenda card -- rendered outside
          the ScrollView so it stays fixed on screen instead of scrolling
          away with the content beneath it. */}
      <TouchableOpacity
        onPress={() => handleShareMyDay(selectedDate, false)}
        disabled={isSharingDay}
        accessibilityLabel={t('mySchedule.shareMyAgenda', 'Share my agenda')}
        style={[
          styles.shareStickyButton,
          { backgroundColor: colors.primary, shadowColor: '#000000' },
        ]}
      >
        {isSharingDay ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <MaterialIcons name="share" size={16} color="#FFFFFF" />
        )}
        <Text style={styles.shareStickyButtonText}>
          {t('mySchedule.shareMyAgenda', 'Share my agenda')}
        </Text>
      </TouchableOpacity>

      {/* Scrollable Content - Includes Calendar and Time Slots */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={true}
      >
        {/* Calendar Week View */}
        <CopilotStep text="This is your schedule view. Select a date to see your meetings and time slots. Tap on meetings to confirm or mark as tentative. You can also mark free time slots as interested or blocked." order={103} name="networkingSchedule">
          <CopilotView style={[
            styles.calendarContainer,
            {
              backgroundColor: colors.background.paper,
              borderBottomColor: colors.divider,
            }
          ]}>
            <View style={[styles.calendarHeader, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
              <Text style={[styles.calendarTitle, { color: colors.text.primary }]}>
                {t('mySchedule.scheduleOverview')}
              </Text>
            </View>
            <View style={styles.calendarWeek}>
            {dayStats.map((dayStat) => {
              const isSelected = isSameDay(dayStat.date, selectedDate);
              const isCurrentDay = isToday(dayStat.date);
              
              return (
                <TouchableOpacity
                  key={dayStat.date.toString()}
                  style={[
                    styles.calendarDay,
                    {
                      backgroundColor: isSelected 
                        ? colors.primary 
                        : isDark 
                        ? colors.surface 
                        : '#FFFFFF',
                      borderColor: isSelected 
                        ? colors.primary 
                        : isCurrentDay 
                        ? colors.primary 
                        : colors.divider,
                      borderWidth: isSelected || isCurrentDay ? 2 : 1,
                    }
                  ]}
                  onPress={() => {
                    setSelectedDate(dayStat.date);
                    setDaySummaryModal({ visible: true, dayStat });
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[
                    styles.calendarDayName,
                    { 
                      color: isSelected 
                        ? '#FFFFFF' 
                        : isCurrentDay 
                        ? colors.primary 
                        : colors.text.secondary 
                    }
                  ]}>
                    {format(dayStat.date, 'EEE')}
                  </Text>
                  <Text style={[
                    styles.calendarDayNumber,
                    { 
                      color: isSelected 
                        ? '#FFFFFF' 
                        : colors.text.primary 
                    }
                  ]}>
                    {format(dayStat.date, 'd')}
                  </Text>
                  
                  {/* Indicators */}
                  <View style={styles.calendarIndicators}>
                    {dayStat.confirmed > 0 && (
                      <View style={[styles.indicatorDot, { backgroundColor: '#4CAF50' }]} />
                    )}
                    {dayStat.tentative > 0 && (
                      <View style={[styles.indicatorDot, { backgroundColor: '#FF9800' }]} />
                    )}
                    {dayStat.interested > 0 && (
                      <View style={[styles.indicatorDot, { backgroundColor: '#F44336' }]} />
                    )}
                    {dayStat.blocked > 0 && (
                      <View style={[styles.indicatorDot, { backgroundColor: colors.error.main }]} />
                    )}
                  </View>
                  
                  {/* Count badge */}
                  {dayStat.total > 0 && (
                    <View style={[
                      styles.countBadge,
                      {
                        backgroundColor: isSelected 
                          ? 'rgba(255, 255, 255, 0.3)' 
                          : colors.primary + '20',
                      }
                    ]}>
                      <Text style={[
                        styles.countBadgeText,
                        { 
                          color: isSelected 
                            ? '#FFFFFF' 
                            : colors.primary 
                        }
                      ]}>
                        {dayStat.total}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          
          {/* Legend */}
          <View style={styles.calendarLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
              <Text style={[styles.legendText, { color: colors.text.secondary }]}>{t('mySchedule.status.confirmed')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#FF9800' }]} />
              <Text style={[styles.legendText, { color: colors.text.secondary }]}>{t('mySchedule.status.tentative')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#F44336' }]} />
              <Text style={[styles.legendText, { color: colors.text.secondary }]}>{t('mySchedule.status.interested')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.error.main }]} />
              <Text style={[styles.legendText, { color: colors.text.secondary }]}>{t('mySchedule.status.blocked')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[
                styles.legendCircleWithNumber,
                {
                  backgroundColor: colors.primary + '20',
                  borderColor: colors.primary,
                }
              ]}>
                <Text style={[
                  styles.legendCircleNumber,
                  { color: colors.primary }
                ]}>
                  {dayStats.reduce((sum, day) => sum + day.total, 0)}
                </Text>
              </View>
              <Text style={[styles.legendText, { color: colors.text.secondary }]}>{t('mySchedule.scheduledSlots')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[
                styles.legendCircleWithNumber,
                {
                  backgroundColor: '#FFD70020',
                  borderColor: '#FFD700',
                }
              ]}>
                <MaterialIcons name="star" size={11} color="#FFD700" />
              </View>
              <Text style={[styles.legendText, { color: colors.text.secondary }]}>
                {dayStats.reduce((sum, day) => sum + day.favorites, 0)} {t('mySchedule.favorites', 'Favorites')}
              </Text>
            </View>
          </View>
          </CopilotView>
        </CopilotStep>

        {/* Search + Filter -- same reusable component, filter groups and
            results-count styling as the Agenda tab's UnifiedSearchAndFilter,
            for a consistent look between the two screens. */}
        {allMeetings.length > 0 && (
          <UnifiedSearchAndFilter
            data={allMeetings}
            onFilteredData={setScheduleSearchResults}
            onSearchChange={() => {}}
            searchPlaceholder={t('mySchedule.searchPlaceholder', 'Search sessions, speakers or keywords...')}
            searchFields={['title', 'participants', 'speaker_name', 'requester_name']}
            filterGroups={scheduleFilterGroups}
            customFilterLogic={scheduleCustomFilterLogic}
            showResultsCount={true}
          />
        )}

        <View style={[styles.calendarHeader, { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 8 }]}>
          <TouchableOpacity
            onPress={() => {
              const anyExpanded = Object.values(expandedHours).some(Boolean);
              if (anyExpanded) {
                setExpandedHours({});
              } else {
                const allHours: { [hour: string]: boolean } = {};
                Object.keys(groupedSlots).forEach((hour) => { allHours[hour] = true; });
                setExpandedHours(allHours);
              }
            }}
            accessibilityLabel={
              Object.values(expandedHours).some(Boolean)
                ? t('mySchedule.collapseAll', 'Collapse all')
                : t('mySchedule.expandAll', 'Expand all')
            }
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 }}
          >
            <MaterialIcons
              name={Object.values(expandedHours).some(Boolean) ? 'expand-less' : 'expand-more'}
              size={18}
              color={colors.primary}
            />
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>
              {Object.values(expandedHours).some(Boolean)
                ? t('mySchedule.collapseAll', 'Collapse all')
                : t('mySchedule.expandAll', 'Expand all')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => loadUserScheduleStatus()}
            disabled={isReloadingStatus}
            accessibilityLabel={t('mySchedule.reloadAgenda', 'Reload agenda')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6 }}
          >
            <MaterialIcons name="refresh" size={18} color={colors.primary} style={isReloadingStatus ? { opacity: 0.5 } : undefined} />
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.primary }}>
              {t('mySchedule.reload', 'Reload')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Time Slots */}
        <View style={styles.content}>
          {Object.entries(groupedSlots).map(([hour, slots]) =>
            renderHourGroup(hour, slots)
          )}

          {/* My Meetings moved to dedicated page: /events/${eventId}/networking/my-meetings */}
        </View>
      </ScrollView>

      {/* Confirmation Modal */}
      {confirmationModal.meeting && confirmationModal.slotStartTime && (
        <ScheduleConfirmationModal
          visible={confirmationModal.visible}
          title={confirmationModal.meeting.title || t('agenda.messages.untitledEvent')}
          location={confirmationModal.meeting.location}
          startTime={confirmationModal.slotStartTime}
          eventTzOffset={eventTimezoneOffset}
          isConfirmed={(confirmationModal.meeting as any).isFreeSlot
            ? (userFreeSlotStatus[confirmationModal.slotStartTime.toISOString()] || 'available') === 'interested'
            : (confirmationModal.meeting as any).isAgendaEvent
            ? (userAgendaStatus[confirmationModal.meeting.id] || 'tentative') === 'confirmed'
            : (userMeetingStatus[confirmationModal.meeting.id] || 'tentative') === 'confirmed'}
          onConfirm={() => handleToggleConfirmation(confirmationModal.meeting!, confirmationModal.slotStartTime!)}
          onCancel={() => setConfirmationModal({ visible: false, meeting: null, slotStartTime: null })}
          isLoading={isConfirming}
          isFreeSlot={(confirmationModal.meeting as any).isFreeSlot}
          freeSlotStatus={userFreeSlotStatus[confirmationModal.slotStartTime.toISOString()] || 'available'}
          isAgendaEvent={(confirmationModal.meeting as any).isAgendaEvent}
          isFavorite={favoriteStatus[confirmationModal.meeting.id] || false}
          onToggleFavorite={() => confirmationModal.meeting && handleToggleFavorite(confirmationModal.meeting)}
          onToggleBlocked={() => handleToggleFreeSlotBlocked(confirmationModal.slotStartTime!)}
          // No onViewAgenda here: we're already on My Schedule, so a "check
          // your agenda" link would just point back at this same screen.
          // That link (and the post-action result modal) is reserved for
          // the main Agenda tab, where it navigates somewhere new — see
          // agenda.tsx.
        />
      )}

      {/* Share My Agenda sheet */}
      <Modal visible={shareSheet.visible} transparent animationType="fade" onRequestClose={() => setShareSheet((prev) => ({ ...prev, visible: false }))}>
        <View style={styles.shareSheetOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShareSheet((prev) => ({ ...prev, visible: false }))} />
          <View
            style={[styles.shareSheetCard, { backgroundColor: colors.background.paper }]}
          >
            {shareSheet.mode === 'preview' && shareSheet.imageUrl ? (
              <>
                <Text style={[styles.shareSheetTitle, { color: colors.text.primary }]}>
                  {t('mySchedule.snapshotPreview', 'Your shareable agenda snapshot')}
                </Text>
                <Text style={[styles.snapshotPrompt, { color: colors.text.secondary }]}>
                  {t('mySchedule.snapshotPrompt', 'Review your day before sharing. You can keep editing your agenda.')}
                </Text>
                <View style={styles.snapshotFrame}>
                  <ScrollView
                    horizontal
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.snapshotPanOuter}
                  >
                    <ScrollView
                      nestedScrollEnabled
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={styles.snapshotPanInner}
                    >
                      <View style={[styles.snapshotScaledCanvas, {
                        width: `${previewScale * 100}%`,
                        height: `${previewScale * 100}%`,
                      }]}>
                        <RNImage
                          source={{ uri: shareSheet.imageUrl }}
                          resizeMode="contain"
                          style={styles.snapshotImage}
                        />
                      </View>
                    </ScrollView>
                  </ScrollView>
                </View>
                <View style={styles.snapshotZoomRow}>
                  <TouchableOpacity style={styles.snapshotZoomButton} onPress={() => setPreviewScale((scale) => Math.max(0.8, scale - 0.1))}>
                    <Text style={[styles.snapshotZoomSymbol, { color: colors.text.primary }]}>−</Text>
                  </TouchableOpacity>
                  <Text style={[styles.snapshotZoomLabel, { color: colors.text.secondary }]}>{Math.round(previewScale * 100)}%</Text>
                  <TouchableOpacity style={styles.snapshotZoomButton} onPress={() => setPreviewScale((scale) => Math.min(3, scale + 0.1))}>
                    <MaterialIcons name="add" size={20} color={colors.text.primary} />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.snapshotConfirm, { color: colors.text.primary }]}>
                  {t('mySchedule.snapshotConfirm', 'Are you sure you want to share this agenda?')}
                </Text>
                <TouchableOpacity
                  style={[styles.snapshotPrimaryButton, { backgroundColor: colors.primary }]}
                  onPress={() => setShareSheet((prev) => ({ ...prev, mode: 'share' }))}
                >
                  <MaterialIcons name="share" size={19} color="#FFFFFF" />
                  <Text style={styles.snapshotPrimaryButtonText}>{t('mySchedule.confirmShare', 'Confirm and share')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.snapshotSecondaryButton} onPress={() => setShareSheet((prev) => ({ ...prev, visible: false }))}>
                  <Text style={[styles.snapshotSecondaryButtonText, { color: colors.text.secondary }]}>{t('mySchedule.keepEditing', 'Keep editing')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
            <Text
              style={[styles.shareSheetTitle, { color: colors.text.primary }]}
            >
              {shareSheet.imageUrl
                ? t('mySchedule.shareMyDay', 'Share this day')
                : t('mySchedule.shareMyAgenda', 'Share my agenda')}
            </Text>
            <View style={styles.shareSheetRow}>
              <TouchableOpacity style={styles.shareSheetAction} onPress={() => openShareIntent('whatsapp')}>
                <View style={[styles.shareSheetIconWrap, { backgroundColor: '#25D36622' }]}>
                  <MaterialIcons name="chat" size={22} color="#25D366" />
                </View>
                <Text style={[styles.shareSheetActionText, { color: colors.text.secondary }]}>WhatsApp</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareSheetAction} onPress={() => openShareIntent('x')}>
                <View style={[styles.shareSheetIconWrap, { backgroundColor: colors.text.primary + '15' }]}>
                  <MaterialIcons name="close" size={22} color={colors.text.primary} />
                </View>
                <Text style={[styles.shareSheetActionText, { color: colors.text.secondary }]}>X</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareSheetAction} onPress={() => openShareIntent('facebook')}>
                <View style={[styles.shareSheetIconWrap, { backgroundColor: '#1877F222' }]}>
                  <MaterialIcons name="thumb-up" size={22} color="#1877F2" />
                </View>
                <Text style={[styles.shareSheetActionText, { color: colors.text.secondary }]}>Facebook</Text>
              </TouchableOpacity>
            </View>

            {shareSheet.imageUrl && (
              <>
                <TouchableOpacity
                  style={[styles.shareSheetFullRow, { borderColor: colors.divider }]}
                  onPress={handleDownloadImage}
                >
                  <MaterialIcons name="image" size={20} color={colors.primary} />
                  <Text style={[styles.shareSheetFullRowText, { color: colors.text.primary }]}>
                    {t('mySchedule.downloadImage', 'Download day image (PNG)')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.shareSheetFullRow, { borderColor: colors.divider }]}
                  onPress={() => copyToClipboard(shareSheet.imageUrl!, t('mySchedule.imageLinkCopied', 'Image link copied — paste it into Instagram or anywhere else'))}
                >
                  <MaterialIcons name="link" size={20} color={colors.primary} />
                  <Text style={[styles.shareSheetFullRowText, { color: colors.text.primary }]}>
                    {t('mySchedule.copyImageLink', 'Copy day image link (for Instagram, etc.)')}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity
              style={[styles.shareSheetFullRow, { borderColor: colors.divider }]}
              onPress={() => copyToClipboard(shareSheet.shareUrl, t('mySchedule.shareLinkCopied', 'Share link copied to clipboard'))}
            >
              <MaterialIcons name="content-copy" size={20} color={colors.primary} />
              <Text style={[styles.shareSheetFullRowText, { color: colors.text.primary }]}>
                {t('mySchedule.copyLiveLink', 'Copy live tracking link')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shareSheetClose}
              onPress={() => setShareSheet((prev) => ({ ...prev, visible: false }))}
            >
              <Text style={{ color: colors.text.secondary, fontWeight: '600' }}>{t('mySchedule.close', 'Close')}</Text>
            </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(removeSessionModal.meeting)}
        transparent
        animationType="fade"
        onRequestClose={() => setRemoveSessionModal({ meeting: null, slotStartTime: null })}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.removeSessionCard, { backgroundColor: colors.background.paper }]}>
            <MaterialIcons name="event-busy" size={34} color={colors.primary} />
            <Text style={[styles.removeSessionTitle, { color: colors.text.primary }]}>
              {t('mySchedule.removeSessionTitle', 'Remove this session?')}
            </Text>
            <Text style={[styles.removeSessionMessage, { color: colors.text.secondary }]}>
              {t('mySchedule.removeSessionMessage', 'This will remove the session from your day plan. You can undo it briefly after removal.')}
            </Text>
            <View style={styles.removeSessionActions}>
              <TouchableOpacity style={styles.removeSessionCancel} onPress={() => setRemoveSessionModal({ meeting: null, slotStartTime: null })}>
                <Text style={[styles.removeSessionCancelText, { color: colors.text.secondary }]}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.removeSessionConfirm, { backgroundColor: colors.primary }]} onPress={confirmRemoveAgendaSession} disabled={isRemovingSession}>
                {isRemovingSession ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.removeSessionConfirmText}>{t('common.remove', 'Remove')}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Day Summary Modal */}
      {daySummaryModal.dayStat && (
        <Modal
          visible={daySummaryModal.visible && !removeSessionModal.meeting}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setDaySummaryModal({ visible: false, dayStat: null })}
        >
          <View style={[
            styles.modalOverlay,
            { backgroundColor: isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)' }
          ]}>
            <View style={[
              styles.modalContent,
              {
                backgroundColor: colors.background.paper,
                borderColor: colors.divider,
              }
            ]}>
              {/* Close X Button */}
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setDaySummaryModal({ visible: false, dayStat: null })}
              >
                <MaterialIcons name="close" size={24} color={colors.text.secondary} />
              </TouchableOpacity>

              {/* Header */}
              <View style={styles.modalHeader}>
                <MaterialIcons
                  name="calendar-today"
                  size={32}
                  color={colors.primary}
                />
                <Text style={[styles.modalTitle, { color: colors.text.primary }]}>
                  {t('mySchedule.scheduleSummary')}
                </Text>
                <Text style={[styles.modalSubtitle, { color: colors.text.secondary }]}>
                  {format(daySummaryModal.dayStat.date, 'EEEE, MMMM d, yyyy')}
                </Text>
              </View>

              {/* Visual Summary */}
              <View style={styles.summaryContainer}>
                {/* Confirmed */}
                {daySummaryModal.dayStat.confirmed > 0 && (
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryLabelContainer}>
                      <View style={[styles.summaryDot, { backgroundColor: '#4CAF50' }]} />
                      <Text style={[styles.summaryLabel, { color: colors.text.primary }]}>
                        {t('mySchedule.status.confirmed')}
                      </Text>
                    </View>
                    <View style={styles.summaryBarContainer}>
                      <View style={[
                        styles.summaryBar,
                        {
                          width: `${(daySummaryModal.dayStat.confirmed / Math.max(daySummaryModal.dayStat.total, 1)) * 100}%`,
                          backgroundColor: '#4CAF50',
                        }
                      ]} />
                    </View>
                    <Text style={[styles.summaryCount, { color: colors.text.primary }]}>
                      {daySummaryModal.dayStat.confirmed}
                    </Text>
                  </View>
                )}

                {/* Tentative */}
                {daySummaryModal.dayStat.tentative > 0 && (
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryLabelContainer}>
                      <View style={[styles.summaryDot, { backgroundColor: '#FF9800' }]} />
                      <Text style={[styles.summaryLabel, { color: colors.text.primary }]}>
                        {t('mySchedule.status.tentative')}
                      </Text>
                    </View>
                    <View style={[
                      styles.summaryBarContainer,
                      {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                      }
                    ]}>
                      <View style={[
                        styles.summaryBar,
                        {
                          width: `${(daySummaryModal.dayStat.tentative / Math.max(daySummaryModal.dayStat.total + daySummaryModal.dayStat.tentative, 1)) * 100}%`,
                          backgroundColor: '#FF9800',
                        }
                      ]} />
                    </View>
                    <Text style={[styles.summaryCount, { color: colors.text.primary }]}>
                      {daySummaryModal.dayStat.tentative}
                    </Text>
                  </View>
                )}

                {/* Interested */}
                {daySummaryModal.dayStat.interested > 0 && (
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryLabelContainer}>
                      <View style={[styles.summaryDot, { backgroundColor: '#F44336' }]} />
                      <Text style={[styles.summaryLabel, { color: colors.text.primary }]}>
                        {t('mySchedule.status.interested')}
                      </Text>
                    </View>
                    <View style={[
                      styles.summaryBarContainer,
                      {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                      }
                    ]}>
                      <View style={[
                        styles.summaryBar,
                        {
                          width: `${(daySummaryModal.dayStat.interested / Math.max(daySummaryModal.dayStat.total, 1)) * 100}%`,
                          backgroundColor: '#F44336',
                        }
                      ]} />
                    </View>
                    <Text style={[styles.summaryCount, { color: colors.text.primary }]}>
                      {daySummaryModal.dayStat.interested}
                    </Text>
                  </View>
                )}

                {/* Blocked */}
                {daySummaryModal.dayStat.blocked > 0 && (
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryLabelContainer}>
                      <View style={[styles.summaryDot, { backgroundColor: colors.error.main }]} />
                      <Text style={[styles.summaryLabel, { color: colors.text.primary }]}>
                        {t('mySchedule.status.blocked')}
                      </Text>
                    </View>
                    <View style={[
                      styles.summaryBarContainer,
                      {
                        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
                      }
                    ]}>
                      <View style={[
                        styles.summaryBar,
                        {
                          width: `${(daySummaryModal.dayStat.blocked / Math.max(daySummaryModal.dayStat.total, 1)) * 100}%`,
                          backgroundColor: colors.error.main,
                        }
                      ]} />
                    </View>
                    <Text style={[styles.summaryCount, { color: colors.text.primary }]}>
                      {daySummaryModal.dayStat.blocked}
                    </Text>
                  </View>
                )}

              </View>

              {/* Timeline of Events */}
              {(() => {
                if (!daySummaryModal.dayStat) return null;
                const selectedDay = schedule.find((day: DaySchedule) => isSameDay(day.date, daySummaryModal.dayStat!.date));
                if (!selectedDay || !selectedDay.slots) return null;

                // Get all slots with meetings or tracked free slots, sorted by time
                const timelineSlots = selectedDay.slots
                  .filter((slot: TimeSlot) => {
                    if (excludePastSessions && slot.startTime.getTime() < Date.now()) return false;
                    if (slot.meeting && (slot.meeting as any).isAgendaEvent && removedAgendaIds.has(slot.meeting.id)) return false;
                    if (slot.meeting) return true;
                    const slotKey = slot.startTime.toISOString();
                    const freeSlotStatus = userFreeSlotStatus[slotKey] || 'available';
                    return freeSlotStatus !== 'available';
                  })
                  .sort((a: TimeSlot, b: TimeSlot) => a.startTime.getTime() - b.startTime.getTime());

                if (timelineSlots.length === 0) return null;

                return (
                  <View style={styles.timelineContainer}>
                    <Text style={[styles.timelineTitle, { color: colors.text.primary }]}>
                      {t('mySchedule.dayPlanRoute')}
                    </Text>
                    <ScrollView 
                      style={styles.timelineScrollView}
                      showsVerticalScrollIndicator={true}
                    >
                      {timelineSlots.map((slot: TimeSlot, index: number) => {
                        const slotKey = slot.startTime.toISOString();
                        const freeSlotStatus = userFreeSlotStatus[slotKey] || 'available';
                        
                        if (slot.meeting) {
                          const meeting = slot.meeting;
                          const isAgendaEvent = (meeting as any).isAgendaEvent;
                          const userStatus = isAgendaEvent 
                            ? (userAgendaStatus[meeting.id] || 'tentative')
                            : (userMeetingStatus[meeting.id] || 'tentative');
                          const isConfirmed = userStatus === 'confirmed';
                          const isTentative = userStatus === 'tentative';
                          const statusColor = isConfirmed ? '#4CAF50' : '#FF9800';
                          
                          return (
                            <View key={`${slot.startTime.toISOString()}-${index}`} style={styles.timelineItem}>
                              <View style={styles.timelineTimeContainer}>
                                <Text style={[styles.timelineTime, { color: colors.text.primary }]}>
                                  {formatEventTime(slot.startTime, eventTimezoneOffset)}
                                </Text>
                                {index < timelineSlots.length - 1 && (
                                  <View style={[styles.timelineLine, { backgroundColor: colors.divider }]} />
                                )}
                              </View>
                              <View style={[
                                styles.timelineContent,
                                {
                                  backgroundColor: isDark ? colors.surface : '#F8F9FA',
                                  borderLeftColor: statusColor,
                                }
                              ]}>
                                <View style={styles.timelineHeader}>
                                  <View style={styles.timelineTitleRow}>
                                    <Text style={[styles.timelineEventTitle, { color: colors.text.primary }]} numberOfLines={2}>
                                      {meeting.title || t('agenda.messages.untitledEvent')}
                                    </Text>
                                  </View>
                                  <View style={[
                                    styles.timelineStatusBadge,
                                    { backgroundColor: statusColor + '20' }
                                  ]}>
                                    <Text style={[
                                      styles.timelineStatusText,
                                      { color: statusColor }
                                    ]}>
                                      {isConfirmed ? t('mySchedule.status.confirmed') : t('mySchedule.status.tentative')}
                                    </Text>
                                  </View>
                                  {isAgendaEvent && (
                                    <TouchableOpacity
                                      style={styles.timelineRemoveButton}
                                      onPress={() => requestRemoveAgendaSession(meeting, slot.startTime)}
                                      accessibilityLabel={t('mySchedule.removeSession', 'Remove session from plan')}
                                    >
                                      <MaterialIcons name="close" size={16} color={colors.text.secondary} />
                                    </TouchableOpacity>
                                  )}
                                </View>
                                {meeting.location && (
                                  <View style={styles.timelineLocation}>
                                    <MaterialIcons name="location-on" size={14} color={colors.text.secondary} />
                                    <Text style={[styles.timelineLocationText, { color: colors.text.secondary }]} numberOfLines={1}>
                                      {meeting.location}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            </View>
                          );
                        } else {
                          // Free slot with status
                          const statusColor = freeSlotStatus === 'interested' ? '#F44336' : 
                                           freeSlotStatus === 'blocked' ? colors.error.main : '#FF9800';
                          const statusLabel = freeSlotStatus === 'interested' ? t('mySchedule.status.interested') :
                                            freeSlotStatus === 'blocked' ? t('mySchedule.status.blocked') : t('mySchedule.status.tentative');
                          
                          return (
                            <View key={`${slot.startTime.toISOString()}-${index}`} style={styles.timelineItem}>
                              <View style={styles.timelineTimeContainer}>
                                <Text style={[styles.timelineTime, { color: colors.text.primary }]}>
                                  {formatEventTime(slot.startTime, eventTimezoneOffset)}
                                </Text>
                                {index < timelineSlots.length - 1 && (
                                  <View style={[styles.timelineLine, { backgroundColor: colors.divider }]} />
                                )}
                              </View>
                              <View style={[
                                styles.timelineContent,
                                {
                                  backgroundColor: isDark ? colors.surface : '#F8F9FA',
                                  borderLeftColor: statusColor,
                                }
                              ]}>
                                <View style={styles.timelineHeader}>
                                  <Text style={[styles.timelineEventTitle, { color: colors.text.primary }]}>
                                    {t('mySchedule.freeSlot.freeSlotAvailable')}
                                  </Text>
                                  <View style={[
                                    styles.timelineStatusBadge,
                                    { backgroundColor: statusColor + '20' }
                                  ]}>
                                    <Text style={[
                                      styles.timelineStatusText,
                                      { color: statusColor }
                                    ]}>
                                      {statusLabel}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            </View>
                          );
                        }
                      })}
                    </ScrollView>
                  </View>
                );
              })()}

              {/* Total Scheduled */}
              <View style={[
                styles.summaryTotalRow,
                {
                  backgroundColor: isDark ? colors.surface : 'rgba(0, 0, 0, 0.05)',
                  borderColor: colors.divider,
                  marginTop: 24,
                }
              ]}>
                <Text style={[styles.summaryTotalLabel, { color: colors.text.primary }]}>
                  {t('mySchedule.totalScheduledSlots')}
                </Text>
                <View style={[
                  styles.summaryTotalBadge,
                  { backgroundColor: colors.primary + '20' }
                ]}>
                  <Text style={[
                    styles.summaryTotalCount,
                    { color: colors.primary }
                  ]}>
                    {daySummaryModal.dayStat.total}
                  </Text>
                </View>
              </View>

              {/* Share this specific day -- same share sheet (link + branded
                  image + social intents) as the sticky global button, but
                  scoped to this modal's own date instead of whatever day
                  happens to be selected on the main screen. */}
              <TouchableOpacity
                style={styles.excludePastRow}
                onPress={() => setExcludePastSessions((value) => !value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: excludePastSessions }}
              >
                <MaterialIcons
                  name={excludePastSessions ? 'check-box' : 'check-box-outline-blank'}
                  size={22}
                  color={excludePastSessions ? colors.primary : colors.text.secondary}
                />
                <Text style={[styles.excludePastText, { color: colors.text.primary }]}>
                  {t('mySchedule.excludePastSessions', 'Exclude sessions that have already passed')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.shareDayButton, { backgroundColor: colors.primary }]}
                onPress={() => {
                  const day = daySummaryModal.dayStat!.date;
                  setDaySummaryModal({ visible: false, dayStat: null });
                  handleShareMyDay(day, true, true);
                }}
                disabled={isSharingDay}
              >
                {isSharingDay ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <MaterialIcons name="photo-camera" size={18} color="#FFFFFF" />
                )}
                <Text style={styles.shareDayButtonText}>
                  {t('mySchedule.generateSnapshot', 'Generate shareable agenda snapshot')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  shareStickyButton: {
    position: 'absolute',
    top: 8,
    right: 12,
    zIndex: 20,
    elevation: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  shareStickyButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  shareSheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  shareSheetCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  shareSheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  snapshotPrompt: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  snapshotFrame: {
    height: 360,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#08091D',
  },
  snapshotPanOuter: {
    minWidth: '100%',
    minHeight: '100%',
  },
  snapshotPanInner: {
    minWidth: '100%',
    minHeight: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapshotScaledCanvas: {
    minWidth: '100%',
    minHeight: '100%',
  },
  snapshotImage: { width: '100%', height: '100%' },
  snapshotZoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    marginVertical: 10,
  },
  snapshotZoomButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(127,127,127,0.15)',
  },
  snapshotZoomLabel: { minWidth: 48, textAlign: 'center', fontSize: 13, fontWeight: '700' },
  snapshotZoomSymbol: { fontSize: 26, lineHeight: 28, fontWeight: '500' },
  snapshotConfirm: { textAlign: 'center', fontSize: 14, fontWeight: '700', marginBottom: 10 },
  snapshotPrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
  },
  snapshotPrimaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  snapshotSecondaryButton: { alignItems: 'center', paddingTop: 14 },
  snapshotSecondaryButtonText: { fontSize: 14, fontWeight: '600' },
  timelineTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, flex: 1 },
  timelineRemoveButton: {
    position: 'absolute',
    right: 0,
    top: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(127,127,127,0.14)',
    zIndex: 4,
  },
  removeSessionCard: { margin: 24, borderRadius: 18, padding: 24, alignItems: 'center' },
  removeSessionTitle: { fontSize: 20, fontWeight: '800', marginTop: 10, textAlign: 'center' },
  removeSessionMessage: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  removeSessionActions: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 20 },
  removeSessionCancel: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 13 },
  removeSessionCancelText: { fontSize: 14, fontWeight: '700' },
  removeSessionConfirm: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingVertical: 13 },
  removeSessionConfirmText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  shareSheetRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  shareSheetAction: {
    alignItems: 'center',
    gap: 6,
  },
  shareSheetIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareSheetActionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  shareSheetFullRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderTopWidth: 1,
  },
  shareSheetFullRowText: {
    fontSize: 14,
    fontWeight: '600',
  },
  shareSheetClose: {
    alignItems: 'center',
    paddingTop: 16,
  },
  shareDayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  shareDayButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  excludePastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    marginTop: 14,
  },
  excludePastText: { fontSize: 13, fontWeight: '600', flex: 1 },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    flexGrow: 1,
  },
  content: {
    padding: 16,
  },
  hourGroup: {
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  hourHeader: {
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  hourHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  slotInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  slotCount: {
    fontSize: 13,
  },
  hourText: {
    fontSize: 16,
    fontWeight: '600',
  },
  timeSlotsContainer: {
    padding: 8,
  },
  slotWrapper: {
    marginBottom: 8,
  },
  meetingSlot: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#F8F9FA',
    borderLeftWidth: 4,
    borderLeftColor: '#2E7D32',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  emptySlot: {
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    borderColor: 'rgba(0, 0, 0, 0.1)',
    position: 'relative',
  },
  meetingTime: {
    fontSize: 12,
    marginBottom: 4,
  },
  meetingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  meetingLocation: {
    fontSize: 13,
    marginBottom: 4,
  },
  participantsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  participantsText: {
    fontSize: 13,
    fontWeight: '500',
  },
  speakerChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    marginLeft: 6,
    gap: 10,
  },
  speakerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  icon: {
    marginRight: 6,
  },
  statusIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  freeSlotLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  calendarContainer: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  calendarHeader: {
    marginBottom: 12,
  },
  calendarTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  calendarWeek: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
  },
  calendarDay: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    minHeight: 100,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  calendarDayName: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  calendarDayNumber: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  calendarIndicators: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
  },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  indicatorCircleWithNumber: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorCircleNumber: {
    fontSize: 9,
    fontWeight: '700',
  },
  countBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  calendarLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendCircleWithNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendCircleNumber: {
    fontSize: 10,
    fontWeight: '700',
  },
  legendText: {
    fontSize: 11,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    position: 'relative',
  },
  modalCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    padding: 4,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 12,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  summaryContainer: {
    gap: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  summaryLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: 100,
  },
  summaryDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  summaryBarContainer: {
    flex: 1,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  summaryBar: {
    height: '100%',
    borderRadius: 12,
  },
  summaryCount: {
    fontSize: 16,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'right',
  },
  summaryTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
  },
  summaryTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  summaryTotalBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  summaryTotalCount: {
    fontSize: 18,
    fontWeight: '700',
  },
  timelineContainer: {
    marginTop: 24,
    maxHeight: 300,
  },
  timelineTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  timelineScrollView: {
    maxHeight: 250,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  timelineTimeContainer: {
    alignItems: 'center',
    width: 70,
  },
  timelineTime: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 60,
  },
  timelineLine: {
    width: 1,
    flex: 1,
    minHeight: 20,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
    position: 'relative',
  },
  timelineEventTitle: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  timelineStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 28,
  },
  timelineStatusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timelineLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  timelineLocationText: {
    fontSize: 12,
    flex: 1,
  },
});

export default MySchedule;
