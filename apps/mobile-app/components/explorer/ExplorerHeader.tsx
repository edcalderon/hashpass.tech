import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { SvgUri } from 'react-native-svg';
import { useTheme } from '../../hooks/useTheme';
import { resolveEventImageSource } from '../../lib/event-branding';

// A bundled raster is intentional here. Passing a public SVG URI through
// SvgUri makes Metro treat part of its directory as an asset request in web
// development (`/logos/bsl`), yielding an ENOENT response loop.
const DEFAULT_BSL_LOGO = require('../../assets/logos/bsl/bsl-colombia-pro.webp');

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
  logoUri,
  showEventSelector = false,
  children 
}: ExplorerHeaderProps) {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const resolvedLogo = logoUri ? resolveEventImageSource(logoUri) : undefined;

  return (
    <View style={styles.header}>
      <View style={styles.headerContent}>
        <View style={styles.headerTop}>
          <View style={styles.logoContainer}>
            {resolvedLogo ? (
              <Image source={resolvedLogo} style={styles.logo} resizeMode="contain" />
            ) : logoUri ? (
              <SvgUri uri={logoUri} width={40} height={40} />
            ) : (
              <Image source={DEFAULT_BSL_LOGO} style={styles.logo} resizeMode="contain" />
            )}
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
  logo: {
    width: 40,
    height: 40,
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
