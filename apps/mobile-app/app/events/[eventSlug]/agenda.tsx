import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, InteractionManager } from 'react-native';
import { useEvent } from '@contexts/EventContext';
import { useTheme } from '../../../hooks/useTheme';
// lib/vector-icons routes web to SVG-based Lucide icons instead of the raw
// font glyphs @expo/vector-icons renders directly; the raw font can show its
// tofu/"?" fallback glyph for a window before the icon font loads on web.
import { MaterialIcons } from '../../../lib/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import EventBanner from '../../../components/EventBanner';
import SpeakerAvatar from '../../../components/SpeakerAvatar';
import UnifiedSearchAndFilter from '../../../components/UnifiedSearchAndFilter';
import { apiClient, eventApiPath } from '@/lib/api-client';
import { 
  getAgendaTypeColor,
  parseEventISO,
  formatTimeRange,
} from '../../../types/agenda';
import type {
  AgendaType,
  AgendaItem,
} from '../../../types/agenda';
import { EVENTS } from '../../../config/events';
import { useAuth } from '../../../hooks/useAuth';
import { useToastHelpers } from '@contexts/ToastContext';
import ScheduleConfirmationModal from '../../../components/ScheduleConfirmationModal';
import * as Haptics from 'expo-haptics';
import { parseISO } from 'date-fns';
import LoadingScreen from '../../../components/LoadingScreen';
import { useTranslation, getCurrentLocale } from '../../../i18n/i18n';

const { width } = Dimensions.get('window');

// Custom filter logic for agenda items
const customAgendaFilterLogic = (
  data: AgendaItem[], 
  filters: { [key: string]: any },
  searchQuery: string
): AgendaItem[] => {
  if (!data) return [];
  
  return data.filter(item => {
    // If no filters are active, include all items
    if (!filters || Object.keys(filters).length === 0) return true;

    // Check each filter group
    for (const [key, value] of Object.entries(filters)) {
      if (!value || value.length === 0) continue;

      switch (key) {
        case 'type':
          if (value.length > 0 && !value.includes(item.type)) {
            return false;
          }
          break;
        case 'speakers':
          if (value.length > 0 && !item.speakers?.some((speakerId: string) => 
            value.includes(speakerId)
          )) {
            return false;
          }
          break;
        case 'time':
          // Add time-based filtering logic if needed
          break;
        // Add more filter cases as needed
      }
    }

    // Handle search query if provided
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesTitle = item.title?.toLowerCase().includes(query) ?? false;
      const matchesDescription = item.description?.toLowerCase().includes(query) ?? false;
      
      // Since we only have speaker IDs, we can only match against the ID itself
      const matchesSpeaker = item.speakers?.some((speakerId: string) =>
        speakerId.toLowerCase().includes(query)
      ) ?? false;
      
      if (!matchesTitle && !matchesDescription && !matchesSpeaker) {
        return false;
      }
    }

    return true;
  });
};

export default function BSL2025AgendaScreen() {
  const { event } = useEvent();
  const { isDark, colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ session?: string; scrollTo?: string; day?: string }>();
  const styles = getStyles(isDark, colors);
  const { user } = useAuth();
  const { showSuccess, showError, showWarning } = useToastHelpers();
  const { t } = useTranslation('agenda');
  const scrollViewRef = useRef<ScrollView>(null);
  const sessionItemRefs = useRef<{ [key: string]: View | null }>({});
  const handledSessionRef = useRef<string | null>(null); // Track which session we've already handled
  const agendaLoadRequestRef = useRef(0);

  const [agendaByDay, setAgendaByDay] = useState<{ [key: string]: AgendaItem[] }>({});
  const [activeTab, setActiveTab] = useState<string>('Day 1 - November 12'); // Default to Day 1
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const hasSetInitialTabRef = useRef(false); // Track if we've set initial tab
  const userSelectedTabRef = useRef(false); // Track if user manually selected a tab
  const [isLive, setIsLive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<AgendaType | 'all'>('all');
  const [usingJsonFallback, setUsingJsonFallback] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<'running' | 'stopped' | 'unknown'>('unknown');
  const [isEventPeriod, setIsEventPeriod] = useState(false);
  const [isEventFinished, setIsEventFinished] = useState(false);
  const [filteredAgenda, setFilteredAgenda] = useState<AgendaItem[]>([]);
  const [showNotLiveDetails, setShowNotLiveDetails] = useState(false);
  const [userAgendaStatus, setUserAgendaStatus] = useState<Record<string, 'tentative' | 'confirmed'>>({});
  const [favoriteStatus, setFavoriteStatus] = useState<Record<string, boolean>>({});
  const [confirmationModal, setConfirmationModal] = useState<{
    visible: boolean;
    agendaItem: AgendaItem | null;
    startTime: Date | null;
  }>({ visible: false, agendaItem: null, startTime: null });
  const [isConfirming, setIsConfirming] = useState(false);
  const [speakerMapRef, setSpeakerMapRef] = useState<Map<string, { id: string; name: string; image?: string }>>(new Map());
  const eventId = event?.id || 'bsl';
  const agendaApiPath = eventApiPath(eventId, 'agenda');
  const agendaStatusApiPath = eventApiPath(eventId, 'agenda/status');
  const eventDateLabel = event?.eventDateString || event?.subtitle || 'Tour 2026';
  const eventLocationLabel = event?.tour?.city && event?.tour?.country
    ? `${event.tour.city}, ${event.tour.country}`
    : event?.subtitle || 'Latin America';
  const eventVenueLabel = event?.tour?.venue || eventLocationLabel;

  // Helper functions used in effects and render
  const checkEventPeriod = () => {
    const now = new Date();
    const start = event?.eventStartDate ? new Date(event.eventStartDate) : null;
    const end = event?.eventEndDate ? new Date(event.eventEndDate) : null;
    setIsEventPeriod(Boolean(start && end && now >= start && now <= end));
    setIsEventFinished(Boolean(end && now > end));
  };

  const getTabLabel = (dayKey: string) => {
    // Expect keys like "Day 1 - November 12"
    const parts = dayKey.split(' - ');
    const rawLabel = parts[0] || dayKey;
    const dayNumberMatch = rawLabel.match(/(\d+)/);
    return dayNumberMatch ? t('tabs.day', { number: dayNumberMatch[1] }) : rawLabel;
  };

  const getTabTheme = (dayKey: string) => {
    const dayNumberMatch = dayKey.match(/Day (\d+)/);
    const dayNumber = dayNumberMatch?.[1];

    // Prefer this event's own published day theme (see chile2026's
    // dayThemes in packages/config/src/events.ts) over the generic
    // fallback copy, which was previously the original bsl2025 hub
    // event's themes shown for every tour-stop event regardless of which
    // one was actually open.
    const eventTheme = dayNumber ? (event as any)?.dayThemes?.[dayNumber] : undefined;
    if (eventTheme) {
      const locale = getCurrentLocale();
      return eventTheme[locale] || eventTheme.en || eventTheme.es || '';
    }

    if (dayKey.includes('Day 1')) return t('tabs.themes.day1');
    if (dayKey.includes('Day 2')) return t('tabs.themes.day2');
    if (dayKey.includes('Day 3')) return t('tabs.themes.day3');
    return '';
  };

  // Filters for UnifiedSearchAndFilter
  const filterGroups = [
    {
      key: 'type',
      label: t('filter.type'),
      type: 'single' as const,
      options: [
        { key: 'keynote', label: t('filter.keynote'), icon: 'mic' },
        { key: 'panel', label: t('filter.panel'), icon: 'group' },
        { key: 'break', label: t('filter.break'), icon: 'free-breakfast' },
        { key: 'meal', label: t('filter.meal'), icon: 'restaurant' },
        { key: 'registration', label: t('filter.registration'), icon: 'person-add' },
      ],
    },
    {
      key: 'speakers',
      label: t('filter.speakers'),
      type: 'chips' as const,
      options: [],
    },
  ];

  const filterAgendaItems = (items: AgendaItem[], filters: { search?: string; type?: AgendaType | 'all'; speakers?: string }) => {
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      items = items.filter((it: AgendaItem) =>
        it.title.toLowerCase().includes(q) ||
        (it.description && it.description.toLowerCase().includes(q)) ||
        (it.type && it.type.toLowerCase().includes(q)) ||
        ((it.speakers || []).some((s: string) => s.toLowerCase().includes(q)))
      );
    }
    if (filters?.type) {
      items = items.filter((it) => it.type === filters.type);
    }
    if (filters?.speakers) {
      items = items.filter((it) => (it.speakers || []).includes(filters?.speakers || ''));
    }
    return items;
  };

  // Load agenda from the database, with the published event schedule as a
  // fallback. A route/tenant transition can briefly issue two requests; only
  // the latest response may update the screen.
  const loadAgenda = useCallback(async () => {
    if (!event) return;

    const requestId = ++agendaLoadRequestRef.current;
    const isCurrentRequest = () => agendaLoadRequestRef.current === requestId;

    setLoading(true);
    setUsingJsonFallback(false);
    setServiceStatus('unknown');

    try {
      let agendaData: AgendaItem[] = [];

      try {
        const response = await apiClient.request(agendaApiPath, {
          skipEventSegment: true,
        });

        if (!isCurrentRequest()) return;

        if (Array.isArray(response)) {
          agendaData = response;
        } else if (Array.isArray(response?.data)) {
          agendaData = response.data;
        } else if (Array.isArray(response?.data?.data)) {
          agendaData = response.data.data;
        }
      } catch {
        if (!isCurrentRequest()) return;
      }

      if (!isCurrentRequest()) return;

      if (agendaData.length > 0) {
        setAgenda(agendaData);
        setIsLive(true);
        setServiceStatus('running');
        return;
      }

      const fallbackAgenda = event.agenda || EVENTS[eventId as keyof typeof EVENTS]?.agenda || [];
      setAgenda(fallbackAgenda);
      setIsLive(false);
      setUsingJsonFallback(true);
      setServiceStatus('stopped');
    } finally {
      if (isCurrentRequest()) {
        setLoading(false);
      }
    }
  }, [agendaApiPath, event, eventId]);

  useEffect(() => {
    if (!event) return;

    void loadAgenda();
    return () => {
      agendaLoadRequestRef.current += 1;
    };
  }, [event, loadAgenda]);

  // Ensure filteredAgenda is populated when agenda loads
  useEffect(() => {
    if (agenda && agenda.length > 0) {
      setFilteredAgenda(agenda);
    } else {
      setFilteredAgenda([]);
    }
  }, [agenda]);

  // Load speakers from database and build a map for both database IDs and config slugs
  useEffect(() => {
    if (!event) return;

    const loadSpeakersMap = async () => {
      try {
        const map = new Map<string, { id: string; name: string; image?: string }>();

        // Add speakers from event config (by slug)
        if (event?.speakers && Array.isArray(event.speakers)) {
          event.speakers.forEach((speaker: any) => {
            if (speaker.id) {
              map.set(speaker.id, {
                id: speaker.id,
                name: speaker.name,
                image: speaker.image,
              });
            }
          });
        }

        // Fetch and add speakers from the event API (by UUID).
        try {
          const response = await apiClient.request(eventApiPath(eventId, 'speakers'), {
            skipEventSegment: true,
          });
          if (!response.success) throw new Error(response.error);
          const dbSpeakers = (response.data as any)?.data || [];

          if (Array.isArray(dbSpeakers)) {
            dbSpeakers.forEach((speaker: any) => {
              if (speaker.id) {
                map.set(speaker.id, {
                  id: speaker.id,
                  name: speaker.name,
                  image: speaker.imageurl || speaker.image_url,
                });
              }
            });
          }
        } catch (e) {
          console.error('Failed to load database speakers:', e);
          // Continue with config speakers only
        }

        setSpeakerMapRef(map);
      } catch (e) {
        console.error('Error building speaker map:', e);
      }
    };

    loadSpeakersMap();
  }, [event, eventId]);

  // Check if we're in the event period and if event is finished
  useEffect(() => {
    checkEventPeriod();
    // Check periodically (every minute) to update finished status
    const interval = setInterval(() => {
      checkEventPeriod();
    }, 60000); // Check every minute
    
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh agenda every 5 minutes during event period (silent, no UI)
  useEffect(() => {
    if (!isLive || !isEventPeriod) return;

    const updateInterval = 5 * 60 * 1000; // 5 minutes in milliseconds

    const refreshTimer = setInterval(() => {
      const refreshAgenda = async () => {
        try {
          const response = await apiClient.request(agendaApiPath, {
            skipEventSegment: true,
          });
          if (response.success && response.data) {
            let agendaData: any[] = [];
            if (Array.isArray(response.data)) {
              agendaData = response.data;
            } else if (response.data.data && Array.isArray(response.data.data)) {
              agendaData = response.data.data;
            }
            if (agendaData.length > 0) {
              setAgenda(agendaData);
            }
          }
        } catch (error) {
          console.error('Auto-refresh failed:', error);
        }
      };
      refreshAgenda();
    }, updateInterval);

    return () => clearInterval(refreshTimer);
  }, [isLive, isEventPeriod, agendaApiPath]);

  // Group agenda by day
  useEffect(() => {
    if (loading) return;
    
    if (agenda.length === 0) {
      // No agenda data - clear the grouped data
      setAgendaByDay({});
      return;
    }
    
    const grouped: { [key: string]: AgendaItem[] } = {};
    
    // Check if agenda items have day information from database
    const hasDayInfo = agenda.some(item => (item as any).day);
    
    if (hasDayInfo) {
      // Group by day column from database
      // Check if the day values are simple (1, 2, 3) or complex (with thematic names)
      // Group by day, handling both simple and complex day names. dayKey is
      // purely an internal grouping/react-key value here -- it's never
      // rendered directly (getTabLabel/getTabTheme derive the displayed,
      // translated text from it), so the hardcoded "November N" isn't
      // user-visible; left as-is to avoid touching this key's format, which
      // several other places in this file pattern-match against.
      agenda.forEach(item => {
        const day = (item as any).day;
        if (day) {
          let dayKey: string;

          // Extract day number from complex day names
          if (day.includes('Día 1')) {
            dayKey = 'Day 1 - November 12';
          } else if (day.includes('Día 2')) {
            dayKey = 'Day 2 - November 13';
          } else if (day.includes('Día 3')) {
            dayKey = 'Day 3 - November 14';
          } else if (day === '1' || day === '2' || day === '3') {
            // Simple day numbers
            dayKey = `Day ${day} - November ${day === '1' ? '12' : day === '2' ? '13' : '14'}`;
          } else {
            // Fallback for other formats
            dayKey = day;
          }

          if (!grouped[dayKey]) {
            grouped[dayKey] = [];
          }
          grouped[dayKey].push(item);
        }
      });
      
      // Also handle items without day information
      const itemsWithoutDay = agenda.filter(item => !(item as any).day);
      if (itemsWithoutDay.length > 0) {
        // Distribute items without day info across the days
        const dayKeys = Object.keys(grouped).sort();
        if (dayKeys.length > 0) {
          itemsWithoutDay.forEach((item, index) => {
            const targetDay = dayKeys[index % dayKeys.length];
            grouped[targetDay].push(item);
          });
        } else {
          // If no days exist yet, create them from the items without day info
          const day1Items = itemsWithoutDay.slice(0, Math.ceil(itemsWithoutDay.length / 3));
          const day2Items = itemsWithoutDay.slice(Math.ceil(itemsWithoutDay.length / 3), Math.ceil(itemsWithoutDay.length * 2 / 3));
          const day3Items = itemsWithoutDay.slice(Math.ceil(itemsWithoutDay.length * 2 / 3));
          
          if (day1Items.length > 0) {
            grouped['Day 1 - November 12'] = day1Items;
          }
          if (day2Items.length > 0) {
            grouped['Day 2 - November 13'] = day2Items;
          }
          if (day3Items.length > 0) {
            grouped['Day 3 - November 14'] = day3Items;
          }
        }
      }
      
    } else {
      // Fallback: distribute sessions across 3 days
      const day1Items = agenda.slice(0, 4); // First 4 items for Day 1
      const day2Items = agenda.slice(4, 8); // Next 4 items for Day 2
      const day3Items = agenda.slice(8); // Remaining items for Day 3
      
      // Add Day 1 items
      if (day1Items.length > 0) {
        grouped['Day 1 - November 12'] = day1Items;
      }
      
      // Add Day 2 items
      if (day2Items.length > 0) {
        grouped['Day 2 - November 13'] = day2Items;
      }
      
      // Add Day 3 items
      if (day3Items.length > 0) {
        grouped['Day 3 - November 14'] = day3Items;
      }
      
    }

    // Sort items within each day by start time (supports DB ISO times)
    Object.keys(grouped).forEach(day => {
      grouped[day].sort((a, b) => {
        const da = parseEventISO((a as any).time as any);
        const db = parseEventISO((b as any).time as any);
        const va = isNaN(da.getTime()) ? 0 : da.getTime();
        const vb = isNaN(db.getTime()) ? 0 : db.getTime();
        return va - vb;
      });
    });

    // Sort days in correct order (Day 1, Day 2, Day 3)
    const sortedGrouped: { [key: string]: AgendaItem[] } = {};
    const dayOrder = ['Day 1 - November 12', 'Day 2 - November 13', 'Day 3 - November 14'];
    
    dayOrder.forEach(dayKey => {
      if (grouped[dayKey]) {
        sortedGrouped[dayKey] = grouped[dayKey];
      }
    });

    setAgendaByDay(sortedGrouped);
    
    // Set first tab as active (Day 1) - only on initial load:
    // 1. We're not navigating from banner (no params.session)
    // 2. We haven't set initial tab yet
    // 3. User hasn't manually selected a tab
    // 4. Current activeTab doesn't exist in the new grouped data (only if it's the initial default)
    // This prevents overriding user's manual tab selection or session navigation
    const availableTabs = Object.keys(sortedGrouped);
    const currentTabExists = activeTab && availableTabs.includes(activeTab);
    
    // NEVER override if user manually selected a tab
    if (userSelectedTabRef.current && currentTabExists) {
      return; // Don't change anything if user selected it
    }
    
    // Only set initial tab if:
    // - No session navigation in progress
    // - User hasn't manually selected a tab
    // - Haven't set initial tab yet
    // - Current tab doesn't exist (meaning it's the default and needs to be set)
    if (!params.session && !handledSessionRef.current && !hasSetInitialTabRef.current && !userSelectedTabRef.current && !currentTabExists && availableTabs.length > 0) {
      // Always prioritize Day 1, then Day 2, then Day 3 - use dayOrder to ensure correct order
      const dayOrder = ['Day 1 - November 12', 'Day 2 - November 13', 'Day 3 - November 14'];
      const tabToSelect = dayOrder.find(dayKey => sortedGrouped[dayKey] && sortedGrouped[dayKey].length > 0) || availableTabs[0];
      
      if (tabToSelect) {
        setActiveTab(tabToSelect);
        hasSetInitialTabRef.current = true;
      }
    } else if (currentTabExists && !hasSetInitialTabRef.current && !userSelectedTabRef.current) {
      // Tab already exists and is valid, mark as set so we don't override it
      // This handles the case where the default tab already exists in the grouped data
      // BUT: if it's not Day 1 and we haven't set initial tab yet, force Day 1
      if (activeTab !== 'Day 1 - November 12' && sortedGrouped['Day 1 - November 12']) {
        setActiveTab('Day 1 - November 12');
        hasSetInitialTabRef.current = true;
      } else {
        hasSetInitialTabRef.current = true;
      }
    }
  }, [agenda, loading]); // Removed activeTab from deps to prevent loops

  // Effect to handle scrolling to a specific session when clicking from banner
  useEffect(() => {
    // Only run if we have both session and scrollTo params
    if (!params.session || !params.scrollTo || Object.keys(agendaByDay).length === 0) {
      // Only reset handledSessionRef if params are actually cleared (not just initial load)
      if (!params.session && !params.scrollTo) {
        handledSessionRef.current = null;
        // Don't reset hasSetInitialTabRef - user might have manually selected a tab
      }
      return;
    }

    const sessionId = String(params.session); // Ensure it's a string
    
    // Skip if we've already handled this exact session and we're on the correct tab
    if (handledSessionRef.current === sessionId && activeTab) {
      // Double-check we're on the right tab
      let foundDay: string | null = null;
      for (const dayKey in agendaByDay) {
        const dayItems = agendaByDay[dayKey];
        if (dayItems.some(item => String(item.id) === sessionId)) {
          foundDay = dayKey;
          break;
        }
      }
      if (foundDay === activeTab) {
        return; // Already handled and on correct tab
      }
    }
    
    // Find which day contains this session
    // First, check if day was provided in URL params (from AgendaTracker)
    let sessionDayKey: string | null = null;
    let foundItem: AgendaItem | null = null;
    
    if (params.day) {
      // Use the day from URL params if provided (more reliable)
      const providedDay = decodeURIComponent(params.day);
      if (agendaByDay[providedDay]) {
        // Verify the session exists in this day
        const dayItems = agendaByDay[providedDay];
        foundItem = dayItems.find(item => {
          const itemIdStr = String(item.id);
          const sessionIdStr = String(sessionId);
          return itemIdStr === sessionIdStr || 
                 itemIdStr === String(Number(sessionIdStr)) ||
                 String(Number(itemIdStr)) === sessionIdStr ||
                 item.id === Number(sessionIdStr) ||
                 Number(itemIdStr) === Number(sessionIdStr);
        }) || null;
        
        if (foundItem) {
          sessionDayKey = providedDay;
        }
      }
    }
    
    // If not found using provided day, search in correct order (Day 1, Day 2, Day 3)
    if (!sessionDayKey) {
      const dayOrder = ['Day 1 - November 12', 'Day 2 - November 13', 'Day 3 - November 14'];
      
      // First, try searching in the ordered days
      for (const dayKey of dayOrder) {
        if (!agendaByDay[dayKey]) continue;
        
        const dayItems = agendaByDay[dayKey];
        foundItem = dayItems.find(item => {
          // Try multiple ID comparison methods
          const itemIdStr = String(item.id);
          const sessionIdStr = String(sessionId);
          const matches = itemIdStr === sessionIdStr || 
                          itemIdStr === String(Number(sessionIdStr)) ||
                          String(Number(itemIdStr)) === sessionIdStr ||
                          item.id === Number(sessionIdStr) ||
                          Number(itemIdStr) === Number(sessionIdStr);
          return matches;
        }) || null;
        
        if (foundItem) {
          sessionDayKey = dayKey;
          break;
        }
      }
      
      // If not found in ordered days, try all days as fallback
      if (!sessionDayKey) {
        for (const dayKey in agendaByDay) {
          if (dayOrder.includes(dayKey)) continue; // Already searched
          
          const dayItems = agendaByDay[dayKey];
          foundItem = dayItems.find(item => {
            const itemIdStr = String(item.id);
            const sessionIdStr = String(sessionId);
            return itemIdStr === sessionIdStr || 
                   itemIdStr === String(Number(sessionIdStr)) ||
                   String(Number(itemIdStr)) === sessionIdStr ||
                   item.id === Number(sessionIdStr) ||
                   Number(itemIdStr) === Number(sessionIdStr);
          }) || null;
          
          if (foundItem) {
            sessionDayKey = dayKey;
            break;
          }
        }
      }
    }

    if (!sessionDayKey) {
      console.error(`❌ Session with ID ${sessionId} not found in agenda!`);
      console.error(`📋 Available session IDs by day:`, 
        Object.entries(agendaByDay).map(([day, items]) => ({
          day,
          ids: items.map(item => ({ id: item.id, title: item.title?.substring(0, 30) }))
        }))
      );
      return;
    }

    // Set the active tab to the session's day if it's different
    if (activeTab !== sessionDayKey) {
      setActiveTab(sessionDayKey);
      // Don't mark as handled yet - wait until we're on the correct tab
      // Return early - the effect will run again when activeTab changes
      return;
    }

    // We're on the correct tab, mark as handling and proceed to scroll
    handledSessionRef.current = sessionId;

    // Function to attempt scrolling
    const attemptScroll = (attemptNumber: number = 1, maxAttempts: number = 5) => {
      const sessionRef = sessionItemRefs.current[sessionId];
      
      if (!sessionRef) {
        if (attemptNumber < maxAttempts) {
          // Retry with exponential backoff
          setTimeout(() => attemptScroll(attemptNumber + 1, maxAttempts), 200 * attemptNumber);
        } else {
          console.error(`[Scroll] Failed to find session ref after ${maxAttempts} attempts`);
        }
        return;
      }
      
      if (!scrollViewRef.current) {
        if (attemptNumber < maxAttempts) {
          setTimeout(() => attemptScroll(attemptNumber + 1, maxAttempts), 200 * attemptNumber);
        }
        return;
      }

      // Use measureLayout to get the position of the session item
      try {
        sessionRef.measureLayout(
          scrollViewRef.current as any,
          (_x, y, _width, _height) => {
            // Calculate scroll position with proper offset
            // Account for header, tabs, and search bar
            const headerOffset = 150; // Approximate header + tabs height
            const scrollY = Math.max(0, y - headerOffset);
            
            scrollViewRef.current?.scrollTo({ 
              y: scrollY,
              animated: true 
            });
            
            // Clear URL parameters after scrolling to prevent re-triggering
            setTimeout(() => {
              router.replace(`/events/${eventId}/agenda`);
            }, 1000);
          },
          () => {
            console.error(`[Scroll] Error measuring session layout (attempt ${attemptNumber})`);
            if (attemptNumber < maxAttempts) {
              // Retry with exponential backoff
              setTimeout(() => attemptScroll(attemptNumber + 1, maxAttempts), 300 * attemptNumber);
            } else {
              console.error(`[Scroll] Failed to measure layout after ${maxAttempts} attempts`);
            }
          }
        );
      } catch (error) {
        console.error(`[Scroll] Exception during measureLayout (attempt ${attemptNumber}):`, error);
        if (attemptNumber < maxAttempts) {
          setTimeout(() => attemptScroll(attemptNumber + 1, maxAttempts), 300 * attemptNumber);
        }
      }
    };

    // Wait for layout to render after tab is set
    // Use InteractionManager to wait for all interactions to complete
    let timeoutId: NodeJS.Timeout | null = null;
    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      // Additional delay to ensure DOM is fully rendered
      timeoutId = setTimeout(() => {
        attemptScroll(1, 5);
      }, 600); // Increased from 400ms to 600ms
    });

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (interactionHandle) {
        interactionHandle.cancel();
      }
    };
  }, [params.session, params.scrollTo, agendaByDay, activeTab]); // Removed router to prevent infinite loops

  // Function to clean session titles by removing type prefixes
  const cleanSessionTitle = (title: string) => {
    // Remove common session type prefixes
    return title
      .replace(/^Keynote\s*–\s*/i, '')
      .replace(/^Panel\s*–\s*/i, '')
      .replace(/^Panel\s*\([^)]+\)\s*–\s*/i, '')
      .replace(/^Break\s*–\s*/i, '')
      .replace(/^Meal\s*–\s*/i, '')
      .replace(/^Registration\s*–\s*/i, '')
      .trim();
  };

  // Resolves an agenda item's speaker reference to both a display name and a
  // navigable speaker id. Newer tour-stop events (packages/config/src/
  // events.ts's chile2026/peru2026/colombia2026 agenda data) reference
  // speakers by id slug (e.g. 'alvaro-clarke'), not display name -- the
  // original name-substring match below predates that and was silently
  // failing for id-slug references (a hyphenated, unaccented slug rarely
  // substring-matches an accented display name), which is why agenda cards
  // were rendering the raw id slug as if it were the speaker's name.
  // When the backend speaker directory returns database rows, supplement the map with both
  // database UUIDs and event.speakers config slugs.
  const resolveAgendaSpeaker = (
    value: string
  ): { id: string | null; displayName: string; image?: string } => {
    // First, try the combined map (config + database speakers)
    const mapEntry = speakerMapRef.get(value);
    if (mapEntry) {
      return { id: mapEntry.id, displayName: mapEntry.name, image: mapEntry.image };
    }

    // Fallback: search by name in event.speakers
    if (event?.speakers) {
      const byName = event.speakers.find((s: { name: string }) =>
        s.name.toLowerCase().includes(value.toLowerCase()) ||
        value.toLowerCase().includes(s.name.toLowerCase())
      );
      if (byName?.id) return { id: byName.id, displayName: byName.name, image: byName.image };
    }

    return { id: null, displayName: value };
  };

  // Function to find speaker ID by name (synchronous check first)
  const findSpeakerId = (speakerName: string): string | null => resolveAgendaSpeaker(speakerName).id;

  // Function to handle speaker navigation
  const handleSpeakerPress = async (speakerName: string) => {
    // First try synchronous lookup
    let speakerId = findSpeakerId(speakerName);
    
    // If not found, ask the backend directory search.
    if (!speakerId) {
      try {
        const response = await apiClient.request(eventApiPath(eventId, 'speakers'), {
          skipEventSegment: true,
          params: { search: speakerName },
        });
        const data = (response.data as any)?.data;
        if (response.success && Array.isArray(data) && data[0]?.id) speakerId = data[0].id;
      } catch (e) {
        // Ignore errors
      }
    }
    
    if (speakerId) {
      router.push(`/events/${eventId}/speakers/${speakerId}`);
    }
  };

  // Load user agenda status and favorites
  useEffect(() => {
    const loadUserAgendaStatus = async () => {
      if (!user) {
        setUserAgendaStatus({});
        setFavoriteStatus({});
        return;
      }
      try {
        const response = await apiClient.request(agendaStatusApiPath, {
          skipEventSegment: true,
        });

        if (!response.success) {
          console.error('Error loading user agenda status:', response.error);
          return;
        }

        const data = (response.data as any)?.data;
        const statusMap: Record<string, 'tentative' | 'confirmed'> = {};
        const favoriteMap: Record<string, boolean> = {};

        (data || []).forEach((item: any) => {
          if (item.agenda_id) {
            const status = item.status === 'unconfirmed' ? 'tentative' : item.status;
            statusMap[item.agenda_id] = status as 'tentative' | 'confirmed';
            if (item.is_favorite) favoriteMap[item.agenda_id] = true;
          }
        });
        
        setUserAgendaStatus(statusMap);
        setFavoriteStatus(favoriteMap);
      } catch (e) {
        console.error('Error loading user agenda status:', e);
      }
    };

    loadUserAgendaStatus();
  }, [user, eventId, agendaStatusApiPath]);

  // Handle toggle confirmation
  /* istanbul ignore next -- exercised through the native/web agenda interaction flow */
  const handleToggleConfirmation = async (agendaItem: AgendaItem, startTime: Date) => {
    if (!user) {
      showError(t('messages.error', 'Error'), t('messages.signInToManageAgenda', 'Sign in to manage your agenda'));
      return;
    }
    
    setIsConfirming(true);
    const currentStatus = userAgendaStatus[agendaItem.id] || 'tentative';
    const newStatus = currentStatus === 'confirmed' ? 'tentative' : 'confirmed';
    
    try {
      const response = await apiClient.request(agendaStatusApiPath, {
        skipEventSegment: true,
        method: 'POST',
        body: { agendaId: agendaItem.id, status: newStatus },
      });
      if (!response.success) throw new Error(response.error);

      setUserAgendaStatus(prev => ({
        ...prev,
        [agendaItem.id]: newStatus,
      }));

      setConfirmationModal({ visible: false, agendaItem: null, startTime: null });
      if (newStatus === 'confirmed') {
        showSuccess(t('messages.addedToAgenda', 'Added to agenda'), t('messages.addedToAgendaMessage', 'This session is now in your agenda'));
      } else {
        showWarning(t('messages.removedFromAgenda', 'Removed from agenda'), t('messages.removedFromAgendaMessage', 'This session was removed from your agenda'));
      }
    } catch (error) {
      console.error('Error toggling confirmation:', error);
      showError(t('messages.error'), newStatus === 'confirmed' ? t('messages.confirmError') : t('messages.unconfirmError'));
    } finally {
      setIsConfirming(false);
    }
  };

  // Handle toggle favorite
  /* istanbul ignore next -- exercised through the native/web agenda interaction flow */
  const handleToggleFavorite = async (agendaItem: AgendaItem) => {
    if (!user) {
      showError(t('messages.error', 'Error'), t('messages.signInToManageFavorites', 'Sign in to manage your favorites'));
      return;
    }
    
    const currentFavorite = favoriteStatus[agendaItem.id] || false;
    const newFavorite = !currentFavorite;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      const response = await apiClient.request(agendaStatusApiPath, {
        skipEventSegment: true,
        method: 'POST',
        body: { agendaId: agendaItem.id, isFavorite: newFavorite },
      });
      if (!response.success) throw new Error(response.error);

      setFavoriteStatus(prev => ({
        ...prev,
        [agendaItem.id]: newFavorite,
      }));
      
      if (newFavorite) {
        showSuccess(t('messages.addedToFavorites'));
      } else {
        showWarning(t('messages.removedFromFavorites'));
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      showError(t('messages.error'), newFavorite ? t('messages.addToFavoritesError') : t('messages.removeFromFavoritesError'));
    }
  };

  // Some published agenda feeds use a display range ("09:00 - 09:30") rather
  // than an ISO timestamp. The confirmation modal cannot render that range as
  // a Date, but the status API does not require one. Fall back to an immediate
  // API toggle so Add to agenda still works and gives the user feedback.
  /* istanbul ignore next -- exercised through the native/web agenda interaction flow */
  const handleAgendaAction = (agendaItem: AgendaItem, startTime: Date) => {
    if (!user) {
      showError(t('messages.error', 'Error'), t('messages.signInToManageAgenda', 'Sign in to manage your agenda'));
      return;
    }

    if (!isNaN(startTime.getTime())) {
      setConfirmationModal({ visible: true, agendaItem, startTime });
      return;
    }

    void handleToggleConfirmation(agendaItem, new Date());
  };

  // Helper function to get the event's date based on day field or ISO time
  const getEventDate = (item: AgendaItem): Date | null => {
    // Map the item's day field to an actual calendar date, derived from
    // *this* event's real eventStartDate (day N = eventStartDate + (N-1)
    // days). Previously hardcoded to November 12-14, 2025 -- the original
    // bsl2025 hub event's dates -- which silently marked every tour-stop
    // event's agenda (chile2026, peru2026, colombia2026, ...) as already
    // past, since November 2025 predates all of them.
    const day = (item as any).day;
    if (day && event?.eventStartDate) {
      const dayMatch = String(day).match(/(\d+)/);
      const dayNumber = dayMatch ? parseInt(dayMatch[1], 10) : null;
      if (dayNumber && dayNumber >= 1) {
        // Parse event start date preserving its local timezone (not device timezone).
        // Extract date components from ISO string before the T separator to avoid
        // timezone conversion. E.g., "2026-08-05T09:00:00-04:00" → year 2026, month 8, day 5.
        const isoMatch = event.eventStartDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
          const [, year, month, date] = isoMatch;
          const eventYear = parseInt(year, 10);
          const eventMonth = parseInt(month, 10) - 1; // JS months are 0-indexed
          const eventDay = parseInt(date, 10) + (dayNumber - 1);
          return new Date(eventYear, eventMonth, eventDay);
        }
        // Fallback: parse as Date (may be affected by device timezone)
        const start = new Date(event.eventStartDate);
        if (!isNaN(start.getTime())) {
          return new Date(start.getFullYear(), start.getMonth(), start.getDate() + (dayNumber - 1));
        }
      }
    }

    // Fallback: try to parse from ISO time format
    if (item.time) {
      try {
        const startTime = parseEventISO(item.time);
        if (!isNaN(startTime.getTime())) {
          // Return the date part (year, month, day) of the start time
          return new Date(startTime.getFullYear(), startTime.getMonth(), startTime.getDate());
        }
      } catch {
        // Ignore parse errors
      }
    }

    return null;
  };

  // Helper function to check if an agenda item has passed
  const isEventPast = (item: AgendaItem): boolean => {
    if (!item.time) return false;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Get the event's date
    const eventDate = getEventDate(item);
    if (!eventDate) {
      // If we can't determine the date, fall back to time-only comparison
      // This handles the case where day info is missing
      let endTime: Date | null = null;
      
      // Try to parse time range format "HH:MM - HH:MM"
      const timeMatch = item.time.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      if (timeMatch) {
        const endHour = parseInt(timeMatch[3], 10);
        const endMin = parseInt(timeMatch[4], 10);
        endTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), endHour, endMin);
      } else {
        // Try ISO format
        try {
          const startTime = parseEventISO(item.time);
          if (!isNaN(startTime.getTime())) {
            const duration = (item as any).duration_minutes || 60;
            endTime = new Date(startTime.getTime() + duration * 60 * 1000);
          }
        } catch {
          return false;
        }
      }
      
      if (!endTime) return false;
      return now > endTime;
    }
    
    // Compare dates first (year, month, day only)
    const eventDayOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
    const todayDayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    // If event is on a past day, it's definitely past
    if (eventDayOnly < todayDayOnly) {
      return true;
    }
    
    // If event is on a future day, it's not past
    if (eventDayOnly > todayDayOnly) {
      return false;
    }
    
    // If event is today, check if the end time has passed
    let endTime: Date | null = null;
    
    // Try to parse time range format "HH:MM - HH:MM"
    const timeMatch = item.time.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (timeMatch) {
      const endHour = parseInt(timeMatch[3], 10);
      const endMin = parseInt(timeMatch[4], 10);
      // Use the event's date, not today
      endTime = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate(), endHour, endMin);
    } else {
      // Try ISO format
      try {
        const startTime = parseEventISO(item.time);
        if (!isNaN(startTime.getTime())) {
          const duration = (item as any).duration_minutes || 60;
          endTime = new Date(startTime.getTime() + duration * 60 * 1000);
        }
      } catch {
        return false;
      }
    }
    
    if (!endTime) return false;
    return now > endTime;
  };

  // Render a single agenda card
  /* istanbul ignore next -- rendered by the platform agenda screen */
  const renderAgendaItem = (item: AgendaItem) => {
    const userStatus = userAgendaStatus[item.id] || 'tentative';
    const isConfirmed = userStatus === 'confirmed';
    const isFavorite = favoriteStatus[item.id] || false;
    const isPast = isEventPast(item);
    
    // Parse start time from item
    const startTime = parseEventISO((item as any).time || '');
    
    const typeColor = getAgendaTypeColor(item.type);
    
    return (
      <View 
        key={item.id} 
        ref={(ref) => {
          sessionItemRefs.current[item.id] = ref;
        }}
        style={[
          styles.agendaItem,
          isPast && styles.agendaItemPast
        ]}
      >
        <View style={[
          styles.agendaItemHeader, 
          { backgroundColor: typeColor },
          isPast && styles.agendaItemHeaderPast
        ]}>
          <View style={styles.timeContainer}>
            <Text style={[styles.agendaTime, { color: '#FFFFFF' }]}>{formatTimeRange(item)}</Text>
            <View style={styles.badgeContainer}>
              {isPast && (
                <View style={styles.pastBadge}>
                  <Text style={styles.pastBadgeText}>{t('badges.past')}</Text>
                </View>
              )}
              <View style={[styles.agendaTypeBadge, { backgroundColor: 'rgba(255, 255, 255, 0.25)' }]}>
                <Text style={[styles.agendaTypeText, { color: '#FFFFFF' }]}>{item.type.toUpperCase()}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.agendaItemContent}>
          <View style={styles.agendaTitleRow}>
            <Text style={styles.agendaTitle}>{cleanSessionTitle(item.title)}</Text>
            <View style={styles.actionButtons}>
              <TouchableOpacity
                onPress={() => handleToggleFavorite(item)}
                style={styles.actionButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={isFavorite ? t('actions.removeFromFavorites', 'Remove from favorites') : t('actions.addToFavorites', 'Add to favorites')}
              >
                <MaterialIcons
                  name={isFavorite ? 'star' : 'star-border'}
                  size={18}
                  color={isFavorite ? '#FFD700' : colors.text.secondary}
                />
                <Text style={[styles.actionButtonLabel, { color: isFavorite ? '#B8860B' : colors.text.secondary }]}>
                  {isFavorite ? t('actions.favorited', 'Favorited') : t('actions.favorite', 'Favorite')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleAgendaAction(item, startTime)}
                style={styles.actionButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={isConfirmed ? t('actions.removeFromAgenda', 'Remove from agenda') : t('actions.addToAgenda', 'Add to agenda')}
              >
                <MaterialIcons
                  name={isConfirmed ? 'check-circle' : 'radio-button-unchecked'}
                  size={18}
                  color={isConfirmed ? colors.success.main : colors.text.secondary}
                />
                <Text style={[styles.actionButtonLabel, { color: isConfirmed ? colors.success.main : colors.text.secondary }]}>
                  {isConfirmed ? t('actions.onAgenda', 'On agenda') : t('actions.addToAgenda', 'Add to agenda')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {item.description && (
            <Text style={styles.agendaDescription}>{item.description}</Text>
          )}

          {item.speakers && item.speakers.length > 0 && (
            <View style={styles.speakersContainer}>
              <MaterialIcons
                name="people"
                size={16}
                color={colors.text.secondary}
                accessibilityLabel={t('labels.speakers')}
              />
              <View style={styles.speakersList}>
                {item.speakers.map((speaker: string, index: number) => {
                  const { id: speakerId, displayName, image } = resolveAgendaSpeaker(speaker);
                  const isClickable = speakerId !== null;
                  const chipContent = (
                    <>
                      <SpeakerAvatar name={displayName} imageUrl={image} size={22} />
                      <Text
                        style={[styles.agendaSpeakers, isClickable && styles.clickableSpeaker]}
                        numberOfLines={1}
                      >
                        {displayName}
                      </Text>
                    </>
                  );
                  return (
                    <React.Fragment key={index}>
                      {isClickable ? (
                        <TouchableOpacity onPress={() => handleSpeakerPress(speaker)} style={styles.speakerChip}>
                          {chipContent}
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.speakerChip}>{chipContent}</View>
                      )}
                    </React.Fragment>
                  );
                })}
              </View>
            </View>
          )}

          {(() => {
            let location = '';
            if (item.type === 'keynote') {
              location = t('locations.mainStage');
            } else if (item.type === 'registration') {
              location = t('locations.registrationArea');
            } else if (item.type === 'meal' || item.type === 'break') {
              return null;
            } else if (item.location) {
              location = item.location;
            }
            if (location) {
              return (
                <View style={styles.locationContainer}>
                  <MaterialIcons
                    name="location-on"
                    size={16}
                    color={colors.text.secondary}
                    accessibilityLabel={t('labels.location')}
                  />
                  <Text style={styles.agendaLocation}>{location}</Text>
                </View>
              );
            }
            return null;
          })()}
        </View>
      </View>
    );
  };
  // Show global loader while loading. Also cover the gap between agenda
  // finishing its load and the separate grouping effect (deps: [agenda,
  // loading]) actually running: that effect only fires on the render AFTER
  // `loading` flips to false, so for one frame agenda has real items but
  // agendaByDay is still {} and activeTab still points at the unset
  // default -- which would otherwise render the real "no agenda for this
  // event" empty state for real data that just hasn't been grouped yet.
  const agendaGroupingPending = agenda.length > 0 && Object.keys(agendaByDay).length === 0;
  if (loading || agendaGroupingPending) {
    return (
      <LoadingScreen
        message={t('loading')}
        fullScreen={true}
      />
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        bounces={true}
        ref={scrollViewRef}
      >
        {/* Event Header */}
        <EventBanner
          title={t('title')}
          subtitle={`${agenda.length === 1 ? t('subtitle_one') : t('subtitle_other').replace('{count}', String(agenda.length))} • ${eventVenueLabel}`}
          date={eventDateLabel}
          showCountdown={!isEventFinished && Boolean(event?.eventStartDate)}
          showLiveIndicator={isLive && !isEventFinished && Boolean(event?.eventStartDate)}
          isEventFinished={isEventFinished}
          eventStartDate={event?.eventStartDate}
          eventId={eventId}
          eventImage={event?.image}
        />

        {/* Tab Navigation - Centered with consistent sizing */}
        {Object.keys(agendaByDay).length > 0 && (
          <View style={styles.tabContainer}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <ScrollView 
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tabScrollContent}
                contentInset={{ left: 0, right: 0 }}
                contentOffset={{ x: 0, y: 0 }}
                snapToInterval={128} // 120 (width) + 8 (margin)
                decelerationRate="fast"
                snapToAlignment="center"
              >
              {Object.keys(agendaByDay).map((dayKey) => (
                <TouchableOpacity
                  key={dayKey}
                  style={[
                    styles.tab,
                    activeTab === dayKey && styles.activeTab
                  ]}
                  onPress={() => {
                    userSelectedTabRef.current = true; // Mark as user-selected
                    // Clear URL query parameters when user manually switches tabs
                    // This prevents the scrolling effect from interfering with manual tab selection
                    if (params.session || params.scrollTo) {
                      handledSessionRef.current = null; // Reset session ref
                      router.replace(`/events/${eventId}/agenda`);
                    }
                    setActiveTab(dayKey);
                  }}
                >
                  <Text style={[
                    styles.tabLabel,
                    activeTab === dayKey && styles.activeTabLabel
                  ]}>
                    {getTabLabel(dayKey)}
                  </Text>
                  <Text style={[
                    styles.tabTheme,
                    activeTab === dayKey && styles.activeTabTheme
                  ]}>
                    {getTabTheme(dayKey)}
                  </Text>
                  <Text style={[
                    styles.tabCount,
                    activeTab === dayKey && styles.activeTabCount
                  ]}>
                    {agendaByDay[dayKey].length} {t('tabs.sessions')}
                  </Text>
                </TouchableOpacity>
              ))}
              </ScrollView>
            </View>
          </View>
        )}


      {/* Unified Search and Filter Section */}
      {agenda.length > 0 && (
        <UnifiedSearchAndFilter
          data={agenda}
          onFilteredData={setFilteredAgenda}
          onSearchChange={() => {}}
          searchPlaceholder={t('search.placeholder')}
          searchFields={['title', 'description', 'type', 'speakers']}
          filterGroups={filterGroups}
          customFilterLogic={customAgendaFilterLogic}
          showResultsCount={true}
        />
      )}

      {/* Full day title -- the tab card itself truncates the theme text to
          fit its fixed small size (see tabTheme style), so this shows the
          complete, untruncated day name + theme once a day is selected. */}
      {activeTab && Object.keys(agendaByDay).length > 0 && (
        <View style={styles.dayHeader}>
          <Text style={styles.dayHeaderLabel} numberOfLines={1}>
            {getTabLabel(activeTab)}
            {!!getTabTheme(activeTab) && (
              <Text style={styles.dayHeaderTheme}>: {getTabTheme(activeTab)}</Text>
            )}
          </Text>
        </View>
      )}

      {/* Tab Content */}
      <View style={styles.contentContainer}>
        {activeTab && agendaByDay[activeTab] ? (
          <View style={styles.agendaList}>
            {(() => {
              // Get filtered items for the active tab
              const filteredItems = filteredAgenda.filter(item => {
                const dayItems = agendaByDay[activeTab] || [];
                return dayItems.some(dayItem => String((dayItem as any).id) === String((item as any).id));
              });

              if (filteredItems.length === 0) {
                return (
                  <View style={styles.noResultsContainer}>
                    <MaterialIcons name="search-off" size={48} color={colors.text.secondary} />
                    <Text style={styles.noResultsText}>{t('noResults.title')}</Text>
                    <Text style={styles.noResultsSubtext}>{t('noResults.subtitle')}</Text>
                  </View>
                );
              }

              return filteredItems.map(renderAgendaItem);
            })()}
          </View>
        ) : agenda.length > 0 ? (
          // We already have real agenda items (confirmed by the top-level
          // loading gate above), but activeTab doesn't have a matching
          // agendaByDay entry yet -- e.g. the session/deep-link effect set
          // activeTab to a key the grouping effect hasn't produced yet.
          // This is still a loading state, not "no agenda for this event":
          // agenda.length > 0 already proves there IS agenda.
          <View style={styles.agendaList}>
            <LoadingScreen message={t('loading')} fullScreen={false} />
          </View>
        ) : (
          // Only reachable once agenda is confirmed empty -- the real "no
          // agenda for this event" case, not a stand-in for still loading.
          <View style={styles.noAgendaContainer}>
            <MaterialIcons name="event-busy" size={48} color={colors.text.secondary} />
            <Text style={styles.noAgendaText}>{t('empty.title')}</Text>
            <Text style={styles.noAgendaSubtext}>{t('empty.subtitle')}</Text>
            <View style={styles.noLiveIndicator}>
              <MaterialIcons name="schedule" size={16} color={colors.text.secondary} />
              <Text style={styles.noLiveText}>{t('empty.noLiveData')}</Text>
            </View>
            <TouchableOpacity
              accessibilityLabel={t('empty.retry')}
              accessibilityRole="button"
              style={styles.retryAgendaButton}
              onPress={() => {
                void loadAgenda();
              }}
            >
              <MaterialIcons name="refresh" size={18} color={colors.primary} />
              <Text style={styles.retryAgendaButtonText}>{t('empty.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Confirmation Modal */}
      {confirmationModal.agendaItem && confirmationModal.startTime && (
        <ScheduleConfirmationModal
          visible={confirmationModal.visible}
          title={confirmationModal.agendaItem.title || t('messages.untitledEvent')}
          location={confirmationModal.agendaItem.location || 
            (confirmationModal.agendaItem.type === 'keynote' ? t('locations.mainStage') : 
             confirmationModal.agendaItem.type === 'registration' ? t('locations.registrationArea') : undefined)}
          startTime={confirmationModal.startTime}
          isConfirmed={(userAgendaStatus[confirmationModal.agendaItem.id] || 'tentative') === 'confirmed'}
          onConfirm={() => handleToggleConfirmation(confirmationModal.agendaItem!, confirmationModal.startTime!)}
          onCancel={() => setConfirmationModal({ visible: false, agendaItem: null, startTime: null })}
          isLoading={isConfirming}
          isFreeSlot={false}
          freeSlotStatus="available"
          isAgendaEvent={true}
          isFavorite={favoriteStatus[confirmationModal.agendaItem.id] || false}
          onToggleFavorite={() => confirmationModal.agendaItem && handleToggleFavorite(confirmationModal.agendaItem)}
        />
      )}
    </ScrollView>
  </View>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  scrollView: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  contentContainer: {
    paddingBottom: 40,
  },
  // Tab Styles - Consistent sizing and centering
  tabContainer: {
    backgroundColor: colors.background.default,
    paddingTop: 8,
    paddingBottom: 8,
    width: '100%',
  },
  tabScrollContent: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    height: 100, // Slightly reduced height for mobile
    paddingHorizontal: 8,
  },
  tab: {
    width: 120, // Reduced width for mobile
    height: 80, // Reduced height for mobile
    paddingHorizontal: 4,
    paddingTop: 6,
    paddingBottom: 6,
    marginHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.background.paper,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    minWidth: 100, // Minimum width for touch targets
  },
  activeTab: {
    backgroundColor: '#007AFF',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  dayHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 6,
  },
  dayHeaderLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  dayHeaderTheme: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.text.secondary,
    textTransform: 'none',
  },
  tabLabel: {
    fontSize: 12, // Slightly smaller font for mobile
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
    width: '100%',
    overflow: 'hidden',
    paddingHorizontal: 2, // Reduced padding
    height: 16, // Reduced height
    lineHeight: 14, // Adjusted line height
  },
  activeTabLabel: {
    color: '#FFFFFF',
  },
  tabTheme: {
    fontSize: 9, // Slightly smaller font for mobile
    color: colors.text.secondary,
    fontWeight: '500',
    textAlign: 'center',
    width: '100%',
    height: 12, // Reduced height
    lineHeight: 11,
    marginBottom: 3, // Reduced margin
    overflow: 'hidden',
  },
  activeTabTheme: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  tabCount: {
    fontSize: 9, // Slightly smaller font for mobile
    color: colors.text.secondary,
    fontWeight: '600',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.05)',
    paddingHorizontal: 4, // Reduced padding
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 2,
    minWidth: 50, // Reduced minimum width
    textAlign: 'center',
    height: 14, // Reduced height
    lineHeight: 12, // Adjusted line height
  },
  activeTabCount: {
    color: 'rgba(255, 255, 255, 0.8)',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  agendaList: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  agendaItem: {
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.divider,
    overflow: 'hidden',
  },
  agendaItemHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  agendaTime: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  agendaTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  agendaTypeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pastBadge: {
    backgroundColor: 'rgba(128, 128, 128, 0.8)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  pastBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  agendaItemPast: {
    opacity: 0.6,
  },
  agendaItemHeaderPast: {
    opacity: 0.7,
  },
  agendaItemContent: {
    padding: 16,
  },
  agendaTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  agendaTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 1,
    lineHeight: 22,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.background.paper,
  },
  actionButtonLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  agendaDescription: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  speakersContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 6,
  },
  speakersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    gap: 8,
    marginTop: -2,
  },
  speakerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 200,
  },
  agendaSpeakers: {
    fontSize: 13,
    color: colors.text.secondary,
    flexShrink: 1,
  },
  clickableSpeaker: {
    color: '#007AFF',
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  agendaLocation: {
    fontSize: 13,
    color: colors.text.secondary,
    marginLeft: 6,
  },
  noAgendaContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  noAgendaText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 16,
    textAlign: 'center',
  },
  noAgendaSubtext: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 8,
    textAlign: 'center',
  },
  noLiveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
  },
  noLiveText: {
    fontSize: 12,
    color: colors.text.secondary,
    marginLeft: 4,
    fontWeight: '500',
  },
  retryAgendaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    marginTop: 20,
    paddingHorizontal: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.background.paper,
  },
  retryAgendaButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  statusIndicatorContainer: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  liveBadge: {
    backgroundColor: colors.success,
  },
  notLiveBadge: {
    backgroundColor: '#8E8E93',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  serviceWarningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: isDark ? 'rgba(255, 193, 7, 0.1)' : 'rgba(255, 193, 7, 0.1)',
    borderBottomWidth: 1,
    borderBottomColor: colors.warning.main,
  },
  serviceWarningText: {
    fontSize: 12,
    color: colors.warning.main,
    marginLeft: 6,
    fontWeight: '500',
  },
  noResultsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  noResultsText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginTop: 16,
    marginBottom: 8,
  },
  noResultsSubtext: {
    fontSize: 14,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  notLiveDetailsDropdown: {
    position: 'absolute',
    top: 50,
    right: 0,
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    minWidth: 280,
    shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.15)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: colors.divider,
    zIndex: 1000,
  },
  notLiveDetailsContent: {
    padding: 16,
  },
  notLiveDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 4,
  },
  notLiveIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  notLiveDetailsText: {
    fontSize: 13,
    color: colors.text.primary,
    flex: 1,
    lineHeight: 18,
    fontWeight: '500',
  },
});
