import english from '../i18n/locales/en.json';
import { uiTokens, uiPalette } from '@hashpass/ui/tokens';
import LandingBadge from './LandingBadge';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, useAnimatedReaction, withTiming, withDelay, withRepeat, withSequence, cancelAnimation, type SharedValue } from 'react-native-reanimated';
import { Maximize2 as LucideExpand } from 'lucide';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../i18n/i18n';
import { useAnimationLevel } from '../contexts/AnimationLevelContext';
import HowItWorksIllustration, { type HowItWorksCardId, type HowItWorksSceneLabels } from './HowItWorksIllustration';
import { MorphIcon } from '../lib/morph-icon';
const cards: { id: HowItWorksCardId; accent: string }[] = [
  { id: 'scan', accent: '#06b6d4' }, { id: 'allies', accent: '#a855f7' },
  { id: 'meet', accent: '#22c55e' }, { id: 'rewards', accent: '#f59e0b' },
];
type Position = { scrollY: SharedValue<number>; sectionY: SharedValue<number>; gridY: SharedValue<number> };
function Card({ card, index, width, dark, animate, position }: { card: typeof cards[number]; index: number; width: number; dark: boolean; animate: boolean; position: Position }) {
  const { t } = useTranslation('index'); const { height } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const labels: HowItWorksSceneLabels = {
    eventPass: t('howItWorks.scenes.eventPass', 'EVENT PASS'), eventExplorer: t('howItWorks.scenes.eventExplorer', 'EVENT EXPLORER'),
    agenda: t('howItWorks.scenes.agenda', 'AGENDA'), speakers: t('howItWorks.scenes.speakers', 'SPEAKERS'),
    findAttendees: t('howItWorks.scenes.findAttendees', 'FIND ATTENDEES'), meet: t('howItWorks.scenes.meet', 'MEET'),
    lksWallet: t('howItWorks.scenes.lksWallet', '$LKS WALLET'), availableBalance: t('howItWorks.scenes.availableBalance', 'AVAILABLE BALANCE'),
  };
  const top = useSharedValue(-1); const bottom = useSharedValue(0); const entered = useSharedValue(false);
  const reveal = useSharedValue(1); const float = useSharedValue(0);
  useAnimatedReaction(() => {
    const absolute = position.sectionY.value + position.gridY.value + top.value;
    return position.sectionY.value >= 0 && position.gridY.value >= 0 && top.value >= 0 && absolute < position.scrollY.value + height - 32 && absolute + bottom.value > position.scrollY.value;
  }, (visible, previous) => {
    if (!animate) { reveal.value = 1; float.value = 0; return; }
    if (visible && !entered.value) {
      entered.value = true; reveal.value = 0;
      reveal.value = withDelay(index % 3 * 70, withTiming(1, { duration: 520 }));
    }
    if (visible === previous) return;
    cancelAnimation(float);
    float.value = visible ? withRepeat(withSequence(withTiming(-4, { duration: 1900 }), withTiming(0, { duration: 1900 })), -1, false) : 0;
  }, [animate, height, index]);
  useEffect(() => () => { cancelAnimation(float); cancelAnimation(reveal); }, [float, reveal]);
  const entrance = useAnimatedStyle(() => ({ opacity: animate ? reveal.value : 1, transform: [{ translateY: animate ? (1 - reveal.value) * 22 : 0 }] }));
  const illustration = useAnimatedStyle(() => ({ transform: [{ translateY: animate ? float.value : 0 }] }));
  return <Animated.View onLayout={event => { top.value = event.nativeEvent.layout.y; bottom.value = event.nativeEvent.layout.height; }}
    style={[styles.card, { width, height: expanded ? undefined : 338, backgroundColor: uiPalette(dark).surface, borderColor: uiPalette(dark).border }, entrance]}>
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[styles.illustration, { backgroundColor: `${card.accent}${dark ? '12' : '0d'}` }]}>
      <Animated.View style={illustration}><HowItWorksIllustration kind={card.id} color={card.accent} labels={labels} /></Animated.View>
    </View>
    <View style={styles.cardHeader}>
      <Text accessibilityRole="header" style={[styles.title, { color: uiPalette(dark).text }]}>{t(`howItWorks.cards.${card.id}.title`, english.index.howItWorks.cards[card.id].title)}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={expanded ? t('howItWorks.closeInfo', 'Close information') : t('howItWorks.moreInfo', 'More information')} accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={[styles.infoButton, { borderColor: uiPalette(dark).border, backgroundColor: 'transparent' }]}>
        <View style={expanded ? { transform: [{ rotate: '180deg' }] } : undefined}>
          <MorphIcon icon={LucideExpand} size={16} color={uiPalette(dark).muted} strokeWidth={1.8} spring="snappy" fallbackIconName={expanded ? 'contract-outline' : 'expand-outline'} />
        </View>
      </TouchableOpacity>
    </View>
    <View style={styles.detail}>{expanded ? <Animated.View entering={animate ? FadeIn.duration(220) : undefined} style={[styles.detailPanel, { backgroundColor: uiPalette(dark).raised }]}><Text style={[styles.body, { color: uiPalette(dark).muted }]}>{t(`howItWorks.cards.${card.id}.description`, english.index.howItWorks.cards[card.id].description)}</Text></Animated.View> : null}</View>
  </Animated.View>;
}
export default function HowItWorks({ scrollY }: { scrollY?: SharedValue<number> }) {
  const { isDark } = useTheme(); const { t } = useTranslation('index');
  const { animationLevel } = useAnimationLevel(); const { width, height } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  const fallbackScroll = useSharedValue(0); const sectionY = useSharedValue(-1); const sectionHeight = useSharedValue(0); const gridY = useSharedValue(-1);
  const sectionReveal = useSharedValue(1); const sectionEntered = useSharedValue(false);
  const available = Math.max(0, Math.min(width - 40, 1340));
  const columns = width <= 600 ? 1 : width <= 1000 ? 2 : 3;
  const cardWidth = Math.max(0, (available - (columns - 1) * 22) / columns);
  const position = { scrollY: scrollY ?? fallbackScroll, sectionY, gridY };
  const animate = animationLevel === 'full' && !reduceMotion;
  useAnimatedReaction(() => {
    const top = sectionY.value;
    return top >= 0 && top < position.scrollY.value + height - 32 && top + sectionHeight.value > position.scrollY.value;
  }, visible => {
    if (!animate) { sectionReveal.value = 1; return; }
    if (!visible && !sectionEntered.value) { sectionReveal.value = 0; return; }
    if (visible && !sectionEntered.value) {
      sectionEntered.value = true;
      sectionReveal.value = withTiming(1, { duration: 620 });
    }
  }, [animate, height]);
  const sectionEntrance = useAnimatedStyle(() => ({
    opacity: animate ? sectionReveal.value : 1,
    transform: [{ translateY: animate ? (1 - sectionReveal.value) * 28 : 0 }],
  }));
  return <View onLayout={event => { sectionY.value = event.nativeEvent.layout.y; sectionHeight.value = event.nativeEvent.layout.height; }}>
    <Animated.View style={[styles.section, sectionEntrance]}>
    <LandingBadge>{t('howItWorks.badge', 'How it works')}</LandingBadge>
    <Text accessibilityRole="header" style={[styles.heading, { color: uiPalette(isDark).text }]}>{t('howItWorks.title', 'How HASHPASS Works')}</Text>
    <Text style={[styles.subtitle, { color: uiPalette(isDark).muted }]}>{t('howItWorks.subtitle', 'One pass, one login, every event — built for speed and privacy.')}</Text>
    <View style={styles.grid} onLayout={event => { gridY.value = event.nativeEvent.layout.y; }}>
      {cards.map((card, index) => <Card key={card.id} card={card} index={index} dark={isDark} animate={animate} position={position} width={columns === 3 && index === 3 ? Math.min(640, available) : cardWidth} />)}
    </View>
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({
  section: { paddingHorizontal: 20, paddingVertical: 64, alignItems: 'center' },
  heading: { fontSize: 32, fontWeight: '800', lineHeight: 38, letterSpacing: -1, textAlign: 'center', marginVertical: 16 },
  subtitle: { fontSize: 17, lineHeight: 27, textAlign: 'center', maxWidth: 760, marginBottom: 40 },
  grid: { width: '100%', maxWidth: 1340, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 22 },
  card: { borderWidth: 1, borderRadius: uiTokens.radius.card, padding: 22, minHeight: 338 },
  illustration: { height: 136, borderRadius: uiTokens.radius.card, alignItems: 'center', justifyContent: 'center', marginBottom: 20, overflow: 'hidden' },
  cardHeader: { minHeight: 32, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.5, textAlign: 'center' },
  infoButton: { position: 'absolute', right: -8, width: 44, height: 44, borderWidth: 1, borderRadius: uiTokens.radius.circle, alignItems: 'center', justifyContent: 'center' },
  detail: { minHeight: 104, paddingTop: 16 },
  detailPanel: { padding: 12, borderRadius: uiTokens.radius.media },
  body: { fontSize: 16, lineHeight: 26, textAlign: 'center' },
});
