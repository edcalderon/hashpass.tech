import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '../lib/vector-icons';
import { useTranslation } from '../i18n/i18n';
import { ActionButton, FormField } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import type {
  SpeakerClaimMode,
  SpeakerClaimModalProps,
  SpeakerClaimStep,
  SpeakerClaimSubmission,
} from '../types/speaker-claim.types';

export const CLAIM_NOTE_MIN_LENGTH = 20;
export const CLAIM_NOTE_MAX_LENGTH = 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Guided "is this your speaker profile?" claim flow. */
export default function SpeakerClaimModal({
  visible,
  speakerName,
  currentEmail,
  isDark = false,
  onSubmit,
  onClose,
}: SpeakerClaimModalProps) {
  const { t } = useTranslation('networking');
  const palette = uiPalette(isDark ? 'dark' : 'light');
  const mode = isDark ? 'dark' : 'light';
  const [step, setStep] = useState<SpeakerClaimStep>('choose');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentMode, setSentMode] = useState<SpeakerClaimMode>('current_email');
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setStep('choose');
      setEmail('');
      setNote('');
      setError('');
      setBusy(false);
    }
  }, [visible]);

  const trimmedNote = note.trim();
  const trimmedEmail = email.trim().toLowerCase();
  const emailError = step === 'other_email' && trimmedEmail && !EMAIL_PATTERN.test(trimmedEmail)
    ? t('speakerView.claimFlow.emailInvalid')
    : '';
  const noteShort = trimmedNote.length > 0 && trimmedNote.length < CLAIM_NOTE_MIN_LENGTH;
  const canSubmit = !busy
    && trimmedNote.length >= CLAIM_NOTE_MIN_LENGTH
    && (step !== 'other_email' || EMAIL_PATTERN.test(trimmedEmail));

  const submit = async () => {
    if (!canSubmit || (step !== 'current_email' && step !== 'other_email')) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit({ mode: step, email: step === 'other_email' ? trimmedEmail : '', note: trimmedNote });
      setSentMode(step);
      setStep('sent');
    } catch (submitError: any) {
      setError(submitError?.message || t('speakerView.claimFailedMessage'));
    } finally {
      setBusy(false);
    }
  };

  const option = (key: SpeakerClaimStep, icon: string, title: string, body: string) => (
    <TouchableOpacity
      key={key}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={() => setStep(key)}
      style={[styles.option, { borderColor: palette.border, backgroundColor: palette.accentSoft }]}
      testID={`claim-option-${key}`}
    >
      <MaterialIcons name={icon as any} size={22} color={palette.accent} />
      <View style={styles.optionBody}>
        <Text style={[styles.optionTitle, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.optionText, { color: palette.muted }]}>{body}</Text>
      </View>
    </TouchableOpacity>
  );

  const noteField = (
    <FormField
      mode={mode}
      label={t('speakerView.claimFlow.noteLabel')}
      placeholder={t('speakerView.claimFlow.notePlaceholder')}
      value={note}
      onChangeText={setNote}
      multiline
      maxLength={CLAIM_NOTE_MAX_LENGTH}
      numberOfLines={4}
      textAlignVertical="top"
      error={noteShort ? t('speakerView.claimFlow.noteTooShort', { min: CLAIM_NOTE_MIN_LENGTH }) : undefined}
      style={styles.noteInput}
      testID="claim-note"
    />
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.overlay, { backgroundColor: palette.overlay }]}
        onPress={onClose}
        accessibilityLabel={t('speakerView.claimFlow.close')}
      >
        <Pressable
          style={[styles.card, { backgroundColor: palette.raised, borderColor: palette.border }]}
          onPress={() => undefined}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: palette.text }]}>
              {step === 'sent' ? t('speakerView.claimFlow.sentTitle') : t('speakerView.claimFlow.title')}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={t('speakerView.claimFlow.close')}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              onPress={onClose}
            >
              <MaterialIcons name="close" size={22} color={palette.text} />
            </TouchableOpacity>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            {step === 'choose' && (
              <>
                <Text style={[styles.lead, { color: palette.muted }]}>
                  {t('speakerView.claimFlow.question', { name: speakerName })}
                </Text>
                {option(
                  'current_email',
                  'mail-outline',
                  t('speakerView.claimFlow.currentTitle'),
                  t('speakerView.claimFlow.currentBody', { email: currentEmail || '' }),
                )}
                {option(
                  'other_email',
                  'alternate-email',
                  t('speakerView.claimFlow.otherTitle'),
                  t('speakerView.claimFlow.otherBody'),
                )}
              </>
            )}

            {(step === 'current_email' || step === 'other_email') && (
              <>
                <Text style={[styles.lead, { color: palette.muted }]}>
                  {step === 'current_email'
                    ? t('speakerView.claimFlow.currentIntro', { name: speakerName, email: currentEmail || '' })
                    : t('speakerView.claimFlow.otherIntro', { name: speakerName })}
                </Text>
                {step === 'other_email' && (
                  <FormField
                    mode={mode}
                    label={t('speakerView.claimFlow.emailLabel')}
                    placeholder="name@company.com"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    error={emailError || undefined}
                    testID="claim-email"
                  />
                )}
                {noteField}
                <Text style={[styles.hint, { color: palette.muted }]}>
                  {step === 'other_email'
                    ? t('speakerView.claimFlow.otherReviewHint')
                    : t('speakerView.claimFlow.currentReviewHint')}
                </Text>
                {!!error && (
                  <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>{error}</Text>
                )}
                <View style={styles.actions}>
                  <ActionButton
                    mode={mode}
                    variant="ghost"
                    label={t('speakerView.claimFlow.back')}
                    onPress={() => { setStep('choose'); setError(''); }}
                    disabled={busy}
                  />
                  <ActionButton
                    mode={mode}
                    label={step === 'other_email' ? t('speakerView.claimFlow.sendLink') : t('speakerView.claimFlow.submit')}
                    onPress={submit}
                    loading={busy}
                    disabled={!canSubmit}
                    testID="claim-submit"
                  />
                </View>
              </>
            )}

            {step === 'sent' && (
              <>
                <MaterialIcons name="mark-email-read" size={36} color={palette.accent} />
                <Text style={[styles.lead, { color: palette.text }]}>
                  {sentMode === 'other_email'
                    ? t('speakerView.claimFlow.sentOther', { email: trimmedEmail })
                    : t('speakerView.claimFlow.sentCurrent', { name: speakerName })}
                </Text>
                <Text style={[styles.hint, { color: palette.muted }]}>
                  {sentMode === 'other_email' ? t('speakerView.claimFlow.sentOtherHint') : t('speakerView.claimFlow.sentCurrentHint')}
                </Text>
                <ActionButton mode={mode} label={t('speakerView.claimFlow.done')} onPress={onClose} />
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: uiTokens.space.xl },
  card: {
    borderRadius: uiTokens.radius.media,
    borderWidth: uiTokens.control.borderWidth,
    padding: uiTokens.space.xl,
    gap: uiTokens.space.lg,
    maxWidth: 480,
    width: '100%',
    maxHeight: '90%',
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: uiTokens.type.title, fontWeight: '700', flex: 1 },
  body: { gap: uiTokens.space.lg },
  lead: { fontSize: uiTokens.type.body, lineHeight: 22 },
  option: {
    flexDirection: 'row',
    gap: uiTokens.space.md,
    padding: uiTokens.space.lg,
    borderRadius: uiTokens.radius.input,
    borderWidth: uiTokens.control.borderWidth,
  },
  optionBody: { flex: 1, gap: uiTokens.space.xs },
  optionTitle: { fontSize: uiTokens.type.body, fontWeight: '700' },
  optionText: { fontSize: uiTokens.type.caption, lineHeight: 18 },
  noteInput: { minHeight: 96 },
  hint: { fontSize: uiTokens.type.caption, lineHeight: 18 },
  error: { fontSize: uiTokens.type.caption },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: uiTokens.space.md, flexWrap: 'wrap' },
});
