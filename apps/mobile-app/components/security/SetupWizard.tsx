import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, Easing, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ActionButton, Badge, FilterChip, Surface } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import type { ColorMode } from '@hashpass/ui/tokens';
import { useTranslation } from '../../i18n/i18n';
import { CONTACT_TOPICS, MAX_CONTACT_TOPICS } from '../../lib/contacts';
import { MAX_SETUP_GOALS, SETUP_GOALS } from '../../lib/setup';
import type { SetupGoal } from '../../types/setup';
import { SETUP_WIZARD_STEPS } from '../../hooks/setup-wizard-machine';
import type { SetupWizardStep } from '../../types/setup-wizard.types';
import PinFlow from './PinFlow';
import type { SetupWizardProps } from './types/SetupWizard.types';

export type { SetupWizardProps };

const GOAL_FALLBACK: Record<(typeof SETUP_GOALS)[number], string> = {
  hire: 'Hire talent', get_hired: 'Find a role', cofounders: 'Meet co-founders',
  learn: 'Learn from others', investors: 'Meet investors', friends: 'Make friends',
};

/**
 * Three steps before Contacts shares anything: what you are here for, what interests you,
 * and what you allow, with a PIN as the second step that protects it. Pure view: all
 * state lives in the setup machine, and the PIN pad talks to the server on its own.
 */
export default function SetupWizard({ mode, view, context, send, pin, onClose }: SetupWizardProps) {
  const { t } = useTranslation('setup');
  const palette = uiPalette(mode);
  const styles = useMemo(() => makeStyles(mode), [mode]);
  const [choosingPin, setChoosingPin] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const entrance = useRef(createAnimationValue(0)).current;
  const pulse = useRef(createAnimationValue(1)).current;
  const finishing = view.phase === 'finishing';

  useEffect(() => {
    let mounted = true;
    const readMotionPreference = AccessibilityInfo.isReduceMotionEnabled?.();
    readMotionPreference?.then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const motionSubscription = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduceMotion);

    return () => {
      mounted = false;
      motionSubscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    entrance.stopAnimation();
    pulse.stopAnimation();
    if (reduceMotion || view.phase === 'loading' || view.phase === 'loadFailed' || typeof Animated.timing !== 'function' || typeof Animated.loop !== 'function') {
      entrance.setValue(1);
      pulse.setValue(1);
      return undefined;
    }

    entrance.setValue(0);
    const intro = Animated.timing(entrance, {
      toValue: 1,
      duration: uiTokens.motion.entrance,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const orbit = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.08, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    intro.start();
    orbit.start();

    return () => {
      intro.stop();
      orbit.stop();
    };
  }, [entrance, pulse, reduceMotion, view.phase]);

  if (view.phase === 'loading') {
    return <View style={styles.center}><ActivityIndicator color={palette.accent} /><Text style={styles.body}>{t('loading', 'Getting things ready')}</Text></View>;
  }
  if (view.phase === 'loadFailed') {
    return <View style={styles.center}>
      <Text accessibilityRole="alert" style={styles.body}>{t('loadFailed', 'We could not load your setup. Your account is unchanged.')}</Text>
      <ActionButton mode={mode} label={t('retry', 'Try again')} onPress={() => send({ type: 'RETRY' })} />
    </View>;
  }
  if (!view.step) return null;

  const headingByStep: Record<SetupWizardStep, [string, string]> = {
    goals: [t('goalsTitle', 'What brings you here?'), t('goalsBody', 'Pick up to {max}. We use this to suggest people worth meeting.', { max: MAX_SETUP_GOALS })],
    topics: [t('topicsTitle', 'What are you curious about?'), t('topicsBody', 'Choose up to {max} interests to find people who share them.', { max: MAX_CONTACT_TOPICS })],
    privacy: [t('privacyTitle', 'You decide what is shared'), t('privacyBody', 'Keep your card private, or let like-minded people find you. You can change this any time.')],
  };
  const heading = headingByStep[view.step as SetupWizardStep];

  return (
    <View style={styles.shell}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Animated.View style={{ opacity: entrance, transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
        <SetupArtwork mode={mode} pulse={pulse} />
        <View style={styles.progressHeader}>
          <View style={styles.progress} accessible accessibilityLabel={t('stepOf', 'Step {step} of {count}', { step: view.stepNumber, count: view.stepCount })}>
            {SETUP_WIZARD_STEPS.map((step: string, index: number) => (
              <View key={step} style={[styles.segment, index < (view.stepNumber ?? 0) && { backgroundColor: palette.accentFill }]} />
            ))}
          </View>
          <Badge mode={mode} tone="neutral">{t('stepOf', 'Step {step} of {count}', { step: view.stepNumber, count: view.stepCount })}</Badge>
        </View>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>{heading[0]}</Text>
          <Text style={styles.body}>{heading[1]}</Text>
        </View>
      </Animated.View>

      {view.step === 'goals' && <View style={styles.selectionSection}>
        <View style={styles.optionGrid}>
          {SETUP_GOALS.map((goal: SetupGoal) => {
            const selected = context.goals.includes(goal);
            return <FilterChip key={goal} mode={mode} label={t(`goals.${goal}`, GOAL_FALLBACK[goal])} selected={selected}
              style={[styles.optionChip, selected && styles.optionChipSelected]}
              disabled={!selected && context.goals.length >= MAX_SETUP_GOALS} onPress={() => send({ type: 'TOGGLE_GOAL', goal })} />;
          })}
        </View>
        <Badge mode={mode} tone={context.goals.length > 0 ? 'accent' : 'neutral'} markerColor={context.goals.length > 0 ? palette.accent : palette.muted}>
          {t('goalCount', '{count} of {max} selected', { count: context.goals.length, max: MAX_SETUP_GOALS })}
        </Badge>
      </View>}

      {view.step === 'topics' && <>
        <View style={styles.selectionSection}>
          <View style={styles.optionGrid}>
            {CONTACT_TOPICS.map((topic: string) => {
              const selected = context.topics.includes(topic);
              return <FilterChip key={topic} mode={mode} label={t(`topics.${topic}`, topic)} selected={selected}
                style={[styles.optionChip, selected && styles.optionChipSelected]}
                disabled={!selected && context.topics.length >= MAX_CONTACT_TOPICS} onPress={() => send({ type: 'TOGGLE_TOPIC', topic })} />;
            })}
          </View>
          <Badge mode={mode} tone={context.topics.length > 0 ? 'accent' : 'neutral'} markerColor={context.topics.length > 0 ? palette.accent : palette.muted}>
            {t('topicCount', '{count} of {max} selected', { count: context.topics.length, max: MAX_CONTACT_TOPICS })}
          </Badge>
        </View>
      </>}

      {view.step === 'privacy' && <View style={styles.stack}>
        <View style={styles.optionGrid}>
          <FilterChip mode={mode} label={t('scopePrivate', 'Private')} selected={context.privacyScope === 'private'} style={[styles.optionChip, context.privacyScope === 'private' && styles.optionChipSelected]} onPress={() => send({ type: 'SET_PRIVACY', scope: 'private' })} />
          <FilterChip mode={mode} label={t('scopePublic', 'Discoverable')} selected={context.privacyScope === 'public'} style={[styles.optionChip, context.privacyScope === 'public' && styles.optionChipSelected]} onPress={() => send({ type: 'SET_PRIVACY', scope: 'public' })} />
        </View>
        <Surface mode={mode} style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>{t('consent', 'I understand how my card is shared')}</Text>
            <Text style={styles.caption}>{t('consentHint', 'Only what you choose is visible, and only to people you connect with or who share your interests.')}</Text>
          </View>
          <Switch accessibilityLabel={t('consent', 'I understand how my card is shared')} value={context.consent} disabled={finishing}
            onValueChange={accepted => send({ type: 'SET_CONSENT', accepted })} trackColor={{ true: palette.accentFill }} />
        </Surface>
        <Surface mode={mode} style={styles.stack}>
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.label}>{t('pinTitle', 'Your 4-digit PIN')}</Text>
              <Text style={styles.caption}>{t('pinHint', 'A second step that confirms it is you before your wallet is created or anything is signed.')}</Text>
            </View>
            {context.pinEnabled && <Badge mode={mode} tone="neutral" compact>{t('pinReady', 'PIN set')}</Badge>}
          </View>
          {!context.pinEnabled && !choosingPin && <ActionButton mode={mode} variant="secondary" label={t('createPin', 'Create my PIN')} disabled={finishing} onPress={() => setChoosingPin(true)} />}
          {!context.pinEnabled && choosingPin && <PinFlow mode={mode} pin={pin} scope="app:unlock" intent="create"
            onDone={() => { setChoosingPin(false); send({ type: 'PIN_SET' }); }} onCancel={() => setChoosingPin(false)} />}
        </Surface>
      </View>}

      {view.error === 'save_failed' && <Text accessibilityRole="alert" style={styles.error}>{t('saveFailed', 'We could not save your setup. Your answers are kept, so you can try again.')}</Text>}

      </ScrollView>
      <View style={styles.actionFooter}>
        <View style={styles.actions}>
          {view.canGoBack && <ActionButton mode={mode} variant="ghost" label={t('back', 'Back')} disabled={finishing} onPress={() => send({ type: 'BACK' })} style={styles.actionButton} />}
          {onClose && context.revisiting && <ActionButton mode={mode} variant="ghost" label={t('close', 'Close')} disabled={finishing} onPress={onClose} style={styles.actionButton} />}
          {view.step === 'privacy'
            ? <ActionButton mode={mode} label={t('finish', 'Finish setup')} loading={finishing} disabled={!view.canFinish} onPress={() => send({ type: 'FINISH' })} style={styles.actionButton} />
            : <ActionButton mode={mode} label={t('next', 'Continue')} onPress={() => send({ type: 'NEXT' })} style={styles.actionButton} />}
        </View>
      </View>
    </View>
  );
}

const createAnimationValue = (initial: number): Animated.Value => {
  if (typeof Animated.Value !== 'function') {
    return {
      interpolate: () => 1,
      setValue: () => undefined,
      stopAnimation: () => undefined,
    } as unknown as Animated.Value;
  }
  return new Animated.Value(initial);
};

function SetupArtwork({ mode, pulse }: { mode: ColorMode; pulse: Animated.Value }) {
  const palette = uiPalette(mode);
  return (
    <View accessible accessibilityLabel="Setup illustration" style={[artworkStyles.frame, { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1 }]}>
      <View style={[artworkStyles.glow, { backgroundColor: palette.accentSoft }]} />
      <View style={[artworkStyles.orbit, artworkStyles.orbitLarge, { borderColor: `${palette.accent}55` }]} />
      <View style={[artworkStyles.orbit, artworkStyles.orbitSmall, { borderColor: `${palette.accent}80` }]} />
      <Animated.View style={[artworkStyles.core, { backgroundColor: palette.accentFill, transform: [{ scale: pulse }] }]}>
        <View style={[artworkStyles.coreMark, { borderColor: palette.onAccent }]} />
      </Animated.View>
      <View style={[artworkStyles.spark, artworkStyles.sparkTop, { backgroundColor: palette.accent }]} />
      <View style={[artworkStyles.spark, artworkStyles.sparkRight, { backgroundColor: uiTokens.feature.violet }]} />
      <View style={[artworkStyles.spark, artworkStyles.sparkBottom, { backgroundColor: palette.accent }]} />
      <View style={artworkStyles.captionBlock}>
        <Text style={[artworkStyles.eyebrow, { color: palette.accent }]}>{'HASHPASS / SETUP'}</Text>
        <Text style={[artworkStyles.artTitle, { color: palette.text }]}>{'Shape your network'}</Text>
      </View>
    </View>
  );
}

const makeStyles = (mode: ColorMode) => {
  const p = uiPalette(mode);
  return StyleSheet.create({
    shell: { flex: 1, minHeight: 0, backgroundColor: p.canvas },
    scroll: { flex: 1, minHeight: 0 },
    content: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: uiTokens.space.lg, paddingTop: uiTokens.space.xl, paddingBottom: uiTokens.space.xl, gap: uiTokens.space.xl, flexGrow: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: uiTokens.space.lg, padding: uiTokens.space.xl },
    progressHeader: { gap: uiTokens.space.md },
    progress: { flexDirection: 'row', gap: uiTokens.space.sm },
    segment: { flex: 1, height: 6, borderRadius: uiTokens.radius.pill, backgroundColor: p.border },
    heading: { gap: uiTokens.space.sm },
    title: { color: p.text, fontSize: uiTokens.type.heading, fontWeight: '700' },
    body: { color: p.muted, fontSize: uiTokens.type.body, lineHeight: 24, textAlign: 'left' },
    caption: { color: p.muted, fontSize: uiTokens.type.caption, lineHeight: 19, flexShrink: 1 },
    label: { color: p.text, fontSize: uiTokens.type.label, fontWeight: '600' },
    error: { color: p.danger, fontSize: uiTokens.type.label },
    optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: uiTokens.space.sm, minWidth: 0 },
    optionChip: { flexGrow: 1, flexBasis: '30%', minWidth: 132, alignSelf: 'stretch', borderColor: p.border, backgroundColor: p.surface },
    optionChipSelected: { borderColor: p.accent, backgroundColor: p.accentSoft },
    selectionSection: { gap: uiTokens.space.sm, minWidth: 0, alignItems: 'flex-start' },
    stack: { gap: uiTokens.space.lg },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: uiTokens.space.lg, padding: uiTokens.space.lg },
    rowText: { flex: 1, gap: uiTokens.space.xs },
    actionFooter: { borderTopWidth: 1, borderTopColor: p.border, backgroundColor: p.canvas, paddingHorizontal: uiTokens.space.lg, paddingVertical: uiTokens.space.md },
    actions: { width: '100%', maxWidth: 640, alignSelf: 'center', flexDirection: 'column', gap: uiTokens.space.sm },
    actionButton: { width: '100%' },
  });
};

const artworkStyles = StyleSheet.create({
  frame: { minHeight: 184, borderRadius: uiTokens.radius.card, overflow: 'hidden', justifyContent: 'center', alignItems: 'center', padding: uiTokens.space.xl },
  glow: { position: 'absolute', width: 180, height: 180, borderRadius: uiTokens.radius.circle, opacity: 0.72 },
  orbit: { position: 'absolute', borderWidth: 1, borderRadius: uiTokens.radius.circle },
  orbitLarge: { width: 138, height: 138 },
  orbitSmall: { width: 88, height: 88 },
  core: { width: 58, height: 58, borderRadius: uiTokens.radius.circle, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  coreMark: { width: 22, height: 22, borderWidth: 2, borderRadius: uiTokens.radius.circle, opacity: 0.9 },
  spark: { position: 'absolute', width: 7, height: 7, borderRadius: uiTokens.radius.circle },
  sparkTop: { top: 34, left: '50%' },
  sparkRight: { right: '22%', top: 88 },
  sparkBottom: { bottom: 38, left: '35%' },
  captionBlock: { position: 'absolute', left: uiTokens.space.xl, bottom: uiTokens.space.lg, gap: uiTokens.space.xs },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  artTitle: { fontSize: 18, fontWeight: '700' },
});
