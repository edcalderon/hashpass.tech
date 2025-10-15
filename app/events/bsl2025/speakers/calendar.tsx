import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useEvent } from '../../../../contexts/EventContext';
import { useTheme } from '../../../../hooks/useTheme';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../../../lib/supabase';
import EventBanner from '../../../../components/EventBanner';
import SpeakerAvatar from '../../../../components/SpeakerAvatar';
import SpeakerSearchAndSort from '../../../../components/SpeakerSearchAndSort';

// Type definitions
interface Speaker {
  id: string;
  name: string;
  title: string;
  company: string;
  bio?: string;
  image?: string;
}

interface AgendaItem {
  id: string;
  time: string;
  title: string;
  description?: string;
  speakers?: string[];
  type: 'keynote' | 'panel' | 'break' | 'meal' | 'registration';
  location?: string;
}

const getAgendaTypeColor = (type: string) => {
  switch (type) {
    case 'keynote': return '#007AFF';
    case 'panel': return '#34A853';
    case 'break': return '#FF9500';
    case 'meal': return '#FF3B30';
    case 'registration': return '#8E8E93';
    default: return '#8E8E93';
  }
};

export default function SpeakersCalendar() {
  const { event } = useEvent();
  const { isDark, colors } = useTheme();
  const router = useRouter();
  const styles = getStyles(isDark, colors);

  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [filteredSpeakers, setFilteredSpeakers] = useState<Speaker[]>([]);
  const [groupedSpeakers, setGroupedSpeakers] = useState<{ [key: string]: Speaker[] }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const agenda = event.agenda || [];

  // Load speakers from database with JSON fallback
  useEffect(() => {
    const loadSpeakers = async () => {
      try {
        console.log('🔍 Loading speakers from database...');
        
        const dbPromise = supabase
          .from('bsl_speakers')
          .select('*')
          .order('name');

        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database timeout')), 5000)
        );

        try {
          const { data: dbSpeakers, error: dbError } = await Promise.race([dbPromise, timeoutPromise]) as any;

          if (dbSpeakers && !dbError && dbSpeakers.length > 0) {
            const formattedSpeakers = dbSpeakers.map((s: any) => ({
              id: s.id,
              name: s.name,
              title: s.title,
              company: s.company || '',
              bio: s.bio || `Experienced professional in ${s.title}.`,
              image: s.imageurl || null // Don't use fallback URL, let SpeakerAvatar handle it
            }));
            
            // Remove duplicates based on ID
            const uniqueSpeakers = formattedSpeakers.filter((speaker, index, self) => 
              index === self.findIndex(s => s.id === speaker.id)
            );
            
            setSpeakers(uniqueSpeakers);
            console.log('✅ Loaded speakers from database:', uniqueSpeakers.length, 'unique speakers');
            return;
          }
        } catch (dbError: any) {
          console.log('⚠️ Database unavailable, falling back to event config...', dbError?.message);
        }

        // Fallback to event config (JSON)
        console.log('📋 Loading speakers from event config (JSON fallback)...');
        const eventSpeakers = event.speakers || [];
        const formattedEventSpeakers = eventSpeakers.map(s => ({
          id: s.id,
          name: s.name,
          title: s.title,
          company: s.company,
          bio: `Experienced professional in ${s.title} at ${s.company}.`,
          image: `https://blockchainsummit.la/wp-content/uploads/2025/09/foto-${s.name.toLowerCase().replace(/\s+/g, '-')}.png`
        }));
        
        // Remove duplicates based on ID
        const uniqueEventSpeakers = formattedEventSpeakers.filter((speaker, index, self) => 
          index === self.findIndex(s => s.id === speaker.id)
        );
        
        setSpeakers(uniqueEventSpeakers);
        console.log('✅ Loaded speakers from event config (JSON fallback):', uniqueEventSpeakers.length, 'unique speakers');
      } catch (error) {
        console.error('❌ Error loading speakers:', error);
        // Emergency fallback to event config
        const eventSpeakers = event.speakers || [];
        const formattedEventSpeakers = eventSpeakers.map(s => ({
          id: s.id,
          name: s.name,
          title: s.title,
          company: s.company,
          bio: `Experienced professional in ${s.title} at ${s.company}.`,
          image: `https://blockchainsummit.la/wp-content/uploads/2025/09/foto-${s.name.toLowerCase().replace(/\s+/g, '-')}.png`
        }));
        
        // Remove duplicates based on ID
        const uniqueEmergencySpeakers = formattedEventSpeakers.filter((speaker, index, self) => 
          index === self.findIndex(s => s.id === speaker.id)
        );
        
        setSpeakers(uniqueEmergencySpeakers);
        console.log('✅ Emergency fallback successful:', uniqueEmergencySpeakers.length, 'unique speakers');
      }
    };

    loadSpeakers();
  }, []); // Load only once on mount

  // Update filtered speakers when speakers change
  useEffect(() => {
    setFilteredSpeakers(speakers);
  }, [speakers]);

  // Group agenda by day
  const agendaByDay = agenda.reduce((acc, item) => {
    const day = item.time.split(' ')[0]; // Extract day from time
    if (!acc[day]) acc[day] = [];
    acc[day].push(item);
    return acc;
  }, {} as Record<string, AgendaItem[]>);

  // SpeakerCard component
  const SpeakerCard = ({ speaker }: { speaker: Speaker }) => {
    return (
      <TouchableOpacity 
        style={styles.speakerCard}
        onPress={() => router.push(`/events/bsl2025/speakers/${speaker.id}`)}
      >
        <View style={styles.speakerImageContainer}>
          <SpeakerAvatar
            imageUrl={speaker.image}
            name={speaker.name}
            size={50}
            showBorder={false}
          />
        </View>
        <View style={styles.speakerInfo}>
          <Text style={styles.speakerName}>{speaker.name}</Text>
          <Text style={styles.speakerTitle}>{speaker.title}</Text>
          <Text style={styles.speakerCompany}>{speaker.company}</Text>
        </View>
        <MaterialIcons name="chevron-right" size={20} color="#666" />
      </TouchableOpacity>
    );
  };

  // AgendaCard component
  const AgendaCard = ({ agendaItem }: { agendaItem: AgendaItem }) => (
    <View style={styles.agendaCard}>
      <View style={styles.agendaTimeContainer}>
        <Text style={styles.agendaTime}>{agendaItem.time}</Text>
        <View style={[styles.agendaTypeBadge, { backgroundColor: getAgendaTypeColor(agendaItem.type) }]}>
          <Text style={styles.agendaTypeText}>{agendaItem.type.toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.agendaContent}>
        <Text style={styles.agendaTitle}>{agendaItem.title}</Text>
        {agendaItem.speakers && agendaItem.speakers.length > 0 && (
          <Text style={styles.agendaSpeakers}>Speakers: {agendaItem.speakers.join(', ')}</Text>
        )}
      </View>
    </View>
  );

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
          subtitle={`Complete Directory • ${speakers.length} Speakers`}
          date="November 12-14, 2025 • Medellín, Colombia"
          showCountdown={true}
          showLiveIndicator={true}
        />

        {/* Search and Sort */}
        {speakers.length > 0 && (
          <SpeakerSearchAndSort
            speakers={speakers}
            onFilteredSpeakers={setFilteredSpeakers}
            onGroupedSpeakers={setGroupedSpeakers}
            onSearchChange={setSearchQuery}
            onSortChange={setSortBy}
          />
        )}

        {/* All Speakers Section */}
        {filteredSpeakers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {searchQuery ? `Search Results (${filteredSpeakers.length})` : `All Speakers (${speakers.length})`}
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
            <Text style={styles.noResultsText}>No speakers found for "{searchQuery}"</Text>
            <Text style={styles.noResultsSubtext}>Try a different search term</Text>
          </View>
        )}

        {/* Event Agenda by Day */}
        {Object.keys(agendaByDay).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Event Agenda</Text>
            {Object.entries(agendaByDay).map(([day, dayAgenda]) => (
              <View key={day} style={styles.daySection}>
                <Text style={styles.dayTitle}>{day}</Text>
                <View style={styles.agendaList}>
                  {dayAgenda.map(agendaItem => (
                    <AgendaCard key={agendaItem.id} agendaItem={agendaItem} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Event Info Section */}
        <View style={[styles.section, styles.infoSection]}>
          <Text style={styles.sectionTitle}>Event Information</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <MaterialIcons name="location-on" size={20} color="#007AFF" />
              <Text style={styles.infoText}>Medellín, Colombia</Text>
            </View>
            <View style={styles.infoRow}>
              <MaterialIcons name="event" size={20} color="#007AFF" />
              <Text style={styles.infoText}>November 12-14, 2025</Text>
            </View>
            <View style={styles.infoRow}>
              <MaterialIcons name="people" size={20} color="#007AFF" />
              <Text style={styles.infoText}>{speakers.length} Speakers</Text>
            </View>
            <View style={styles.infoRow}>
              <MaterialIcons name="schedule" size={20} color="#007AFF" />
              <Text style={styles.infoText}>3 Days of Content</Text>
            </View>
          </View>
        </View>
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
  daySection: {
    marginBottom: 20,
  },
  dayTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  speakersList: {
    gap: 12,
  },
  speakerCard: {
    flexDirection: 'row',
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
  },
  speakerImageContainer: {
    marginRight: 12,
  },
  speakerInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  speakerName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 2,
  },
  speakerTitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 2,
  },
  speakerCompany: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  agendaList: {
    gap: 12,
  },
  agendaCard: {
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  agendaTimeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  agendaTime: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
  },
  agendaTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  agendaTypeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  agendaContent: {
    flex: 1,
  },
  agendaTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 4,
  },
  agendaSpeakers: {
    fontSize: 12,
    color: colors.text.secondary,
    fontStyle: 'italic',
  },
  infoSection: {
    backgroundColor: colors.background.paper,
  },
  infoCard: {
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    padding: 16,
    shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: colors.text.primary,
    marginLeft: 12,
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


