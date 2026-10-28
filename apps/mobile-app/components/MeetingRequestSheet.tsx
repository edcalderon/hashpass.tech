import React, { useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { ActionButton, Badge, FormField, Surface } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { useTheme } from '../hooks/useTheme';
import { useTranslation } from '../i18n/i18n';
import { MaterialIcons } from '../lib/vector-icons';
import { COFFEE_DURATIONS, meetingDurationMinutes, SPEED_BASE_MINUTES } from '../lib/meeting-rules';
import DrawerSheet from './ui/DrawerSheet';
import type { BoostBarProps, BoostTierId, MeetingRequestSheetProps } from './MeetingRequestSheet.types';

export type { BoostTierId } from './MeetingRequestSheet.types';

export const MEETING_INTENTIONS = [
  { id: 'coffee', icon: 'coffee' },
  { id: 'pitch', icon: 'lightbulb' },
  { id: 'advice', icon: 'forum' },
  { id: 'collaboration', icon: 'group' },
  { id: 'networking', icon: 'explore' },
] as const;
export const MAX_INTENTIONS = 3;
/** Most points one request can carry; the balance can be smaller. */
export const MAX_BOOST_PER_REQUEST = 50;
/** Points added by one press of the +/- buttons or one accessibility step. */
export const BOOST_STEP = 5;

/** Priority tiers by points spent; `from` is the first point of each tier. */
export const BOOST_TIERS = [
  { id: 'standard', from: 0 },
  { id: 'boosted', from: 1 },
  { id: 'priority', from: 10 },
  { id: 'high', from: 25 },
  { id: 'top', from: 50 },
] as const;

/** Upper end of the boost bar: the balance, capped per request. */
export function boostMax(remainingBoost: number): number {
  if (!Number.isFinite(remainingBoost) || remainingBoost <= 0) return 0;
  return Math.min(MAX_BOOST_PER_REQUEST, Math.floor(remainingBoost));
}

export function clampBoost(points: number, max: number): number {
  if (!Number.isFinite(points)) return 0;
  return Math.max(0, Math.min(max, Math.round(points)));
}

export function boostTier(points: number): BoostTierId {
  let tier: BoostTierId = 'standard';
  for (const candidate of BOOST_TIERS) if (points >= candidate.from) tier = candidate.id;
  return tier;
}

/** Points under a pointer `x` px into a bar `width` px wide (0 when it has no width yet). */
export function boostFromPosition(x: number, width: number, max: number): number {
  if (width <= 0 || max <= 0) return 0;
  return clampBoost((x / width) * max, max);
}

const THUMB = 28;
const TRACK = 10;
const TINT_LIGHT = '24';
const TINT_DARK = '38';

/**
 * Continuous boost input: drag or tap the bar for any whole number of points, with tier marks at
 * the priority thresholds. Position follows the value directly (no animation), so it is
 * reduced-motion safe by construction.
 */
function BoostBar({ value, max, onChange, label, valueText }: BoostBarProps) {
  const { isDark } = useTheme();
  const palette = uiPalette(isDark ? 'dark' : 'light');
  const [width, setWidth] = useState(0);
  // Pan callbacks outlive renders, so they read the current inputs through a ref.
  const live = useRef({ width: 0, max, value, onChange });
  live.current = { width: Math.max(0, width - THUMB), max, value, onChange };
  const grabX = useRef(0);

  const pan = useMemo(() => {
    const move = (x: number) => {
      const { width: span, max: top, onChange: emit } = live.current;
      emit(boostFromPosition(x - THUMB / 2, span, top));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        grabX.current = event.nativeEvent.locationX;
        move(grabX.current);
      },
      onPanResponderMove: (_event, gesture) => move(grabX.current + gesture.dx),
    });
  }, []);

  const step = (direction: 1 | -1) => {
    const { value: current, max: top, onChange: emit } = live.current;
    emit(clampBoost(current + direction * Math.min(BOOST_STEP, top), top));
  };
  const keyboard = Platform.OS === 'web'
    ? {
        onKeyDown: (event: { key: string; preventDefault: () => void }) => {
          const direction = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1
            : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
          if (direction === 0) return;
          event.preventDefault();
          const { value: current, max: top, onChange: emit } = live.current;
          emit(clampBoost(current + direction, top));
        },
      }
    : {};

  const percent = max > 0 ? (value / max) * 100 : 0;
  const ticks = BOOST_TIERS.filter((tier) => tier.from > 0 && tier.from <= max);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View
      style={styles.bar}
      onLayout={onLayout}
      accessible
      focusable
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: value, text: valueText }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => step(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
      testID="meeting-boost-bar"
      {...keyboard}
      {...pan.panHandlers}
    >
      <View style={styles.barInner} pointerEvents="none">
        <View style={[styles.track, { backgroundColor: palette.border }]} />
        <View style={[styles.fill, { width: `${percent}%`, backgroundColor: palette.accent }]} />
        {ticks.map((tier) => {
          const reached = value >= tier.from;
          return (
            <View
              key={tier.id}
              style={[styles.tick, {
                left: `${(tier.from / max) * 100}%`,
                backgroundColor: reached ? palette.onAccent : palette.muted,
              }]}
            />
          );
        })}
        <View
          style={[styles.thumb, {
            left: `${percent}%`,
            backgroundColor: palette.raised,
            borderColor: palette.accent,
          }]}
        />
      </View>
    </View>
  );
}

export default function MeetingRequestSheet({
  open, onClose, speakerName, message, onMessageChange, intentions, onIntentionsChange,
  boostAmount, onBoostChange, remainingBoost, submitting, onSubmit,
  meetingType, onMeetingTypeChange, coffeeMinutes, onCoffeeMinutesChange, coffeeAllowed,
  onCoffeeLockedPress,
}: MeetingRequestSheetProps) {
  const { isDark } = useTheme();
  const { t } = useTranslation('networking');
  const mode = isDark ? 'dark' : 'light';
  const palette = uiPalette(mode);
  const hues = uiTokens.intention[mode];
  const tint = isDark ? TINT_DARK : TINT_LIGHT;
  const max = boostMax(remainingBoost);
  const points = clampBoost(boostAmount, max);
  const boosted = points > 0;
  const tier = boostTier(points);
  const full = intentions.length >= MAX_INTENTIONS;
  const coffee = meetingType === 'coffee' && coffeeAllowed;
  const duration = meetingDurationMinutes(coffee ? 'coffee' : 'speed', points, coffeeMinutes);
  const tierTitle = t(`meetingRequestModal.boostTier.${tier}.title`);
  const ticks = BOOST_TIERS.filter((candidate) => candidate.from > 0 && candidate.from <= max);

  const toggleIntention = (id: string) => {
    if (intentions.includes(id)) onIntentionsChange(intentions.filter((item) => item !== id));
    else if (!full) onIntentionsChange([...intentions, id]);
  };

  return (
    <DrawerSheet
      open={open}
      onClose={onClose}
      defaultHeight="medium"
      title={t('meetingRequestModal.title', { speakerName })}
      closeLabel={t('meetingRequestModal.cancel')}
      footer={
        <ActionButton
          mode={mode}
          label={submitting ? t('meetingRequestModal.sending') : t('meetingRequestModal.sendRequest')}
          onPress={onSubmit}
          disabled={submitting}
          style={styles.send}
          testID="meeting-send-request"
        />
      }
    >
      <View style={styles.stack}>
        <View style={styles.section}>
          <Text style={[styles.label, { color: palette.text }]}>{t('meetingRequestModal.typeLabel')}</Text>
          <View style={styles.grid}>
            {([
              { id: 'speed', icon: 'bolt', locked: false },
              { id: 'coffee', icon: 'coffee', locked: !coffeeAllowed },
            ] as const).map(({ id, icon, locked }) => {
              const selected = meetingType === id && !locked;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="radio"
                  accessibilityLabel={t(`meetingRequestModal.types.${id}.title`)}
                  accessibilityHint={locked ? t('meetingRequestModal.coffeeLocked') : undefined}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    if (locked) {
                      onCoffeeLockedPress?.();
                      return;
                    }
                    onMeetingTypeChange(id);
                  }}
                  testID={`meeting-type-${id}`}
                  style={({ pressed }) => [
                    styles.typeCard,
                    {
                      backgroundColor: selected ? palette.accentSoft : palette.raised,
                      borderColor: selected ? palette.accent : palette.border,
                      opacity: locked ? 0.55 : pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <View style={[styles.tileIcon, { backgroundColor: selected ? palette.accent : palette.border }]}>
                    <MaterialIcons name={locked ? 'lock' : icon} size={20} color={selected ? palette.onAccent : palette.text} />
                  </View>
                  <View style={styles.typeText}>
                    <View style={styles.typeTitleRow}>
                      <Text style={[styles.label, { color: palette.text }]}>{t(`meetingRequestModal.types.${id}.title`)}</Text>
                      {locked ? (
                        <Badge
                          mode={mode}
                          tone="neutral"
                          compact
                          leadingIcon={<MaterialIcons name="lock" size={12} color={palette.accent} />}
                          accessibilityLabel={t('meetingRequestModal.coffeeLocked')}
                        >
                          {t('meetingRequestModal.coffeeLocked')}
                        </Badge>
                      ) : null}
                    </View>
                    <Text style={[styles.caption, { color: palette.muted }]} numberOfLines={2}>
                      {locked
                        ? t('meetingRequestModal.coffeeLockedHint', 'Upgrade your pass to unlock Coffee break.')
                        : t(`meetingRequestModal.types.${id}.hint`)}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {coffee ? (
            <View style={styles.chips} testID="meeting-coffee-lengths">
              {COFFEE_DURATIONS.map((minutes) => {
                const selected = coffeeMinutes === minutes;
                return (
                  <Pressable
                    key={minutes}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => onCoffeeMinutesChange(minutes)}
                    testID={`meeting-coffee-${minutes}`}
                    style={[styles.chip, {
                      backgroundColor: selected ? palette.accentSoft : palette.raised,
                      borderColor: selected ? palette.accent : palette.border,
                    }]}
                  >
                    <Text style={[styles.label, { color: selected ? palette.accent : palette.text }]}>
                      {t('meetingRequestModal.minutes', { minutes })}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        <FormField
          mode={mode}
          label={t('meetingRequestModal.messageLabel')}
          placeholder={t('meetingRequestModal.messagePlaceholder')}
          value={message}
          onChangeText={onMessageChange}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          style={styles.messageInput}
        />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.label, { color: palette.text }]}>{t('meetingRequestModal.intentionLabel')}</Text>
            <Text style={[styles.caption, { color: palette.muted }]}>
              {t('meetingRequestModal.intentionLimit', { count: intentions.length, max: MAX_INTENTIONS })}
            </Text>
          </View>
          <View style={styles.grid}>
            {MEETING_INTENTIONS.map(({ id, icon }, index) => {
              const selected = intentions.includes(id);
              const locked = full && !selected;
              const hue = hues[id];
              const label = t(`meetingRequestModal.intentions.${id}`);
              const last = index === MEETING_INTENTIONS.length - 1 && MEETING_INTENTIONS.length % 2 === 1;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected, disabled: locked }}
                  disabled={locked}
                  onPress={() => toggleIntention(id)}
                  testID={`meeting-intention-${id}`}
                  style={({ pressed }) => [
                    styles.tile,
                    last && styles.tileWide,
                    {
                      backgroundColor: selected ? `${hue}1a` : palette.raised,
                      borderColor: selected ? hue : palette.border,
                      opacity: locked ? 0.5 : pressed ? 0.8 : 1,
                    },
                  ]}
                >
                  <View style={[styles.tileIcon, { backgroundColor: `${hue}${tint}` }]}>
                    <MaterialIcons name={icon} size={20} color={hue} />
                  </View>
                  <Text numberOfLines={2} style={[styles.tileLabel, { color: palette.text }]}>{label}</Text>
                  {selected ? (
                    <View style={[styles.tileCheck, { backgroundColor: hue }]}>
                      <MaterialIcons name="check" size={12} color={isDark ? palette.canvas : palette.onAccent} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        {max > 0 && (
          <Surface mode={mode} style={styles.boostCard} testID="meeting-boost">
            <View style={styles.boostHeader}>
              <View style={[styles.boostIcon, { backgroundColor: palette.accentSoft }]}>
                <MaterialIcons name="bolt" size={20} color={palette.accent} />
              </View>
              <View style={styles.boostTitles}>
                <Text style={[styles.label, { color: palette.text }]}>{t('meetingRequestModal.boostLabel')}</Text>
                <Text style={[styles.caption, { color: palette.muted }]}>
                  {t('meetingRequestModal.boostAvailable', { points: remainingBoost })}
                </Text>
              </View>
              <Text
                style={[styles.readout, { color: boosted ? palette.accent : palette.muted }]}
                testID="meeting-boost-points"
              >
                {boosted ? t('meetingRequestModal.boostPoints', { points }) : t('meetingRequestModal.boostNone')}
              </Text>
            </View>

            <View style={styles.stepper}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('meetingRequestModal.boostDecrease')}
                accessibilityState={{ disabled: points <= 0 }}
                disabled={points <= 0}
                onPress={() => onBoostChange(clampBoost(points - Math.min(BOOST_STEP, max), max))}
                testID="meeting-boost-decrease"
                style={[styles.stepButton, { backgroundColor: palette.raised, borderColor: palette.border, opacity: points <= 0 ? 0.4 : 1 }]}
              >
                <MaterialIcons name="remove" size={20} color={palette.text} />
              </Pressable>
              <View style={styles.barWrap}>
                <BoostBar
                  value={points}
                  max={max}
                  onChange={onBoostChange}
                  label={t('meetingRequestModal.boostLabel')}
                  valueText={`${t('meetingRequestModal.boostPoints', { points })}, ${tierTitle}`}
                />
                <View style={styles.tickLabels} pointerEvents="none" accessible={false}>
                  {ticks.map((candidate) => (
                    <Text
                      key={candidate.id}
                      style={[styles.tickLabel, {
                        left: `${(candidate.from / max) * 100}%`,
                        color: points >= candidate.from ? palette.text : palette.muted,
                        fontWeight: points >= candidate.from ? '700' : '500',
                      }]}
                    >
                      {candidate.from}
                    </Text>
                  ))}
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('meetingRequestModal.boostIncrease')}
                accessibilityState={{ disabled: points >= max }}
                disabled={points >= max}
                onPress={() => onBoostChange(clampBoost(points + Math.min(BOOST_STEP, max), max))}
                testID="meeting-boost-increase"
                style={[styles.stepButton, { backgroundColor: palette.raised, borderColor: palette.border, opacity: points >= max ? 0.4 : 1 }]}
              >
                <MaterialIcons name="add" size={20} color={palette.text} />
              </Pressable>
            </View>

            <View style={[styles.summary, { borderTopColor: palette.border }]} accessibilityLiveRegion="polite">
              <View style={styles.summaryRow}>
                <Text style={[styles.caption, { color: palette.muted }]}>{t('meetingRequestModal.boostLength')}</Text>
                <Text style={[styles.value, { color: palette.text }]} testID="meeting-boost-length">
                  {boosted && !coffee && duration > SPEED_BASE_MINUTES
                    ? `${t('meetingRequestModal.minutes', { minutes: SPEED_BASE_MINUTES })} → ${t('meetingRequestModal.minutes', { minutes: duration })}`
                    : t('meetingRequestModal.minutes', { minutes: duration })}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={[styles.caption, { color: palette.muted }]}>{t('meetingRequestModal.boostPriority')}</Text>
                <Text style={[styles.value, { color: palette.text }]} testID="meeting-boost-tier">
                  {boosted
                    ? `${t('meetingRequestModal.priorityPoints', { points })} · ${tierTitle}`
                    : tierTitle}
                </Text>
              </View>
              <Text style={[styles.hint, { color: palette.muted }]}>
                {t(`meetingRequestModal.boostTier.${tier}.hint`)}
              </Text>
              <Text style={[styles.hint, { color: palette.muted }]} testID="meeting-boost-note">
                {t(`meetingRequestModal.boostNote.${coffee ? 'coffee' : 'speed'}`)}
              </Text>
            </View>
          </Surface>
        )}
      </View>
    </DrawerSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: uiTokens.space.lg },
  section: { gap: uiTokens.space.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label: { fontSize: uiTokens.type.label, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: uiTokens.type.caption },
  hint: { fontSize: uiTokens.type.caption, lineHeight: 18 },
  value: { fontSize: uiTokens.type.label, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  messageInput: { minHeight: 96, paddingTop: uiTokens.space.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: uiTokens.space.sm },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: uiTokens.control.minHeight + uiTokens.space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: uiTokens.space.md,
    paddingHorizontal: uiTokens.space.md,
    paddingVertical: uiTokens.space.sm,
    borderRadius: uiTokens.radius.media,
    borderWidth: uiTokens.control.borderWidth,
  },
  tileWide: { flexBasis: '100%' },
  typeCard: {
    flexGrow: 1,
    flexBasis: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: uiTokens.space.md,
    padding: uiTokens.space.md,
    borderRadius: uiTokens.radius.media,
    borderWidth: uiTokens.control.borderWidth,
  },
  typeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: uiTokens.space.xs,
  },
  typeText: { flex: 1, gap: 2 },
  chips: { flexDirection: 'row', gap: uiTokens.space.sm },
  chip: {
    flex: 1,
    minHeight: uiTokens.control.compactHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: uiTokens.radius.pill,
    borderWidth: uiTokens.control.borderWidth,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: uiTokens.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { flex: 1, fontSize: uiTokens.type.label, lineHeight: 18, fontWeight: '600' },
  tileCheck: {
    width: 20,
    height: 20,
    borderRadius: uiTokens.radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boostCard: { padding: uiTokens.space.lg, gap: uiTokens.space.md, borderRadius: uiTokens.radius.card },
  boostHeader: { flexDirection: 'row', alignItems: 'center', gap: uiTokens.space.md },
  boostIcon: { width: 36, height: 36, borderRadius: uiTokens.radius.circle, alignItems: 'center', justifyContent: 'center' },
  boostTitles: { flex: 1 },
  readout: { fontSize: uiTokens.type.body + 2, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'flex-start', gap: uiTokens.space.sm },
  stepButton: {
    width: uiTokens.control.compactHeight,
    height: uiTokens.control.compactHeight,
    borderRadius: uiTokens.radius.circle,
    borderWidth: uiTokens.control.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barWrap: { flex: 1 },
  bar: { height: uiTokens.control.compactHeight, justifyContent: 'center' },
  barInner: { height: THUMB, marginHorizontal: THUMB / 2, justifyContent: 'center' },
  track: { height: TRACK, borderRadius: uiTokens.radius.pill, marginHorizontal: -THUMB / 2 },
  fill: { position: 'absolute', left: 0, height: TRACK, borderRadius: uiTokens.radius.pill },
  tick: { position: 'absolute', width: 2, height: TRACK, marginLeft: -1 },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    marginLeft: -THUMB / 2,
    borderRadius: uiTokens.radius.circle,
    borderWidth: 3,
  },
  tickLabels: { height: 16, marginHorizontal: THUMB / 2 },
  tickLabel: { position: 'absolute', width: 32, marginLeft: -16, textAlign: 'center', fontSize: uiTokens.type.caption },
  summary: { borderTopWidth: uiTokens.control.borderWidth, paddingTop: uiTokens.space.md, gap: uiTokens.space.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: uiTokens.space.md },
  send: { alignSelf: 'stretch' },
});
