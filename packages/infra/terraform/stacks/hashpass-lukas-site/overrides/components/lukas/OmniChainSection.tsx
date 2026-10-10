import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTranslation } from '../../i18n/i18n';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Line } from 'react-native-svg';

export function OmniChainSection() {
  const { colors, isDark } = useTheme();
  const isMobile = useIsMobile();
  const { t } = useTranslation('lukas');

  // Each network icon gets its own pulse value (desynced via a per-index start delay)
  // rather than one shared value driving all four in lockstep — a more organic,
  // "alive" feel, matching the per-satellite animation-delay pattern already used by
  // LukasCoin.css. The vault gets a slower, independent breathing pulse of its own so
  // it reads as a distinct, central presence rather than just another orbiting node.
  const networkPulse0 = useSharedValue(1);
  const networkPulse1 = useSharedValue(1);
  const networkPulse2 = useSharedValue(1);
  const networkPulse3 = useSharedValue(1);
  const vaultPulse = useSharedValue(1);
  const networkPulses = [networkPulse0, networkPulse1, networkPulse2, networkPulse3];

  useEffect(() => {
    // Capped at 1.06 (was 1.1 pre-rework): still a visible pulse, but a smaller max
    // footprint keeps the orbit-clearance math below honest under worst-case scale.
    networkPulses.forEach((pulse, index) => {
      pulse.value = withDelay(
        index * 300,
        withRepeat(
          withSequence(
            withTiming(1.06, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
            withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        )
      );
    });

    vaultPulse.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 3400, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 3400, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      true
    );
  }, []);

  const styles = getStyles(isDark, colors, isMobile);

  // The SVG connecting lines need the networksContainer's REAL rendered size to find
  // its center. It previously assumed a fixed isMobile ? 150 : 200 half-size (i.e. a
  // ~300/400px box), but networksContainer is actually `width: '100%'` of a container
  // that can be up to maxWidth 1200 wide on desktop — so the assumed center sat far to
  // the left of the real one and every line pointed the wrong direction (visually
  // confirmed: the dashed line overshot well past the Solana node toward the left
  // edge on a 1280px viewport). The nodes themselves don't have this bug because they
  // get centered by real flexbox layout (alignItems/justifyContent: 'center'), not a
  // hardcoded pixel guess — so the lines need to track the same real layout via
  // onLayout instead of assuming a fixed box size.
  const [containerSize, setContainerSize] = useState({
    width: isMobile ? 300 : 400,
    height: isMobile ? 300 : 400,
  });
  const onNetworksLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setContainerSize({ width, height });
  };

  const networks = [
    { name: 'Ethereum', icon: 'Ξ', color: '#627EEA' },
    { name: 'Polygon', icon: '⬟', color: '#8247E5' },
    { name: 'Solana', icon: '◎', color: '#14F195' },
    { name: 'Base', icon: '⬬', color: '#0052FF' },
  ];

  // radiusX/radiusY form an ellipse rather than a circle. The vault sits dead center,
  // and the previous single `radius` (same value for both axes) put the top/bottom
  // network nodes (Base, Polygon at the two vertical extremes of the orbit) too close
  // to the vault's own top/bottom edge: vaultHalfHeight + nodeHalfHeight (icon circle +
  // gap + name label, at up to 1.06x pulse scale) exceeded the orbit radius on mobile,
  // and left only a thin, pulse-eaten margin on desktop — producing the real,
  // screenshot-confirmed "LUKAS Reserve" / "Polygon" text overlap. radiusY is widened
  // with a safety margin to guarantee clearance at full pulse scale; radiusX is left
  // at its original value since the horizontal (Ethereum/Solana) spacing already had
  // plenty of room and widening it too would risk clipping on narrow phones.
  const radiusX = isMobile ? 100 : 150;
  const radiusY = isMobile ? 130 : 170;

  // Positions are computed up front (not inline in the .map() below) so each node's
  // useAnimatedStyle can close over its own fixed {x, y} alongside its pulse value.
  // Critical: translateX/translateY and the pulse's scale must live in ONE transform
  // array. Passing them as separate style objects in the same `style={[...]}` array
  // (as the original pinned source did) doesn't merge: RN Web's style flattening lets
  // the later object's `transform` key fully overwrite the earlier one, so the pulse
  // style silently discarded the orbit position and collapsed every node (and their
  // name labels) onto the vault's center — this, not insufficient radius margin, was
  // the real cause of the screenshot-confirmed "LUKAS Reserve"/"Polygon" overlap,
  // confirmed via live bounding-box inspection (all four nodes rendering at near-
  // identical coordinates regardless of radius value).
  const nodePositions = networks.map((_, index) => {
    const angle = (index * 2 * Math.PI) / networks.length;
    return { x: Math.cos(angle) * radiusX, y: Math.sin(angle) * radiusY };
  });

  // Each node's animated style carries BOTH its fixed orbit translate and its own
  // pulse scale in the same transform array — see the comment above nodePositions
  // for why splitting them across two style objects silently drops the translate.
  const networkPulseStyle0 = useAnimatedStyle(() => ({
    transform: [{ translateX: nodePositions[0].x }, { translateY: nodePositions[0].y }, { scale: networkPulse0.value }],
  }));
  const networkPulseStyle1 = useAnimatedStyle(() => ({
    transform: [{ translateX: nodePositions[1].x }, { translateY: nodePositions[1].y }, { scale: networkPulse1.value }],
  }));
  const networkPulseStyle2 = useAnimatedStyle(() => ({
    transform: [{ translateX: nodePositions[2].x }, { translateY: nodePositions[2].y }, { scale: networkPulse2.value }],
  }));
  const networkPulseStyle3 = useAnimatedStyle(() => ({
    transform: [{ translateX: nodePositions[3].x }, { translateY: nodePositions[3].y }, { scale: networkPulse3.value }],
  }));
  const networkPulseStyles = [networkPulseStyle0, networkPulseStyle1, networkPulseStyle2, networkPulseStyle3];
  const vaultPulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: vaultPulse.value }] }));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('omnichain.title')}</Text>

      <View style={styles.visualizationContainer}>
        {/* Network Icons */}
        <View style={styles.networksContainer} onLayout={onNetworksLayout}>
          {networks.map((network, index) => (
            // networkPulseStyles[index] alone carries this node's full transform
            // (orbit translate + pulse scale) — see the nodePositions comment above.
            <Animated.View
              key={network.name}
              style={[styles.networkIcon, networkPulseStyles[index]]}
            >
              <View style={[styles.networkCircle, { borderColor: network.color }]}>
                <Text style={[styles.networkIconText, { color: network.color }]}>
                  {network.icon}
                </Text>
              </View>
              <Text style={styles.networkName}>{network.name}</Text>
            </Animated.View>
          ))}
        </View>

        {/* Central Vault */}
        <View style={styles.vaultContainer}>
          <Animated.View style={[styles.vault, vaultPulseStyle]}>
            <Text style={styles.vaultIcon}>🔐</Text>
            <Text style={styles.vaultLabel}>{t('omnichain.vaultLabel')}</Text>
          </Animated.View>
        </View>

        {/* Connecting Lines */}
        <Svg
          style={StyleSheet.absoluteFill}
          width="100%"
          height="100%"
        >
          {networks.map((network, index) => {
            const angle = (index * 2 * Math.PI) / networks.length;
            // Real center from onLayout — see the containerSize comment above for why
            // this can't be a fixed pixel guess.
            const centerX = containerSize.width / 2;
            const centerY = containerSize.height / 2;
            const startX = centerX;
            const startY = centerY;
            const endX = centerX + Math.cos(angle) * radiusX;
            const endY = centerY + Math.sin(angle) * radiusY;

            return (
              <Line
                key={`line-${index}`}
                x1={startX}
                y1={startY}
                x2={endX}
                y2={endY}
                stroke={network.color}
                strokeWidth="2"
                strokeDasharray="5,5"
                opacity={0.4}
              />
            );
          })}
        </Svg>
      </View>

      {/* Features */}
      <View style={styles.featuresContainer}>
        <View style={styles.feature}>
          <Text style={styles.featureIcon}>🌐</Text>
          <Text style={styles.featureText}>{t('omnichain.feature1')}</Text>
        </View>
        <View style={styles.feature}>
          <Text style={styles.featureIcon}>🔍</Text>
          <Text style={styles.featureText}>{t('omnichain.feature2')}</Text>
        </View>
        <View style={styles.feature}>
          <Text style={styles.featureIcon}>📊</Text>
          <Text style={styles.featureText}>{t('omnichain.feature3')}</Text>
        </View>
      </View>
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any, isMobile: boolean) => StyleSheet.create({
  container: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
  title: {
    fontSize: isMobile ? 32 : 48,
    fontWeight: '800',
    color: isDark ? '#F9FAFB' : '#111827',
    textAlign: 'center',
    marginBottom: isMobile ? 40 : 60,
    letterSpacing: -0.5,
  },
  visualizationContainer: {
    // Enlarged (was 300/400) to fit the widened vertical orbit (radiusY) plus the
    // network node's own height at full pulse scale, so nothing bleeds into the
    // featuresContainer below it.
    height: isMobile ? 360 : 460,
    width: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: isMobile ? 40 : 60,
  },
  networksContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  networkIcon: {
    position: 'absolute',
    alignItems: 'center',
    gap: 8,
  },
  networkCircle: {
    width: isMobile ? 60 : 80,
    height: isMobile ? 60 : 80,
    borderRadius: 999,
    borderWidth: 3,
    backgroundColor: isDark ? 'rgba(17, 24, 39, 0.8)' : 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  networkIconText: {
    fontSize: isMobile ? 24 : 32,
    fontWeight: '800',
  },
  networkName: {
    fontSize: isMobile ? 12 : 14,
    fontWeight: '600',
    color: isDark ? '#9CA3AF' : '#6B7280',
    marginTop: 4,
  },
  vaultContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    // Painted after networksContainer in source order (so it's already on top), plus
    // an explicit zIndex/elevation as defense-in-depth against any residual overlap —
    // same belt-and-suspenders approach as the Hero coin's `overflow: hidden` fix.
    zIndex: 10,
    elevation: 10,
  },
  vault: {
    width: isMobile ? 120 : 160,
    height: isMobile ? 120 : 160,
    borderRadius: 20,
    backgroundColor: isDark ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)',
    borderWidth: 3,
    borderColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: '#22C55E',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  vaultIcon: {
    fontSize: isMobile ? 48 : 64,
  },
  vaultLabel: {
    fontSize: isMobile ? 14 : 18,
    fontWeight: '700',
    color: '#22C55E',
    textAlign: 'center',
  },
  featuresContainer: {
    flexDirection: isMobile ? 'column' : 'row',
    gap: 20,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: isDark ? 'rgba(17, 24, 39, 0.5)' : 'rgba(249, 250, 251, 0.8)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)',
  },
  featureIcon: {
    fontSize: 24,
  },
  featureText: {
    fontSize: isMobile ? 14 : 16,
    fontWeight: '600',
    color: isDark ? '#E5E7EB' : '#1F2937',
  },
});
