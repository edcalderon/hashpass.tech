import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
// lib/vector-icons routes web to SVG-based Lucide icons instead of the raw
// font glyphs @expo/vector-icons renders directly; the raw font can show its
// tofu/"?" fallback glyph for a window before the icon font loads on web.
import { MaterialIcons, NativeSafeIcon } from '../lib/vector-icons';
import { useTheme } from '../hooks/useTheme';
import { uiTokens } from '@hashpass/ui/tokens';

// Generic interfaces for different data types
interface BaseItem {
  id: string;
  [key: string]: any;
}

interface FilterOption {
  key: string;
  label: string;
  icon?: string;
  /** Optional semantic marker used by contextual filter menus. */
  color?: string;
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
  /**
   * Lets a caller drive this component's filters from outside its own
   * dropdown UI (e.g. a quick-filter legend rendered alongside it). When
   * provided, it replaces the internal `activeFilters` state and is
   * re-applied whenever its identity changes -- callers must memoize it
   * (e.g. `useMemo`) so an unrelated re-render doesn't create a new object
   * and re-trigger filtering on every render. Omit entirely for the default,
   * dropdown-only filtering behavior.
   */
  externalFilters?: { [key: string]: any };
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
  customFilterLogic,
  externalFilters
}: UnifiedSearchAndFilterProps<T>) {
  const { isDark, colors } = useTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const useSingleColumnFilters = viewportWidth < 640;
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

  // Counts individual selected values, not filter groups, so a stacked
  // multi-select (e.g. an externally-driven legend passing
  // `{ type: ['keynote', 'panel'] }`) shows "2" on the badge rather than "1"
  // for the whole "type" group.
  const activeFilterCount = Object.values(activeFilters).reduce<number>(
    (total, value) => total + (Array.isArray(value) ? value.length : value ? 1 : 0),
    0,
  ) + (searchQuery ? 1 : 0);

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
        <View style={styles.filterOptionsGrid}>
          {group.options.map((option) => {
            const selected = activeFilters[group.key] === option.key;
            const optionColor = option.color || colors.primary;
            return (
              <TouchableOpacity
                key={option.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                style={[
                  styles.filterOption,
                  { width: useSingleColumnFilters ? '100%' : '48.5%' },
                  selected && styles.filterOptionSelected,
                  selected && { borderColor: optionColor, backgroundColor: `${optionColor}14` },
                ]}
                onPress={() => handleFilterChange(group.key, selected ? '' : option.key)}
              >
                <View style={styles.filterOptionLeading}>
                  {option.color ? (
                    <View
                      accessible={false}
                      style={[styles.filterOptionColor, { backgroundColor: option.color }]}
                    />
                  ) : null}
                  {option.icon ? (
                    <MaterialIcons
                      name={option.icon as any}
                      size={19}
                      color={selected ? optionColor : colors.text.secondary}
                    />
                  ) : null}
                </View>
                <Text style={[
                  styles.filterOptionText,
                  selected && styles.filterOptionTextSelected,
                  selected && { color: optionColor },
                ]}>
                  {option.label}
                </Text>
                {selected ? (
                  <View style={[styles.filterOptionCheck, { backgroundColor: optionColor }]}>
                    <MaterialIcons name="check" size={14} color={colors.primaryContrastText || '#FFFFFF'} />
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  // Initialize with all data
  useEffect(() => {
    onFilteredData(data);
  }, [data, onFilteredData]);

  // Apply externally-driven filters (e.g. a quick-filter legend rendered by
  // the caller alongside this component). Runs after the "initialize" effect
  // above, so it takes precedence for the initial render too.
  useEffect(() => {
    if (externalFilters === undefined) return;
    setActiveFilters(externalFilters);
    if (onFilterChange) onFilterChange(externalFilters);
    applyFiltersAndSearch(externalFilters, undefined);
  }, [externalFilters]);

  return (
    <View style={[styles.container, showFiltersDropdown && styles.containerWithFloatingFilters]}>
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
            accessibilityRole="button"
            accessibilityLabel={showFiltersDropdown ? 'Close filters' : 'Open filters'}
            accessibilityState={{ expanded: showFiltersDropdown }}
          >
            <NativeSafeIcon
              name="filter"
              size={21}
              color={hasActiveFilters ? colors.primaryContrastText : colors.primary}
            />
            {hasActiveFilters && (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>
                  {activeFilterCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>

      {/* Filters Dropdown */}
      {showFiltersDropdown && filterGroups.length > 0 && (
        <View style={styles.filtersDropdown}>
          <View style={styles.filtersHeader}>
            <View style={styles.filtersHeadingCopy}>
              <NativeSafeIcon name="filter" size={18} color={colors.primary} />
              <Text style={styles.filtersTitle}>Filters</Text>
            </View>
            <Text style={styles.filtersSubtitle}>Choose a session type</Text>
          </View>
          
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
  containerWithFloatingFilters: {
    zIndex: 30,
    elevation: 30,
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
    borderRadius: uiTokens.radius.media,
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
    width: 46,
    height: 46,
    borderRadius: uiTokens.radius.media,
    backgroundColor: colors.background.paper,
    borderWidth: 1,
    borderColor: colors.divider,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
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
    position: 'absolute',
    top: 64,
    left: 20,
    right: 20,
    backgroundColor: colors.background.paper,
    borderRadius: uiTokens.radius.card,
    marginTop: 8,
    padding: uiTokens.space.xl,
    borderWidth: 1,
    borderColor: colors.divider,
    boxShadow: uiTokens.effects.dialogShadow,
    zIndex: 40,
    maxHeight: 400, // Maximum height before scrolling
  },
  filtersTitle: {
    fontSize: uiTokens.type.body,
    fontWeight: '800',
    color: colors.text.primary,
  },
  filtersHeader: {
    gap: uiTokens.space.xs,
    marginBottom: uiTokens.space.lg,
  },
  filtersHeadingCopy: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: uiTokens.space.sm,
  },
  filtersSubtitle: {
    color: colors.text.secondary,
    fontSize: uiTokens.type.caption,
  },
  filtersScrollView: {
    maxHeight: 320, // Max height for scrollable area (leaving room for title and clear button)
  },
  filtersScrollContent: {
    paddingBottom: 8,
  },
  filterGroup: {
    marginBottom: uiTokens.space.md,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: uiTokens.space.sm,
  },
  filterOptionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: uiTokens.space.sm,
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
    minHeight: uiTokens.control.compactHeight,
    paddingVertical: uiTokens.space.sm,
    paddingHorizontal: uiTokens.space.md,
    borderRadius: uiTokens.radius.input,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(7,17,30,0.018)',
  },
  filterOptionLeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: uiTokens.space.sm,
  },
  filterOptionColor: {
    width: 9,
    height: 9,
    borderRadius: uiTokens.radius.circle,
  },
  filterOptionSelected: {
    borderWidth: 1,
  },
  filterOptionText: {
    fontSize: uiTokens.type.label,
    color: colors.text.primary,
    marginLeft: uiTokens.space.sm,
    flex: 1,
  },
  filterOptionTextSelected: {
    fontWeight: '800',
  },
  filterOptionCheck: {
    alignItems: 'center',
    borderRadius: uiTokens.radius.circle,
    height: 22,
    justifyContent: 'center',
    width: 22,
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
