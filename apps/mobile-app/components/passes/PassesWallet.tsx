import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { MaterialIcons } from '../../lib/vector-icons';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../i18n/i18n';
import { passSystemService, type PassInfo } from '../../lib/pass-system';
import {
  buildWalletPasses,
  countWalletPasses,
  filterWalletPasses,
  MAX_VISIBLE_STACK,
  type PassTimelineFilter,
  type PassTypeFilter,
  type WalletPass,
} from '../../lib/pass-wallet';
import { getSelectEventCardWatermark } from '../../lib/event-branding';
import UnifiedSearchAndFilter from '../UnifiedSearchAndFilter';
import PassWalletCard, { PASS_CARD_HEIGHT, PASS_CARD_WIDTH } from './PassWalletCard';

interface PassesWalletProps {
  /**
   * Restrict the wallet to specific events. Omit (the default) to show every
   * pass the signed-in user holds -- which is the point of the wallet: a BSL
   * attendee holds passes for several tour stops, and the main-tenant
   * explorer previously showed "No passes found" purely because it scoped the
   * lookup to the tenant's own placeholder event.
   */
  eventIds?: string[];
  refreshTrigger?: number;
  onPassesLoaded?: (passes: PassInfo[]) => void;
  layout?: 'stacked' | 'plain';
}

// How far each card behind the front one peeks out to the right, and how much
// it shrinks. These two numbers set the deck's fixed footprint, which is the
// point of the stack: the section occupies the same space whether you hold one
// pass or ten, so the explore screen never grows an unbounded scroll of
// tickets.
//
// Note the two work against each other: scaling shrinks a card toward its
// centre, pulling its right edge back in by roughly (step * width / 2). At
// 340px wide that's ~7px per step, so the offset has to clear it for the card
// behind to peek out at all.
const STACK_OFFSET_X = 26;
const STACK_SCALE_STEP = 0.04;
const PASS_LOAD_TIMEOUT_MS = 12_000;

const PassesWallet: React.FC<PassesWalletProps> = ({
  eventIds,
  refreshTrigger,
  onPassesLoaded,
  layout = 'stacked',
}) => {
  const { colors, isDark } = useTheme();
  const { dbUserId } = useAuth();
  const { t } = useTranslation('passes');
  const { width: windowWidth } = useWindowDimensions();

  const [passes, setPasses] = useState<PassInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [filteredPasses, setFilteredPasses] = useState<WalletPass[]>([]);
  // UnifiedSearchAndFilter reports its result in an effect, so filteredPasses
  // is legitimately empty for one frame after mount. Without this flag that
  // frame renders "No passes match your filters" at someone who hasn't
  // filtered anything.
  const [hasFilterResult, setHasFilterResult] = useState(false);
  // Which card the user pulled to the front. Stored as an id rather than a
  // reordered array so it stays correct when filtering changes the set.
  const [frontId, setFrontId] = useState<string | null>(null);

  const eventIdsKey = eventIds?.join(',');

  useEffect(() => {
    let active = true;
    let identityTimeout: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      setLoadError(false);
      setLoadTimedOut(false);
      if (!dbUserId) {
        // No Supabase identity yet (the Better Auth -> Supabase bridge may
        // still be in flight right after sign-in). Stay in the loading state
        // rather than flashing "no passes" at someone who has them.
        setPasses([]);
        setLoading(true);
        identityTimeout = setTimeout(() => {
          if (!active) return;
          setLoading(false);
          setLoadTimedOut(true);
        }, PASS_LOAD_TIMEOUT_MS);
        return;
      }

      setLoading(true);
      let requestTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const scopedIds = eventIdsKey ? eventIdsKey.split(',').filter(Boolean) : undefined;
        const request = scopedIds?.length
          ? passSystemService.getUserPassesForEvents(dbUserId, scopedIds)
          : passSystemService.getAllUserPasses(dbUserId);
        const result = await Promise.race([
          request,
          new Promise<never>((_, reject) => {
            requestTimeout = setTimeout(
              () => reject(new Error('PASS_LOAD_TIMEOUT')),
              PASS_LOAD_TIMEOUT_MS,
            );
          }),
        ]);
        if (!active) return;
        setPasses(result);
        onPassesLoaded?.(result);
      } catch (error) {
        console.error('Error loading pass wallet:', error);
        if (active) {
          setPasses([]);
          if (error instanceof Error && error.message === 'PASS_LOAD_TIMEOUT') {
            setLoadTimedOut(true);
          } else {
            setLoadError(true);
          }
        }
      } finally {
        if (requestTimeout) clearTimeout(requestTimeout);
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
      if (identityTimeout) clearTimeout(identityTimeout);
    };
    // onPassesLoaded is intentionally excluded: callers pass inline callbacks
    // and re-running the whole load on every parent render would thrash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbUserId, refreshTrigger, eventIdsKey, retryNonce]);

  const walletPasses: WalletPass[] = useMemo(() => buildWalletPasses(passes), [passes]);
  const counts = useMemo(() => countWalletPasses(walletPasses), [walletPasses]);

  const handleFilteredData = useCallback((next: WalletPass[]) => {
    setFilteredPasses(next);
    setHasFilterResult(true);
    setFrontId(null);
  }, []);

  const handleSearchChange = useCallback(() => {}, []);

  const handleRetry = useCallback(() => {
    setHasFilterResult(false);
    setLoadError(false);
    setLoadTimedOut(false);
    setLoading(true);
    setRetryNonce((current) => current + 1);
  }, []);

  const customFilterLogic = useCallback(
    (data: WalletPass[], filters: { [key: string]: any }, searchQuery: string) =>
      filterWalletPasses(data, {
        query: searchQuery,
        timeline: (filters.timeline as PassTimelineFilter) || 'all',
        passType: (filters.passType as PassTypeFilter) || 'all',
      }),
    []
  );

  const filterGroups = useMemo(
    () => [
      {
        key: 'timeline',
        label: t('wallet.filter.when', 'When'),
        type: 'single' as const,
        options: [
          { key: 'live', label: t('wallet.timeline.live', 'Happening now'), icon: 'sensors' },
          { key: 'upcoming', label: t('wallet.timeline.upcoming', 'Upcoming'), icon: 'event-available' },
          { key: 'past', label: t('wallet.timeline.past', 'Past event'), icon: 'history' },
        ],
      },
      {
        key: 'passType',
        label: t('wallet.filter.passType', 'Pass type'),
        type: 'single' as const,
        options: [
          { key: 'general', label: t('type.general', 'General'), icon: 'confirmation-number' },
          { key: 'business', label: t('type.business', 'Business'), icon: 'business-center' },
          { key: 'vip', label: t('type.vip', 'VIP'), icon: 'star' },
        ],
      },
    ],
    [t]
  );

  // Fixed order the pagination row is measured against. Deliberately never
  // reordered by which card is in front -- that's what makes the active dot
  // actually move (see stableIndex below) instead of always landing on the
  // first dot, which is what happened when the indicator was derived from
  // `deck` itself.
  const stableOrder: WalletPass[] = hasFilterResult ? filteredPasses : walletPasses;

  // Draw order for the stack: whichever card was last tapped sits in front,
  // everything else keeps stableOrder. Deriving this rather than storing a
  // whole array keeps it correct when filtering changes the set.
  const deck: WalletPass[] = useMemo(() => {
    if (!frontId) return stableOrder;
    const promoted = stableOrder.find((pass) => pass.id === frontId);
    if (!promoted) return stableOrder;
    return [promoted, ...stableOrder.filter((pass) => pass.id !== frontId)];
  }, [stableOrder, frontId]);

  const activeIndex = Math.max(
    0,
    stableOrder.findIndex((pass) => pass.id === (frontId ?? stableOrder[0]?.id))
  );

  const goToOffset = useCallback(
    (delta: number) => {
      if (stableOrder.length < 2) return;
      const nextIndex = (activeIndex + delta + stableOrder.length) % stableOrder.length;
      setFrontId(stableOrder[nextIndex].id);
    },
    [activeIndex, stableOrder]
  );

  const visibleDeck = deck.slice(0, MAX_VISIBLE_STACK);
  const stackDepth = Math.max(0, visibleDeck.length - 1);
  // The peeking cards extend the deck to the right, so they have to come out
  // of the card's own width -- otherwise the stack overflows the section on a
  // narrow phone.
  const cardWidth = Math.min(PASS_CARD_WIDTH, windowWidth - 48 - stackDepth * STACK_OFFSET_X);
  const deckWidth = cardWidth + stackDepth * STACK_OFFSET_X;

  if (loading) {
    return <WalletSkeleton colors={colors} label={t('loading', 'Loading your pass information...')} width={cardWidth} />;
  }

  // Nothing at all — distinct from "your filters matched nothing", which is a
  // recoverable state and shouldn't suggest contacting support.
  if (!walletPasses.length) {
    const fallbackTitle = loadTimedOut
      ? t('loadTimeoutTitle', 'Passes took too long to load')
      : loadError
        ? t('loadErrorTitle', 'Unable to load your passes')
        : !dbUserId
          ? t('sessionPendingTitle', 'Your pass session is still loading')
          : t('noPassFound', 'No passes found');
    const fallbackMessage = loadTimedOut
      ? t('loadTimeoutMessage', 'Check your connection and try again.')
      : loadError
        ? t('loadErrorMessage', 'We could not reach your pass information right now.')
        : !dbUserId
          ? t('sessionPendingMessage', 'Your account is still being connected. Try again in a moment.')
          : t('contactSupport', 'Contact support to get your event passes');

    return (
      <View
        style={{
          backgroundColor: colors.background.paper,
          borderRadius: 20,
          borderWidth: 1,
          borderColor: colors.divider,
          paddingVertical: 34,
          paddingHorizontal: 24,
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        <Image
          source={getSelectEventCardWatermark(isDark)}
          style={{
            position: 'absolute',
            right: -30,
            bottom: -18,
            width: 170,
            height: 110,
            opacity: isDark ? 0.1 : 0.07,
          }}
          resizeMode="contain"
        />
        <MaterialIcons name="confirmation-number" size={40} color={colors.text.disabled} />
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text.primary, marginTop: 12 }}>
          {fallbackTitle}
        </Text>
        <Text
          style={{
            fontSize: 12,
            color: colors.text.secondary,
            marginTop: 6,
            textAlign: 'center',
            lineHeight: 18,
          }}
        >
          {fallbackMessage}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('tryAgain', 'Try again')}
          onPress={handleRetry}
          style={{
            marginTop: 16,
            paddingHorizontal: 18,
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor: colors.primary,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
            {t('tryAgain', 'Try again')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // BSL intentionally keeps the legacy flat row: its tenant currently has
  // only two tour-stop passes, so a stack/search/filter surface adds motion
  // and controls without helping the attendee. The main hashpass.tech tenant
  // continues to use the stacked 3D wallet below.
  if (layout === 'plain') {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 20 }}
      >
        {walletPasses.map((pass) => (
          <View key={pass.id} style={{ width: cardWidth, marginRight: 16 }}>
            <PassWalletCard pass={pass} />
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <View>
      {/* Summary strip */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
        <WalletStat colors={colors} value={counts.total} label={t('wallet.stat.total', 'Passes')} />
        <WalletStat
          colors={colors}
          value={counts.live + counts.upcoming}
          label={t('wallet.stat.active', 'Upcoming')}
          accent="#34A853"
        />
        <WalletStat colors={colors} value={counts.past} label={t('wallet.stat.past', 'Past')} />
      </View>

      {/* Search + filters. Same bar the agenda, notifications and my-requests
          screens use, so filtering behaves identically everywhere. */}
      <View style={{ marginHorizontal: -20 }}>
        <UnifiedSearchAndFilter<WalletPass>
          data={walletPasses}
          onFilteredData={handleFilteredData}
          onSearchChange={handleSearchChange}
          searchPlaceholder={t('wallet.searchPlaceholder', 'Search your passes')}
          filterGroups={filterGroups}
          customFilterLogic={customFilterLogic}
          showResultsCount={false}
        />
      </View>

      {deck.length === 0 ? (
        <View style={{ paddingVertical: 34, alignItems: 'center' }}>
          <MaterialIcons name="search-off" size={32} color={colors.text.disabled} />
          <Text style={{ fontSize: 13, color: colors.text.secondary, marginTop: 10 }}>
            {t('wallet.noMatches', 'No passes match your filters')}
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: 10 }}>
          <View style={{ height: PASS_CARD_HEIGHT, width: deckWidth, alignSelf: 'center' }}>
            {/* Painted back-to-front so the front card is the last child:
                Android ignores zIndex in enough cases that document order is
                the only reliable stacking signal. */}
            {visibleDeck
              .map((pass, position) => ({ pass, position }))
              .reverse()
              .map(({ pass, position }) => (
                <StackedCard
                  key={pass.id}
                  pass={pass}
                  position={position}
                  width={cardWidth}
                  onBringToFront={() => setFrontId(pass.id)}
                />
              ))}
          </View>

          {deck.length > 1 && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                marginTop: 14,
              }}
            >
              <TouchableOpacity onPress={() => goToOffset(-1)} hitSlop={8} style={{ padding: 4 }}>
                <MaterialIcons name="chevron-left" size={22} color={colors.text.secondary} />
              </TouchableOpacity>

              {stableOrder.map((pass, index) => (
                <Pressable
                  key={pass.id}
                  onPress={() => setFrontId(pass.id)}
                  hitSlop={6}
                  style={{
                    width: index === activeIndex ? 18 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: index === activeIndex ? pass.accentColor : colors.divider,
                  }}
                />
              ))}

              <TouchableOpacity onPress={() => goToOffset(1)} hitSlop={8} style={{ padding: 4 }}>
                <MaterialIcons name="chevron-right" size={22} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>
          )}

          <Text
            style={{
              fontSize: 11,
              color: colors.text.disabled,
              textAlign: 'center',
              marginTop: 8,
            }}
          >
            {deck.length > 1
              ? t('wallet.stackHint', 'Tap a card behind to bring it forward')
              : `${deck[0].eventName}`}
          </Text>
        </View>
      )}
    </View>
  );
};

/**
 * One card in the deck. Owns its own spring so a card promoted to the front
 * animates from wherever it was rather than snapping, which is what sells the
 * stack as physical rather than as a list that reordered.
 */
const StackedCard: React.FC<{
  pass: WalletPass;
  position: number;
  width: number;
  onBringToFront: () => void;
}> = ({ pass, position, width, onBringToFront }) => {
  const offset = useSharedValue(position);
  const isFront = position === 0;

  useEffect(() => {
    offset.value = withSpring(position, { damping: 18, stiffness: 160, mass: 0.7 });
  }, [offset, position]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: offset.value * STACK_OFFSET_X },
      { scale: 1 - offset.value * STACK_SCALE_STEP },
    ],
    opacity: 1 - offset.value * 0.12,
  }));

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          width,
          height: PASS_CARD_HEIGHT,
          zIndex: MAX_VISIBLE_STACK - position,
        },
        style,
      ]}
    >
      <PassWalletCard pass={pass} interactive={isFront} />

      {/* Cards behind are a single tap target: their own buttons must not fire
          from a tap whose only intent was "bring this one forward". */}
      {!isFront && (
        <Pressable
          onPress={onBringToFront}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 16 }}
        />
      )}
    </Animated.View>
  );
};

const WalletStat: React.FC<{
  colors: any;
  value: number;
  label: string;
  accent?: string;
}> = ({ colors, value, label, accent }) => (
  <View
    style={{
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: colors.background.paper,
      borderWidth: 1,
      borderColor: colors.divider,
    }}
  >
    <Text style={{ fontSize: 18, fontWeight: '800', color: accent || colors.text.primary }}>{value}</Text>
    <Text style={{ fontSize: 10, color: colors.text.secondary, marginTop: 1 }} numberOfLines={1}>
      {label}
    </Text>
  </View>
);

const WalletSkeleton: React.FC<{ colors: any; label: string; width: number }> = ({
  colors,
  label,
  width,
}) => {
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    pulse.value = withTiming(1, { duration: 900 });
  }, [pulse]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={{ fontSize: 12, color: colors.text.secondary }}>{label}</Text>
      </View>
      <Animated.View
        style={[
          {
            width,
            height: PASS_CARD_HEIGHT,
            alignSelf: 'center',
            borderRadius: 16,
            backgroundColor: colors.background.paper,
            borderWidth: 1,
            borderColor: colors.divider,
          },
          style,
        ]}
      />
    </View>
  );
};

export default PassesWallet;
