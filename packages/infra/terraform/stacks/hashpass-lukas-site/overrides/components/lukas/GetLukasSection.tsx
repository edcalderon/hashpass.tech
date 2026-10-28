import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { FormField } from '@hashpass/ui/primitives';
import { uiTokens } from '@hashpass/ui/tokens';
import { useTheme } from '../../hooks/useTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTranslation } from '../../i18n/i18n';
import { LukasCaptcha } from '../LukasCaptcha';
import { LukasButton, LukasCard, LukasDialog, dialogCopy, dialogTitle, lukasPalette, lukasSectionTitle } from './lukas-ui';
import { LukasGlyph } from './LukasGlyph';

const API_BASE = 'https://api.hashpass.tech/api';
const SUCCESS_COPY = "You're already listed for $LKS airdrops and prizes until the LUKAS $LKS TGE. We're currently in testnet.";

type WalletKind = 'ethereum' | 'solana';
type ModalView = 'choices' | 'hashpass' | 'wallets' | 'newsletter' | 'success';

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type SolanaProvider = EthereumProvider & {
  signMessage?: (message: Uint8Array, display?: string) => Promise<{ signature: Uint8Array }>;
};

const getBrowserWindow = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window as typeof window & { ethereum?: EthereumProvider; solana?: SolanaProvider };
};

const encodeBase58 = (bytes: Uint8Array) => {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const value = digits[index] * 256 + carry;
      digits[index] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let result = '';
  for (const byte of bytes) {
    if (byte !== 0) break;
    result += '1';
  }
  for (let index = digits.length - 1; index >= 0; index -= 1) result += alphabet[digits[index]];
  return result;
};

const postJson = async (path: string, body: Record<string, unknown>) => {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'The request could not be completed.');
  return payload;
};

const getJson = async (path: string) => {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'No active HASHPASS session was found.');
  return payload;
};

const buildEthereumMessage = (address: string, nonce: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://lukas.hashpass.tech';
  const domain = typeof window !== 'undefined' ? window.location.host : 'lukas.hashpass.tech';
  return `${domain} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to LUKAS and reserve your place for the $LKS airdrop.\n\nURI: ${origin}\nVersion: 1\nChain ID: 1\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;
};

const buildSolanaMessage = (address: string, nonce: string) =>
  `LUKAS wants you to sign in with your Solana account:\n${address}\n\nSign in to LUKAS and reserve your place for the $LKS airdrop.\n\nNonce: ${nonce}`;

export function GetLukasSection() {
  const { isDark } = useTheme();
  const isMobile = useIsMobile();
  const { t } = useTranslation('lukas');
  const [modalVisible, setModalVisible] = useState(false);
  const [view, setView] = useState<ModalView>('choices');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connectedWallet, setConnectedWallet] = useState('');
  const [email, setEmail] = useState('');
  const [hashPassOptIn, setHashPassOptIn] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const palette = useMemo(() => lukasPalette(isDark), [isDark]);
  const mode = isDark ? 'dark' : 'light';
  const styles = useMemo(() => getStyles(isDark, isMobile, palette), [isDark, isMobile, palette]);

  const openModal = (nextView: ModalView = 'choices') => {
    setView(nextView);
    setError('');
    setCaptchaToken('');
    setModalVisible(true);
  };
  const closeModal = () => {
    if (busy) return;
    setModalVisible(false);
    setView('choices');
    setError('');
  };

  const connectWallet = async (kind: WalletKind, label: string) => {
    setBusy(true);
    setError('');
    try {
      const browserWindow = getBrowserWindow();
      if (kind === 'ethereum') {
        const provider = browserWindow?.ethereum;
        if (!provider) throw new Error('No browser wallet was found. Install MetaMask or another EVM wallet and try again.');
        const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
        const address = accounts?.[0];
        if (!address) throw new Error('Your wallet did not return an account.');
        const challenge = await postJson('/auth/wallet/challenge', { walletAddress: address, walletType: 'ethereum' });
        const message = buildEthereumMessage(address, challenge.nonce);
        const signature = await provider.request({ method: 'personal_sign', params: [message, address] });
        await postJson('/auth/wallet/ethereum', { message, signature, walletAddress: address });
        setConnectedWallet(`${label} · ${address.slice(0, 6)}…${address.slice(-4)}`);
      } else {
        const provider = browserWindow?.solana;
        if (!provider?.signMessage) throw new Error('No Solana wallet was found. Install Phantom and try again.');
        const connection = await provider.request({ method: 'connect' }) as { publicKey?: { toString: () => string } };
        const address = connection?.publicKey?.toString();
        if (!address) throw new Error('Your wallet did not return an account.');
        const challenge = await postJson('/auth/wallet/challenge', { walletAddress: address, walletType: 'solana' });
        const message = buildSolanaMessage(address, challenge.nonce);
        const signed = await provider.signMessage(new TextEncoder().encode(message), 'utf8');
        const signature = encodeBase58(signed.signature);
        await postJson('/auth/wallet/solana', { message, signature, walletAddress: address });
        setConnectedWallet(`${label} · ${address.slice(0, 6)}…${address.slice(-4)}`);
      }
      setView('success');
    } catch (walletError) {
      setError(walletError instanceof Error ? walletError.message : 'Wallet connection failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const joinNewsletter = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Enter a valid email address to join the LUKAS newsletter.');
      return;
    }
    if (!captchaToken) {
      setError('Complete the security check before joining the newsletter.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await postJson('/lukas/subscribe', { email: normalizedEmail, hashpassOptIn: hashPassOptIn, source: 'lukas_landing', captchaToken });
      setView('success');
      setConnectedWallet('');
    } catch (newsletterError) {
      setError(newsletterError instanceof Error ? newsletterError.message : 'Newsletter signup failed. Please try again.');
    } finally {
      setBusy(false);
      setCaptchaToken('');
      setCaptchaResetKey((key) => key + 1);
    }
  };

  const connectHashPass = () => {
    setError('');
    setView('hashpass');
    const authUrl = `https://hashpass.tech/auth?returnTo=${encodeURIComponent('/dashboard/explore')}`;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.open) {
      window.open(authUrl, '_blank', 'noopener,noreferrer');
    } else {
      Linking.openURL(authUrl);
    }
  };

  const checkHashPass = async () => {
    setBusy(true);
    setError('');
    try {
      const payload = await getJson('/lukas/session');
      const email = payload?.user?.email || 'verified HashPass account';
      setConnectedWallet(`HASHPASS · ${email}`);
      setView('success');
    } catch (sessionError) {
      setError(sessionError instanceof Error ? sessionError.message : 'Sign in with HASHPASS first, then try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('getLukas.title')}</Text>
      <Text style={styles.intro}>Connect a wallet or join the independent LUKAS newsletter for LatAm index updates and $LKS eligibility.</Text>
      <View style={styles.content}>
        <View style={styles.stepsContainer}>
          {[
            [t('getLukas.step1.title'), 'Connect your wallet or HashPass account'],
            [t('getLukas.step2.title'), t('getLukas.step2.description')],
            [t('getLukas.step3.title'), t('getLukas.step3.description')],
          ].map(([title, description], index) => (
            <LukasCard key={title} palette={palette} style={styles.step}>
              <View style={styles.stepNumberContainer}><Text style={styles.stepNumber}>{index + 1}</Text></View>
              <View style={styles.stepContent}><Text style={styles.stepTitle}>{title}</Text><Text style={styles.stepDescription}>{description}</Text></View>
            </LukasCard>
          ))}
        </View>
        <View style={styles.ctaContainer}>
          <LukasButton palette={palette} label={t('getLukas.connectWallet')} onPress={() => openModal()} style={styles.cta} />
          <LukasButton palette={palette} variant="secondary" label="Join the LUKAS Newsletter" onPress={() => openModal('newsletter')} style={styles.cta} />
        </View>
        <LukasCard palette={palette} style={styles.comingSoonContainer}>
          <LukasGlyph name="token" size={56} />
          <Text style={styles.comingSoonText}>LUKAS $LKS · Testnet until TGE</Text>
          <Text style={styles.comingSoonSubtext}>Stay listed for airdrops, prizes, and launch pricing.</Text>
        </LukasCard>
      </View>

      <LukasDialog visible={modalVisible} onClose={closeModal} isDark={isDark} isMobile={isMobile} palette={palette}>
        {view !== 'choices' && view !== 'success' ? <Pressable onPress={() => { setError(''); setView('choices'); }} style={styles.backButton} accessibilityRole="button"><Text style={styles.backButtonText}>‹ Back</Text></Pressable> : null}
        {view === 'choices' ? <>
          <Text style={styles.modalTitle}>Connect to LUKAS</Text>
          <Text style={styles.modalSubtitle}>Choose how you want to reserve your place in the $LKS community.</Text>
          <LukasButton palette={palette} label="Connect with HASHPASS" onPress={connectHashPass} fullWidth />
          <LukasButton palette={palette} variant="secondary" label="Connect Wallet" onPress={() => setView('wallets')} fullWidth />
          <LukasButton palette={palette} variant="ghost" label="Join the LUKAS newsletter instead" onPress={() => setView('newsletter')} fullWidth />
        </> : null}
        {view === 'hashpass' ? <>
          <Text style={styles.modalTitle}>Connect with HASHPASS</Text>
          <Text style={styles.modalSubtitle}>Sign in in the new tab, then return here to confirm your HashPass account and reserve your LUKAS place.</Text>
          <LukasButton palette={palette} label="I’ve signed in — continue" loading={busy} onPress={checkHashPass} fullWidth />
        </> : null}
        {view === 'wallets' ? <>
          <Text style={styles.modalTitle}>Choose a wallet</Text>
          <Text style={styles.modalSubtitle}>You will sign one message. LUKAS never asks for your seed phrase or private key.</Text>
          <Pressable disabled={busy} onPress={() => connectWallet('ethereum', 'Browser wallet')} accessibilityRole="button" style={({ pressed }) => [styles.walletOption, pressed && styles.pressed, busy && styles.disabled]}><Text style={styles.walletOptionTitle}>MetaMask / Browser wallet</Text><Text style={styles.walletOptionCopy}>Ethereum · EVM</Text></Pressable>
          <Pressable disabled={busy} onPress={() => connectWallet('solana', 'Phantom')} accessibilityRole="button" style={({ pressed }) => [styles.walletOption, pressed && styles.pressed, busy && styles.disabled]}><Text style={styles.walletOptionTitle}>Phantom</Text><Text style={styles.walletOptionCopy}>Solana</Text></Pressable>
          <Text style={styles.walletHint}>WalletConnect and Coinbase Wallet work when their browser provider is enabled.</Text>
        </> : null}
        {view === 'newsletter' ? <>
          <Text style={styles.modalTitle}>Join the LUKAS newsletter</Text>
          <Text style={styles.modalSubtitle}>Get independent LUKAS updates, LatAm index mechanics, launch timing, and $LKS airdrop news.</Text>
          <FormField mode={mode} label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
          <View style={styles.optInRow}><Switch value={hashPassOptIn} onValueChange={setHashPassOptIn} trackColor={{ false: palette.borderStrong, true: palette.fill }} accessibilityLabel="Also send me HASHPASS ecosystem updates" /><Text style={styles.optInText}>Also send me HASHPASS ecosystem updates.</Text></View>
          <LukasCaptcha resetKey={captchaResetKey} onSolve={setCaptchaToken} onReset={() => setCaptchaToken('')} />
          <LukasButton palette={palette} label="Join LUKAS updates" loading={busy} disabled={!captchaToken} onPress={joinNewsletter} fullWidth />
        </> : null}
        {view === 'success' ? <>
          <View style={styles.successIcon}><Text style={styles.successIconText}>✓</Text></View>
          <Text style={[styles.modalTitle, styles.centered]}>You’re on the list</Text>
          {connectedWallet ? <Text style={styles.connectedWallet}>{connectedWallet}</Text> : null}
          <Text style={[styles.modalSubtitle, styles.centered]}>{SUCCESS_COPY}</Text>
          <LukasButton palette={palette} label="Done" onPress={closeModal} fullWidth />
        </> : null}
        {busy && (view === 'wallets' || view === 'hashpass') ? <ActivityIndicator color={palette.fill} style={styles.loader} /> : null}
        {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
      </LukasDialog>
    </View>
  );
}

const getStyles = (isDark: boolean, isMobile: boolean, palette: ReturnType<typeof lukasPalette>) => StyleSheet.create({
  container: { width: '100%', maxWidth: 1200, alignSelf: 'center' },
  title: { ...lukasSectionTitle(palette, isMobile), marginBottom: 12 },
  intro: { color: palette.body, fontSize: isMobile ? 15 : 17, lineHeight: 24, textAlign: 'center', maxWidth: 680, alignSelf: 'center', marginBottom: isMobile ? 32 : 48 },
  content: { width: '100%', gap: 32 },
  stepsContainer: { width: '100%', gap: uiTokens.space.lg },
  step: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: uiTokens.space.lg, padding: isMobile ? 18 : 22, borderRadius: uiTokens.radius.media },
  stepNumberContainer: { flexShrink: 0, width: isMobile ? 40 : 48, height: isMobile ? 40 : 48, borderRadius: uiTokens.radius.circle, backgroundColor: palette.fill, alignItems: 'center', justifyContent: 'center' },
  stepNumber: { color: palette.onFill, fontSize: isMobile ? 18 : 22, fontWeight: '800' },
  stepContent: { flex: 1, minWidth: 0, gap: 4 },
  stepTitle: { fontSize: isMobile ? 18 : 22, fontWeight: '700', color: palette.text },
  stepDescription: { fontSize: isMobile ? 14 : 16, color: palette.body, lineHeight: isMobile ? 20 : 24 },
  ctaContainer: { width: '100%', gap: uiTokens.space.lg, alignItems: 'center' },
  cta: { width: isMobile ? '100%' : undefined, minWidth: isMobile ? 0 : 320 },
  comingSoonContainer: { alignItems: 'center', gap: 8, backgroundColor: palette.tint },
  comingSoonText: { fontSize: isMobile ? 16 : 18, fontWeight: '700', color: palette.accent, textAlign: 'center' },
  comingSoonSubtext: { fontSize: isMobile ? 14 : 16, color: palette.body, textAlign: 'center', lineHeight: isMobile ? 20 : 24 },
  modalTitle: dialogTitle(palette, isMobile),
  modalSubtitle: dialogCopy(palette),
  centered: { textAlign: 'center', paddingRight: 0 },
  backButton: { alignSelf: 'flex-start', minHeight: uiTokens.control.compactHeight, justifyContent: 'center' },
  backButtonText: { color: palette.accent, fontWeight: '700', fontSize: 15 },
  walletOption: { minHeight: uiTokens.control.minHeight, borderRadius: uiTokens.radius.media, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: uiTokens.space.lg, gap: 4 },
  walletOptionTitle: { color: palette.text, fontSize: 16, fontWeight: '800' },
  walletOptionCopy: { color: palette.body, fontSize: 13 },
  walletHint: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.45 },
  optInRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  optInText: { flex: 1, color: palette.body, fontSize: 14, lineHeight: 20 },
  loader: { marginTop: 4 },
  errorText: { color: palette.danger, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  successIcon: { width: 64, height: 64, borderRadius: uiTokens.radius.circle, backgroundColor: palette.tint, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  successIconText: { color: palette.accent, fontSize: 38, fontWeight: '800' },
  connectedWallet: { color: palette.accent, fontWeight: '700', textAlign: 'center', fontSize: 14 },
});
