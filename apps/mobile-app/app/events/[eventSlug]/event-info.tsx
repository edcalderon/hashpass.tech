import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, ActivityIndicator } from 'react-native';
import { useEvent } from '@contexts/EventContext';
import { useTheme } from '../../../hooks/useTheme';
import { MaterialIcons } from '@expo/vector-icons';
import EventBanner from '../../../components/EventBanner';
import { getRuntimeApiBaseUrl } from '../../../lib/api-client';

interface EventDetailsRow {
  description: string | null;
  venue_name: string | null;
  venue_address: string | null;
  city: string | null;
  country: string | null;
}

// Public, no-auth-required event info screen -- this is where a logged-out
// visitor lands after tapping an event from the landing page (see
// events/[eventSlug]/home.tsx). Real per-event content (description, venue)
// comes from public.events via /api/events/{id}/details; not every event has
// a row there yet (e.g. ingested events), so this always has a real,
// non-fabricated fallback rather than inventing details for gaps.
export default function EventInfoScreen() {
  const { event } = useEvent();
  const { isDark, colors } = useTheme();
  const styles = getStyles(isDark, colors);
  const eventId = event?.id || 'bsl';
  const [details, setDetails] = useState<EventDetailsRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDetails(null);

    fetch(`${getRuntimeApiBaseUrl()}/events/${eventId}/details`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!cancelled) setDetails(body?.data ?? null);
      })
      .catch(() => {
        if (!cancelled) setDetails(null);
      });

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const eventDateLabel = event?.eventDateString || event?.subtitle || 'Date to be announced';
  const eventLocationLabel = details?.city && details?.country
    ? `${details.city}, ${details.country}`
    : event?.tour?.city && event?.tour?.country
      ? `${event.tour.city}, ${event.tour.country}`
      : event?.subtitle || 'Location to be announced';
  const venueLabel = details?.venue_name || event?.tour?.venue || 'Venue to be announced';
  const addressLabel = details?.venue_address || venueLabel;
  const isArchiveEvent = event?.tour?.role === 'archive' || eventId === 'bsl2025';

  const [isEventFinished, setIsEventFinished] = useState(false);
  useEffect(() => {
    const checkEventFinished = () => {
      const now = new Date();
      const end = event?.eventEndDate ? new Date(event.eventEndDate) : null;
      setIsEventFinished(Boolean(end && now > end));
    };
    checkEventFinished();
    const interval = setInterval(checkEventFinished, 60000);
    return () => clearInterval(interval);
  }, [event?.eventEndDate]);

  const handleOpenLink = (url: string) => {
    Linking.openURL(url).catch((err) => console.error('Failed to open link:', err));
  };

  // Real description from the DB when the event has one; the event's own
  // subtitle otherwise. Never a fabricated "Blockchain & FinTech Summit"
  // paragraph that doesn't reflect what this specific event actually is.
  const aboutText = details?.description || event?.subtitle || null;

  const eventDetailItems = [
    { icon: 'event', label: 'Date', value: eventDateLabel },
    { icon: 'location-on', label: 'Location', value: eventLocationLabel },
    { icon: 'business', label: 'Venue', value: venueLabel },
  ];

  const contactItems = [
    event?.website
      ? {
          icon: 'web',
          label: 'Website',
          value: event.website.replace(/^https?:\/\//, ''),
          action: () => handleOpenLink(event.website!),
        }
      : null,
    details?.venue_address
      ? {
          icon: 'location-on',
          label: 'Address',
          value: addressLabel,
          action: () => handleOpenLink(`https://maps.google.com/?q=${encodeURIComponent(addressLabel)}`),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  const renderItemRow = (item: { icon: string; label: string; value: string; action?: () => void }, index: number) => (
    <TouchableOpacity
      key={index}
      style={styles.infoItem}
      onPress={item.action}
      disabled={!item.action}
    >
      <View style={styles.infoItemLeft}>
        <View style={styles.infoIcon}>
          <MaterialIcons name={item.icon as any} size={24} color={isDark ? '#60A5FA' : '#007AFF'} />
        </View>
        <View style={styles.infoText}>
          <Text style={styles.infoLabel}>{item.label}</Text>
          <Text style={[styles.infoValue, item.action && styles.infoValueLink]}>{item.value}</Text>
        </View>
      </View>
      {item.action && <MaterialIcons name="chevron-right" size={20} color={colors.text.secondary} />}
    </TouchableOpacity>
  );

  const renderArchiveSummary = () => {
    if (!isArchiveEvent) return null;

    return (
      <View style={styles.archiveSummary}>
        <View style={styles.archiveBadge}>
          <MaterialIcons name="history" size={16} color={isDark ? '#E0F2FE' : '#1D4ED8'} />
          <Text style={styles.archiveBadgeText}>Past Event</Text>
        </View>
        <Text style={styles.archiveTitle}>Archived Edition</Text>
        <Text style={styles.archiveDescription}>
          {event?.title || 'This event'} is preserved here as a reference archive.
        </Text>
      </View>
    );
  };

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <EventBanner
        title={event?.title || 'Event Information'}
        subtitle={event?.subtitle || 'Event Details & Logistics'}
        date={eventDateLabel}
        showCountdown={!isEventFinished && Boolean(event?.eventStartDate)}
        showLiveIndicator={!isEventFinished && Boolean(event?.eventStartDate)}
        isEventFinished={isEventFinished}
        eventStartDate={event?.eventStartDate}
        eventId={eventId}
        eventImage={event?.image}
        eventVideo={event?.heroVideo}
      />

      {renderArchiveSummary()}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Event Details</Text>
        <View style={styles.sectionContent}>
          {eventDetailItems.map(renderItemRow)}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.sectionContent}>
          {details === null && !aboutText ? (
            <View style={styles.aboutLoading}>
              <ActivityIndicator size="small" color={isDark ? '#60A5FA' : '#007AFF'} />
            </View>
          ) : (
            <Text style={styles.aboutText}>
              {aboutText || `More details for ${event?.title || 'this event'} are coming soon.`}
            </Text>
          )}
        </View>
      </View>

      {contactItems.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <View style={styles.sectionContent}>
            {contactItems.map(renderItemRow)}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: colors.background.default,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  archiveSummary: {
    marginHorizontal: 20,
    marginTop: 20,
    marginBottom: 24,
    padding: 18,
    borderRadius: 22,
    backgroundColor: isDark ? 'rgba(7, 17, 31, 0.92)' : 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(96, 165, 250, 0.22)' : 'rgba(37, 99, 235, 0.14)',
    shadowColor: isDark ? 'rgba(0, 0, 0, 0.35)' : 'rgba(15, 23, 42, 0.12)',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 4,
  },
  archiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: isDark ? 'rgba(96, 165, 250, 0.16)' : 'rgba(37, 99, 235, 0.10)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(96, 165, 250, 0.24)' : 'rgba(37, 99, 235, 0.16)',
    marginBottom: 12,
  },
  archiveBadgeText: {
    marginLeft: 6,
    color: isDark ? '#E0F2FE' : '#1D4ED8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  archiveTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 8,
    letterSpacing: -0.4,
  },
  archiveDescription: {
    fontSize: 15,
    color: colors.text.secondary,
    lineHeight: 23,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text.primary,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  sectionContent: {
    backgroundColor: colors.background.paper,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.divider,
    overflow: 'hidden',
    shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  infoItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: isDark ? 'rgba(0, 122, 255, 0.15)' : 'rgba(0, 122, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(0, 122, 255, 0.3)' : 'rgba(0, 122, 255, 0.2)',
  },
  infoText: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 13,
    color: colors.text.secondary,
    marginBottom: 4,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 16,
    color: colors.text.primary,
    fontWeight: '600',
    lineHeight: 22,
  },
  infoValueLink: {
    color: isDark ? '#60A5FA' : '#007AFF',
  },
  aboutLoading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  aboutText: {
    fontSize: 15,
    color: colors.text.primary,
    lineHeight: 24,
    padding: 20,
  },
});
