import React, { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { FormField } from '@hashpass/ui/primitives';
import { uiTokens } from '@hashpass/ui/tokens';
import { useTheme } from '../../hooks/useTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTranslation } from '../../i18n/i18n';
import { LukasCaptcha } from '../LukasCaptcha';
import { ActionButton } from '@hashpass/ui/primitives';
import { LukasDialog, LukasEyebrow, dialogCopy, dialogTitle, lukasFullWidth, lukasPalette, lukasSkin } from './lukas-ui';
import type { LukasClaimModalProps, LukasClaimSession, LukasClaimStep } from '../../types/lukas.types';

const API_BASE = 'https://api.hashpass.tech/api';
const QUIZ_QUESTIONS = [
  { id: 'q1', correctIndex: 1 },
  { id: 'q2', correctIndex: 2 },
  { id: 'q3', correctIndex: 0 },
  { id: 'q4', correctIndex: 1 },
  { id: 'q5', correctIndex: 1 },
] as const;
const QUIZ_OPTIONS = [1, 2, 3, 4] as const;
const QUIZ_PASSING_SCORE = 4;

export function LukasClaimModal({ visible, onClose, rewardTotal = 0, onClaimed }: LukasClaimModalProps) {
  const { isDark } = useTheme();
  const isMobile = useIsMobile();
  const { t } = useTranslation('lukas');
  const palette = useMemo(() => lukasPalette(isDark), [isDark]);
  const mode = isDark ? 'dark' : 'light';
  const skin = useMemo(() => lukasSkin(palette), [palette]);
  const styles = useMemo(() => getStyles(isMobile, palette), [isMobile, palette]);
  const [step, setStep] = useState<LukasClaimStep>('quiz');
  const [quizAnswers, setQuizAnswers] = useState<Array<number | null>>(() => Array(QUIZ_QUESTIONS.length).fill(null));
  const [questionIndex, setQuestionIndex] = useState(0);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const [sessionPayload, setSessionPayload] = useState<LukasClaimSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const quizQuestions = QUIZ_QUESTIONS.map((question) => ({
    ...question,
    prompt: t(`claimQuiz.questions.${question.id}.prompt`),
    options: QUIZ_OPTIONS.map((optionNumber) => t(`claimQuiz.questions.${question.id}.option${optionNumber}`)),
  }));
  const currentQuestion = quizQuestions[questionIndex];
  const selectedAnswer = quizAnswers[questionIndex] ?? null;
  const isLastQuestion = questionIndex === quizQuestions.length - 1;

  const reset = () => {
    setStep('quiz');
    setQuizAnswers(Array(QUIZ_QUESTIONS.length).fill(null));
    setQuestionIndex(0);
    setQuizScore(null);
    setEmail('');
    setCode('');
    setCaptchaToken('');
    setCaptchaResetKey((key) => key + 1);
    setSessionPayload(null);
    setError('');
    onClose();
  };

  const retryQuiz = () => {
    setQuizAnswers(Array(QUIZ_QUESTIONS.length).fill(null));
    setQuestionIndex(0);
    setQuizScore(null);
    setError('');
  };

  const continueQuiz = () => {
    if (selectedAnswer === null) return;
    if (!isLastQuestion) {
      setQuestionIndex((index) => index + 1);
      return;
    }
    const score = quizQuestions.reduce((count, question, index) => count + (quizAnswers[index] === question.correctIndex ? 1 : 0), 0);
    setQuizScore(score);
    if (score >= QUIZ_PASSING_SCORE) setStep('email');
  };

  const requestCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError(t('claim.invalidEmail'));
      return;
    }
    if (!captchaToken) {
      setError(t('claim.captchaRequired'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/lukas/claim/otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: normalizedEmail, captchaToken }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t('claim.sendCodeError'));
      setStep('code');
      setCaptchaToken('');
      setCaptchaResetKey((key) => key + 1);
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : t('claim.sendCodeError'));
      setCaptchaToken('');
      setCaptchaResetKey((key) => key + 1);
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code.trim())) {
      setError(t('claim.codeInvalid'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/auth/otp/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || t('claim.verificationFailed'));
      if (!payload?.session?.access_token || !payload?.session?.refresh_token) {
        throw new Error(t('claim.sessionMissing'));
      }
      setSessionPayload(payload.session);
      onClaimed?.(email.trim().toLowerCase());
      setStep('verified');
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : t('claim.verificationFailed'));
    } finally {
      setBusy(false);
    }
  };

  const openWallet = () => {
    if (!sessionPayload) return;
    const fragment = new URLSearchParams({
      access_token: sessionPayload.access_token,
      refresh_token: sessionPayload.refresh_token,
      expires_in: String(sessionPayload.expires_in ?? 3600),
      token_type: sessionPayload.token_type ?? 'bearer',
      type: 'magiclink',
    });
    // Tokens stay in the URL fragment so they are not sent in HTTP requests;
    // the HashPass callback consumes them and removes the fragment immediately.
    const url = `https://hashpass.tech/auth/callback?returnTo=${encodeURIComponent('/dashboard/wallet')}#${fragment.toString()}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
    else void Linking.openURL(url);
  };

  const eyebrow = step === 'quiz'
    ? t('claimQuiz.eyebrow')
    : t('claim.earnedTgeReserved', { amount: rewardTotal });
  const titleKey = step === 'quiz'
    ? 'claimQuiz.title'
    : step === 'verified'
      ? 'claim.verifiedTitle'
      : step === 'code'
        ? 'claim.verifyTitle'
        : 'claim.title';

  return (
    <LukasDialog visible={visible} onClose={reset} isDark={isDark} isMobile={isMobile} palette={palette} closeLabel={t('claim.close')}>
      <LukasEyebrow palette={palette}>{eyebrow}</LukasEyebrow>
      <Text style={styles.title}>{t(titleKey)}</Text>
      {step === 'quiz' ? quizScore === null ? <>
        <Text style={styles.copy}>{t('claimQuiz.intro')}</Text>
        <View
          style={styles.quizStepTrack}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: quizQuestions.length, now: questionIndex + 1 }}
          accessibilityLabel={t('claimQuiz.progress', { current: questionIndex + 1, total: quizQuestions.length })}
        >
          {quizQuestions.map((_, index) => <View key={index} style={[styles.quizStepSegment, { backgroundColor: index <= questionIndex ? palette.fill : palette.border }]} />)}
        </View>
        <Text style={styles.quizProgress}>{t('claimQuiz.progress', { current: questionIndex + 1, total: quizQuestions.length })}</Text>
        <Text style={styles.quizQuestion}>{currentQuestion.prompt}</Text>
        <View style={styles.quizAnswers} accessibilityRole="radiogroup">
          {currentQuestion.options.map((option, optionIndex) => {
            const selected = selectedAnswer === optionIndex;
            return (
              <Pressable
                key={`${questionIndex}-${optionIndex}`}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityHint={t('claimQuiz.selectAnswer')}
                onPress={() => setQuizAnswers((answers) => answers.map((answer, index) => index === questionIndex ? optionIndex : answer))}
                style={({ pressed }) => [
                  styles.quizOption,
                  { backgroundColor: selected ? palette.tint : palette.cardRaised, borderColor: selected ? palette.fill : palette.border },
                  pressed && styles.quizOptionPressed,
                ]}
              >
                <View style={[styles.radioOuter, { borderColor: selected ? palette.fill : palette.borderStrong }]}>
                  {selected ? <View style={styles.radioInner} /> : null}
                </View>
                <Text style={[styles.quizOptionCopy, { color: palette.text }]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.quizActions}>
          {questionIndex > 0 ? (
            <ActionButton mode={mode} skin={skin} variant="ghost" label={t('claimQuiz.previous')} onPress={() => setQuestionIndex((index) => Math.max(0, index - 1))} style={styles.quizAction} />
          ) : <View style={styles.quizActionSpacer} />}
          <ActionButton mode={mode} skin={skin} label={isLastQuestion ? t('claimQuiz.checkAnswers') : t('claimQuiz.next')} disabled={selectedAnswer === null} onPress={continueQuiz} style={styles.quizAction} />
        </View>
      </> : <>
        <Text accessibilityRole="alert" style={styles.quizResult}>{t('claimQuiz.failed', { score: quizScore })}</Text>
        <ActionButton mode={mode} skin={skin} label={t('claimQuiz.retry')} onPress={retryQuiz} style={lukasFullWidth} />
      </> : null}
      {step === 'email' ? <>
        {quizScore !== null ? <Text style={styles.quizPass}>{t('claimQuiz.passed', { score: quizScore })}</Text> : null}
        <Text style={styles.copy}>{t('claim.emailIntro')}</Text>
        <FormField mode={mode} label={t('claim.emailLabel')} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" placeholder={t('claim.emailPlaceholder')} />
        <LukasCaptcha resetKey={captchaResetKey} onSolve={setCaptchaToken} onReset={() => setCaptchaToken('')} />
        <ActionButton mode={mode} skin={skin} label={t('claim.sendCode')} loading={busy} disabled={!captchaToken} onPress={requestCode} style={lukasFullWidth} />
      </> : null}
      {step === 'code' ? <>
        <Text style={styles.copy}>{t('claim.codeIntro', { email: email.trim().toLowerCase() })}</Text>
        <FormField mode={mode} label={t('claim.codeLabel')} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" placeholder={t('claim.codePlaceholder')} style={styles.codeInput} />
        <ActionButton mode={mode} skin={skin} label={t('claim.verifyEmail')} loading={busy} onPress={verifyCode} style={lukasFullWidth} />
      </> : null}
      {step === 'verified' ? <>
        <Text style={styles.copy}>{t('claim.verifiedCopy')}</Text>
        <ActionButton mode={mode} skin={skin} label={t('claim.openWallet')} onPress={openWallet} style={lukasFullWidth} />
        <Text style={styles.note}>{t('claim.securityNote')}</Text>
      </> : null}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </LukasDialog>
  );
}

const getStyles = (isMobile: boolean, palette: ReturnType<typeof lukasPalette>) => StyleSheet.create({
  title: dialogTitle(palette, isMobile),
  copy: dialogCopy(palette),
  codeInput: { textAlign: 'center', fontSize: uiTokens.type.title, letterSpacing: 8, fontWeight: '800' },
  note: { color: palette.muted, fontSize: uiTokens.type.caption, lineHeight: 18, textAlign: 'center' },
  error: { color: palette.danger, fontSize: uiTokens.type.caption + 1, lineHeight: 19, textAlign: 'center' },
  quizStepTrack: { flexDirection: 'row', gap: uiTokens.space.xs },
  quizStepSegment: { flex: 1, height: 4, borderRadius: uiTokens.radius.pill },
  quizProgress: { color: palette.accent, fontSize: uiTokens.type.caption, fontWeight: '800', letterSpacing: 0.4 },
  quizQuestion: { color: palette.text, fontSize: uiTokens.type.body, lineHeight: 24, fontWeight: '800' },
  quizAnswers: { gap: uiTokens.space.sm },
  quizOption: { minHeight: uiTokens.control.minHeight, flexDirection: 'row', alignItems: 'center', gap: uiTokens.space.md, borderWidth: uiTokens.control.borderWidth, borderRadius: uiTokens.radius.input, paddingHorizontal: uiTokens.space.md, paddingVertical: uiTokens.space.sm },
  quizOptionPressed: { opacity: 0.82 },
  radioOuter: { width: 20, height: 20, borderWidth: 2, borderRadius: uiTokens.radius.circle, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: uiTokens.radius.circle, backgroundColor: palette.fill },
  quizOptionCopy: { flex: 1, fontSize: uiTokens.type.body, lineHeight: 22, fontWeight: '600' },
  quizActions: { flexDirection: 'row', alignItems: 'center', gap: uiTokens.space.sm, marginTop: uiTokens.space.sm },
  quizAction: { flex: 1 },
  quizActionSpacer: { flex: 1, minHeight: uiTokens.control.minHeight },
  quizResult: { color: palette.danger, fontSize: uiTokens.type.body, lineHeight: 24, fontWeight: '700' },
  quizPass: { color: palette.accent, fontSize: uiTokens.type.body, lineHeight: 24, fontWeight: '800' },
});
