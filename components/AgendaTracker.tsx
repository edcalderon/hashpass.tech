import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useRouter } from 'expo-router';
import { useTranslation } from '../i18n/i18n';
import { isMainBranch } from '../lib/event-detector';
import { apiClient } from '../lib/api-client';
import { AgendaItem, parseEventISO, formatTimeRange } from '../types/agenda';

interface AgendaTrackerProps {
  eventId?: string;
  backgroundColor?: string;
}

interface TimeLeft {
  hours: number;
  minutes: number;
  seconds: number;
}

export default function AgendaTracker({ 
  eventId = 'bsl2025',
  backgroundColor = '#007AFF'
}: AgendaTrackerProps) {
  const { isDark, colors } = useTheme();
  const router = useRouter();
  const { t } = useTranslation('explore');
  const styles = getStyles(isDark, colors, backgroundColor);
  
  const [currentEvent, setCurrentEvent] = useState<any | null>(null);
  const [nextEvent, setNextEvent] = useState<any | null>(null);
  const [timeToNext, setTimeToNext] = useState<TimeLeft>({ hours: 0, minutes: 0, seconds: 0 });
  const [timeRemaining, setTimeRemaining] = useState<TimeLeft>({ hours: 0, minutes: 0, seconds: 0 });
  const [loading, setLoading] = useState(true);
  const [sessionProgress, setSessionProgress] = useState(0); // 0-100 percentage
  const [agendaLoaded, setAgendaLoaded] = useState(false); // Track if agenda has been loaded at least once
  const progressAnim = React.useRef(new Animated.Value(0)).current;

  // Load agenda and find current/next events
  useEffect(() => {
    const loadAgenda = async () => {
      try {
        setLoading(true);
        const response = await apiClient.request('agenda', {
          params: { eventId }
        });
        
        let agendaData: AgendaItem[] = [];
        // Handle apiClient response format: { success, data, error }
        if (response.success && response.data) {
          if (Array.isArray(response.data)) {
            agendaData = response.data;
          } else if (response.data.data && Array.isArray(response.data.data)) {
            agendaData = response.data.data;
          }
        } else if (Array.isArray(response)) {
          agendaData = response;
        } else if (response?.data) {
          agendaData = Array.isArray(response.data) ? response.data : response.data.data || [];
        }

        if (agendaData.length === 0) {
          setLoading(false);
          setAgendaLoaded(true);
          return;
        }

        const now = new Date();
        
        // Find current event (happening now)
        const current = agendaData.find(item => {
          if (!item.time) return false;
          
          // Try to parse time range format "HH:MM - HH:MM"
          const timeMatch = item.time.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
          if (timeMatch) {
            const startHour = parseInt(timeMatch[1], 10);
            const startMin = parseInt(timeMatch[2], 10);
            const endHour = parseInt(timeMatch[3], 10);
            const endMin = parseInt(timeMatch[4], 10);
            
            // Create date objects for today with the parsed times
            const today = new Date();
            const startTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), startHour, startMin);
            const endTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), endHour, endMin);
            
            return now >= startTime && now <= endTime;
          }
          
          // Try ISO format
          try {
            const eventTime = parseEventISO(item.time);
            if (isNaN(eventTime.getTime())) return false;
            
            const startTime = eventTime;
            const duration = (item as any).duration_minutes || 60;
            const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
            
            return now >= startTime && now <= endTime;
          } catch {
            return false;
          }
        });

        // Find next event (upcoming)
        const upcoming = agendaData
          .filter(item => {
            if (!item.time) return false;
            
            // Try to parse time range format
            const timeMatch = item.time.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
            if (timeMatch) {
              const startHour = parseInt(timeMatch[1], 10);
              const startMin = parseInt(timeMatch[2], 10);
              const today = new Date();
              const startTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), startHour, startMin);
              return startTime > now;
            }
            
            // Try ISO format
            try {
              const eventTime = parseEventISO(item.time);
              if (isNaN(eventTime.getTime())) return false;
              return eventTime > now;
            } catch {
              return false;
            }
          })
          .sort((a, b) => {
            const getStartTime = (item: AgendaItem): Date | null => {
              const timeMatch = item.time?.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
              if (timeMatch) {
                const startHour = parseInt(timeMatch[1], 10);
                const startMin = parseInt(timeMatch[2], 10);
                const today = new Date();
                return new Date(today.getFullYear(), today.getMonth(), today.getDate(), startHour, startMin);
              }
              try {
                return parseEventISO(item.time || '');
              } catch {
                return null;
              }
            };
            
            const timeA = getStartTime(a);
            const timeB = getStartTime(b);
            if (!timeA || !timeB) return 0;
            return timeA.getTime() - timeB.getTime();
          })[0] || null;

        setCurrentEvent(current || null);
        setNextEvent(upcoming || null);
        setAgendaLoaded(true);
      } catch (error) {
        console.error('Error loading agenda:', error);
        setAgendaLoaded(true);
      } finally {
        setLoading(false);
      }
    };

    loadAgenda();
    // Refresh every minute
    const interval = setInterval(loadAgenda, 60000);
    return () => clearInterval(interval);
  }, [eventId]);

  // Calculate time remaining and progress for current event
  useEffect(() => {
    if (!currentEvent || !currentEvent.time) {
      setTimeRemaining({ hours: 0, minutes: 0, seconds: 0 });
      setSessionProgress(0);
      return;
    }

    const updateRemainingTime = () => {
      const now = new Date();
      let startTime: Date | null = null;
      let endTime: Date | null = null;
      
      // Try to parse time range format "HH:MM - HH:MM"
      const timeMatch = currentEvent.time.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      if (timeMatch) {
        const startHour = parseInt(timeMatch[1], 10);
        const startMin = parseInt(timeMatch[2], 10);
        const endHour = parseInt(timeMatch[3], 10);
        const endMin = parseInt(timeMatch[4], 10);
        const today = new Date();
        startTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), startHour, startMin);
        endTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), endHour, endMin);
      } else {
        // Try ISO format
        try {
          startTime = parseEventISO(currentEvent.time);
          if (!isNaN(startTime.getTime())) {
            const duration = currentEvent.duration_minutes || 60;
            endTime = new Date(startTime.getTime() + duration * 60 * 1000);
          }
        } catch {
          endTime = null;
          startTime = null;
        }
      }
      
      if (!endTime || !startTime) {
        setTimeRemaining({ hours: 0, minutes: 0, seconds: 0 });
        setSessionProgress(0);
        return;
      }
      
      const totalDuration = endTime.getTime() - startTime.getTime();
      const elapsed = now.getTime() - startTime.getTime();
      const remaining = endTime.getTime() - now.getTime();
      
      // Calculate progress percentage (0-100)
      const progress = Math.max(0, Math.min(100, (elapsed / totalDuration) * 100));
      setSessionProgress(progress);
      
      // Animate progress bar
      Animated.timing(progressAnim, {
        toValue: progress / 100,
        duration: 1000,
        useNativeDriver: false,
      }).start();

      if (remaining > 0) {
        setTimeRemaining({
          hours: Math.floor(remaining / (1000 * 60 * 60)),
          minutes: Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((remaining % (1000 * 60)) / 1000)
        });
      } else {
        setTimeRemaining({ hours: 0, minutes: 0, seconds: 0 });
      }
    };

    updateRemainingTime();
    const timer = setInterval(updateRemainingTime, 1000);
    return () => clearInterval(timer);
  }, [currentEvent, progressAnim]);

  // Calculate time to next event
  useEffect(() => {
    if (!nextEvent || !nextEvent.time) {
      setTimeToNext({ hours: 0, minutes: 0, seconds: 0 });
      return;
    }

    const updateTimer = () => {
      const now = new Date();
      let startTime: Date | null = null;
      
      // Try to parse time range format
      const timeMatch = nextEvent.time!.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
      if (timeMatch) {
        const startHour = parseInt(timeMatch[1], 10);
        const startMin = parseInt(timeMatch[2], 10);
        const today = new Date();
        startTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), startHour, startMin);
      } else {
        // Try ISO format
        try {
          startTime = parseEventISO(nextEvent.time!);
          if (isNaN(startTime.getTime())) {
            startTime = null;
          }
        } catch {
          startTime = null;
        }
      }
      
      if (!startTime) {
        setTimeToNext({ hours: 0, minutes: 0, seconds: 0 });
        return;
      }
      
      const diff = startTime.getTime() - now.getTime();

      if (diff > 0) {
        setTimeToNext({
          hours: Math.floor(diff / (1000 * 60 * 60)),
          minutes: Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((diff % (1000 * 60)) / 1000)
        });
      } else {
        setTimeToNext({ hours: 0, minutes: 0, seconds: 0 });
      }
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [nextEvent]);

  const formatTime = (time: TimeLeft): string => {
    if (time.hours > 0) {
      return `${time.hours}h ${time.minutes}m`;
    }
    return `${time.minutes}m ${time.seconds}s`;
  };

  const formatTimeShort = (time: TimeLeft): string => {
    if (time.hours > 0) {
      return `${time.hours}h ${time.minutes}m`;
    }
    if (time.minutes > 0) {
      return `${time.minutes}m`;
    }
    return `${time.seconds}s`;
  };

  const handleCurrentEventPress = () => {
    if (currentEvent?.id) {
      // Determine day key from currentEvent's day property
      let dayKey: string | null = null;
      const day = (currentEvent as any).day;
      
      if (day) {
        // Extract day number from complex day names or use simple day numbers
        if (day.includes('Día 1') || day === '1') {
          dayKey = 'Day 1 - November 12';
        } else if (day.includes('Día 2') || day === '2') {
          dayKey = 'Day 2 - November 13';
        } else if (day.includes('Día 3') || day === '3') {
          dayKey = 'Day 3 - November 14';
        }
      }
      
      // If we have day info, include it in the URL to help with navigation
      if (dayKey) {
        console.log(`[AgendaTracker] Navigating to session ${currentEvent.id} on ${dayKey}`);
        router.push(`/events/bsl2025/agenda?session=${currentEvent.id}&scrollTo=current&day=${encodeURIComponent(dayKey)}`);
      } else {
        console.log(`[AgendaTracker] Navigating to session ${currentEvent.id} (day unknown)`);
        router.push(`/events/bsl2025/agenda?session=${currentEvent.id}&scrollTo=current`);
      }
    } else {
      router.push('/events/bsl2025/agenda');
    }
  };

  const handleNextEventPress = () => {
    if (nextEvent?.id) {
      // Determine day key from nextEvent's day property
      let dayKey: string | null = null;
      const day = (nextEvent as any).day;
      
      if (day) {
        // Extract day number from complex day names or use simple day numbers
        if (day.includes('Día 1') || day === '1') {
          dayKey = 'Day 1 - November 12';
        } else if (day.includes('Día 2') || day === '2') {
          dayKey = 'Day 2 - November 13';
        } else if (day.includes('Día 3') || day === '3') {
          dayKey = 'Day 3 - November 14';
        }
      }
      
      // If we have day info, include it in the URL to help with navigation
      if (dayKey) {
        console.log(`[AgendaTracker] Navigating to next session ${nextEvent.id} on ${dayKey}`);
        router.push(`/events/bsl2025/agenda?session=${nextEvent.id}&scrollTo=next&day=${encodeURIComponent(dayKey)}`);
      } else {
        console.log(`[AgendaTracker] Navigating to next session ${nextEvent.id} (day unknown)`);
        router.push(`/events/bsl2025/agenda?session=${nextEvent.id}&scrollTo=next`);
      }
    } else {
      router.push('/events/bsl2025/agenda');
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading agenda...</Text>
      </View>
    );
  }

  // Check if all events have finished (no current event and no next event, and agenda has been loaded)
  const allEventsFinished = !currentEvent && !nextEvent && !loading && agendaLoaded;

  // Show thank you message if all events are finished
  if (allEventsFinished) {
    return (
      <View style={styles.container}>
        <View style={styles.thankYouContainer}>
          <MaterialIcons name="celebration" size={32} color="#FFFFFF" />
          <Text style={styles.thankYouText}>Thanks and see you next time!</Text>
          <TouchableOpacity
            style={styles.viewMoreEventsButton}
            onPress={() => router.push('/(shared)/dashboard/explore' as any)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="explore" size={18} color="#FFFFFF" />
            <Text style={styles.viewMoreEventsText}>
              {isMainBranch ? t('banner.exploreAllEvents') : t('banner.exploreMoreEvents')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Current Event and Next Session - Same Line */}
      <View style={styles.sessionRow}>
        {/* Current Event - Compact Single Line */}
        {currentEvent ? (
          <TouchableOpacity 
            style={styles.currentEventContainer}
            onPress={handleCurrentEventPress}
            activeOpacity={0.7}
          >
            <View style={styles.eventIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveLabel}>LIVE</Text>
            </View>
            <View style={styles.eventInfoCompact}>
              {/* Track/Day Name Badge */}
              {currentEvent.day_name && (
                <View style={styles.trackBadgeCompact}>
                  <Text style={styles.trackBadgeTextCompact}>{currentEvent.day_name}</Text>
                </View>
              )}
              {/* Title on its own line */}
              <Text style={styles.eventTitleCompact} numberOfLines={1}>
                {currentEvent.title || 'Current Event'}
              </Text>
              {/* Time on separate line */}
              {currentEvent.time && (
                <Text style={styles.eventTimeCompact}>
                  {formatTimeRange(currentEvent)}
                </Text>
              )}
              {/* Progress Bar with percentage overlay */}
              <View style={styles.progressRowCompact}>
                <View style={styles.progressBarBackgroundCompact}>
                  <Animated.View 
                    style={[
                      styles.progressBarFillCompact,
                      {
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%'],
                        }),
                      }
                    ]}
                  />
                  {/* Percentage overlay on progress bar */}
                  <View style={styles.progressPercentageOverlay}>
                    <Text style={styles.progressPercentageText}>
                      {Math.round(sessionProgress)}%
                    </Text>
                  </View>
                </View>
                <View style={styles.timeRemainingCompact}>
                  <MaterialIcons name="timer" size={12} color="#FF3B30" />
                  <Text style={styles.timeRemainingTextCompact}>
                    {formatTimeShort(timeRemaining)} left
                  </Text>
                </View>
              </View>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={styles.noCurrentEventContainer}>
          <Text style={styles.noEventText}>No event currently happening</Text>
        </View>
      )}

        {/* Next Event - Compact Small Card on Right */}
        {nextEvent && (
          <TouchableOpacity 
            style={styles.nextEventContainerCompact}
            onPress={handleNextEventPress}
            activeOpacity={0.7}
          >
            <MaterialIcons name="schedule" size={12} color="#FFFFFF" />
            <View style={styles.nextEventTextContainer}>
              <Text style={styles.nextEventLabelCompact}>Next in:</Text>
              <Text style={styles.timerValueCompact}>{formatTime(timeToNext)}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={16} color="#FFFFFF" style={styles.chevronCompact} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any, backgroundColor: string) => StyleSheet.create({
  container: {
    width: '100%',
    marginTop: 8,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  loadingText: {
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
    padding: 12,
  },
  currentEventContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.3)',
    flex: 1,
  },
  eventInfoCompact: {
    flex: 1,
  },
  trackBadgeCompact: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 4,
  },
  trackBadgeTextCompact: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  eventTitleCompact: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  eventTimeCompact: {
    color: '#E3F2FD',
    fontSize: 9,
    marginBottom: 6,
  },
  progressRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBarBackgroundCompact: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBarFillCompact: {
    height: '100%',
    backgroundColor: '#FF3B30',
    borderRadius: 3,
  },
  progressPercentageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  progressPercentageText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  timeRemainingCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeRemainingTextCompact: {
    color: '#FF3B30',
    fontSize: 10,
    fontWeight: '600',
  },
  progressPercentageCompact: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  eventIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    backgroundColor: 'rgba(255, 59, 48, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF3B30',
    marginRight: 6,
  },
  liveLabel: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  eventInfo: {
    flex: 1,
  },
  trackBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 6,
  },
  trackBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  eventTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
    lineHeight: 20,
  },
  eventMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  eventTime: {
    color: '#E3F2FD',
    fontSize: 12,
  },
  eventLocation: {
    color: '#BBDEFB',
    fontSize: 11,
  },
  progressBarContainer: {
    marginTop: 12,
    width: '100%',
  },
  progressBarBackground: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FF3B30',
    borderRadius: 3,
  },
  progressInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeRemainingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  timeRemainingText: {
    color: '#FF3B30',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 4,
  },
  progressPercentage: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  noCurrentEventContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    alignItems: 'center',
  },
  noEventText: {
    color: '#E3F2FD',
    fontSize: 14,
    fontStyle: 'italic',
  },
  nextEventContainerCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    gap: 4,
    minWidth: 100,
  },
  nextEventTextContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
  },
  nextEventLabelCompact: {
    color: '#E3F2FD',
    fontSize: 9,
    fontWeight: '500',
  },
  timerValueCompact: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  chevronCompact: {
    marginLeft: 4,
  },
  thankYouContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  thankYouText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  viewMoreEventsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  viewMoreEventsText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
    letterSpacing: 0.5,
  },
});

