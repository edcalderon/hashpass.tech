import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SvgUri } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';

interface ExplorerHeaderProps {
  title: string;
  subtitle: string;
  date?: string;
  logoUri?: string;
  showEventSelector?: boolean;
  children?: React.ReactNode;
}

export default function ExplorerHeader({ 
  title, 
  subtitle, 
  date, 
  logoUri = "https://blockchainsummit.la/wp-content/uploads/2025/09/logo-bsl.svg",
  showEventSelector = false,
  children 
}: ExplorerHeaderProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);

  return (
    <View style={styles.header}>
      <View style={styles.headerContent}>
        <View style={styles.headerTop}>
          <View style={styles.logoContainer}>
            <SvgUri
              uri={logoUri}
              width={40}
              height={40}
            />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>{title}</Text>
            <Text style={styles.headerSubtitle}>{subtitle}</Text>
            {date && (
              <Text style={styles.headerDate}>{date}</Text>
            )}
          </View>
        </View>
        
        {showEventSelector && children}
      </View>
    </View>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  header: {
    padding: 20,
    paddingTop: 10,
  },
  headerContent: {
    gap: 20,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoContainer: {
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text.primary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: colors.text.secondary,
    marginTop: 2,
  },
  headerDate: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 2,
  },
});

