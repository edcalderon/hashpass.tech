import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';
import SpeakerAvatar from './SpeakerAvatar';
import SpeakerQuickScroll from './SpeakerQuickScroll';

interface Speaker {
  id: string;
  name: string;
  title: string;
  company: string;
  bio?: string;
  image?: string;
}

interface SpeakerListWithDividersProps {
  groupedSpeakers: { [key: string]: Speaker[] };
  onSpeakerPress: (speaker: Speaker) => void;
  sortBy: string;
}

export default function SpeakerListWithDividers({ 
  groupedSpeakers, 
  onSpeakerPress,
  sortBy 
}: SpeakerListWithDividersProps) {
  const { isDark, colors } = useTheme();
  const scrollViewRef = useRef<FlatList<{ type: 'header' | 'speaker'; letter?: string; speaker?: any; id: string }>>(null);
  const groupRefs = useRef<{ [key: string]: View | null }>({});
  const styles = getStyles(isDark, colors);

  // Sort the group keys alphabetically
  const sortedGroupKeys = Object.keys(groupedSpeakers).sort((a, b) => {
    if (a === '#') return 1; // Put # at the end
    if (b === '#') return -1;
    return a.localeCompare(b);
  });

  const getGroupLabel = (letter: string): string => {
    if (letter === '#') return 'Others';
    return letter;
  };

  const getGroupSubtitle = (letter: string): string => {
    switch (sortBy) {
      case 'name':
        return letter === '#' ? 'Names starting with numbers or symbols' : `Names starting with ${letter}`;
      case 'company':
        return letter === '#' ? 'Companies starting with numbers or symbols' : `Companies starting with ${letter}`;
      case 'title':
        return letter === '#' ? 'Titles starting with numbers or symbols' : `Titles starting with ${letter}`;
      default:
        return '';
    }
  };

  const handleLetterPress = (letter: string) => {
    const groupRef = groupRefs.current[letter];
    if (groupRef && scrollViewRef.current) {
      groupRef.measureLayout(
        scrollViewRef.current as any,
        (x, y) => {
          scrollViewRef.current?.scrollToOffset({ offset: y - 20, animated: true });
        },
        () => {
          console.log('Failed to measure layout');
        }
      );
    }
  };

  // Flatten speakers for FlatList with section headers
  const flatListData = React.useMemo(() => {
    const items: { type: 'header' | 'speaker'; letter?: string; speaker?: any; id: string }[] = [];
    sortedGroupKeys.forEach((letter) => {
      items.push({ type: 'header', letter, id: `header-${letter}` });
      groupedSpeakers[letter].forEach((speaker) => {
        items.push({ type: 'speaker', speaker, id: speaker.id });
      });
    });
    return items;
  }, [sortedGroupKeys, groupedSpeakers]);

  const renderItem = React.useCallback(({ item }: { item: typeof flatListData[0] }) => {
    if (item.type === 'header') {
  return (
          <View 
          key={item.id}
            style={styles.groupContainer}
            ref={(ref) => {
            if (item.letter) {
              groupRefs.current[item.letter] = ref;
            }
            }}
          >
            <View style={styles.groupHeader}>
            <Text style={styles.groupTitle}>{getGroupLabel(item.letter || '')}</Text>
            <Text style={styles.groupSubtitle}>{getGroupSubtitle(item.letter || '')}</Text>
              <View style={styles.groupDivider} />
            </View>
        </View>
      );
    }

    const speaker = item.speaker;
    if (!speaker) return null;

    return (
                <TouchableOpacity
                  key={speaker.id}
                  style={styles.speakerCard}
                  onPress={() => onSpeakerPress(speaker)}
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
                    {speaker.title && <Text style={styles.speakerTitle}>{speaker.title}</Text>}
                    {speaker.company && <Text style={styles.speakerCompany}>{speaker.company}</Text>}
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color="#666" />
                </TouchableOpacity>
    );
  }, [onSpeakerPress, styles, getGroupLabel, getGroupSubtitle]);

  const getItemLayout = React.useCallback((data: any, index: number) => {
    const item = flatListData[index];
    if (item?.type === 'header') {
      return { length: 60, offset: 60 * index, index };
    }
    return { length: 80, offset: 80 * index, index };
  }, [flatListData]);

  return (
    <View style={styles.container}>
      <FlatList
        ref={scrollViewRef}
        data={flatListData}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        getItemLayout={getItemLayout}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        initialNumToRender={15}
        windowSize={10}
      />

      {/* Quick Scroll */}
      <SpeakerQuickScroll
        groupedSpeakers={groupedSpeakers}
        onLetterPress={handleLetterPress}
        sortBy={sortBy}
      />
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  groupContainer: {
    marginBottom: 24,
  },
  groupHeader: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.background.paper,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  groupTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 4,
  },
  groupSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginBottom: 8,
  },
  groupDivider: {
    height: 2,
    backgroundColor: '#007AFF',
    borderRadius: 1,
  },
  speakersList: {
    paddingHorizontal: 20,
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
});
