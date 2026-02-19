import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../hooks/useTheme';

interface StatItem {
  label: string;
  value: number | string;
  icon: string;
  color: string;
}

interface StatsGridProps {
  stats: StatItem[];
  title?: string;
  layout?: 'grid' | 'row';
}

export default function StatsGrid({ stats, title = "Statistics", layout = 'grid' }: StatsGridProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);

  const renderStatCard = (stat: StatItem) => (
    <View key={stat.label} style={styles.statCard}>
      <MaterialIcons name={stat.icon as any} size={24} color={stat.color} />
      <Text style={styles.statValue}>{stat.value}</Text>
      <Text style={styles.statLabel}>{stat.label}</Text>
    </View>
  );

  const renderStatsRow = (rowStats: StatItem[]) => (
    <View style={styles.statsRow}>
      {rowStats.map(renderStatCard)}
    </View>
  );

  const renderGridLayout = () => {
    const rows = [];
    for (let i = 0; i < stats.length; i += 2) {
      rows.push(
        <View key={i} style={styles.statsRow}>
          {stats.slice(i, i + 2).map(renderStatCard)}
        </View>
      );
    }
    return rows;
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.statsContainer}>
        {layout === 'grid' ? renderGridLayout() : renderStatsRow(stats)}
      </View>
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 16,
  },
  statsContainer: {
    gap: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.background.paper,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 4,
    textAlign: 'center',
  },
});

