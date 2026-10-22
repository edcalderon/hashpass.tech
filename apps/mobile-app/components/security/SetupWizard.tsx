import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ActionButton, Badge, FilterChip, Surface } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import type { ColorMode } from '@hashpass/ui/tokens';
import { useTranslation } from '../../i18n/i18n';
import { CONTACT_TOPICS, MAX_CONTACT_TOPICS } from '../../lib/contacts';
import { MAX_SETUP_GOALS, SETUP_GOALS } from '../../lib/setup';
import { SETUP_WIZARD_STEPS, type SetupWizardContext, type SetupWizardEvent, type SetupWizardView } from '../../hooks/setup-wizard-machine';
import type { UsePin } from '../../hooks/usePin';
import PinFlow from './PinFlow';

const GOAL_FALLBACK: Record<(typeof SETUP_GOALS)[number], string> = {
  hire: 'Hire talent', get_hired: 'Find a role', cofounders: 'Meet co-founders',
  learn: 'Learn from others', investors: 'Meet investors', friends: 'Make friends',
};

export interface SetupWizardProps {
  mode: ColorMode;
  view: SetupWizardView;
  context: SetupWizardContext;
  send: (event: SetupWizardEvent) => void;
  pin: UsePin;
  /** Lets someone who is only revisiting settings leave without finishing. */
  onClose?: () => void;
}

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
  const finishing = view.phase === 'finishing';

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

  const heading = {
    goals: [t('goalsTitle', 'What brings you here?'), t('goalsBody', 'Pick up to {max}. We use this to suggest people worth meeting.', { max: MAX_SETUP_GOALS })],
    topics: [t('topicsTitle', 'What are you curious about?'), t('topicsBody', 'Choose up to {max} interests to find people who share them.', { max: MAX_CONTACT_TOPICS })],
    privacy: [t('privacyTitle', 'You decide what is shared'), t('privacyBody', 'Keep your card private, or let like-minded people find you. You can change this any time.')],
  }[view.step];

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.progress} accessible accessibilityLabel={t('stepOf', 'Step {step} of {count}', { step: view.stepNumber, count: view.stepCount })}>
        {SETUP_WIZARD_STEPS.map((step, index) => (
          <View key={step} style={[styles.segment, index < (view.stepNumber ?? 0) && { backgroundColor: palette.accentFill }]} />
        ))}
      </View>
      <Badge mode={mode} tone="neutral">{t('stepOf', 'Step {step} of {count}', { step: view.stepNumber, count: view.stepCount })}</Badge>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>{heading[0]}</Text>
        <Text style={styles.body}>{heading[1]}</Text>
      </View>

      {view.step === 'goals' && <View style={styles.wrap}>
        {SETUP_GOALS.map(goal => {
          const selected = context.goals.includes(goal);
          return <FilterChip key={goal} mode={mode} label={t(`goals.${goal}`, GOAL_FALLBACK[goal])} selected={selected}
            disabled={!selected && context.goals.length >= MAX_SETUP_GOALS} onPress={() => send({ type: 'TOGGLE_GOAL', goal })} />;
        })}
      </View>}

      {view.step === 'topics' && <>
        <View style={styles.wrap}>
          {CONTACT_TOPICS.map((topic: string) => {
            const selected = context.topics.includes(topic);
            return <FilterChip key={topic} mode={mode} label={t(`topics.${topic}`, topic)} selected={selected}
              disabled={!selected && context.topics.length >= MAX_CONTACT_TOPICS} onPress={() => send({ type: 'TOGGLE_TOPIC', topic })} />;
          })}
        </View>
        <Text style={styles.caption}>{t('topicCount', '{count} of {max} selected', { count: context.topics.length, max: MAX_CONTACT_TOPICS })}</Text>
      </>}

      {view.step === 'privacy' && <View style={styles.stack}>
        <View style={styles.wrap}>
          <FilterChip mode={mode} label={t('scopePrivate', 'Private')} selected={context.privacyScope === 'private'} onPress={() => send({ type: 'SET_PRIVACY', scope: 'private' })} />
          <FilterChip mode={mode} label={t('scopePublic', 'Discoverable')} selected={context.privacyScope === 'public'} onPress={() => send({ type: 'SET_PRIVACY', scope: 'public' })} />
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

      <View style={styles.actions}>
        {view.canGoBack && <ActionButton mode={mode} variant="ghost" label={t('back', 'Back')} disabled={finishing} onPress={() => send({ type: 'BACK' })} />}
        {onClose && context.revisiting && <ActionButton mode={mode} variant="ghost" label={t('close', 'Close')} disabled={finishing} onPress={onClose} />}
        {view.step === 'privacy'
          ? <ActionButton mode={mode} label={t('finish', 'Finish setup')} loading={finishing} disabled={!view.canFinish} onPress={() => send({ type: 'FINISH' })} />
          : <ActionButton mode={mode} label={t('next', 'Continue')} onPress={() => send({ type: 'NEXT' })} />}
      </View>
    </ScrollView>
  );
}

const makeStyles = (mode: ColorMode) => {
  const p = uiPalette(mode);
  return StyleSheet.create({
    content: { width: '100%', maxWidth: 640, alignSelf: 'center', padding: uiTokens.space.xl, gap: uiTokens.space.xl },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: uiTokens.space.lg, padding: uiTokens.space.xl },
    progress: { flexDirection: 'row', gap: uiTokens.space.sm },
    segment: { flex: 1, height: 6, borderRadius: uiTokens.radius.pill, backgroundColor: p.border },
    heading: { gap: uiTokens.space.sm },
    title: { color: p.text, fontSize: uiTokens.type.heading, fontWeight: '700' },
    body: { color: p.muted, fontSize: uiTokens.type.body, lineHeight: 24, textAlign: 'left' },
    caption: { color: p.muted, fontSize: uiTokens.type.caption, lineHeight: 19, flexShrink: 1 },
    label: { color: p.text, fontSize: uiTokens.type.label, fontWeight: '600' },
    error: { color: p.danger, fontSize: uiTokens.type.label },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: uiTokens.space.sm },
    stack: { gap: uiTokens.space.lg },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: uiTokens.space.lg, padding: uiTokens.space.lg },
    rowText: { flex: 1, gap: uiTokens.space.xs },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: uiTokens.space.md, justifyContent: 'flex-end' },
  });
};
