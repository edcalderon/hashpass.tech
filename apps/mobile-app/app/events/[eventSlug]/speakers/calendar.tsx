import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useEvent } from '@contexts/EventContext';
import { useTheme } from '../../../../hooks/useTheme';
import { MaterialIcons } from '../../../../lib/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import EventBanner from '../../../../components/EventBanner';
import SpeakerAvatar from '../../../../components/SpeakerAvatar';
import SpeakerSearchAndSort from '../../../../components/SpeakerSearchAndSort';
import { sortSpeakersByPriority } from '../../../../lib/speaker-priority';
import { getSpeakerAvatarUrl, resolveConfiguredSpeakerImage, resolveSpeakerImage } from '../../../../lib/string-utils';
import LoadingScreen from '../../../../components/LoadingScreen';

// Type definitions
interface Speaker {
  id: string;
  name: string;
  title: string | null;
  company: string | null;
  bio?: string;
  image?: string;
  user_id?: string;
  isActive?: boolean; // Has user_id = active speaker
}

// Shape of event?.speakers entries (from packages/config/src/events.ts's
// Speaker type) as actually read below -- named explicitly rather than
// inferred through `event` (from useEvent(), a non-relative import) so the
// pre-push isolated typecheck's blanket `any` stub for that import doesn't
// cascade into implicit-any errors on every .map() callback here.
interface EventSpeakerConfig {
  id: string;
  name: string;
  title?: string | null;
  company?: string | null;
  image?: string;
}

export default function SpeakersCalendar() {
  const { event } = useEvent();
  const { isDark, colors } = useTheme();
  const router = useRouter();
  const styles = getStyles(isDark, colors);
  const eventId = event?.id || 'bsl';
  const eventDateLabel = event?.eventDateString || event?.subtitle || '2026 Tour';

  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [filteredSpeakers, setFilteredSpeakers] = useState<Speaker[]>([]);
  const [groupedSpeakers, setGroupedSpeakers] = useState<{ [key: string]: Speaker[] }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check if event is finished
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
  
  // Calculate active speakers count
  const activeSpeakersCount = useMemo(() => {
    return speakers.filter(s => s.isActive).length;
  }, [speakers]);

  // Load speakers from database with JSON fallback. Gated on event being
  // resolved: EventContext derives `event` synchronously from usePathname(),
  // which can be null on the very first render before routing settles. This
  // effect only runs once "on mount" (see deps below), so if it fired while
  // `event` was still null, event?.speakers would bake in as [] forever --
  // the JSON fallback would never get real data even after `event` resolved
  // moments later, since nothing would re-trigger this effect.
  useEffect(() => {
    if (!event) return;

    const loadSpeakers = async () => {
      try {
        setLoading(true);
        
        const dbPromise = supabase
          .from('bsl_speakers')
          .select('*');

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database timeout')), 5000)
        );

        try {
          const { data: dbSpeakers, error: dbError } = await Promise.race([dbPromise, timeoutPromise]) as any;

          if (dbSpeakers && !dbError && dbSpeakers.length > 0) {
            const formattedSpeakers = dbSpeakers.map((s: any) => ({
              id: s.id,
              name: s.name,
              title: s.title || null,
              company: s.company || null,
              bio: s.bio || (s.title ? `Experienced professional in ${s.title}.` : undefined),
              image: s.imageurl || getSpeakerAvatarUrl(s.name),
              user_id: s.user_id || undefined,
              isActive: !!s.user_id // Active if has user_id
            }));
            
            // Remove duplicates based on ID
            const uniqueSpeakers = formattedSpeakers.filter((speaker: Speaker, index: number, self: Speaker[]) => 
              index === self.findIndex((s: Speaker) => s.id === speaker.id)
            );
            
            // Sort by priority order
            const sortedSpeakers: Speaker[] = sortSpeakersByPriority(uniqueSpeakers);
            setSpeakers(sortedSpeakers);
            setLoading(false);
            return;
          }
        } catch (dbError: any) {
          // Fall back to the event configuration when the database is unavailable.
        }

        // Fallback to event config (JSON)
        const eventSpeakers = event?.speakers || [];
        const formattedEventSpeakers = eventSpeakers.map((s: EventSpeakerConfig) => ({
          id: s.id,
          name: s.name,
          title: s.title || null,
          company: s.company || null,
          bio: (s.title && s.company) ? `Experienced professional in ${s.title} at ${s.company}.` : undefined,
          // s.image is our own hosted photo (see packages/config/src/events.ts).
          // Only fall back to the legacy Cloudinary/name-guessing lookup for
          // older speakers that were never given a real image field.
          image: resolveConfiguredSpeakerImage(s.image, s.name)
        }));

        // Remove duplicates based on ID
        const uniqueEventSpeakers = formattedEventSpeakers.filter((speaker: Speaker, index: number, self: Speaker[]) =>
          index === self.findIndex((s: Speaker) => s.id === speaker.id)
        );

        // Sort by priority order
        const sortedEventSpeakers: Speaker[] = sortSpeakersByPriority(uniqueEventSpeakers);
        setSpeakers(sortedEventSpeakers);
        setLoading(false);
      } catch (error) {
        console.error('❌ Error loading speakers:', error);
        // Emergency fallback to event config
        const eventSpeakers = event?.speakers || [];
        const formattedEventSpeakers = eventSpeakers.map((s: EventSpeakerConfig) => ({
          id: s.id,
          name: s.name,
          title: s.title || null,
          company: s.company || null,
          bio: (s.title && s.company) ? `Experienced professional in ${s.title} at ${s.company}.` : undefined,
          image: resolveSpeakerImage(s.image, s.name)
        }));

        // Remove duplicates based on ID
        const uniqueEmergencySpeakers = formattedEventSpeakers.filter((speaker: Speaker, index: number, self: Speaker[]) =>
          index === self.findIndex((s: Speaker) => s.id === speaker.id)
        );
        
        // Sort by priority order
        const sortedEmergencySpeakers: Speaker[] = sortSpeakersByPriority(uniqueEmergencySpeakers);
        setSpeakers(sortedEmergencySpeakers);
        setLoading(false);
      }
    };

    loadSpeakers();
  }, [event?.id]); // Re-run once `event` resolves (or the route's event changes)

  // Update filtered speakers when speakers change
  useEffect(() => {
    setFilteredSpeakers(speakers);
  }, [speakers]);

  // SpeakerCard component
  const SpeakerCard = ({ speaker }: { speaker: Speaker }) => {
    return (
      <TouchableOpacity 
        style={styles.speakerCard}
        onPress={() => router.push(`/events/${eventId}/speakers/${speaker.id}`)}
      >
        <View style={styles.speakerImageContainer}>
          <SpeakerAvatar
            imageUrl={speaker.image}
            name={speaker.name}
            size={50}
            showBorder={false}
          />
          {/* Active speaker badge */}
          {speaker.isActive && (
            <View style={styles.activeBadge}>
              <View style={styles.activeIndicator} />
            </View>
          )}
        </View>
        <View style={styles.speakerInfo}>
          <View style={styles.speakerNameRow}>
            <Text style={styles.speakerName}>{speaker.name}</Text>
            {speaker.isActive && (
              <View style={styles.activeLabel}>
                <Text style={styles.activeLabelText}>Active</Text>
              </View>
            )}
          </View>
          {speaker.title && <Text style={styles.speakerTitle}>{speaker.title}</Text>}
          {speaker.company && <Text style={styles.speakerCompany}>{speaker.company}</Text>}
        </View>
        <MaterialIcons name="chevron-right" size={20} color="#666" />
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <LoadingScreen
        icon="people"
        message="Loading speakers..."
        fullScreen={true}
      />
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Event Header */}
        <EventBanner
          title="All Speakers"
          subtitle={`Complete Directory • ${speakers.length} Speakers${activeSpeakersCount > 0 ? ` • ${activeSpeakersCount} Active` : ''}`}
          date={eventDateLabel}
          showCountdown={!isEventFinished && Boolean(event?.eventStartDate)}
          showLiveIndicator={!isEventFinished && Boolean(event?.eventStartDate)}
          isEventFinished={isEventFinished}
          eventStartDate={event?.eventStartDate}
          eventId={eventId}
          eventImage={event?.image}
        />

        {/* Search and Sort */}
        {speakers.length > 0 && (
          <SpeakerSearchAndSort
            speakers={speakers}
            onFilteredSpeakers={setFilteredSpeakers}
            onGroupedSpeakers={setGroupedSpeakers}
            onSearchChange={setSearchQuery}
            onSortChange={setSortBy}
            onActiveFilterChange={(showActiveOnly: boolean) => {
              setShowActiveOnly(showActiveOnly);
            }}
          />
        )}

        {/* All Speakers Section */}
        {filteredSpeakers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {searchQuery 
                ? `Search Results (${filteredSpeakers.length})`
                : showActiveOnly 
                  ? `Active Speakers (${filteredSpeakers.length})`
                  : `All Speakers (${speakers.length})`}
            </Text>
            <View style={styles.speakersList}>
              {filteredSpeakers.map(speaker => (
                <SpeakerCard key={speaker.id} speaker={speaker} />
              ))}
            </View>
          </View>
        )}

        {/* No Results */}
        {searchQuery && filteredSpeakers.length === 0 && (
          <View style={styles.noResultsContainer}>
            <MaterialIcons name="search-off" size={48} color={colors.text.secondary} />
            <Text style={styles.noResultsText}>No speakers found for &quot;{searchQuery}&quot;</Text>
            <Text style={styles.noResultsSubtext}>Try a different search term</Text>
          </View>
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
  },
  scrollContent: {
    paddingBottom: 30,
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginBottom: 15,
  },
  speakersList: {
    gap: 12,
  },
  speakerCard: {
    flexDirection: 'row',
    backgroundColor: colors.background.paper,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
  },
  speakerImageContainer: {
    marginRight: 16,
    shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.15)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  activeBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.background.paper,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.background.paper,
  },
  activeIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34A853',
  },
  speakerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  speakerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  speakerName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: 0.2,
    flex: 1,
  },
  activeLabel: {
    backgroundColor: '#34A853',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  activeLabelText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  speakerTitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 3,
    fontWeight: '500',
  },
  speakerCompany: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: '400',
    opacity: 0.8,
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
    textAlign: 'center',
  },
  noResultsSubtext: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 8,
    textAlign: 'center',
  },
});
