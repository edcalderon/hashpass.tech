import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, StatusBar } from 'react-native';
import { useTheme } from '../../../hooks/useTheme';
import BlockchainTokensView from '../../../components/BlockchainTokensView';
import HashPointsView from '../../../components/HashPointsView';
import BlockchainTicketsView from '../../../components/BlockchainTicketsView';
import { useTranslation } from '../../../i18n/i18n';
import { useScroll } from '../../../contexts/ScrollContext';

type TabType = 'tokens' | 'points' | 'tickets';

const WalletScreen = () => {
  const { colors, isDark } = useTheme();
  const { headerHeight } = useScroll();
  const { t } = useTranslation('wallet');
  const [activeTab, setActiveTab] = useState<TabType>('tokens');
  const screenWidth = Dimensions.get('window').width;
  // Calculate nav bar height (StatusBar + header content)
  const navBarHeight = (StatusBar.currentHeight || 0) + 80;

  const styles = getStyles(isDark, colors, screenWidth, navBarHeight, headerHeight);

  const renderContent = () => {
    switch (activeTab) {
      case 'tokens':
        return <BlockchainTokensView />;
      case 'points':
        return <HashPointsView />;
      case 'tickets':
        return <BlockchainTicketsView />;
      default:
        return <BlockchainTokensView />;
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            {t("digitalWalletTitle")}
          </Text>
          <Text style={styles.subtitle}>
            {t("walletDesc")}
          </Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabContainer}>
          <View style={styles.tabsWrapper}>
            <TouchableOpacity
              style={styles.tab}
              onPress={() => setActiveTab('tokens')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === 'tokens' && styles.activeTabText]}>
                {t("tabs.tokens")}
              </Text>
              {activeTab === 'tokens' && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.tab}
              onPress={() => setActiveTab('points')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === 'points' && styles.activeTabText]}>
                {t("tabs.points")}
              </Text>
              {activeTab === 'points' && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.tab}
              onPress={() => setActiveTab('tickets')}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, activeTab === 'tickets' && styles.activeTabText]}>
                {t("tabs.tickets")}
              </Text>
              {activeTab === 'tickets' && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          </View>
          <View style={styles.tabDivider} />
        </View>

        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {t(`${activeTab}.title`)}
          </Text>
          <Text style={styles.sectionDescription}>
            {t(`${activeTab}.description`)}
          </Text>
        </View>

        {/* Tab Content */}
        {renderContent()}
      </ScrollView>
    </View>
  );
};

const getStyles = (isDark: boolean, colors: any, screenWidth: number, navBarHeight: number = 0, scrollHeaderHeight: number = 0) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.default,
    paddingTop: Math.max(scrollHeaderHeight || 0, navBarHeight),
  },
  header: {
    padding: 24,
    paddingBottom: 16,
    paddingTop: 16,
  },
  title: {
    fontSize: screenWidth < 400 ? 28 : 32,
    fontWeight: '800',
    marginBottom: 8,
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: screenWidth < 400 ? 14 : 16,
    color: colors.text.secondary,
  },
  tabContainer: {
    backgroundColor: colors.background.default,
    paddingTop: 8,
    paddingBottom: 0,
  },
  tabsWrapper: {
    flexDirection: 'row',
    paddingHorizontal: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activeTab: {
    // Active tab styling handled by indicator
  },
  tabText: {
    fontSize: screenWidth < 400 ? 14 : 15,
    fontWeight: '500',
    color: colors.text.secondary,
    letterSpacing: 0.2,
  },
  activeTabText: {
    color: colors.primary,
    fontWeight: '700',
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '10%',
    right: '10%',
    height: 3,
    backgroundColor: colors.primary,
    borderRadius: 2,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  tabDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginTop: 0,
    marginHorizontal: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  sectionHeader: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
  },
  sectionTitle: {
    fontSize: screenWidth < 400 ? 20 : 24,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: screenWidth < 400 ? 13 : 14,
    color: colors.text.secondary,
  },
});

export default WalletScreen;
