import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

// Generic interfaces for different data types
interface BaseItem {
  id: string;
  [key: string]: any;
}

interface FilterOption {
  key: string;
  label: string;
  icon?: string;
  type?: 'single' | 'multiple';
}

interface FilterGroup {
  key: string;
  label: string;
  options: FilterOption[];
  type: 'single' | 'multiple' | 'chips';
}

interface UnifiedSearchAndFilterProps<T extends BaseItem> {
  data: T[];
  onFilteredData: (data: T[]) => void;
  onSearchChange: (query: string) => void;
  searchPlaceholder?: string;
  searchFields?: string[]; // Fields to search in
  filterGroups?: FilterGroup[];
  onFilterChange?: (filters: { [key: string]: any }) => void;
  showResultsCount?: boolean;
  customFilterLogic?: (data: T[], filters: { [key: string]: any }, searchQuery: string) => T[];
}

export default function UnifiedSearchAndFilter<T extends BaseItem>({
  data,
  onFilteredData,
  onSearchChange,
  searchPlaceholder = "Search...",
  searchFields = [],
  filterGroups = [],
  onFilterChange,
  showResultsCount = true,
  customFilterLogic
}: UnifiedSearchAndFilterProps<T>) {
  const { isDark, colors } = useTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
  const [activeFilters, setActiveFilters] = useState<{ [key: string]: any }>({});
  const styles = getStyles(isDark, colors);

  // Default search logic
  const defaultSearchLogic = (items: T[], query: string): T[] => {
    if (!query.trim()) return items;
    
    const lowercaseQuery = query.toLowerCase();
    return items.filter(item => {
      // If searchFields is specified, only search in those fields
      if (searchFields.length > 0) {
        return searchFields.some(field => {
          const value = item[field];
          return value && value.toString().toLowerCase().includes(lowercaseQuery);
        });
      }
      
      // Otherwise, search in all string fields
      return Object.values(item).some(value => {
        if (typeof value === 'string') {
          return value.toLowerCase().includes(lowercaseQuery);
        }
        if (Array.isArray(value)) {
          return value.some(v => 
            typeof v === 'string' && v.toLowerCase().includes(lowercaseQuery)
          );
        }
        return false;
      });
    });
  };

  // Default filter logic
  const defaultFilterLogic = (items: T[], filters: { [key: string]: any }): T[] => {
    return items.filter(item => {
      return Object.entries(filters).every(([filterKey, filterValue]) => {
        if (!filterValue || filterValue === '') return true;
        
        const itemValue = item[filterKey];
        
        // Handle array values (like speakers)
        if (Array.isArray(itemValue)) {
          if (Array.isArray(filterValue)) {
            return filterValue.some(fv => itemValue.includes(fv));
          }
          return itemValue.includes(filterValue);
        }
        
        // Handle single values
        return itemValue === filterValue;
      });
    });
  };

  // Apply filters and search (supports overrides to avoid stale state)
  const applyFiltersAndSearch = (
    filtersOverride?: { [key: string]: any },
    queryOverride?: string
  ) => {
    const filtersToUse = filtersOverride ?? activeFilters;
    const queryToUse = queryOverride ?? searchQuery;
    let filtered = data;

    if (customFilterLogic) {
      filtered = customFilterLogic(data, filtersToUse, queryToUse);
    } else {
      filtered = defaultSearchLogic(filtered, queryToUse);
      filtered = defaultFilterLogic(filtered, filtersToUse);
    }

    onFilteredData(filtered);
  };

  // Handle search change
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    onSearchChange(query);
    applyFiltersAndSearch(undefined, query);
  };

  // Handle filter change
  const handleFilterChange = (filterKey: string, value: any) => {
    const newFilters = { ...activeFilters };

    if (value === '' || value === null || (Array.isArray(value) && value.length === 0)) {
      delete newFilters[filterKey];
    } else {
      newFilters[filterKey] = value;
    }

    setActiveFilters(newFilters);
    if (onFilterChange) onFilterChange(newFilters);
    applyFiltersAndSearch(newFilters, undefined);
  };

  // Clear all filters
  const clearAllFilters = () => {
    setSearchQuery('');
    setActiveFilters({});
    onSearchChange('');
    if (onFilterChange) onFilterChange({});
    onFilteredData(data);
  };

  // Check if any filters are active
  const hasActiveFilters = searchQuery.length > 0 || Object.keys(activeFilters).length > 0;

  // Get unique values for a field
  const getUniqueValues = (field: string): string[] => {
    const values = new Set<string>();
    data.forEach(item => {
      const value = item[field];
      if (Array.isArray(value)) {
        value.forEach(v => values.add(v));
      } else if (value) {
        values.add(value);
      }
    });
    return Array.from(values).sort();
  };

  // Render filter group
  const renderFilterGroup = (group: FilterGroup) => {
    if (group.type === 'chips') {
      return (
        <View key={group.key} style={styles.filterGroup}>
          <Text style={styles.filterLabel}>{group.label}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <TouchableOpacity
              style={[styles.filterChip, !activeFilters[group.key] && styles.filterChipActive]}
              onPress={() => handleFilterChange(group.key, '')}
            >
              <Text style={[styles.filterChipText, !activeFilters[group.key] && styles.filterChipTextActive]}>
                All {group.label}
              </Text>
            </TouchableOpacity>
            {getUniqueValues(group.key).map(value => (
              <TouchableOpacity
                key={value}
                style={[styles.filterChip, activeFilters[group.key] === value && styles.filterChipActive]}
                onPress={() => handleFilterChange(group.key, activeFilters[group.key] === value ? '' : value)}
              >
                <Text style={[styles.filterChipText, activeFilters[group.key] === value && styles.filterChipTextActive]}>
                  {value}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      );
    }

    return (
      <View key={group.key} style={styles.filterGroup}>
        <Text style={styles.filterLabel}>{group.label}</Text>
        {group.options.map((option) => (
          <TouchableOpacity
            key={option.key}
            style={[
              styles.filterOption,
              activeFilters[group.key] === option.key && styles.filterOptionSelected
            ]}
            onPress={() => handleFilterChange(group.key, activeFilters[group.key] === option.key ? '' : option.key)}
          >
            {option.icon && (
              <MaterialIcons 
                name={option.icon as any} 
                size={20} 
                color={activeFilters[group.key] === option.key ? '#007AFF' : colors.text.primary} 
              />
            )}
            <Text style={[
              styles.filterOptionText,
              activeFilters[group.key] === option.key && styles.filterOptionTextSelected
            ]}>
              {option.label}
            </Text>
            {activeFilters[group.key] === option.key && (
              <MaterialIcons name="check" size={20} color="#007AFF" />
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  // Initialize with all data
  useEffect(() => {
    onFilteredData(data);
  }, [data, onFilteredData]);

  return (
    <View style={styles.container}>
      {/* Top Row: Search Input + Filter Button */}
      <View style={styles.topRow}>
        {/* Search Input - expands to left */}
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color={colors.text.secondary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={searchPlaceholder}
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
        {filterGroups.length > 0 && (
          <TouchableOpacity 
            style={[styles.filterButton, hasActiveFilters && styles.filterButtonActive]}
            onPress={() => setShowFiltersDropdown(!showFiltersDropdown)}
          >
            <MaterialIcons 
              name="tune" 
              size={24} 
              color={hasActiveFilters ? '#fff' : '#007AFF'} 
            />
            {hasActiveFilters && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>
                  {Object.keys(activeFilters).length + (searchQuery ? 1 : 0)}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Filters Dropdown */}
      {showFiltersDropdown && filterGroups.length > 0 && (
        <View style={styles.filtersDropdown}>
          <Text style={styles.filtersTitle}>Filters</Text>
          
          <ScrollView 
            style={styles.filtersScrollView}
            contentContainerStyle={styles.filtersScrollContent}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
          >
            {filterGroups.map(renderFilterGroup)}
          </ScrollView>

          {/* Clear All Filters */}
          {hasActiveFilters && (
            <TouchableOpacity
              style={styles.clearAllFilters}
              onPress={clearAllFilters}
            >
              <MaterialIcons name="clear-all" size={16} color={colors.text.secondary} />
              <Text style={styles.clearAllFiltersText}>Clear all filters</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Results Count */}
      {showResultsCount && hasActiveFilters && (
        <View style={styles.resultsCount}>
          <Text style={styles.resultsCountText}>
            Showing {(() => {
              const filtersToUse = activeFilters;
              const queryToUse = searchQuery;
              let filtered = data;
              if (customFilterLogic) {
                filtered = customFilterLogic(data, filtersToUse, queryToUse);
              } else {
                filtered = defaultSearchLogic(filtered, queryToUse);
                filtered = defaultFilterLogic(filtered, filtersToUse);
              }
              return filtered.length;
            })()} of {data.length} items
          </Text>
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
    position: 'relative',
  },
  filterButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
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
    maxHeight: 400, // Maximum height before scrolling
  },
  filtersTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 16,
  },
  filtersScrollView: {
    maxHeight: 320, // Max height for scrollable area (leaving room for title and clear button)
  },
  filtersScrollContent: {
    paddingBottom: 8,
  },
  filterGroup: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 8,
  },
  filterScroll: {
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  filterChipActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  filterChipText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: '#fff',
    fontWeight: '600',
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
  clearAllFilters: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    marginTop: 8,
  },
  clearAllFiltersText: {
    fontSize: 14,
    color: colors.text.secondary,
    marginLeft: 6,
    fontWeight: '500',
  },
  resultsCount: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  resultsCountText: {
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
    fontWeight: '500',
  },
});
