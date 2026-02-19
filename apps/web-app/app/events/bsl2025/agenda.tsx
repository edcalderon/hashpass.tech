import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, InteractionManager } from 'react-native';
import { useEvent } from '../../../contexts/EventContext';
import { useTheme } from '../../../hooks/useTheme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import EventBanner from '../../../components/EventBanner';
import UnifiedSearchAndFilter from '../../../components/UnifiedSearchAndFilter';
import { apiClient } from '@/lib/api-client';
import { 
  AgendaType,
  getAgendaTypeColor,
  parseEventISO,
  formatTimeRange,
  AgendaItem
} from '../../../types/agenda';
import { EVENTS } from '../../../config/events';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { useToastHelpers } from '../../../contexts/ToastContext';
import ScheduleConfirmationModal from '../../../components/ScheduleConfirmationModal';
import * as Haptics from 'expo-haptics';
import { parseISO } from 'date-fns';
import LoadingScreen from '../../../components/LoadingScreen';
import { useTranslation } from '../../../i18n/i18n';

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
          if (value.length > 0 && !item.speakers?.some(speakerId => 
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
      const matchesSpeaker = item.speakers?.some(speakerId => 
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

  // Helper functions used in effects and render
  const checkEventPeriod = () => {
    const now = new Date();
    // Event runs Nov 12-14, 2025 (Medellín, Colombia, UTC-05)
    const start = new Date('2025-11-12T00:00:00-05:00');
    const end = new Date('2025-11-14T23:59:59-05:00');
    setIsEventPeriod(now >= start && now <= end);
    setIsEventFinished(now > end);
  };

  const getTabLabel = (dayKey: string) => {
    // Expect keys like "Day 1 - November 12"
    const parts = dayKey.split(' - ');
    return parts[0] || dayKey;
  };

  const getTabTheme = (dayKey: string) => {
    if (dayKey.includes('Day 1')) return 'Regulación, Bancos Centrales e Infraestructura del Dinero Digital';
    if (dayKey.includes('Day 2')) return 'PSAV, Compliance, Custodia y Tokenización';
    if (dayKey.includes('Day 3')) return 'Stablecoins y DeFi: Integrando el Mundo Financiero Global';
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

  // Load agenda from database first, fallback to hardcoded config only on error
  useEffect(() => {
    const loadAgenda = async () => {
      try {
        setLoading(true);
        setUsingJsonFallback(false);
        setServiceStatus('unknown');
        console.log('📅 Attempting to load agenda from database...');
        
        try {
          // Try to fetch agenda directly first
          console.log('🌐 Fetching agenda data...');
          const response = await apiClient.request('agenda');
          
          // Handle the API response format: { data: [...] }
          let agendaData = [];
          
          try {
            // Check if response is already the data array
            if (Array.isArray(response)) {
              agendaData = response;
            }
            // Check if response has a data property that is an array
            else if (response?.data) {
              if (Array.isArray(response.data)) {
                agendaData = response.data;
              } else if (response.data.data && Array.isArray(response.data.data)) {
                // Handle nested data structure
                agendaData = response.data.data;
              }
            }
            
            console.log('📊 Parsed agenda data:', agendaData);
          } catch (error) {
            console.error('❌ Error parsing agenda data:', error);
            throw error; // Re-throw to trigger the fallback
          }
          
          if (agendaData.length > 0) {
            console.log('✅ Loaded live agenda from database:', agendaData.length, 'items');
            setAgenda(agendaData);
            setIsLive(true);
            setServiceStatus('running');
            return;
          }
        } catch (error) {
          console.error('❌ Error loading agenda:', error);
          console.log('🔄 Using JSON fallback due to error');
        }
        
        // If we get here but no data, try with status endpoint
        console.log('ℹ️ No data in direct response, trying status endpoint...');
        try {
          const statusResponse = await apiClient.request('status');
          // Handle status response format: { data: { hasData: true } }
          const statusData = statusResponse?.data || {};
          
          if (statusData?.hasData) {
            const agendaResponse = await apiClient.request('agenda');
            let agendaItems = [];
            
            // Handle agenda response format: { data: [...] }
            if (agendaResponse?.data && Array.isArray(agendaResponse.data)) {
              agendaItems = agendaResponse.data;
            } else if (Array.isArray(agendaResponse)) {
              agendaItems = agendaResponse;
            }
            
            console.log('📊 Parsed agenda items from status check:', agendaItems);
            
            if (agendaItems.length > 0) {
              console.log('✅ Loaded agenda with eventId:', agendaItems.length, 'items');
              setAgenda(agendaItems);
              setIsLive(true);
              setServiceStatus('running');
              return;
            }
          }
        } catch (error) {
          console.error('❌ Error loading agenda:', error);
          console.log('🔄 Using JSON fallback due to error');
        }
        
        // If we get here, no data was found through any method
        console.warn('⚠️ No agenda data found, showing JSON fallback');
        console.log('📄 Event object:', event);
        console.log('📄 JSON fallback data:', event?.agenda?.length || 0, 'items');
        
        // Use fallback data
        const fallbackAgenda = event?.agenda || EVENTS.bsl2025.agenda || [];
        console.log('📄 Setting fallback agenda:', fallbackAgenda.length, 'items');
              setAgenda(fallbackAgenda);
              setIsLive(false);
              setUsingJsonFallback(true);
        setServiceStatus('stopped');
      } catch (error) {
        console.error('❌ Error loading agenda:', error);
        console.log('🔄 Using JSON fallback due to error');
        
        // Use fallback data
        const fallbackAgenda = event?.agenda || EVENTS.bsl2025.agenda || [];
        console.log('📋 Using fallback agenda with', fallbackAgenda.length, 'items');
        console.log('📄 JSON fallback data:', fallbackAgenda.length, 'items');
        setAgenda(fallbackAgenda);
        setIsLive(false);
        setUsingJsonFallback(true);
        setServiceStatus('stopped');
      } finally {
        setLoading(false);
      }
    };

    loadAgenda();
  }, [event?.agenda]);

  // Ensure filteredAgenda is populated when agenda loads
  useEffect(() => {
    if (agenda && agenda.length > 0) {
      setFilteredAgenda(agenda);
    } else {
      setFilteredAgenda([]);
    }
  }, [agenda]);

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
          const response = await apiClient.request('agenda', {
            params: { eventId: 'bsl2025' }
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
  }, [isLive, isEventPeriod]);

  // Group agenda by day
  useEffect(() => {
    if (loading) return;
    
    if (agenda.length === 0) {
      // No agenda data - clear the grouped data
      console.log('📅 No agenda data to group, clearing agendaByDay');
      setAgendaByDay({});
      return;
    }
    
    console.log('📅 Grouping agenda data:', agenda.length, 'items');
    console.log('📅 First agenda item:', agenda[0]);
    const grouped: { [key: string]: AgendaItem[] } = {};
    
    // Check if agenda items have day information from database
    const hasDayInfo = agenda.some(item => (item as any).day);
    console.log('📅 Has day info from database:', hasDayInfo);
    
    if (hasDayInfo) {
      const dayValues = agenda.map(item => (item as any).day).filter(Boolean);
      console.log('📅 Day values found:', [...new Set(dayValues)]);
    }
    
    if (hasDayInfo) {
      // Group by day column from database
      console.log('📅 Using database day information');
      
      // Check if the day values are simple (1, 2, 3) or complex (with thematic names)
      const dayValues = agenda.map(item => (item as any).day).filter(Boolean);
      const uniqueDays = [...new Set(dayValues)];
      console.log('📅 Unique day values:', uniqueDays);
      
      // Group by day, handling both simple and complex day names
      agenda.forEach(item => {
        const day = (item as any).day;
        if (day) {
          let dayKey: string;
          let dayName: string;
          
          // Extract day number from complex day names
          if (day.includes('Día 1')) {
            dayKey = 'Day 1 - November 12';
            dayName = 'Regulación, Bancos Centrales e Infraestructura del Dinero Digital';
          } else if (day.includes('Día 2')) {
            dayKey = 'Day 2 - November 13';
            dayName = 'PSAV, Compliance, Custodia y Tokenización';
          } else if (day.includes('Día 3')) {
            dayKey = 'Day 3 - November 14';
            dayName = 'Stablecoins y DeFi: Integrando el Mundo Financiero Global';
          } else if (day === '1' || day === '2' || day === '3') {
            // Simple day numbers
            dayKey = `Day ${day} - November ${day === '1' ? '12' : day === '2' ? '13' : '14'}`;
            dayName = day === '1' ? 'Regulación, Bancos Centrales e Infraestructura del Dinero Digital' :
                     day === '2' ? 'PSAV, Compliance, Custodia y Tokenización' :
                     'Stablecoins y DeFi: Integrando el Mundo Financiero Global';
          } else {
            // Fallback for other formats
            dayKey = day;
            dayName = 'Event Day';
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
        console.log('📅 Found', itemsWithoutDay.length, 'items without day info, distributing them');
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
      
      console.log('📅 Grouped by database day column:', Object.keys(grouped).map(key => `${key}: ${grouped[key].length} items`));
    } else {
      // Fallback: distribute sessions across 3 days
      console.log('📅 No day info in database, using fallback distribution');
      const day1Items = agenda.slice(0, 4); // First 4 items for Day 1
      const day2Items = agenda.slice(4, 8); // Next 4 items for Day 2
      const day3Items = agenda.slice(8); // Remaining items for Day 3
      
      console.log('📅 Day distribution:', {
        day1: day1Items.length,
        day2: day2Items.length, 
        day3: day3Items.length
      });
      
      console.log('📅 Day 1 items:', day1Items.map(item => item.title));
      console.log('📅 Day 2 items:', day2Items.map(item => item.title));
      console.log('📅 Day 3 items:', day3Items.map(item => item.title));
      
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
      
      console.log('📅 Grouped after fallback distribution:', Object.keys(grouped));
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

    console.log('📅 Final grouped data:', Object.keys(sortedGrouped).map(key => `${key}: ${sortedGrouped[key].length} items`));
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
      console.log('📅 User selected tab preserved:', activeTab);
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
        console.log('📅 Setting initial active tab to:', tabToSelect, '(from available tabs:', availableTabs, ')');
        setActiveTab(tabToSelect);
        hasSetInitialTabRef.current = true;
      }
    } else if (currentTabExists && !hasSetInitialTabRef.current && !userSelectedTabRef.current) {
      // Tab already exists and is valid, mark as set so we don't override it
      // This handles the case where the default tab already exists in the grouped data
      // BUT: if it's not Day 1 and we haven't set initial tab yet, force Day 1
      if (activeTab !== 'Day 1 - November 12' && sortedGrouped['Day 1 - November 12']) {
        console.log('📅 Current tab is not Day 1, forcing Day 1:', activeTab, '-> Day 1 - November 12');
        setActiveTab('Day 1 - November 12');
        hasSetInitialTabRef.current = true;
      } else {
        console.log('📅 Current tab exists, marking as set:', activeTab);
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
          console.log(`✅ Using provided day from URL: ${providedDay} for session ${sessionId}`);
        } else {
          console.warn(`⚠️ Session ${sessionId} not found in provided day ${providedDay}, searching all days...`);
        }
      }
    }
    
    // If not found using provided day, search in correct order (Day 1, Day 2, Day 3)
    if (!sessionDayKey) {
      const dayOrder = ['Day 1 - November 12', 'Day 2 - November 13', 'Day 3 - November 14'];
      
      console.log(`🔍 Searching for session ${sessionId} in agenda...`);
      console.log(`📅 Available days:`, Object.keys(agendaByDay));
      console.log(`📅 Day counts:`, dayOrder.map(day => ({ day, count: agendaByDay[day]?.length || 0 })));
      
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
          
          if (matches) {
            console.log(`✅ Found match in ${dayKey}:`, {
              itemId: item.id,
              itemIdStr,
              sessionId,
              sessionIdStr,
              title: item.title?.substring(0, 50),
            });
          }
          
          return matches;
        }) || null;
        
        if (foundItem) {
          sessionDayKey = dayKey;
          console.log(`🎯 Session ${sessionId} found in ${dayKey}`);
          break;
        }
      }
      
      // If not found in ordered days, try all days as fallback
      if (!sessionDayKey) {
        console.log(`⚠️ Not found in ordered days, searching all days...`);
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
            console.log(`🎯 Session ${sessionId} found in ${dayKey} (fallback)`);
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
      console.log(`📅 Setting active tab to ${sessionDayKey} for session ${sessionId} (was ${activeTab})`);
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
        console.warn(`[Scroll] Attempt ${attemptNumber}: Session ref not found for ID: ${sessionId}`);
        if (attemptNumber < maxAttempts) {
          // Retry with exponential backoff
          setTimeout(() => attemptScroll(attemptNumber + 1, maxAttempts), 200 * attemptNumber);
        } else {
          console.error(`[Scroll] Failed to find session ref after ${maxAttempts} attempts`);
        }
        return;
      }
      
      if (!scrollViewRef.current) {
        console.warn(`[Scroll] Attempt ${attemptNumber}: ScrollView ref not found`);
        if (attemptNumber < maxAttempts) {
          setTimeout(() => attemptScroll(attemptNumber + 1, maxAttempts), 200 * attemptNumber);
        }
        return;
      }

      // Use measureLayout to get the position of the session item
      try {
        sessionRef.measureLayout(
          scrollViewRef.current as any,
          (x, y, width, height) => {
            console.log(`[Scroll] ✅ Successfully measured session ${sessionId}:`, {
              x,
              y,
              width,
              height,
              scrollY: y - 150, // Offset by 150px for header/tabs
            });
            
            // Calculate scroll position with proper offset
            // Account for header, tabs, and search bar
            const headerOffset = 150; // Approximate header + tabs height
            const scrollY = Math.max(0, y - headerOffset);
            
            scrollViewRef.current?.scrollTo({ 
              y: scrollY,
              animated: true 
            });
            
            console.log(`[Scroll] Scrolled to y: ${scrollY} for session ${sessionId}`);
            
            // Clear URL parameters after scrolling to prevent re-triggering
            setTimeout(() => {
              router.replace('/events/bsl2025/agenda', { scroll: false });
            }, 1000);
          },
          (error) => {
            console.error(`[Scroll] Error measuring session layout (attempt ${attemptNumber}):`, error);
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

  // Function to find speaker ID by name (synchronous check first)
  const findSpeakerId = (speakerName: string): string | null => {
    // Try to find speaker in the event speakers data first
    if (event?.speakers) {
      const speaker = event.speakers.find(s => 
        s.name.toLowerCase().includes(speakerName.toLowerCase()) ||
        speakerName.toLowerCase().includes(s.name.toLowerCase())
      );
      if (speaker?.id) return speaker.id;
    }
    
    // Return null for now - async lookup can be added later if needed
    return null;
  };

  // Function to handle speaker navigation
  const handleSpeakerPress = async (speakerName: string) => {
    // First try synchronous lookup
    let speakerId = findSpeakerId(speakerName);
    
    // If not found, try database lookup
    if (!speakerId) {
      try {
        const { data } = await supabase
          .from('bsl_speakers')
          .select('id')
          .ilike('name', `%${speakerName}%`)
          .limit(1)
          .single();
        
        if (data?.id) speakerId = data.id;
      } catch (e) {
        // Ignore errors
      }
    }
    
    if (speakerId) {
      router.push(`/events/bsl2025/speakers/${speakerId}`);
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
        const { data, error } = await supabase
          .from('user_agenda_status')
          .select('agenda_id, status, is_favorite')
          .eq('user_id', user.id)
          .not('agenda_id', 'is', null);
        
        if (error) {
          console.error('Error loading user agenda status:', error);
          return;
        }
        
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
  }, [user]);

  // Handle toggle confirmation
  const handleToggleConfirmation = async (agendaItem: AgendaItem, startTime: Date) => {
    if (!user) return;
    
    setIsConfirming(true);
    const currentStatus = userAgendaStatus[agendaItem.id] || 'tentative';
    const newStatus = currentStatus === 'confirmed' ? 'tentative' : 'confirmed';
    
    try {
      const { data: existing } = await supabase
        .from('user_agenda_status')
        .select('id')
        .eq('user_id', user.id)
        .eq('agenda_id', agendaItem.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('user_agenda_status')
          .update({
            status: newStatus,
            confirmed_at: newStatus === 'confirmed' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_agenda_status')
          .insert({
            user_id: user.id,
            agenda_id: agendaItem.id,
            event_id: 'bsl2025',
            status: newStatus,
            confirmed_at: newStatus === 'confirmed' ? new Date().toISOString() : null,
          });
        
        if (error) throw error;
      }

      setUserAgendaStatus(prev => ({
        ...prev,
        [agendaItem.id]: newStatus,
      }));

      setConfirmationModal({ visible: false, agendaItem: null, startTime: null });
      if (newStatus === 'confirmed') {
        showSuccess(t('messages.eventConfirmed'), t('messages.eventConfirmedMessage'));
      } else {
        showWarning(t('messages.eventUnconfirmed'), t('messages.eventUnconfirmedMessage'));
      }
    } catch (error) {
      console.error('Error toggling confirmation:', error);
      showError(t('messages.error'), newStatus === 'confirmed' ? t('messages.confirmError') : t('messages.unconfirmError'));
    } finally {
      setIsConfirming(false);
    }
  };

  // Handle toggle favorite
  const handleToggleFavorite = async (agendaItem: AgendaItem) => {
    if (!user) return;
    
    const currentFavorite = favoriteStatus[agendaItem.id] || false;
    const newFavorite = !currentFavorite;
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    try {
      const { data: existing } = await supabase
        .from('user_agenda_status')
        .select('id')
        .eq('user_id', user.id)
        .eq('agenda_id', agendaItem.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('user_agenda_status')
          .update({
            is_favorite: newFavorite,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const currentStatus = userAgendaStatus[agendaItem.id] || 'tentative';
        const { error } = await supabase
          .from('user_agenda_status')
          .insert({
            user_id: user.id,
            agenda_id: agendaItem.id,
            event_id: 'bsl2025',
            status: currentStatus,
            is_favorite: newFavorite,
          });
        if (error) throw error;
      }

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

  // Helper function to get the event's date based on day field or ISO time
  const getEventDate = (item: AgendaItem): Date | null => {
    // First try to get the day from the item's day field
    const day = (item as any).day;
    if (day) {
      let eventDate: Date | null = null;
      
      // Map day to actual date
      if (day.includes('Día 1') || day === '1') {
        eventDate = new Date(2025, 10, 12); // November 12, 2025 (month is 0-indexed)
      } else if (day.includes('Día 2') || day === '2') {
        eventDate = new Date(2025, 10, 13); // November 13, 2025
      } else if (day.includes('Día 3') || day === '3') {
        eventDate = new Date(2025, 10, 14); // November 14, 2025
      }
      
      if (eventDate) {
        return eventDate;
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
  const renderAgendaItem = (item: AgendaItem) => {
    const userStatus = userAgendaStatus[item.id] || 'tentative';
    const isConfirmed = userStatus === 'confirmed';
    const isFavorite = favoriteStatus[item.id] || false;
    const isPast = isEventPast(item);
    
    // Parse start time from item
    const startTime = parseEventISO((item as any).time || '');
    const isValidTime = !isNaN(startTime.getTime());
    
    const handleConfirmPress = () => {
      if (isValidTime) {
        setConfirmationModal({ visible: true, agendaItem: item, startTime });
      }
    };

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
              >
                <MaterialIcons
                  name={isFavorite ? 'star' : 'star-border'}
                  size={22}
                  color={isFavorite ? '#FFD700' : colors.text.secondary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleConfirmPress}
                style={styles.actionButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialIcons
                  name={isConfirmed ? 'check-circle' : 'radio-button-unchecked'}
                  size={22}
                  color={isConfirmed ? colors.success.main : colors.text.secondary}
                />
              </TouchableOpacity>
            </View>
          </View>
          
          {item.description && (
            <Text style={styles.agendaDescription}>{item.description}</Text>
          )}

          {item.speakers && item.speakers.length > 0 && (
            <View style={styles.speakersContainer}>
              <MaterialIcons name="people" size={16} color={colors.text.secondary} />
              <View style={styles.speakersList}>
                {item.speakers.map((speaker, index) => {
                  const speakerId = findSpeakerId(speaker);
                  const isClickable = speakerId !== null;
                  return (
                    <React.Fragment key={index}>
                      {isClickable ? (
                        <TouchableOpacity onPress={() => handleSpeakerPress(speaker)} style={styles.speakerLink}>
                          <Text style={[styles.agendaSpeakers, styles.clickableSpeaker]}>{speaker}</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.agendaSpeakers}>{speaker}</Text>
                      )}
                      {index < (item.speakers?.length || 0) - 1 && (
                        <Text style={styles.speakerSeparator}>, </Text>
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
                  <MaterialIcons name="location-on" size={16} color={colors.text.secondary} />
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
  // Show global loader while loading
  if (loading) {
    return (
      <LoadingScreen
        icon="schedule"
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
          subtitle={agenda.length === 1 ? t('subtitle_one') : t('subtitle_other').replace('{count}', String(agenda.length))}
          date={t('date')}
          showCountdown={!isEventFinished}
          showLiveIndicator={isLive && !isEventFinished}
          isEventFinished={isEventFinished}
          eventId="bsl2025"
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
                      router.replace('/events/bsl2025/agenda', { scroll: false });
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
              
              // Removed console.log to prevent infinite re-renders
              
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
        ) : (
          <View style={styles.noAgendaContainer}>
            <MaterialIcons name="event-busy" size={48} color={colors.text.secondary} />
            <Text style={styles.noAgendaText}>{t('empty.title')}</Text>
            <Text style={styles.noAgendaSubtext}>{t('empty.subtitle')}</Text>
            <View style={styles.noLiveIndicator}>
              <MaterialIcons name="schedule" size={16} color={colors.text.secondary} />
              <Text style={styles.noLiveText}>{t('empty.noLiveData')}</Text>
            </View>
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
  tabLabel: {
    fontSize: 12, // Slightly smaller font for mobile
    fontWeight: '600',
    color: colors.text.primary,
    textAlign: 'center',
    width: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
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
    padding: 4,
  },
  agendaDescription: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  speakersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  speakersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
  },
  agendaSpeakers: {
    fontSize: 13,
    color: colors.text.secondary,
    marginLeft: 6,
    flex: 1,
  },
  clickableSpeaker: {
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  speakerLink: {
    // No additional styling needed, inherits from parent
  },
  speakerSeparator: {
    fontSize: 13,
    color: colors.text.secondary,
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
