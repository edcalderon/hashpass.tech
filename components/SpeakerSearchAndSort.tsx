import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

interface Speaker {
  id: string;
  name: string;
  title: string;
  company: string;
  bio?: string;
  image?: string;
}

interface SpeakerSearchAndSortProps {
  speakers: Speaker[];
  onFilteredSpeakers: (speakers: Speaker[]) => void;
  onGroupedSpeakers: (groupedSpeakers: { [key: string]: Speaker[] }) => void;
  onSearchChange: (query: string) => void;
  onSortChange: (sortBy: string) => void;
}

type SortOption = 'name' | 'company' | 'title';

export default function SpeakerSearchAndSort({ 
  speakers, 
  onFilteredSpeakers, 
  onGroupedSpeakers,
  onSearchChange, 
  onSortChange 
}: SpeakerSearchAndSortProps) {
  const { isDark, colors } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const styles = getStyles(isDark, colors);

  const sortOptions: { key: SortOption; label: string; icon: string }[] = [
    { key: 'name', label: 'Name (A-Z)', icon: 'sort-by-alpha' },
    { key: 'company', label: 'Company (A-Z)', icon: 'business' },
    { key: 'title', label: 'Title (A-Z)', icon: 'work' },
  ];

  // Helper functions
  const filterSpeakers = (speakers: Speaker[], query: string): Speaker[] => {
    if (!query.trim()) return speakers;
    
    const lowercaseQuery = query.toLowerCase();
    return speakers.filter(speaker => 
      speaker.name.toLowerCase().includes(lowercaseQuery) ||
      speaker.title.toLowerCase().includes(lowercaseQuery) ||
      speaker.company.toLowerCase().includes(lowercaseQuery) ||
      (speaker.bio && speaker.bio.toLowerCase().includes(lowercaseQuery))
    );
  };

  const sortSpeakers = (speakers: Speaker[], sortBy: SortOption): Speaker[] => {
    return [...speakers].sort((a, b) => {
      let aValue = '';
      let bValue = '';
      
      switch (sortBy) {
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'company':
          aValue = a.company.toLowerCase();
          bValue = b.company.toLowerCase();
          break;
        case 'title':
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
      }
      
      return aValue.localeCompare(bValue);
    });
  };

  // Group speakers by first letter for alphabetical dividers
  const groupSpeakersByLetter = (speakers: Speaker[], sortBy: SortOption): { [key: string]: Speaker[] } => {
    const sorted = sortSpeakers(speakers, sortBy);
    const grouped: { [key: string]: Speaker[] } = {};
    
    sorted.forEach(speaker => {
      let firstLetter = '';
      switch (sortBy) {
        case 'name':
          firstLetter = speaker.name.charAt(0).toUpperCase();
          break;
        case 'company':
          firstLetter = speaker.company.charAt(0).toUpperCase();
          break;
        case 'title':
          firstLetter = speaker.title.charAt(0).toUpperCase();
          break;
      }
      
      // Handle non-alphabetic characters
      if (!/[A-Z]/.test(firstLetter)) {
        firstLetter = '#';
      }
      
      if (!grouped[firstLetter]) {
        grouped[firstLetter] = [];
      }
      grouped[firstLetter].push(speaker);
    });
    
    return grouped;
  };

  const getSortLabel = (): string => {
    const option = sortOptions.find(opt => opt.key === sortBy);
    return option ? option.label : 'Sort by...';
  };

  // Initialize with all speakers
  useEffect(() => {
    if (speakers.length > 0 && onGroupedSpeakers && onFilteredSpeakers) {
      const grouped = groupSpeakersByLetter(speakers, sortBy);
      onGroupedSpeakers(grouped);
      onFilteredSpeakers(speakers);
    }
  }, [speakers, sortBy]);

  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (onSearchChange) onSearchChange(query);
    
    // Filter and sort speakers
    const filtered = filterSpeakers(speakers, query);
    const sorted = sortSpeakers(filtered, sortBy);
    if (onFilteredSpeakers) onFilteredSpeakers(sorted);
    
    // Group speakers for alphabetical dividers
    const grouped = groupSpeakersByLetter(filtered, sortBy);
    if (onGroupedSpeakers) onGroupedSpeakers(grouped);
  };

  const handleSortChange = (newSortBy: SortOption) => {
    setSortBy(newSortBy);
    if (onSortChange) onSortChange(newSortBy);
    setShowFiltersDropdown(false);
    
    // Filter and sort speakers
    const filtered = filterSpeakers(speakers, searchQuery);
    const sorted = sortSpeakers(filtered, newSortBy);
    if (onFilteredSpeakers) onFilteredSpeakers(sorted);
    
    // Group speakers for alphabetical dividers
    const grouped = groupSpeakersByLetter(filtered, newSortBy);
    if (onGroupedSpeakers) onGroupedSpeakers(grouped);
  };

  return (
    <View style={styles.container}>
      {/* Top Row: Search Input + Filter Button */}
      <View style={styles.topRow}>
        {/* Search Input - expands to left */}
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color={colors.text.secondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search speakers..."
            placeholderTextColor={colors.text.secondary}
            value={searchQuery}
            onChangeText={handleSearchChange}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity 
              style={styles.clearButton}
              onPress={() => handleSearchChange('')}
            >
              <MaterialIcons name="clear" size={20} color={colors.text.secondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Button - top right corner */}
        <TouchableOpacity 
          style={styles.filterButton}
          onPress={() => setShowFiltersDropdown(!showFiltersDropdown)}
        >
          <MaterialIcons name="tune" size={24} color="#007AFF" />
        </TouchableOpacity>
      </View>

      {/* Filters Dropdown */}
      {showFiltersDropdown && (
        <View style={styles.filtersDropdown}>
          <Text style={styles.filtersTitle}>Sort by:</Text>
          {sortOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.filterOption,
                sortBy === option.key && styles.filterOptionSelected
              ]}
              onPress={() => handleSortChange(option.key)}
            >
              <MaterialIcons 
                name={option.icon as any} 
                size={20} 
                color={sortBy === option.key ? '#007AFF' : colors.text.primary} 
              />
              <Text style={[
                styles.filterOptionText,
                sortBy === option.key && styles.filterOptionTextSelected
              ]}>
                {option.label}
              </Text>
              {sortBy === option.key && (
                <MaterialIcons name="check" size={20} color="#007AFF" />
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: colors.background.default,
  },
  // Top Row Layout
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // Search Container - expands to left
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text.primary,
    paddingVertical: 4,
  },
  clearButton: {
    padding: 4,
  },
  // Filter Button - top right corner
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.background.paper,
    borderWidth: 1,
    borderColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  // Filters Dropdown
  filtersDropdown: {
    backgroundColor: colors.background.paper,
    borderRadius: 12,
    marginTop: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.divider,
    shadowColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  filtersTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 12,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  filterOptionSelected: {
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  filterOptionText: {
    fontSize: 16,
    color: colors.text.primary,
    marginLeft: 12,
    flex: 1,
  },
  filterOptionTextSelected: {
    color: '#007AFF',
    fontWeight: '600',
  },
});
