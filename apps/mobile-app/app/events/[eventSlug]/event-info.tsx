import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useEvent } from '@contexts/EventContext';
import { useTheme } from '../../../hooks/useTheme';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  Globe,
  History,
  type LucideIcon,
  MapPin,
  Mic,
  Ticket,
  Users,
} from 'lucide-react-native';
import EventBanner from '../../../components/EventBanner';
import EventMap from '../../../components/EventMap';
import { apiClient, eventApiPath } from '../../../lib/api-client';
import { useAnimationLevel } from '../../../contexts/AnimationLevelContext';
import { Surface, ActionButton, HoverText } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';

interface EventDetailsRow {
  description: string | null;
  venue_name: string | null;
  venue_address: string | null;
  city: string | null;
  country: string | null;
  // Per-event guest-visibility flags (public.events.agenda_public /
  // speakers_public, db/migrations/V109). Absent on events with no
  // public.events row yet, so treat anything but an explicit `false` as
  // public -- same fallback the API itself uses.
  agenda_public?: boolean | null;
  speakers_public?: boolean | null;
}

// Fade + slight rise on first render. Content starts hidden only when the
// app's animation level allows motion, and snaps to visible if the OS
// reduce-motion setting (resolved asynchronously) turns out to be on.
function Reveal({ children, delay = 0, enabled }: { children: React.ReactNode; delay?: number; enabled: boolean }) {
  const progress = useSharedValue(enabled ? 0 : 1);
  useEffect(() => {
    progress.value = enabled ? withDelay(delay, withTiming(1, { duration: 380 })) : 1;
  }, [enabled, delay, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 10 }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

interface InfoRow {
  icon: LucideIcon;
  label: string;
  value: string;
  action?: () => void;
}

// Public, no-auth-required event info screen -- this is where a logged-out
// visitor lands after tapping an event from the landing page (see
// events/[eventSlug]/home.tsx). Real per-event content (description, venue)
// comes from public.events via /api/events/{id}/details; not every event has
// a row there yet (e.g. ingested events), so this always has a real,
// non-fabricated fallback rather than inventing details for gaps.
export default function EventInfoScreen() {
  const { event } = useEvent();
  const router = useRouter();
  const { isDark } = useTheme();
  const { animationLevel } = useAnimationLevel();
  const { width: viewportWidth } = useWindowDimensions();
  const isWide = viewportWidth >= 960;
  const palette = uiPalette(isDark);
  const styles = getStyles(palette, isWide, viewportWidth);
  const eventId = event?.id || 'bsl';
  const [details, setDetails] = useState<EventDetailsRow | null>(null);
  const [systemReducedMotion, setSystemReducedMotion] = useState(true);
  const motionEnabled = animationLevel === 'full' && !systemReducedMotion;
  // Reveal hides content until its animation runs, so it must not wait on the
  // async reduce-motion lookup (that would flash content in and back out).
  const [motionResolved, setMotionResolved] = useState(false);
  const revealEnabled = animationLevel === 'full' && (!motionResolved || !systemReducedMotion);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduced) => {
        if (active) {
          setSystemReducedMotion(reduced);
          setMotionResolved(true);
        }
      })
      .catch(() => {
        if (active) {
          setSystemReducedMotion(true);
          setMotionResolved(true);
        }
      });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setSystemReducedMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDetails(null);

    apiClient
      .get(eventApiPath(eventId, 'details'), {
        skipAuth: true,
        skipEventSegment: true,
      })
      .then((response: { success: boolean; data?: { data: EventDetailsRow | null } | null }) => {
        if (!cancelled) {
          setDetails(response.success ? response.data?.data ?? null : null);
        }
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
  // Some events' DB rows put the same full "building, university, neighborhood,
  // city" string in both venue_name and venue_address -- showing both the
  // Venue detail row and the Contact "Address" row then duplicates the exact
  // same location line twice. Only surface Address as its own row when it
  // actually adds information beyond the Venue row (case-insensitive,
  // either-contains-the-other check, since one is often a superset of the
  // other rather than a verbatim match).
  const normalizedVenue = venueLabel.trim().toLowerCase();
  const normalizedAddress = (details?.venue_address || '').trim().toLowerCase();
  const hasDistinctAddress = Boolean(
    details?.venue_address &&
    normalizedAddress !== normalizedVenue &&
    !normalizedAddress.includes(normalizedVenue) &&
    !normalizedVenue.includes(normalizedAddress)
  );
  const isArchiveEvent = event?.tour?.role === 'archive' || eventId === 'bsl2025';
  // Guests only get a direct entry point into Agenda/Speakers when the
  // organizer has actually opted the event into it; absent a details row
  // (not-yet-migrated/ingested events) this defaults open, matching the
  // DB column's own DEFAULT true and the API's same fallback.
  const isAgendaPublic = details?.agenda_public !== false;
  const isSpeakersPublic = details?.speakers_public !== false;

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

  const eventDetailItems: InfoRow[] = [
    { icon: CalendarDays, label: 'Date', value: eventDateLabel },
    { icon: MapPin, label: 'Location', value: eventLocationLabel },
    { icon: Building2, label: 'Venue', value: venueLabel },
  ];

  // Direct guest entry points into Agenda/Speakers -- each only shown when
  // the event has actually opted that section into guest visibility (see
  // isAgendaPublic/isSpeakersPublic above). Shown for archive events too:
  // reviewing a past edition's schedule/lineup is still useful, unlike the
  // ticket/CFP CTAs those are gated off for.
  const exploreItems: InfoRow[] = [
    isAgendaPublic
      ? {
          icon: CalendarRange,
          label: 'Agenda',
          value: 'View the full schedule',
          action: () => router.push(`/events/${eventId}/agenda`),
        }
      : null,
    isSpeakersPublic
      ? {
          icon: Users,
          label: 'Speakers',
          value: 'Meet the speaker lineup',
          action: () => router.push(`/events/${eventId}/speakers`),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  const contactItems: InfoRow[] = [
    event?.website
      ? {
          icon: Globe,
          label: 'Website',
          value: event.website.replace(/^https?:\/\//, ''),
          action: () => handleOpenLink(event.website!),
        }
      : null,
    hasDistinctAddress
      ? {
          icon: MapPin,
          label: 'Address',
          value: addressLabel,
          action: () => handleOpenLink(`https://maps.google.com/?q=${encodeURIComponent(addressLabel)}`),
        }
      : null,
    // Speaker application uses the same InfoRow style as Website/Address
    // (icon in rounded square, uppercase label, accent value) for visual
    // consistency within the Contact card.
    !isArchiveEvent && event?.speakerApplicationUrl
      ? {
          icon: Mic,
          label: 'Speaker',
          value: `Apply to speak at ${event?.speakerApplicationLabel || event?.title || 'this event'}`,
          action: () => handleOpenLink(event.speakerApplicationUrl!),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  const renderItemRow = (item: InfoRow, index: number, all: InfoRow[]) => {
    const Icon = item.icon;
    const rowStyle = [styles.infoItem, index === all.length - 1 && styles.infoItemLast];
    const content = (
      <>
        <View style={styles.infoItemLeft}>
          <View style={styles.infoIcon}>
            <Icon size={18} color={palette.accent} strokeWidth={2} />
          </View>
          <View style={styles.infoText}>
            <Text style={styles.infoLabel}>{item.label}</Text>
            <Text style={[styles.infoValue, item.action && styles.infoValueLink]}>{item.value}</Text>
          </View>
        </View>
        {item.action && <ChevronRight size={18} color={palette.muted} />}
      </>
    );

    return item.action ? (
      <TouchableOpacity
        key={item.label}
        style={rowStyle}
        onPress={item.action}
        activeOpacity={0.6}
        accessibilityRole="link"
        accessibilityLabel={`${item.label}: ${item.value}`}
      >
        {content}
      </TouchableOpacity>
    ) : (
      <View key={item.label} style={rowStyle}>
        {content}
      </View>
    );
  };

  // The map needs *some* real location signal; without one we skip it rather
  // than pin a placeholder city.
  const tourCity = event?.tour?.city;
  const tourCountry = event?.tour?.country;
  const mapVenue = details?.venue_name || event?.tour?.venue || null;
  const hasMapLocation = Boolean(details?.venue_address || mapVenue || details?.city || tourCity);

  const renderArchiveSummary = () => {
    if (!isArchiveEvent) return null;

    return (
      <View style={styles.archiveSummary}>
        <View style={styles.archiveBadge}>
          <History size={14} color={isDark ? '#E0F2FE' : '#1D4ED8'} />
          <Text style={styles.archiveBadgeText}>Past Event</Text>
        </View>
        <Text accessibilityRole="header" style={styles.archiveTitle}>
          Archived Edition
        </Text>
        <Text style={styles.archiveDescription}>
          {event?.title || 'This event'} is preserved here as a reference archive.
        </Text>
      </View>
    );
  };

  const detailsSection = (
    <View testID="event-info-details-section" style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Event Details
      </Text>
      <Surface mode={isDark ? 'dark' : 'light'} style={styles.sectionContent}>
        {eventDetailItems.map(renderItemRow)}
      </Surface>
    </View>
  );

  const aboutSection = (
    <View testID="event-info-about-section" style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        About
      </Text>
      <Surface mode={isDark ? 'dark' : 'light'} style={styles.sectionContent}>
        {details === null && !aboutText ? (
          <View style={styles.aboutLoading}>
            <ActivityIndicator size="small" color={palette.accent} />
          </View>
        ) : (
          <Text style={[styles.aboutText, hasMapLocation && styles.aboutTextWithMap]}>
            {aboutText || `More details for ${event?.title || 'this event'} are coming soon.`}
          </Text>
        )}
        {hasMapLocation && (
          <EventMap
            address={details?.venue_address}
            venue={mapVenue}
            city={details?.city || tourCity}
            country={details?.country || tourCountry}
            label={venueLabel}
            isDark={isDark}
            animated={motionEnabled}
          />
        )}
      </Surface>
    </View>
  );

  const exploreSection = exploreItems.length > 0 ? (
    <View testID="event-info-explore-section" style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Explore
      </Text>
      <Surface mode={isDark ? 'dark' : 'light'} style={styles.sectionContent}>
        {exploreItems.map(renderItemRow)}
      </Surface>
    </View>
  ) : null;

  const contactSection = contactItems.length > 0 ? (
    <View testID="event-info-contact-section" style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Contact
      </Text>
      <Surface mode={isDark ? 'dark' : 'light'} style={styles.sectionContent}>
        {contactItems.map(renderItemRow)}
      </Surface>
    </View>
  ) : null;

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View testID="event-info-content" style={styles.contentShell}>
        <EventBanner
          variant="detail"
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
          videoPlaybackEnabled={animationLevel === 'full' && !systemReducedMotion}
        />

        {renderArchiveSummary()}

        {/* Get Tickets is the page's single primary CTA (the call for
            speakers lives in Contact as a matching row). */}
        {!isArchiveEvent && (
          <Reveal enabled={revealEnabled}>
            <Surface mode={isDark ? 'dark' : 'light'} style={styles.ticketCta}>
              <View style={styles.ticketCtaRow}>
                <View style={styles.ticketCtaIcon}>
                  <Ticket size={22} color={palette.accent} />
                </View>
                <View style={styles.ticketCtaCopy}>
                  <Text style={styles.ticketCtaTitle}>Get your tickets</Text>
                  <HoverText mode={isDark ? 'dark' : 'light'} style={styles.ticketCtaSubtitle} numberOfLines={2}>
                    Secure your spot at {event?.title || 'this event'} · {eventDateLabel}
                  </HoverText>
                </View>
              </View>
              <ActionButton
                mode={isDark ? 'dark' : 'light'}
                label="Get Tickets"
                trailingIcon={<ArrowRight size={18} color={palette.onAccent} />}
                onPress={() => router.push(`/events/${eventId}/tickets`)}
                style={styles.ticketCtaButton}
              />
            </Surface>
          </Reveal>
        )}

        <View testID="event-info-sections" style={styles.sections}>
          {isWide ? (
            <>
              <View testID="event-info-column" style={styles.mainColumn}>
                <Reveal enabled={revealEnabled} delay={120}>{aboutSection}</Reveal>
              </View>
              <View testID="event-info-column" style={styles.supportColumn}>
                <Reveal enabled={revealEnabled} delay={60}>{detailsSection}</Reveal>
                {exploreSection && <Reveal enabled={revealEnabled} delay={140}>{exploreSection}</Reveal>}
                {contactSection && <Reveal enabled={revealEnabled} delay={220}>{contactSection}</Reveal>}
              </View>
            </>
          ) : (
            <>
              {/* About + map first on mobile so the map gets full width
                  right below the Get Tickets CTA. */}
              <Reveal enabled={revealEnabled} delay={60}>{aboutSection}</Reveal>
              <Reveal enabled={revealEnabled} delay={120}>{detailsSection}</Reveal>
              {exploreSection && <Reveal enabled={revealEnabled} delay={180}>{exploreSection}</Reveal>}
              {contactSection && <Reveal enabled={revealEnabled} delay={240}>{contactSection}</Reveal>}
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const getStyles = (
  palette: ReturnType<typeof uiPalette>,
  isWide: boolean,
  viewportWidth: number,
) => StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: palette.canvas,
  },
  scrollContent: {
    paddingBottom: uiTokens.space.hero,
    paddingHorizontal: viewportWidth >= 768 ? uiTokens.space.xl : uiTokens.space.lg,
  },
  contentShell: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
  archiveSummary: {
    marginTop: uiTokens.space.xl,
    padding: uiTokens.space.xl,
    borderRadius: uiTokens.radius.card,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  archiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: uiTokens.space.md,
    paddingVertical: uiTokens.space.sm,
    borderRadius: uiTokens.radius.pill,
    backgroundColor: palette.accentSoft,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: uiTokens.space.md,
  },
  archiveBadgeText: {
    marginLeft: 6,
    color: palette.accent,
    fontSize: uiTokens.type.caption,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  archiveTitle: {
    fontSize: uiTokens.type.title,
    fontWeight: '800',
    color: palette.text,
    marginBottom: uiTokens.space.sm,
  },
  archiveDescription: {
    fontSize: uiTokens.type.body,
    color: palette.muted,
    lineHeight: 24,
  },
  ticketCta: {
    marginTop: uiTokens.space.xl,
    marginBottom: uiTokens.space.md,
    gap: uiTokens.space.lg,
    borderWidth: 1,
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft,
  },
  ticketCtaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: uiTokens.space.md,
  },
  ticketCtaIcon: {
    width: 44,
    height: 44,
    borderRadius: uiTokens.radius.circle,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  ticketCtaCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  ticketCtaTitle: {
    fontSize: uiTokens.type.title,
    fontWeight: '800',
    color: palette.text,
  },
  ticketCtaSubtitle: {
    fontSize: uiTokens.type.caption,
    color: palette.muted,
    lineHeight: 18,
  },
  ticketCtaButton: {
    alignSelf: 'stretch',
  },
  sections: {
    flexDirection: isWide ? 'row' : 'column',
    alignItems: 'flex-start',
    gap: uiTokens.space.xl,
    marginTop: isWide ? uiTokens.space.section : uiTokens.space.xxl,
  },
  mainColumn: {
    flex: 2,
    minWidth: 0,
  },
  supportColumn: {
    flex: 1,
    minWidth: 0,
  },
  section: {
    width: '100%',
    marginBottom: uiTokens.space.xl,
  },
  sectionTitle: {
    fontSize: uiTokens.type.title,
    fontWeight: '800',
    color: palette.text,
    marginBottom: uiTokens.space.md,
  },
  sectionContent: {
    padding: 0,
    backgroundColor: palette.surface,
    borderRadius: uiTokens.radius.card,
    borderWidth: 1,
    borderColor: palette.border,
    overflow: 'hidden',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: uiTokens.control.minHeight,
    paddingVertical: uiTokens.space.md,
    paddingHorizontal: uiTokens.space.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  infoItemLast: {
    borderBottomWidth: 0,
  },
  infoItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  infoIcon: {
    width: 36,
    height: 36,
    borderRadius: uiTokens.radius.input,
    backgroundColor: palette.accentSoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  infoText: {
    flex: 1,
    minWidth: 0,
  },
  infoLabel: {
    fontSize: 12,
    color: palette.muted,
    marginBottom: 2,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: uiTokens.type.body,
    color: palette.text,
    fontWeight: '600',
    lineHeight: 22,
  },
  infoValueLink: {
    color: palette.accent,
  },
  aboutLoading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  aboutText: {
    fontSize: uiTokens.type.body,
    color: palette.text,
    lineHeight: 26,
    padding: uiTokens.space.xl,
  },
  aboutTextWithMap: {
    paddingBottom: uiTokens.space.lg,
  },
});
