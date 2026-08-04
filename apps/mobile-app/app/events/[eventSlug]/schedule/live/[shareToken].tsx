import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator, RefreshControl, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SystemBars } from 'react-native-edge-to-edge';
import { useTheme } from '../../../../../hooks/useTheme';
import { useTranslation } from '../../../../../i18n/i18n';
import { apiClient, eventApiPath } from '../../../../../lib/api-client';
import { getTourBrandAsset } from '../../../../../lib/event-branding';
import { getEventTzOffset, parseAgendaTime, formatEventClock } from '../../../../../lib/event-time';
import { MaterialIcons } from '../../../../../lib/vector-icons';
import { EVENTS } from '../../../../../config/events';

type PublicScheduleItem = {
  id: string;
  time: string;
  title: string;
  speakers?: string[] | null;
  type: string;
  location?: string | null;
  day?: string | null;
  day_name?: string | null;
};

// Public, unauthenticated "Share my day" page: read-only, polls for live
// updates (no login, no realtime channel infra needed for a page that's
// mostly opened once and glanced at). See app/api/events/[eventId]/
// schedule/public/[shareToken]+api.ts for the read side and share-token+api.ts
// for how the link gets minted from My Schedule.
const POLL_INTERVAL_MS = 20_000;

export default function PublicLiveSchedule() {
  const { eventSlug, shareToken } = useLocalSearchParams<{ eventSlug: string; shareToken: string }>();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('networking');
  const [items, setItems] = useState<PublicScheduleItem[] | null>(null);
  const [ownerHandle, setOwnerHandle] = useState('@hashpass.attendee');
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const eventId = eventSlug || 'bsl';
  const event = (EVENTS as any)[eventId];
  const brand = getTourBrandAsset(eventId);
  const eventTzOffset = getEventTzOffset(event?.eventStartDate);

  const load = useCallback(async (isManualRefresh = false) => {
    if (!eventId || !shareToken) return;
    if (isManualRefresh) setRefreshing(true);
    try {
      const response = await apiClient.request(
        `${eventApiPath(eventId, 'schedule')}/public/${encodeURIComponent(shareToken)}`,
        { skipEventSegment: true }
      );
      if (response.success) {
        setItems(response.data?.data || []);
        if (response.data?.owner) setOwnerHandle(response.data.owner);
        setError(null);
        setLastUpdated(new Date());
      } else {
        setError(response.error || t('mySchedule.shareLinkInvalid', 'This share link is invalid or has expired.'));
      }
    } catch {
      setError(t('mySchedule.shareLinkInvalid', 'This share link is invalid or has expired.'));
    } finally {
      if (isManualRefresh) setRefreshing(false);
    }
  }, [eventId, shareToken, t]);

  useEffect(() => {
    load();
    const interval = setInterval(() => load(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const grouped = React.useMemo(() => {
    const byDay: Record<string, PublicScheduleItem[]> = {};
    (items || []).forEach((item) => {
      const key = item.day_name || item.day || '1';
      if (!byDay[key]) byDay[key] = [];
      byDay[key].push(item);
    });
    return byDay;
  }, [items]);

  const styles = getStyles(isDark, colors);

  return (
    <View style={styles.container}>
      <SystemBars style={isDark ? 'light' : 'dark'} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.primary} />}
      >
        <View style={[styles.hero, { backgroundColor: brand?.accentColor || colors.primary }]}>
          {brand?.logo && <Image source={brand.logo} style={styles.brandLogo} resizeMode="contain" />}
          <Text style={styles.heroTitle}>
            {t('mySchedule.liveAgendaOf', 'Live agenda of {user} at {eventName}', {
              user: ownerHandle,
              eventName: brand?.label || eventId,
            })}
          </Text>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>{t('mySchedule.liveUpdating', 'Live — updates automatically')}</Text>
          </View>
        </View>

        {items === null && !error && (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {error && (
          <View style={styles.centered}>
            <MaterialIcons name="error-outline" size={40} color={colors.text.secondary} />
            <Text style={[styles.errorText, { color: colors.text.secondary }]}>{error}</Text>
          </View>
        )}

        {items && items.length === 0 && !error && (
          <View style={styles.centered}>
            <MaterialIcons name="event-busy" size={40} color={colors.text.secondary} />
            <Text style={[styles.errorText, { color: colors.text.secondary }]}>
              {t('mySchedule.noConfirmedSessions', 'No confirmed sessions yet.')}
            </Text>
          </View>
        )}

        {Object.entries(grouped).map(([dayKey, dayItems]) => (
          <View key={dayKey} style={styles.daySection}>
            <Text style={[styles.dayHeader, { color: colors.text.primary }]}>{dayKey}</Text>
            {dayItems.map((item) => (
              <View key={item.id} style={[styles.sessionCard, { backgroundColor: colors.background.paper, borderColor: colors.divider }]}>
                <Text style={[styles.sessionTime, { color: colors.primary }]}>
                  {formatEventClock(parseAgendaTime(item.time, event?.eventStartDate, item.day, eventTzOffset), eventTzOffset)}
                </Text>
                <Text style={[styles.sessionTitle, { color: colors.text.primary }]}>{item.title}</Text>
                {item.location && (
                  <View style={styles.sessionMetaRow}>
                    <MaterialIcons name="location-on" size={14} color={colors.text.secondary} />
                    <Text style={[styles.sessionMetaText, { color: colors.text.secondary }]}>{item.location}</Text>
                  </View>
                )}
                {item.speakers && item.speakers.length > 0 && (
                  <View style={styles.sessionMetaRow}>
                    <MaterialIcons name="people" size={14} color={colors.text.secondary} />
                    <Text style={[styles.sessionMetaText, { color: colors.text.secondary }]}>{item.speakers.join(', ')}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        ))}

        {lastUpdated && (
          <Text style={[styles.lastUpdated, { color: colors.text.secondary }]}>
            {t('mySchedule.lastUpdated', 'Last updated {time}').replace('{time}', lastUpdated.toLocaleTimeString())}
          </Text>
        )}

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.text.secondary }]}>{t('mySchedule.poweredBy', 'Powered by HASHPASS')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background.primary },
    scrollContent: { paddingBottom: 40 },
    hero: {
      paddingTop: Platform.OS === 'web' ? 40 : 60,
      paddingBottom: 28,
      paddingHorizontal: 20,
      alignItems: 'center',
    },
    brandLogo: { width: 140, height: 44, marginBottom: 14 },
    heroTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: '#FFFFFF',
      textAlign: 'center',
      marginBottom: 10,
    },
    liveBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(255,255,255,0.18)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#4CAF50' },
    liveBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
    centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 10 },
    errorText: { fontSize: 14, textAlign: 'center', paddingHorizontal: 32 },
    daySection: { paddingHorizontal: 16, paddingTop: 20 },
    dayHeader: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
    sessionCard: {
      borderWidth: 1,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
    },
    sessionTime: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
    sessionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
    sessionMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
    sessionMetaText: { fontSize: 12, flex: 1 },
    lastUpdated: { fontSize: 11, textAlign: 'center', marginTop: 16 },
    footer: { alignItems: 'center', marginTop: 24 },
    footerText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  });
