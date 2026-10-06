import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '../../hooks/useTheme';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTranslation } from '../../i18n/i18n';

const API_BASE = 'https://api.hashpass.tech/api';
const SUCCESS_COPY = "You're already listed for $LKS airdrops and prizes until the LUKAS $LKS TGE in Q2 2027.";

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
  const styles = useMemo(() => getStyles(isDark, isMobile), [isDark, isMobile]);

  const openModal = (nextView: ModalView = 'choices') => {
    setView(nextView);
    setError('');
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
    setBusy(true);
    setError('');
    try {
      await postJson('/lukas/subscribe', { email: normalizedEmail, hashpassOptIn: hashPassOptIn, source: 'lukas_landing' });
      setView('success');
      setConnectedWallet('');
    } catch (newsletterError) {
      setError(newsletterError instanceof Error ? newsletterError.message : 'Newsletter signup failed. Please try again.');
    } finally {
      setBusy(false);
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
            <View key={title} style={styles.step}>
              <View style={styles.stepNumberContainer}><Text style={styles.stepNumber}>{index + 1}</Text></View>
              <View style={styles.stepContent}><Text style={styles.stepTitle}>{title}</Text><Text style={styles.stepDescription}>{description}</Text></View>
            </View>
          ))}
        </View>
        <View style={styles.ctaContainer}>
          <Pressable onPress={() => openModal()} style={styles.primaryButton} accessibilityRole="button"><Text style={styles.primaryButtonText}>{t('getLukas.connectWallet')}</Text></Pressable>
          <Pressable onPress={() => openModal('newsletter')} style={styles.secondaryButton} accessibilityRole="button"><Text style={styles.secondaryButtonText}>Join the LUKAS Newsletter</Text></Pressable>
        </View>
        <View style={styles.comingSoonContainer}><Text style={styles.comingSoonText}>LUKAS $LKS TGE · Q2 2027</Text><Text style={styles.comingSoonSubtext}>Stay listed for airdrops, prizes, and launch pricing.</Text></View>
      </View>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={closeModal}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
              {view !== 'choices' && view !== 'success' ? <Pressable onPress={() => { setError(''); setView('choices'); }} style={styles.backButton}><Text style={styles.backButtonText}>‹ Back</Text></Pressable> : null}
              <Pressable onPress={closeModal} style={styles.closeButton} accessibilityLabel="Close"><Text style={styles.closeButtonText}>×</Text></Pressable>
              {view === 'choices' ? <>
                <Text style={styles.modalTitle}>Connect to LUKAS</Text>
                <Text style={styles.modalSubtitle}>Choose how you want to reserve your place in the $LKS community.</Text>
                <Pressable onPress={connectHashPass} style={styles.modalPrimaryButton}><Text style={styles.modalPrimaryText}>Connect with HASHPASS</Text></Pressable>
                <Pressable onPress={() => setView('wallets')} style={styles.modalOutlineButton}><Text style={styles.modalOutlineText}>Connect Wallet</Text></Pressable>
                <Pressable onPress={() => setView('newsletter')} style={styles.modalLinkButton}><Text style={styles.modalLinkText}>Join the LUKAS newsletter instead</Text></Pressable>
              </> : null}
              {view === 'hashpass' ? <>
                <Text style={styles.modalTitle}>Connect with HASHPASS</Text>
                <Text style={styles.modalSubtitle}>Sign in in the new tab, then return here to confirm your HashPass account and reserve your LUKAS place.</Text>
                <Pressable disabled={busy} onPress={checkHashPass} style={styles.modalPrimaryButton}>{busy ? <ActivityIndicator color="#07111F" /> : <Text style={styles.modalPrimaryText}>I’ve signed in — continue</Text>}</Pressable>
              </> : null}
              {view === 'wallets' ? <>
                <Text style={styles.modalTitle}>Choose a wallet</Text>
                <Text style={styles.modalSubtitle}>You will sign one message. LUKAS never asks for your seed phrase or private key.</Text>
                <Pressable disabled={busy} onPress={() => connectWallet('ethereum', 'Browser wallet')} style={styles.walletOption}><Text style={styles.walletOptionTitle}>MetaMask / Browser wallet</Text><Text style={styles.walletOptionCopy}>Ethereum · EVM</Text></Pressable>
                <Pressable disabled={busy} onPress={() => connectWallet('solana', 'Phantom')} style={styles.walletOption}><Text style={styles.walletOptionTitle}>Phantom</Text><Text style={styles.walletOptionCopy}>Solana</Text></Pressable>
                <Text style={styles.walletHint}>WalletConnect and Coinbase Wallet work when their browser provider is enabled.</Text>
              </> : null}
              {view === 'newsletter' ? <>
                <Text style={styles.modalTitle}>Join the LUKAS newsletter</Text>
                <Text style={styles.modalSubtitle}>Get independent LUKAS updates, LatAm index mechanics, launch timing, and $LKS airdrop news.</Text>
                <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" placeholder="you@example.com" placeholderTextColor={isDark ? '#718096' : '#94A3B8'} style={styles.emailInput} />
                <View style={styles.optInRow}><Switch value={hashPassOptIn} onValueChange={setHashPassOptIn} trackColor={{ false: '#475569', true: '#35C66B' }} /><Text style={styles.optInText}>Also send me HASHPASS ecosystem updates.</Text></View>
                <Pressable disabled={busy} onPress={joinNewsletter} style={styles.modalPrimaryButton}>{busy ? <ActivityIndicator color="#07111F" /> : <Text style={styles.modalPrimaryText}>Join LUKAS updates</Text>}</Pressable>
              </> : null}
              {view === 'success' ? <>
                <View style={styles.successIcon}><Text style={styles.successIconText}>✓</Text></View>
                <Text style={styles.modalTitle}>You’re on the list</Text>
                {connectedWallet ? <Text style={styles.connectedWallet}>{connectedWallet}</Text> : null}
                <Text style={styles.modalSubtitle}>{SUCCESS_COPY}</Text>
                <Pressable onPress={closeModal} style={styles.modalPrimaryButton}><Text style={styles.modalPrimaryText}>Done</Text></Pressable>
              </> : null}
              {busy && (view === 'wallets' || view === 'hashpass') ? <ActivityIndicator color="#35C66B" style={styles.loader} /> : null}
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (isDark: boolean, isMobile: boolean) => StyleSheet.create({
  container: { width: '100%', maxWidth: 1200, alignSelf: 'center' },
  title: { fontSize: isMobile ? 32 : 48, fontWeight: '800', color: isDark ? '#F9FAFB' : '#111827', textAlign: 'center', marginBottom: 12, letterSpacing: -0.5 },
  intro: { color: isDark ? '#A8B6C8' : '#526174', fontSize: isMobile ? 15 : 17, lineHeight: 24, textAlign: 'center', maxWidth: 680, alignSelf: 'center', marginBottom: isMobile ? 32 : 48 },
  content: { gap: 32 }, stepsContainer: { gap: 16 },
  step: { flexDirection: 'row', gap: 20, padding: 22, borderRadius: 16, backgroundColor: isDark ? 'rgba(17, 24, 39, 0.55)' : 'rgba(249, 250, 251, 0.8)', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' },
  stepNumberContainer: { width: isMobile ? 40 : 48, height: isMobile ? 40 : 48, borderRadius: 999, backgroundColor: '#35C66B', alignItems: 'center', justifyContent: 'center' }, stepNumber: { color: '#07111F', fontSize: isMobile ? 18 : 22, fontWeight: '800' }, stepContent: { flex: 1, gap: 4 },
  stepTitle: { fontSize: isMobile ? 18 : 22, fontWeight: '700', color: isDark ? '#F9FAFB' : '#111827' }, stepDescription: { fontSize: isMobile ? 14 : 16, color: isDark ? '#A8B6C8' : '#526174', lineHeight: isMobile ? 20 : 24 },
  ctaContainer: { gap: 16, alignItems: 'center' }, primaryButton: { paddingHorizontal: 32, paddingVertical: 16, borderRadius: 999, backgroundColor: '#35C66B', alignItems: 'center', justifyContent: 'center', minWidth: isMobile ? '100%' : 300 }, primaryButtonText: { color: '#07111F', fontSize: isMobile ? 16 : 18, fontWeight: '700' },
  secondaryButton: { paddingHorizontal: 32, paddingVertical: 16, borderRadius: 999, borderWidth: 1.5, borderColor: isDark ? '#546477' : '#CBD5E1', alignItems: 'center', justifyContent: 'center', minWidth: isMobile ? '100%' : 300 }, secondaryButtonText: { color: isDark ? '#E5E7EB' : '#1F2937', fontSize: isMobile ? 16 : 18, fontWeight: '600' },
  comingSoonContainer: { padding: 22, borderRadius: 16, backgroundColor: isDark ? 'rgba(53,198,107,0.1)' : 'rgba(53,198,107,0.07)', borderWidth: 1, borderColor: 'rgba(53,198,107,0.3)', alignItems: 'center', gap: 8 }, comingSoonText: { fontSize: isMobile ? 16 : 18, fontWeight: '700', color: isDark ? '#7EE6A0' : '#137A42', textAlign: 'center' }, comingSoonSubtext: { fontSize: isMobile ? 14 : 16, color: isDark ? '#A8B6C8' : '#526174', textAlign: 'center', lineHeight: isMobile ? 20 : 24 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(2, 8, 23, 0.78)', alignItems: 'center', justifyContent: 'center', padding: 20 }, modalCard: { width: '100%', maxWidth: 500, maxHeight: '90%', borderRadius: 24, backgroundColor: isDark ? '#101B2B' : '#FFFFFF', borderWidth: 1, borderColor: isDark ? '#2D4059' : '#E2E8F0', overflow: 'hidden' }, modalScroll: { padding: isMobile ? 24 : 32, gap: 16 },
  modalTitle: { color: isDark ? '#F8FAFC' : '#0F172A', fontSize: isMobile ? 25 : 30, fontWeight: '800', paddingRight: 28 }, modalSubtitle: { color: isDark ? '#A8B6C8' : '#526174', fontSize: 15, lineHeight: 22 }, closeButton: { position: 'absolute', right: 14, top: 12, zIndex: 2, padding: 6 }, closeButtonText: { color: isDark ? '#D5DFEC' : '#64748B', fontSize: 28, lineHeight: 28 }, backButton: { alignSelf: 'flex-start', paddingVertical: 2 }, backButtonText: { color: '#35C66B', fontWeight: '700', fontSize: 15 },
  modalPrimaryButton: { minHeight: 52, borderRadius: 999, backgroundColor: '#35C66B', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }, modalPrimaryText: { color: '#07111F', fontWeight: '800', fontSize: 16 }, modalOutlineButton: { minHeight: 52, borderRadius: 999, borderWidth: 1, borderColor: isDark ? '#53677F' : '#CBD5E1', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }, modalOutlineText: { color: isDark ? '#F8FAFC' : '#0F172A', fontWeight: '700', fontSize: 16 }, modalLinkButton: { alignItems: 'center', paddingVertical: 8 }, modalLinkText: { color: '#35C66B', fontWeight: '700', fontSize: 14 }, walletOption: { borderRadius: 16, borderWidth: 1, borderColor: isDark ? '#344B66' : '#D7E0EA', padding: 16, gap: 4 }, walletOptionTitle: { color: isDark ? '#F8FAFC' : '#0F172A', fontSize: 16, fontWeight: '800' }, walletOptionCopy: { color: isDark ? '#A8B6C8' : '#526174', fontSize: 13 }, walletHint: { color: isDark ? '#8193A8' : '#64748B', fontSize: 12, lineHeight: 18 },
  emailInput: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: isDark ? '#425A73' : '#CBD5E1', color: isDark ? '#F8FAFC' : '#0F172A', paddingHorizontal: 16, fontSize: 16 }, optInRow: { flexDirection: 'row', gap: 10, alignItems: 'center' }, optInText: { flex: 1, color: isDark ? '#C6D1DF' : '#475569', fontSize: 14, lineHeight: 20 }, loader: { marginTop: 4 }, errorText: { color: '#FCA5A5', fontSize: 13, lineHeight: 19, textAlign: 'center' }, successIcon: { width: 64, height: 64, borderRadius: 999, backgroundColor: 'rgba(53,198,107,0.18)', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }, successIconText: { color: '#35C66B', fontSize: 38, fontWeight: '800' }, connectedWallet: { color: '#35C66B', fontWeight: '700', textAlign: 'center', fontSize: 14 },
});
