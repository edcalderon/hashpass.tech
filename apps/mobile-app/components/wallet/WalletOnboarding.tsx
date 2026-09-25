import { uiTokens } from '@hashpass/ui/tokens';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { WalletProvisioning, createRecoveryChallenge, importRecoveryBackup, type LocalWallet, type RecoveryChallenge, type WalletEnrollment } from '@hashpass/wallet';
import { createDeviceWallet, walletOperationId, walletRandom } from '../../lib/wallet/device-wallet';
import { walletEnrollmentClient } from '../../lib/wallet/enrollment-client';
import { bindWalletLifecycle } from '../../lib/wallet/lifecycle';
import { pickRecoveryFile, protectRecoveryScreen, saveRecoveryFile } from '../../lib/wallet/recovery-files';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from '../../i18n/i18n';

/** Rollout remains development/testnet only. Backup proof grants no signing capability. */
export default function WalletOnboarding({ enrollment }: { enrollment: WalletEnrollment }) {
  if (!enrollment.setupEnabled || enrollment.scope.environment !== 'development') return null;
  return <Setup key={`${enrollment.scope.ownerId}:${enrollment.scope.walletId}`} initial={enrollment} />;
}

function Setup({ initial }: { initial: WalletEnrollment }) {
  const { colors } = useTheme();
  const { t } = useTranslation('wallet');
  const label = (key: string, fallback: string) => t(`setup.${key}`, fallback);
  const [row, setRow] = useState(initial);
  const [exists, setExists] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [backupPassword, setBackupPassword] = useState('');
  const [backupConfirm, setBackupConfirm] = useState('');
  const [file, setFile] = useState<string | null>(null);
  const [phrase, setPhrase] = useState('');
  const [answers, setAnswers] = useState(['', '', '']);
  const [phraseVerified, setPhraseVerified] = useState(false);
  const [fileVerified, setFileVerified] = useState(false);
  const [plaintextWarning, setPlaintextWarning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [ready, setReady] = useState(false);
  const local = useRef<LocalWallet | null>(null);
  const provision = useRef<WalletProvisioning | null>(null);
  const challenge = useRef<RecoveryChallenge | null>(null);
  const epoch = useRef(0);
  const working = useRef(false);
  const alive = useRef(false);
  useEffect(() => {
    alive.current = true;
    let cleanupScreen: (() => void) | undefined;
    let cleanupLifecycle: (() => void) | undefined;
    const clear = () => {
      epoch.current++; provision.current?.lock(); local.current?.lock();
      challenge.current?.dispose(); challenge.current = null;
      setPassword(''); setConfirm(''); setBackupPassword(''); setBackupConfirm('');
      setPhrase(''); setAnswers(['', '', '']); setPlaintextWarning(false);
      setPhraseVerified(false); setFileVerified(false); setFile(null);
    };
    try {
      const deviceWallet: LocalWallet = createDeviceWallet(initial.scope);
      local.current = deviceWallet;
      provision.current = new WalletProvisioning(initial, deviceWallet, walletEnrollmentClient, walletOperationId);
      cleanupLifecycle = bindWalletLifecycle({ lock: clear });
      void (async () => {
        const release = await protectRecoveryScreen();
        if (!alive.current) { release(); return; }
        cleanupScreen = release;
        const present = await local.current!.exists();
        if (alive.current) { setExists(present); setReady(true); }
      })().catch(() => { if (alive.current) setError(true); });
    } catch { setError(true); }
    return () => { alive.current = false; clear(); cleanupLifecycle?.(); cleanupScreen?.(); };
  }, [initial]);
  const run = (action: (current: () => boolean) => Promise<void>) => {
    if (working.current || !ready) return;
    working.current = true; setBusy(true); setError(false);
    const stamp = epoch.current;
    const current = () => alive.current && stamp === epoch.current;
    void action(current).catch(() => { if (current()) setError(true); }).finally(() => {
      working.current = false;
      if (alive.current) { setBusy(false); setPassword(''); setConfirm(''); setBackupPassword(''); setBackupConfirm(''); }
    });
  };
  const field = (key: string, fallback: string, value: string, change: (value: string) => void) => <TextInput
    accessibilityLabel={label(key, fallback)} placeholder={label(key, fallback)} placeholderTextColor={colors.text.secondary}
    value={value} onChangeText={change} editable={!busy} secureTextEntry autoComplete="off" textContentType="none"
    autoCorrect={false} autoCapitalize="none" maxLength={256}
    style={[styles.input, { color: colors.text.primary, borderColor: colors.divider }]} />;
  const button = (key: string, fallback: string, onPress: () => void, disabled = false) => <Pressable
    accessibilityRole="button" accessibilityLabel={label(key, fallback)} disabled={busy || !ready || disabled}
    accessibilityState={{ disabled: busy || !ready || disabled }} onPress={onPress}
    style={[styles.button, { borderColor: colors.divider, opacity: busy || !ready || disabled ? 0.45 : 1 }]}>
    <Text style={{ color: colors.primary, fontWeight: '600' }}>{label(key, fallback)}</Text>
  </Pressable>;
  const text = (key: string, fallback: string) => <Text style={{ color: colors.text.secondary, lineHeight: 22 }}>{label(key, fallback)}</Text>;
  const recovery = row.state === 'registered' && exists === false;
  return <View style={styles.stack} {...(Platform.OS === 'web' ? { className: 'sentry-block' } : {})}>
    {text('title', 'Device setup · test networks only')}
    {text('readOnly', 'Signing remains unavailable. Backup checks do not enable transactions.')}
    {error && text('error', 'Unable to complete this step. Check your passwords, backup and connection. Keep your original device; never create a replacement wallet.')}
    {busy && <ActivityIndicator color={colors.primary} />}
    {ready && <>
      {text('passwordHelp', 'Use a separate wallet password: at least 16 characters and 8 distinct characters. HASHPASS cannot reset it or recover your phrase.')}
      {field('password', 'Wallet password', password, setPassword)}
      {(!exists) && field('confirm', 'Confirm wallet password', confirm, setConfirm)}
      {row.state !== 'registered' && button(exists || row.state === 'provisioning' ? 'resume' : 'create', exists || row.state === 'provisioning' ? 'Resume wallet setup' : 'Create testnet wallet', () => {
        if (!exists && password !== confirm) { setError(true); return; }
        run(async current => {
          const registered = await provision.current!.provision(password);
          if (current()) { setRow(registered); setExists(true); }
        });
      })}
      {recovery && text('restoreTitle', 'Restore from encrypted backup')}
      {row.state === 'registered' && <>
        {exists && <>
          {button('reveal', 'Reveal recovery phrase', () => run(async current => {
            const words = await local.current!.recoveryPhrase(password);
            if (!current()) return;
            challenge.current?.dispose(); challenge.current = createRecoveryChallenge(words, walletRandom);
            setAnswers(['', '', '']); setPhraseVerified(false); setPhrase(words);
          }))}
          {!!phrase && <View style={styles.stack}>
            {text('phraseWarning', 'Anyone with these words controls the wallet. Write them down privately, in order. Never send them to support.')}
            <Text style={{ color: colors.text.primary, lineHeight: 28 }}>{phrase.split(' ').map((word, index) => `${index + 1}. ${word}`).join('   ')}</Text>
            {button('hide', 'Hide phrase and verify words', () => setPhrase(''))}
          </View>}
          {!phrase && challenge.current && !phraseVerified && <>
            {text('challenge', 'Enter the requested words from your saved recovery phrase.')}
            {challenge.current.positions.map((position, index) => <View key={position}>
              <Text style={{ color: colors.text.secondary }}>{label('word', 'Word')} {position + 1}</Text>
              {field('answer', 'Recovery word', answers[index], value => setAnswers(previous => previous.map((answer, i) => i === index ? value : answer)))}
            </View>)}
            {button('verifyWords', 'Verify recovery words', () => {
              const valid = challenge.current!.verify(answers); setPhraseVerified(valid); setError(!valid); setAnswers(['', '', '']);
              if (valid) { challenge.current!.dispose(); challenge.current = null; }
            })}
          </>}
        </>}
        {text('backupHelp', 'The encrypted file restores into HASHPASS. It is not a MetaMask JSON keystore. Keep its separate password safely; wallet import compatibility is still being tested.')}
        {field('backupPassword', 'Backup password', backupPassword, setBackupPassword)}
        {exists && <>
          {field('backupConfirm', 'Confirm backup password', backupConfirm, setBackupConfirm)}
          {button('export', 'Download encrypted backup', () => {
            if (backupPassword !== backupConfirm || backupPassword === password) { setError(true); return; }
            run(async current => { const backup = await local.current!.exportBackup(password, backupPassword); if (current()) await saveRecoveryFile(backup); });
          })}
        </>}
        {button('pick', 'Choose encrypted backup file', () => {
          // File pickers may background the app. A returned encrypted file may be
          // selected after that lock, but no password or verification survives it.
          const target = epoch.current;
          void pickRecoveryFile().then((contents: string | null) => { if (alive.current && contents) { setFile(contents); setFileVerified(false); } })
            .catch(() => { if (alive.current && target === epoch.current) setError(true); });
        })}
        {file && text('fileSelected', 'Encrypted file selected. Enter its password to verify or restore it locally.')}
        {button(recovery ? 'restore' : 'verifyFile', recovery ? 'Restore wallet on this device' : 'Verify saved backup', () => {
          if (!file || !row.wallet || (recovery && password !== confirm)) { setError(true); return; }
          run(async current => {
            if (recovery) await local.current!.restore(file, backupPassword, password, row.wallet!);
            else await importRecoveryBackup(file, backupPassword, row.wallet!);
            if (current()) { setExists(true); setFileVerified(true); setFile(null); }
          });
        }, !file)}
        {phraseVerified && fileVerified && text('verified', 'Recovery words and encrypted backup verified for this session. Signing is still disabled.')}
        {exists && <>
          {text('plaintextWarning', 'Optional unencrypted phrase download: anyone who can open this file can take the wallet. Avoid shared folders and cloud sync.')}
          {button(plaintextWarning ? 'cancelPlaintext' : 'acknowledge', plaintextWarning ? 'Cancel unencrypted download' : 'I understand the unencrypted file risk', () => setPlaintextWarning(value => !value))}
          {plaintextWarning && button('plaintext', 'Download unencrypted recovery phrase', () => run(async current => {
            const words = await local.current!.recoveryPhrase(password);
            if (current()) { setPlaintextWarning(false); await saveRecoveryFile(words, true); }
          }))}
        </>}
      </>}
    </>}
  </View>;
}
const styles = StyleSheet.create({
  stack: { gap: 14 }, input: { minHeight: 48, padding: 14, borderRadius: uiTokens.radius.input, borderWidth: 1 },
  button: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 12, borderRadius: uiTokens.radius.pill, borderWidth: 1, alignSelf: 'flex-start' },
});
