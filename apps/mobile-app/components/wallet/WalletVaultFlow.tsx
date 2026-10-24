import { uiTokens } from '@hashpass/ui/tokens';
import { ActionButton } from '@hashpass/ui/primitives';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createActor } from 'xstate';
import { createRecoveryChallenge, exportRecoveryBackup, HybridWallet, type RecoveryChallenge, type VaultTransport, type WalletEnrollment } from '@hashpass/wallet';
import { hybridVaultClient } from '../../lib/wallet/hybrid-vault-api';
import { createWalletEnrollmentClient } from '../../lib/wallet/enrollment-client';
import { walletPinRecoveryClient } from '../../lib/wallet/pin-recovery-client';
import { bindWalletLifecycle } from '../../lib/wallet/lifecycle';
import { saveRecoveryFile } from '../../lib/wallet/recovery-files';
import { walletOperationId, walletRandom } from '../../lib/wallet/device-wallet';
import { usePin } from '../../hooks/usePin';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from '../../i18n/i18n';
import PinFlow from '../security/PinFlow';
import PinPad from '../security/PinPad';
import { walletVaultMachine, vaultFlowStep, type VaultFlowOrigin } from '../../hooks/wallet-vault-machine';
import type { VaultCommand } from './WalletVaultFlow.types';
export type { VaultCommand } from './WalletVaultFlow.types';

export default function WalletVaultFlow({ enrollment, onReload, onChanged, command }: {
  enrollment: WalletEnrollment; onReload?: () => void;
  /** Called once the wallet's state changed on the server (created), so the card can refresh quietly. */
  onChanged?: () => void;
  /** An action chosen from the card's menu; applied once per nonce. */
  command?: VaultCommand | null;
}) {
  if (!enrollment.setupEnabled || enrollment.scope.environment !== 'development') {
    // Never silently hidden: the person must know the setup wizard exists, why it is not
    // offered here, and how to start it once it becomes available.
    return <SetupUnavailable environment={enrollment.scope.environment} registered={enrollment.state === 'registered'} onReload={onReload} />;
  }
  return <Vault key={`${enrollment.scope.ownerId}:${enrollment.scope.walletId}`} initial={enrollment} onChanged={onChanged} command={command} />;
}

function SetupUnavailable({ environment, registered, onReload }: { environment: string; registered: boolean; onReload?: () => void }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('wallet');
  const mode = isDark ? 'dark' : 'light';
  const label = (key: string, fallback: string) => t(`vault.${key}`, fallback);
  const body = { color: colors.text.secondary, lineHeight: 22 };
  const text = registered
    ? label('setupRegistered', 'Wallet management is not available in this build for your account. Your wallet itself is not affected.')
    : environment !== 'development'
      ? label('setupEnv', 'The setup wizard only runs on the test networks in this build. Your account has no wallet yet.')
      : label('setupFlag', 'Wallet setup is not enabled for your account yet. Your account has no wallet yet.');
  return <View style={{ gap: uiTokens.space.md }}>
    <Text style={{ color: colors.text.primary, fontSize: 20, fontWeight: '700' }}>{label('setupTitle', 'Wallet setup wizard')}</Text>
    <Text style={body}>{text}</Text>
    {onReload && <ActionButton mode={mode} variant="secondary" label={label('setupCheck', 'Check again for wallet setup')}
      onPress={onReload} />}
  </View>;
}

function Vault({ initial, onChanged, command }: { initial: WalletEnrollment; onChanged?: () => void; command?: VaultCommand | null }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('wallet');
  const mode = isDark ? 'dark' : 'light';
  const label = (key: string, fallback: string) => t(`vault.${key}`, fallback);
  const pin = usePin(initial.scope.ownerId);
  const pinRef = useRef(pin); pinRef.current = pin;

  const [step, setStep] = useState('intro');
  const [acknowledged, setAcknowledged] = useState(false);
  const [phrase, setPhrase] = useState('');
  const [challengeAnswers, setChallengeAnswers] = useState(['', '', '']);
  const [recoverCode, setRecoverCode] = useState('');
  const [recoverPhrase, setRecoverPhrase] = useState('');
  const [recoverProof, setRecoverProof] = useState<string | null>(null);
  const recoverProofRef = useRef<import('../../types/step-up.types').StepUpProof | null>(null);
  const [changeCurrent, setChangeCurrent] = useState<string | null>(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [backupConfirm, setBackupConfirm] = useState('');
  const [backupFormOpen, setBackupFormOpen] = useState(false);
  const [backupProblem, setBackupProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const epoch = useRef(0);
  const working = useRef(false);
  const challengeRef = useRef<RecoveryChallenge | null>(null);
  const actorRef = useRef<ReturnType<typeof createActor<typeof walletVaultMachine>> | null>(null);

  const lockNow = useCallback(() => {
    // Invalidate in-flight work so a late result (a phrase!) can never land on screen.
    epoch.current++;
    challengeRef.current?.dispose(); challengeRef.current = null;
    setPhrase(''); setChallengeAnswers(['', '', '']);
    setRecoverCode(''); setRecoverPhrase(''); setRecoverProof(null); recoverProofRef.current = null;
    setChangeCurrent(null);
    setBackupPassword(''); setBackupConfirm(''); setBackupFormOpen(false); setBackupProblem(null);
    actorRef.current?.send({ type: 'LOCK' });
    setBusy(false);
  }, []);
  useEffect(() => bindWalletLifecycle({ lock: lockNow }), [lockNow]);

  useEffect(() => {
    const actor = createActor(walletVaultMachine, { input: { registered: initial.state === 'registered' } });
    actorRef.current = actor;
    const sub = actor.subscribe(snapshot => { setStep(vaultFlowStep(snapshot.value)); setAcknowledged(snapshot.context.acknowledged); });
    actor.start();
    return () => { sub.unsubscribe(); actor.stop(); actorRef.current = null; };
    // A quiet status refresh hands in a new row object for the same wallet; restarting the
    // machine then would throw away a phrase screen that is open. Only the identity restarts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.scope.ownerId, initial.scope.walletId]);

  // Actions picked from the card's menu enter the same machine the in-flow buttons use.
  const lastCommand = useRef(0);
  useEffect(() => {
    if (!command || command.nonce === lastCommand.current) return;
    lastCommand.current = command.nonce;
    setPhrase(''); setChangeCurrent(null); setReason(null);
    actorRef.current?.send({ type: command.type });
  }, [command]);

  const wallet = useMemo(() => new HybridWallet({
    scope: initial.scope,
    enrollment: createWalletEnrollmentClient(() => pinRef.current.proofFor('wallet:sign')),
    vault: hybridVaultClient as VaultTransport,
    random: walletRandom,
    newOperationId: walletOperationId,
    proofs: {
      unlock: () => pinRef.current.proofFor('wallet:unlock'),
      sign: () => pinRef.current.proofFor('wallet:sign'),
    },
    changeServerPin: (next, current) => pinRef.current.setPin(next, current),
    // The full proof object (scope + expiry, not just the token) is what the recovery endpoint checks.
    resetServerPin: async next => {
      const proof = recoverProofRef.current;
      if (!proof) throw new Error('wallet_recovery_unavailable');
      await walletPinRecoveryClient.setRecoveredPin(next, proof);
    },
  }), [initial.scope.ownerId, initial.scope.walletId]);

  const run = useCallback((action: () => Promise<'phrase' | 'home'>) => {
    if (working.current) return;
    working.current = true; setBusy(true); setReason(null);
    const stamp = epoch.current;
    void (async () => {
      try {
        const next = await action();
        if (stamp === epoch.current) { actorRef.current?.send({ type: 'SUCCEEDED', next }); onChanged?.(); }
      } catch (failure) {
        if (stamp !== epoch.current) return;
        const message = failure instanceof Error ? failure.message : 'vault_failed';
        if (message === 'wallet_step_up_required') pinRef.current.lock();
        setReason(message);
        actorRef.current?.send({ type: 'FAILED', reason: message });
      } finally {
        working.current = false;
        if (stamp === epoch.current) setBusy(false);
      }
    })();
  }, [onChanged]);

  const call = useCallback(async (digits: string, scope: 'wallet:sign') => {
    // Both proofs used by a change come from the CURRENT pin, so they are minted before the
    // server verifier is replaced.
    if (!await pinRef.current.unlock(digits, scope)) throw new Error('vault_unlock_failed');
  }, []);

  const withPhrase = useCallback((origin: VaultFlowOrigin, action: (digits: string) => Promise<void>) =>
    (digits: string) => run(async () => {
      await action(digits);
      return origin === 'create' || origin === 'reveal' ? 'phrase' : 'home';
    }), [run]);

  const create = withPhrase('create', async digits => {
    await call(digits, 'wallet:sign');
    const result = await wallet.create(digits);
    setPhrase(result.phrase);
    challengeRef.current?.dispose();
    challengeRef.current = createRecoveryChallenge(result.phrase, walletRandom);
  });
  const reveal = withPhrase('reveal', async digits => {
    const words = await wallet.reveal(digits);
    setPhrase(words);
    challengeRef.current?.dispose();
    challengeRef.current = createRecoveryChallenge(words, walletRandom);
  });
  const change = withPhrase('change', async digits => {
    await call(changeCurrent!, 'wallet:sign');
    await wallet.changePin(changeCurrent!, digits);
    setChangeCurrent(null);
  });
  const recover = withPhrase('recover', async digits => {
    await wallet.recover(recoverPhrase, digits, recoverProof!);
    setRecoverProof(null); recoverProofRef.current = null;
  });

  const body = { color: colors.text.secondary, lineHeight: 22 };
  const stack = { gap: uiTokens.space.md } as const;
  const heading = { color: colors.text.primary, fontSize: 20, fontWeight: '700' as const };
  const input = [styles.input, { color: colors.text.primary, borderColor: colors.divider }];

  const content = (() => {
  if (step === 'intro') return <View style={stack}>
    <Text style={heading}>{label('title', 'Your wallet')}</Text>
    <Text style={body}>{label('intro', 'Create your HASHPASS wallet: one wallet for Ethereum, Bitcoin and Solana (testnet for now), encrypted with your PIN. You will see your recovery phrase once and can save it.')}</Text>
    <Text style={body}>{label('exportOnly', 'HASHPASS only manages wallets it creates itself. You can export your recovery phrase at any time; importing wallets made elsewhere is not supported.')}</Text>
    <ActionButton mode={mode} disabled={busy} label={label('create', 'Create wallet')}
      onPress={() => actorRef.current?.send({ type: 'CREATE' })} />
  </View>;

  if (step === 'enter_pin') return <View style={stack}>
    <Text style={heading}>{label('pinTitle', 'Confirm your PIN')}</Text>
    <Text style={body}>{label('pinIntro', 'Enter your 4-digit PIN. It encrypts your wallet and is asked every time you open your wallet and before every sensitive action.')}</Text>
    <PinFlow mode={mode} pin={pin} scope="wallet:unlock" intent="unlock"
      onDone={digits => { if (digits) { setPhrase(''); actorRef.current?.send({ type: 'PIN_OK', origin: 'create' }); create(digits); } }}
      onCancel={() => actorRef.current?.send({ type: 'CANCEL' })} />
  </View>;

  if (step === 'working') return <View style={stack}><Text style={body}>{label('working', 'Working…')}</Text></View>;

  if (step === 'phrase') return <View style={stack}>
    <Text style={heading}>{label('phraseTitle', 'Your recovery phrase')}</Text>
    <Text style={body}>{label('phraseWarning', 'Write these words down, in order, somewhere private. Anyone who has them controls your wallet. HASHPASS will never ask you for them.')}</Text>
    <Text selectable style={{ color: colors.text.primary, lineHeight: 28 }}>
      {phrase.split(' ').map((word, index) => `${index + 1}. ${word}`).join('   ')}
    </Text>
    <Text style={body}>{label('acknowledge', 'I understand that if I lose this phrase my funds cannot be recovered, and that HASHPASS is not responsible for the management or security of my assets.')}</Text>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: acknowledged }}
      onPress={() => actorRef.current?.send({ type: 'ACKNOWLEDGE' })} style={styles.check}>
      <Text style={{ color: colors.text.primary }}>{label('acknowledgeShort', 'I understand and accept')}</Text>
    </Pressable>
    <ActionButton mode={mode} disabled={busy} label={label('hide', 'I saved it — continue')}
      onPress={() => { setPhrase(''); actorRef.current?.send({ type: 'HIDE' }); }} />
    <ActionButton mode={mode} variant="ghost" disabled={busy || !acknowledged}
      label={label('download', 'Download unprotected phrase')}
      onPress={() => { void saveRecoveryFile(phrase, true); }} />
    <ActionButton mode={mode} variant="secondary" disabled={busy || !acknowledged}
      label={backupFormOpen ? label('backupCancel', 'Cancel encrypted backup') : label('export', 'Download encrypted backup')}
      onPress={() => { setBackupFormOpen(open => !open); setBackupProblem(null); }} />
    {backupFormOpen && <>
      <Text style={body}>{label('backupHelp', 'A separate password of at least 16 characters with 8 distinct characters protects this file. HASHPASS cannot reset it or recover your phrase. Without it the file cannot be opened.')}</Text>
      <TextInput accessibilityLabel={label('backupPassword', 'Backup password')} value={backupPassword}
        onChangeText={value => { setBackupPassword(value); setBackupProblem(null); }} secureTextEntry
        autoComplete="off" autoCorrect={false} autoCapitalize="none" maxLength={256} style={input} />
      <TextInput accessibilityLabel={label('backupConfirm', 'Confirm backup password')} value={backupConfirm}
        onChangeText={value => { setBackupConfirm(value); setBackupProblem(null); }} secureTextEntry
        autoComplete="off" autoCorrect={false} autoCapitalize="none" maxLength={256} style={input} />
      {backupProblem && <Text accessibilityRole="alert" style={body}>{describeBackupProblem(backupProblem, label)}</Text>}
      <ActionButton mode={mode} disabled={busy} label={label('backupSave', 'Save encrypted file')} loading={busy}
        onPress={() => {
          if (backupPassword !== backupConfirm) { setBackupProblem('vault_backup_mismatch'); return; }
          setBusy(true);
          void exportRecoveryBackup(phrase, initial.network ?? 'testnet', backupPassword, walletRandom)
            .then(backup => saveRecoveryFile(backup))
            .then(() => { setBusy(false); setBackupPassword(''); setBackupConfirm(''); setBackupFormOpen(false); })
            .catch(failure => { setBusy(false); setBackupProblem(messageOf(failure)); });
        }} />
    </>}
  </View>;

  return <View style={stack}>
    {reason && <Text accessibilityRole="alert" style={{ color: colors.text.primary }}>{describeFailure(reason, label)}</Text>}
    {step === 'home' && <>
      <Text style={heading}>{label('homeTitle', 'Wallet ready')}</Text>
      <Text style={body}>{label('homeIntro', 'Your wallet is encrypted with your PIN. If you forget it, a code from your email plus your recovery phrase resets it.')}</Text>
      <ActionButton mode={mode} disabled={busy} label={label('reveal', 'Show recovery phrase')}
        onPress={() => { setPhrase(''); actorRef.current?.send({ type: 'REVEAL' }); }} />
      <ActionButton mode={mode} variant="secondary" disabled={busy} label={label('change', 'Change PIN')}
        onPress={() => { setChangeCurrent(null); actorRef.current?.send({ type: 'CHANGE' }); }} />
      <ActionButton mode={mode} variant="ghost" disabled={busy} label={label('recover', 'I forgot my PIN')}
        onPress={() => actorRef.current?.send({ type: 'RECOVER' })} />
    </>}
    {step === 'reveal_pin' && <PinFlow mode={mode} pin={pin} scope="wallet:unlock" intent="unlock"
      onDone={digits => { if (digits) { actorRef.current?.send({ type: 'PIN_OK', origin: 'reveal' }); reveal(digits); } }}
      onCancel={() => actorRef.current?.send({ type: 'CANCEL' })} />}
    {step === 'change_pin' && (changeCurrent === null
      ? <PinFlow mode={mode} pin={pin} scope="wallet:unlock" intent="unlock"
          onDone={digits => { if (digits) setChangeCurrent(digits); }}
          onCancel={() => actorRef.current?.send({ type: 'CANCEL' })} />
      : <NewPinEntry mode={mode} label={label} onDone={digits => { actorRef.current?.send({ type: 'PIN_OK', origin: 'change' }); change(digits); }}
        onCancel={() => { setChangeCurrent(null); actorRef.current?.send({ type: 'CANCEL' }); }} />)}
    {step === 'challenge' && <>
      <Text style={body}>{label('challenge', 'Enter the requested words from your saved recovery phrase.')}</Text>
      {(challengeRef.current?.positions ?? []).map((position, index) => <View key={position}>
        <Text style={body}>{label('word', 'Word')} {position + 1}</Text>
        <TextInput accessibilityLabel={label('answer', 'Recovery word')} value={challengeAnswers[index]}
          onChangeText={value => setChallengeAnswers(previous => previous.map((answer, i) => i === index ? value : answer))}
          style={input} />
      </View>)}
      <ActionButton mode={mode} disabled={busy} label={label('verifyWords', 'Verify recovery words')} onPress={() => {
        if (challengeRef.current?.verify(challengeAnswers)) {
          challengeRef.current.dispose(); challengeRef.current = null; setChallengeAnswers(['', '', '']);
          actorRef.current?.send({ type: 'CHALLENGE_PASSED' });
        } else setReason('vault_words_wrong');
      }} />
    </>}
    {step === 'recover_send' && <>
      <Text style={body}>{label('recoverIntro', 'We will email you a 6-digit code. You will also need your recovery phrase.')}</Text>
      <ActionButton mode={mode} disabled={busy} label={label('sendCode', 'Email me a reset code')}
        onPress={() => { setBusy(true); setReason(null);
          void walletPinRecoveryClient.sendRecoveryCode().then(() => { setBusy(false); actorRef.current?.send({ type: 'CODE_SENT' }); })
            .catch(failure => { setBusy(false); setReason(messageOf(failure)); }); }} />
    </>}
    {step === 'recover_code' && <>
      <Text style={body}>{label('codeHint', 'Enter the 6-digit code from your email.')}</Text>
      <TextInput accessibilityLabel={label('code', 'Email code')} keyboardType="number-pad" maxLength={6}
        value={recoverCode} onChangeText={setRecoverCode} style={input} />
      <ActionButton mode={mode} disabled={busy || recoverCode.length !== 6} label={label('codeNext', 'Continue')}
        onPress={() => { setBusy(true); setReason(null);
          void walletPinRecoveryClient.verifyRecoveryCode(recoverCode).then(proof => {
            setBusy(false); recoverProofRef.current = proof; setRecoverProof(proof.token); actorRef.current?.send({ type: 'CODE_OK' });
          }).catch(failure => { setBusy(false); setReason(messageOf(failure)); }); }} />
    </>}
    {step === 'recover_phrase' && <>
      <Text style={body}>{label('recoverPhraseHint', 'Enter your recovery phrase to prove this wallet is yours.')}</Text>
      <TextInput accessibilityLabel={label('recoverPhrase', 'Recovery phrase')} value={recoverPhrase}
        onChangeText={setRecoverPhrase} multiline style={input} />
      <ActionButton mode={mode} disabled={busy || !recoverPhrase.trim()} label={label('phraseNext', 'Continue')}
        onPress={() => actorRef.current?.send({ type: 'PHRASE_OK' })} />
    </>}
    {step === 'recover_pin' && <NewPinEntry mode={mode} label={label}
      onDone={digits => { actorRef.current?.send({ type: 'PIN_OK', origin: 'recover' }); recover(digits); }}
      onCancel={() => actorRef.current?.send({ type: 'CANCEL' })} />}
    {step === 'failed' && <>
      <Text style={body}>{describeFailure(reason ?? 'vault_failed', label)}</Text>
      <ActionButton mode={mode} label={label('back', 'Go back')}
        onPress={() => { setChangeCurrent(null); actorRef.current?.send({ type: 'BACK' }); }} />
    </>}
  </View>;
  })();

  // Everything past the intro and the wallet's home is a security-sensitive step (PIN entry,
  // the recovery phrase, resets). Those take over the whole screen, like the initial PIN
  // setup, so nothing else on the page can be tapped or read while they run.
  const secure = step !== 'intro' && step !== 'home';
  if (!secure) return content;
  const cancellable = step === 'enter_pin' || step === 'reveal_pin' || step === 'change_pin' || step === 'recover_code' || step === 'recover_phrase' || step === 'recover_pin';
  return <Modal visible animationType="fade" onRequestClose={() => { if (cancellable) actorRef.current?.send({ type: 'CANCEL' }); }}>
    <View style={[styles.fullScreen, { backgroundColor: colors.background.default }]}>
      <ScrollView contentContainerStyle={styles.fullScreenContent} keyboardShouldPersistTaps="handled">
        <View style={styles.fullScreenInner}>{content}</View>
      </ScrollView>
    </View>
  </Modal>;
}

/** New-PIN entry for change/reset: two matching entries, device-side only (the server is called by the flow that uses it). */
function NewPinEntry({ mode, label, onDone, onCancel }: {
  mode: 'light' | 'dark'; label: (key: string, fallback: string) => string;
  onDone: (pin: string) => void; onCancel: () => void;
}) {
  const [first, setFirst] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState(false);
  return <View style={{ gap: uiTokens.space.md, alignItems: 'stretch' }}>
    <PinPad mode={mode}
      title={first === null ? label('newPinTitle', 'Choose a new 4-digit PIN') : label('newPinConfirmTitle', 'Enter the same four digits again')}
      hint={label('newPinHint', 'This PIN encrypts your wallet from now on.')}
      error={mismatch ? label('mismatch', 'The two PINs did not match. Start again.') : null}
      onComplete={(entered: string) => {
        if (first === null) { setFirst(entered); setMismatch(false); return; }
        if (first !== entered) { setFirst(null); setMismatch(true); return; }
        setFirst(null); onDone(entered);
      }} />
    <ActionButton mode={mode} variant="ghost" label={label('cancel', 'Not now')} onPress={onCancel} />
  </View>;
}

const messageOf = (failure: unknown) => failure instanceof Error ? failure.message : 'vault_failed';

function describeBackupProblem(reason: string, label: (key: string, fallback: string) => string): string {
  switch (reason) {
    case 'vault_backup_mismatch': return label('backupMismatch', 'The two passwords did not match. Enter them again.');
    case 'weak_wallet_password': return label('backupWeak', 'Use at least 16 characters with 8 distinct characters, and not only digits.');
    default: return label('backupFailed', 'The encrypted file could not be created. Nothing was changed; try again.');
  }
}

function describeFailure(reason: string, label: (key: string, fallback: string) => string): string {  switch (reason) {
    case 'invalid_mnemonic': return label('importInvalid', 'That is not a valid recovery phrase. Check every word and the order (12, 15, 18, 21 or 24 words).');
    case 'wallet_vault_exists': return label('alreadyWallet', 'This account already has a wallet. An import cannot replace it — use "Show recovery phrase" or "I forgot my PIN" instead.');
    case 'wallet_vault_missing': return label('vaultMissing', 'The encrypted wallet record is missing for this account. Use "I forgot my PIN" with your recovery phrase to rebuild it.');
    case 'vault_unlock_failed': return label('wrongPin', 'That PIN did not unlock the wallet. Nothing was changed.');
    case 'wallet_pin_change_failed': return label('changeFailed', 'The PIN could not be changed. Nothing was changed.');
    case 'wallet_vault_conflict': return label('conflict', 'The wallet changed while you were working. Start again.');
    case 'wallet_recovery_mismatch': return label('recoveryMismatch', 'That recovery phrase does not match this wallet.');
    case 'vault_words_wrong': return label('wordsWrong', 'Those words are not right. Check your saved recovery phrase.');
    case 'wallet_code_invalid': case 'wallet_recovery_invalid': return label('codeInvalid', 'That code is not right or has expired. Request a new one.');
    case 'wallet_recovery_rate_limited': return label('rateLimited', 'Too many attempts. Wait a little, then request a new code.');
    case 'wallet_recovery_unavailable': return label('recoveryUnavailable', 'PIN reset is unavailable right now. Try again later.');
    case 'wallet_step_up_required': return label('stepUp', 'Your PIN session expired. Start again.');
    default: return label('failed', 'Something went wrong. Nothing was changed. Try again.');
  }
}

const styles = StyleSheet.create({
  fullScreen: { flex: 1 },
  fullScreenContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center',
    padding: uiTokens.space.xl, paddingTop: Platform.OS === 'web' ? uiTokens.space.xl : 64 },
  fullScreenInner: { width: '100%', maxWidth: 480 },
  input: { minHeight: 48, padding: 14, borderRadius: uiTokens.radius.input, borderWidth: 1 },
  check: { minHeight: 48, justifyContent: 'center' },
});
