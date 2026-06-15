import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions, StyleSheet, Modal, ActivityIndicator } from 'react-native';
import { Coins, ArrowRightLeft, ExternalLink, TrendingUp, Shield, ChevronLeft, ChevronRight, Info, X, RefreshCw } from 'lucide-react-native';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../i18n/i18n';
import { useAuth } from '../hooks/useAuth';
import { lukasRewardService } from '../lib/lukas-reward-service';
import { useToastHelpers } from '../contexts/ToastContext';
import { useBalance } from '../contexts/BalanceContext';

interface Token {
  symbol: string;
  name: string;
  balance: string;
  usdValue: string;
  network: string;
  description: string;
  color: string;
  icon: string;
}

const BlockchainTokensView = () => {
  const { colors, isDark } = useTheme();
  const { t: translate } = useTranslation('wallet');
  const { user } = useAuth();
  const { showInfo, showSuccess } = useToastHelpers();
  const { refreshBalance } = useBalance();
  
  // Helper function to translate with fallback
  const t = (key: string, fallback?: string) => {
    try {
      const translated = translate(key, {});
      // If translation returns the key itself (not found), use the fallback
      if (!translated || translated === key || translated.startsWith('wallet.')) {
        return fallback || key;
      }
      return translated;
    } catch {
      return fallback || key;
    }
  };
  const screenWidth = Dimensions.get('window').width;
  const paddingHorizontal = screenWidth < 400 ? 16 : 24;
  // Calculate card width: screen width - padding (2x) - margins (32) = responsive width
  // Minimum 280px, maximum 320px
  const cardWidth = Math.max(280, Math.min(320, screenWidth - (paddingHorizontal * 2) - 32));
  const cardSpacing = 16;
  
  // Scroll state and refs
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [scrollX, setScrollX] = useState(0);
  const [maxScrollX, setMaxScrollX] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // Balance state for each token
  const [lukasBalance, setLukasBalance] = useState<number>(0);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [refreshingToken, setRefreshingToken] = useState<string | null>(null);
  
  // Modal state
  const [showLukasModal, setShowLukasModal] = useState(false);

  // Fetch balance for a specific token
  const fetchTokenBalance = useCallback(async (tokenSymbol: string, forceRefresh: boolean = false) => {
    if (!user?.id) {
      if (tokenSymbol === 'LUKAS') {
        setLukasBalance(0);
        setIsLoadingBalance(false);
      }
      return;
    }

    try {
      if (tokenSymbol === 'LUKAS') {
        if (forceRefresh) {
          setRefreshingToken('LUKAS');
        } else {
          setIsLoadingBalance(true);
        }
        
        console.log('💰 Fetching LUKAS balance for user:', user.id, 'forceRefresh:', forceRefresh);
        
        // Force a fresh fetch - get balance directly from database
        const balance = await lukasRewardService.getUserBalance(user.id, 'LUKAS');
        console.log('💰 Fetched LUKAS balance:', balance);
        
        // Update state immediately
        setLukasBalance(balance);
        setIsLoadingBalance(false);
        
        if (forceRefresh) {
          showSuccess('Balance Updated', `Your ${tokenSymbol} balance has been refreshed`); // Auto-close with progress bar
        }
      }
      // Add other tokens here when they're supported
    } catch (error) {
      console.error(`❌ Error fetching ${tokenSymbol} balance:`, error);
      if (tokenSymbol === 'LUKAS') {
        setLukasBalance(0);
        setIsLoadingBalance(false);
      }
    } finally {
      if (tokenSymbol === 'LUKAS' && forceRefresh) {
        setRefreshingToken(null);
      }
    }
  }, [user?.id, showSuccess]);

    // Listen for balance refresh events from other components
    const handleBalanceRefresh = useCallback(() => {
      console.log('💰 Balance refresh event received, refreshing...');
      // Force a fresh fetch from the database
      fetchTokenBalance('LUKAS', true);
    }, [fetchTokenBalance]);

    // Subscribe to custom refresh events
    useEffect(() => {
      if (typeof window !== 'undefined') {
        window.addEventListener('balance:refresh', handleBalanceRefresh);
        return () => {
          window.removeEventListener('balance:refresh', handleBalanceRefresh);
        };
      }
    }, [handleBalanceRefresh]);

  // Initial fetch and subscription setup
  useEffect(() => {
    if (!user?.id) {
      setLukasBalance(0);
      setIsLoadingBalance(false);
      return;
    }

    // Initial fetch
    fetchTokenBalance('LUKAS', false);

    // Subscribe to balance changes (real-time updates)
    const unsubscribe = lukasRewardService.subscribeToBalance(
      user.id,
      'LUKAS',
      (balance) => {
        console.log('💰 Balance subscription callback:', balance);
        // Always update from subscription - it's the source of truth
        // The refreshingToken check was preventing updates during manual refresh
        if (balance) {
          const newBalance = parseFloat(balance.balance.toString());
          console.log('💰 Updating balance from subscription to:', newBalance);
          setLukasBalance(newBalance);
          setIsLoadingBalance(false);
        } else {
          console.log('💰 Balance is null, setting to 0');
          setLukasBalance(0);
          setIsLoadingBalance(false);
        }
      }
    );

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [user?.id, fetchTokenBalance]);

  // Memoize tokens array to update when balance changes
  const tokens: Token[] = React.useMemo(() => [
    {
      symbol: 'LUKAS',
      name: 'LUKAS Token',
      balance: isLoadingBalance && !refreshingToken ? '...' : lukasBalance.toFixed(2),
      usdValue: '0.00',
      network: 'Native',
      description: 'Native token of HashPass ecosystem',
      color: '#8b5cf6',
      icon: '💎',
    },
    {
      symbol: 'COP',
      name: 'Colombian Peso Token',
      balance: '0.00',
      usdValue: '0.00',
      network: 'Pegged',
      description: 'Pegged to Colombian Peso, backed by HashPass merchants',
      color: '#10b981',
      icon: '🇨🇴',
    },
    {
      symbol: 'VOI',
      name: 'Voi Network Token',
      balance: '0.00',
      usdValue: '0.00',
      network: 'Voi Network',
      description: 'Token from Voi Network (Algorand fork)',
      color: '#3b82f6',
      icon: '🔷',
    },
  ], [lukasBalance, isLoadingBalance, refreshingToken]);

  const handleScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const x = contentOffset.x;
    const maxX = Math.max(0, contentSize.width - layoutMeasurement.width);
    setScrollX(x);
    setMaxScrollX(maxX);
    setViewportWidth(layoutMeasurement.width);
    setShowLeftArrow(x > 10);
    setShowRightArrow(x < maxX - 10);
  };

  const scrollTo = (direction: 'left' | 'right') => {
    const delta = Math.max(cardWidth, viewportWidth - cardSpacing);
    const target = direction === 'left' ? scrollX - delta : scrollX + delta;
    const nextX = Math.max(0, Math.min(target, maxScrollX));
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ x: nextX, animated: true });
    }
  };

  const handleLayout = (e: any) => {
    const w = e?.nativeEvent?.layout?.width || 0;
    setViewportWidth(w);
    setMaxScrollX(Math.max(0, contentWidth - w));
    // Check if we need to show right arrow initially
    if (contentWidth > w) {
      setShowRightArrow(true);
    }
  };

  const handleContentSizeChange = (w: number, _h: number) => {
    setContentWidth(w);
    setMaxScrollX(Math.max(0, w - viewportWidth));
    // Check if we need to show right arrow
    if (w > viewportWidth) {
      setShowRightArrow(true);
    }
  };

  const handleWheel = (e: any) => {
    // RN Web: map wheel vertical/horizontal delta to horizontal scroll
    const dx = e?.nativeEvent?.deltaX ?? e?.deltaX ?? 0;
    const dy = e?.nativeEvent?.deltaY ?? e?.deltaY ?? 0;
    const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    const nextX = Math.max(0, Math.min(scrollX + delta, maxScrollX));
    if (typeof e?.preventDefault === 'function') e.preventDefault();
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ x: nextX, animated: false });
    }
  };

  const styles = getStyles(isDark, colors);

  return (
    <View style={{ paddingHorizontal }}>
      {/* Total Portfolio Value */}
      <View
        style={{
          marginBottom: 24,
          backgroundColor: colors.background.paper,
          borderRadius: 16,
          padding: 20,
          borderWidth: 1,
          borderColor: colors.divider,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <TrendingUp size={20} color={colors.text.primary} />
          <Text
            style={{
              fontSize: 16,
              fontWeight: '600',
              color: colors.text.primary,
              marginLeft: 8,
            }}
          >
            {t('tokens.totalPortfolio')}
          </Text>
        </View>
        <Text
          style={{
            fontSize: 28,
            fontWeight: '800',
            color: colors.text.primary,
            marginBottom: 4,
          }}
        >
          $0.00 USD
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: colors.text.secondary,
          }}
        >
          {t('tokens.portfolioDesc')}
        </Text>
      </View>


      <View style={styles.scrollContainer}>
        {showLeftArrow && (
          <TouchableOpacity
            style={[styles.scrollArrow, styles.leftArrow]}
            onPress={() => scrollTo('left')}
          >
            <ChevronLeft size={24} color={colors.primary} />
          </TouchableOpacity>
        )}
        <ScrollView 
          ref={scrollRef}
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingRight: paddingHorizontal }}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          decelerationRate="fast"
          snapToInterval={cardWidth + cardSpacing}
          snapToAlignment="start"
          disableIntervalMomentum
          onLayout={handleLayout}
          onContentSizeChange={handleContentSizeChange}
          // @ts-ignore - onWheel supported in RN Web
          onWheel={handleWheel}
        >
        {tokens.map((token, index) => (
          <View
            key={token.symbol}
            style={{
              width: cardWidth,
              backgroundColor: colors.background.paper,
              borderRadius: 16,
              padding: screenWidth < 400 ? 16 : 20,
              marginRight: index === tokens.length - 1 ? 0 : cardSpacing,
              marginLeft: index === 0 ? 0 : 0,
              borderWidth: 1,
              borderColor: colors.divider,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 8,
              elevation: 3,
            }}
          >
            {/* Token Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: `${token.color}20`,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Text style={{ fontSize: 24 }}>{token.icon}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: '700',
                    color: colors.text.primary,
                    marginBottom: 4,
                  }}
                >
                  {token.symbol}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.text.secondary,
                  }}
                >
                  {token.name}
                </Text>
              </View>
              {/* Reload Balance Button */}
              <TouchableOpacity
                onPress={() => {
                  console.log(`🔄 Refreshing ${token.symbol} balance...`);
                  fetchTokenBalance(token.symbol, true);
                }}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: colors.background.default,
                  borderWidth: 1,
                  borderColor: colors.divider,
                }}
                disabled={refreshingToken === token.symbol}
              >
                {refreshingToken === token.symbol ? (
                  <ActivityIndicator size="small" color={token.color} />
                ) : (
                  <RefreshCw size={16} color={token.color} />
                )}
              </TouchableOpacity>
            </View>

            {/* Balance */}
            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                {token.symbol === 'LUKAS' && (isLoadingBalance || refreshingToken === 'LUKAS') ? (
                  <>
                    <Text
                      style={{
                        fontSize: 32,
                        fontWeight: '800',
                        color: token.color,
                        marginRight: 8,
                      }}
                    >
                      ...
                    </Text>
                    <ActivityIndicator size="small" color={token.color} />
                  </>
                ) : (
                  <Text
                    style={{
                      fontSize: 32,
                      fontWeight: '800',
                      color: token.color,
                    }}
                  >
                    {token.balance}
                  </Text>
                )}
              </View>
              <Text
                style={{
                  fontSize: 14,
                  color: colors.text.secondary,
                }}
              >
                ≈ ${token.usdValue} USD
              </Text>
            </View>

            {/* Network Badge */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 16,
              }}
            >
              <Shield size={14} color={colors.text.secondary} />
              <Text
                style={{
                  fontSize: 12,
                  color: colors.text.secondary,
                  marginLeft: 6,
                }}
              >
                {token.network}
              </Text>
            </View>

            {/* Description */}
            <Text
              style={{
                fontSize: 13,
                color: colors.text.secondary,
                marginBottom: 16,
                lineHeight: 18,
              }}
            >
              {token.description}
            </Text>

            {/* Withdrawal Disclaimer for LUKAS */}
            {token.symbol === 'LUKAS' && (
              <View
                style={{
                  backgroundColor: isDark ? '#78350f' : '#fef3c7',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: isDark ? '#92400e' : '#fbbf24',
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: isDark ? '#fbbf24' : '#92400e',
                    lineHeight: 18,
                    fontWeight: '600',
                  }}
                >
                  {t('tokens.withdrawalDisclaimer', '💡 Withdrawal available when balance is over 5 LUKAS')}
                </Text>
              </View>
            )}

            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                onPress={() => {
                  showInfo(
                    t('tokens.swapAvailable.title', 'Swaps Available'),
                    t('tokens.swapAvailable.message', 'Swaps are available IRL on Hash merchants')
                  );
                }}
                style={{
                  flex: 1,
                  backgroundColor: token.color,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  alignItems: 'center',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <ArrowRightLeft size={16} color="#fff" />
                  <Text
                    style={{
                      color: '#fff',
                      fontWeight: '600',
                      marginLeft: 6,
                      fontSize: 14,
                    }}
                  >
                    {t('tokens.swap')}
                  </Text>
                </View>
              </TouchableOpacity>
              {token.symbol === 'LUKAS' ? (
                <TouchableOpacity
                  onPress={() => setShowLukasModal(true)}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: token.color,
                    backgroundColor: `${token.color}10`,
                    alignItems: 'center',
                  }}
                >
                  <Info size={16} color={token.color} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.divider,
                    alignItems: 'center',
                  }}
                >
                  <ExternalLink size={16} color={colors.text.primary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
        </ScrollView>
        {showRightArrow && (
          <TouchableOpacity
            style={[styles.scrollArrow, styles.rightArrow]}
            onPress={() => scrollTo('right')}
          >
            <ChevronRight size={24} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* LUKAS Info Modal */}
      <Modal
        visible={showLukasModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowLukasModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: colors.background.paper,
              borderRadius: 20,
              padding: 24,
              width: '100%',
              maxWidth: 400,
              borderWidth: 1,
              borderColor: colors.divider,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 12,
              elevation: 8,
            }}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: '#8b5cf620',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 12,
                }}
              >
                <Text style={{ fontSize: 24 }}>💎</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 20,
                    fontWeight: '700',
                    color: '#8b5cf6',
                    marginBottom: 4,
                  }}
                >
                  {t('tokens.lukasInfo.title', 'What is LUKAS?')}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: colors.text.secondary,
                  }}
                >
                  LUKAS Token
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowLukasModal(false)}
                style={{
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: colors.background.default,
                }}
              >
                <X size={20} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View>
              <Text
                style={{
                  fontSize: 15,
                  color: colors.text.primary,
                  lineHeight: 22,
                  marginBottom: 20,
                }}
              >
                {t('tokens.lukasInfo.description', 'LUKAS is the digital currency of the HashPass ecosystem designed to reward user interactions and engagement.')}
              </Text>

              <View
                style={{
                  backgroundColor: colors.background.default,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 20,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    color: colors.text.secondary,
                    lineHeight: 22,
                  }}
                >
                  {t('tokens.lukasInfo.features', '• Earn LUKAS by accepting and scheduling meetings\n• Will be monetized in HashHouse\n• Swappable to other crypto tokens')}
                </Text>
              </View>

              {/* Withdrawal Disclaimer */}
              <View
                style={{
                  backgroundColor: '#fef3c7',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 20,
                  borderWidth: 1,
                  borderColor: '#fbbf24',
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: '#92400e',
                    lineHeight: 20,
                    fontWeight: '600',
                    marginBottom: 4,
                  }}
                >
                  ⚠️ Withdrawal Notice
                </Text>
                <Text
                  style={{
                    fontSize: 13,
                    color: '#92400e',
                    lineHeight: 20,
                  }}
                >
                  {t('tokens.lukasInfo.withdrawalDisclaimer', 'You can withdraw LUKAS tokens when your balance is over 5 LUKAS.')}
                </Text>
              </View>

              {/* Close Button */}
              <TouchableOpacity
                onPress={() => setShowLukasModal(false)}
                style={{
                  backgroundColor: '#8b5cf6',
                  paddingVertical: 14,
                  paddingHorizontal: 24,
                  borderRadius: 10,
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    color: '#fff',
                    fontSize: 16,
                    fontWeight: '600',
                  }}
                >
                  Got it
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const getStyles = (isDark: boolean, colors: any) => StyleSheet.create({
  scrollContainer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  scrollArrow: {
    position: 'absolute',
    zIndex: 1,
    backgroundColor: colors.background.paper,
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  leftArrow: {
    left: -10,
  },
  rightArrow: {
    right: -10,
  },
});

export default BlockchainTokensView;

