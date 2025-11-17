import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity, StatusBar, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { useRouter } from 'expo-router';
import { useTranslation } from '../i18n/i18n';
import { isMainBranch } from '../lib/event-detector';
import AgendaTracker from './AgendaTracker';

interface EventBannerProps {
  title: string;
  subtitle: string;
  date: string;
  backgroundColor?: string;
  showCountdown?: boolean;
  showLiveIndicator?: boolean;
  eventStartDate?: string; // ISO date string for countdown
  isLive?: boolean;
  lastUpdated?: string | null;
  usingJsonFallback?: boolean;
  eventId?: string; // Event ID to determine if logo should be shown
  isEventFinished?: boolean; // Whether the event has finished
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export default function EventBanner({ 
  title, 
  subtitle, 
  date, 
  backgroundColor = '#007AFF',
  showCountdown = false,
  showLiveIndicator = false,
  eventStartDate = '2025-11-12T09:00:00-05:00', // BSL 2025 start time
  isLive = false,
  lastUpdated = null,
  usingJsonFallback = false,
  eventId,
  isEventFinished = false
}: EventBannerProps) {
  const { isDark, colors } = useTheme();
  const router = useRouter();
  const { t } = useTranslation('explore');
  
  // Check if this is BSL2025 event to show logo instead of title
  const isBSL2025 = eventId === 'bsl2025' || title === 'Blockchain Summit Latam 2025';
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [isEventLive, setIsEventLive] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));
  const styles = getStyles(isDark, colors, backgroundColor);

  // Check if event has started based on eventStartDate
  useEffect(() => {
    const checkEventStatus = () => {
      const now = new Date().getTime();
      const eventTime = new Date(eventStartDate).getTime();
      const hasStarted = now >= eventTime;
      setIsEventLive(hasStarted);
    };

    checkEventStatus();
    // Check every minute
    const interval = setInterval(checkEventStatus, 60000);
    return () => clearInterval(interval);
  }, [eventStartDate]);

  // Calculate time left until event
  const calculateTimeLeft = (): TimeLeft => {
    const now = new Date().getTime();
    const eventTime = new Date(eventStartDate).getTime();
    const difference = eventTime - now;

    if (difference > 0) {
      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((difference % (1000 * 60)) / 1000)
      };
    } else {
      return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    }
  };

  // Update countdown every second (only if event hasn't started)
  useEffect(() => {
    if (showCountdown && !isEventLive && !isLive) {
      const timer = setInterval(() => {
        setTimeLeft(calculateTimeLeft());
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [showCountdown, eventStartDate, isEventLive, isLive]);

  // Live indicator pulse animation
  useEffect(() => {
    if (showLiveIndicator && (isLive || isEventLive)) {
      const pulse = () => {
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]).start(() => pulse());
      };
      pulse();
    }
  }, [showLiveIndicator, isLive, isEventLive, pulseAnim]);

  const formatTimeUnit = (value: number): string => {
    return value.toString().padStart(2, '0');
  };

  return (
    <View style={styles.headerSection}>
      {/* Main Event Info */}
      <View style={styles.mainInfo}>
        {isBSL2025 ? (
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/logos/bsl/BSL-Logo-fondo-oscuro-2024.svg')}
              style={styles.eventLogo}
              resizeMode="contain"
            />
            <Text style={styles.logoSubLabel}>2025 - 9th Edition</Text>
          </View>
        ) : (
          <Text style={styles.eventTitle}>{title}</Text>
        )}
        <Text style={styles.eventSubtitle}>{subtitle}</Text>
        <Text style={styles.eventDate}>{date}</Text>
      </View>

      {/* Finished Event Badge */}
      {isEventFinished && (
        <View style={styles.finishedBadge}>
          <MaterialIcons name="celebration" size={20} color="#FFFFFF" />
          <Text style={styles.finishedBadgeText}>
            Evento Finalizado / Event Finished
          </Text>
        </View>
      )}

      {/* Gratitude Message - Replaces Agenda Tracker when event is finished */}
      {isEventFinished ? (
        <View style={styles.gratitudeContainer}>
          <MaterialIcons name="celebration" size={36} color="#FFFFFF" />
          <Text style={styles.gratitudeTitle}>
            ¡Gracias por ser parte de BSL 2025!
          </Text>
          <Text style={styles.gratitudeTitleEn}>
            Thank you for being part of BSL 2025!
          </Text>
          <Text style={styles.gratitudeSubtitle}>
            El evento ha finalizado. Agradecemos a todos los asistentes, speakers y colaboradores que hicieron posible este evento histórico sin precedentes en Latinoamérica.
          </Text>
          <Text style={styles.gratitudeSubtitleEn}>
            The event has ended. We thank all attendees, speakers and collaborators who made this unprecedented historic event in Latin America possible.
          </Text>
          <View style={styles.gratitudeThanksContainer}>
            <Text style={styles.gratitudeThanks}>
              Especial agradecimiento a Rodrigo, al equipo BSL (Juli, Julian, Laura), a la Universidad EAFIT y a todos los que contribuyeron.
            </Text>
            <Text style={styles.gratitudeThanksEn}>
              Special thanks to Rodrigo, the BSL team (Juli, Julian, Laura), EAFIT University and everyone who contributed.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.viewMoreEventsButton}
            onPress={() => router.push('/(shared)/dashboard/explore' as any)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="explore" size={20} color="#FFFFFF" />
            <Text style={styles.viewMoreEventsText}>
              {isMainBranch ? t('banner.exploreAllEvents') : t('banner.exploreMoreEvents')}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Agenda Tracker - Show when event is live */}
          {(isLive || isEventLive) && (
            <AgendaTracker eventId={eventId} backgroundColor={backgroundColor} />
          )}

          {/* Countdown Timer - Only show before event starts */}
          {showCountdown && !isLive && !isEventLive && (
            <View style={styles.countdownContainer}>
              <Text style={styles.countdownLabel}>Event starts in:</Text>
              <View style={styles.countdownTimer}>
                <View style={styles.timeUnit}>
                  <Text style={styles.timeValue}>{formatTimeUnit(timeLeft.days)}</Text>
                  <Text style={styles.timeLabel}>DAYS</Text>
                </View>
                <Text style={styles.timeSeparator}>:</Text>
                <View style={styles.timeUnit}>
                  <Text style={styles.timeValue}>{formatTimeUnit(timeLeft.hours)}</Text>
                  <Text style={styles.timeLabel}>HRS</Text>
                </View>
                <Text style={styles.timeSeparator}>:</Text>
                <View style={styles.timeUnit}>
                  <Text style={styles.timeValue}>{formatTimeUnit(timeLeft.minutes)}</Text>
                  <Text style={styles.timeLabel}>MIN</Text>
                </View>
                <Text style={styles.timeSeparator}>:</Text>
                <View style={styles.timeUnit}>
                  <Text style={styles.timeValue}>{formatTimeUnit(timeLeft.seconds)}</Text>
                  <Text style={styles.timeLabel}>SEC</Text>
                </View>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any, backgroundColor: string) => StyleSheet.create({
  headerSection: {
    padding: 20,
    paddingTop: (StatusBar.currentHeight || 0) + 100, // Extra top padding to account for nav bar overlay
    backgroundColor: backgroundColor,
    alignItems: 'center',
    minHeight: 360,
    justifyContent: 'center',
    flex: 1,
  },
  mainInfo: {
    alignItems: 'center',
    marginBottom: 16,
  },
  eventTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
    textAlign: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 4,
    width: '100%',
  },
  eventLogo: {
    width: 360,
    height: 100,
    marginBottom: 8,
  },
  logoSubLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  eventSubtitle: {
    fontSize: 16,
    color: '#E3F2FD',
    marginBottom: 8,
    textAlign: 'center',
  },
  eventDate: {
    fontSize: 14,
    color: '#BBDEFB',
    textAlign: 'center',
  },
  // Live Indicator Styles
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
  },
  liveDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF3B30',
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  liveText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  notLiveText: {
    color: '#BBDEFB',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  lastUpdatedText: {
    color: '#BBDEFB',
    fontSize: 10,
    marginTop: 2,
  },
  // Countdown Styles
  countdownContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  countdownLabel: {
    color: '#E3F2FD',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  countdownTimer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeUnit: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 50,
  },
  timeValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    lineHeight: 20,
  },
  timeLabel: {
    color: '#BBDEFB',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  timeSeparator: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginHorizontal: 4,
  },
  // Finished Event Badge
  finishedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
  },
  finishedBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginLeft: 8,
  },
  // Gratitude Message Styles (replaces Agenda Tracker)
  gratitudeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginTop: 8,
    width: '100%',
  },
  gratitudeTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 6,
    lineHeight: 28,
  },
  gratitudeTitleEn: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
    opacity: 0.95,
    fontStyle: 'italic',
    lineHeight: 24,
  },
  gratitudeSubtitle: {
    fontSize: 15,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 21,
    opacity: 0.95,
    paddingHorizontal: 8,
  },
  gratitudeSubtitleEn: {
    fontSize: 13,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 19,
    opacity: 0.85,
    fontStyle: 'italic',
    paddingHorizontal: 8,
  },
  gratitudeThanksContainer: {
    marginTop: 8,
    paddingHorizontal: 8,
  },
  gratitudeThanks: {
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 6,
    lineHeight: 20,
    fontWeight: '600',
    opacity: 0.95,
  },
  gratitudeThanksEn: {
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 18,
    opacity: 0.85,
    fontStyle: 'italic',
  },
  // View More Events Button
  viewMoreEventsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    marginTop: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  viewMoreEventsText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
    letterSpacing: 0.5,
  },
});
