import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SegmentedTabs } from '@hashpass/ui/primitives';
import { useTheme } from '../../hooks/useTheme';
import { useTranslation } from '../../i18n/i18n';
import DrawerSheet from '../ui/DrawerSheet';
import type { ThemeColors } from '../../lib/theme';
import type { FaqEntry, FaqCategory } from './WalletHelpDrawer.types';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';

/**
 * The wallet's internal support wiki, hosted in the shared DrawerSheet base: semantic-ish
 * search over the FAQ corpus (query terms + a synonym map, so "password" finds the PIN and
 * "lost backup" finds the recovery phrase) and category tabs whose items expand in place.
 */

/** Query words people actually type mapped to the words the answers use. */
const SYNONYMS: Record<string, string[]> = {
  password: ['pin'], passcode: ['pin'], code: ['pin', 'six-digit'],
  lost: ['forgot', 'lose', 'losing'], stolen: ['control', 'private'],
  backup: ['recovery phrase', 'phrase', 'save'], back: ['recovery phrase', 'phrase'],
  seed: ['recovery phrase', 'phrase'], words: ['recovery phrase', 'phrase'],
  transfer: ['move', 'send', 'funds'],
  money: ['funds', 'assets'], crypto: ['assets', 'funds'],
  safe: ['security', 'control'], secure: ['security', 'control'],
  custodial: ['non-custodial', 'control'], bank: ['non-custodial', 'control'],
};

const normalize = (value: string) => value.normalize('NFKD').toLowerCase().replace(/[^\w\s'-]/g, ' ');
const tokenize = (value: string) => normalize(value).split(/\s+/).filter(token => token.length > 2);

function searchScore(query: string, entry: FaqEntry): number {
  const terms = tokenize(query);
  if (!terms.length) return 1;
  const question = normalize(entry.question);
  const answer = normalize(entry.answer);
  let score = 0;
  for (const term of terms) {
    const expansions = SYNONYMS[term] ?? [];
    const matches = (text: string, word: string) => text.includes(word);
    if (matches(question, term)) score += 6;
    else if (matches(answer, term)) score += 3;
    for (const expansion of expansions) {
      if (matches(question, expansion)) score += 4;
      else if (matches(answer, expansion)) score += 2;
    }
  }
  return score;
}

export default function WalletHelpDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { colors, isDark } = useTheme();
  const { t } = useTranslation('wallet');
  const mode = isDark ? 'dark' : 'light';
  const [category, setCategory] = useState<FaqCategory>('security');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const entries: FaqEntry[] = useMemo(() => [
    { category: 'security', question: t('faq.controlQ', 'Who controls my assets?'),
      answer: t('faq.controlA', 'You do. HASHPASS is non-custodial: your wallet is encrypted with your PIN and your seed never leaves your device unencrypted. HASHPASS cannot move, freeze or recover your assets, and is not responsible for their management or security.') },
    { category: 'security', question: t('faq.phraseQ', 'What is the recovery phrase?'),
      answer: t('faq.phraseA', 'Twenty-four words that fully back up your wallet. Write them down in order and keep them private: anyone who has them controls your funds. If you lose them, your funds cannot be recovered.') },
    { category: 'recovery', question: t('faq.pinQ', 'What does the 4-digit PIN do?'),
      answer: t('faq.pinA', 'The PIN encrypts your wallet. It is asked every time you open your wallet and before every sensitive action. HASHPASS cannot see or recover it — if you forget it, use the email code + recovery phrase reset.') },
    { category: 'recovery', question: t('faq.forgotQ', 'I forgot my PIN. What now?'),
      answer: t('faq.forgotA', 'Open your wallet page and choose "I forgot my PIN". A six-digit code is emailed to you; the code plus your saved recovery phrase sets a new PIN and rebuilds your wallet.') },
    { category: 'networks', question: t('faq.importQ', 'Can I import my existing wallet?'),
      answer: t('faq.importA', 'Yes. Any BIP-39 wallet (MetaMask, Trust, Ledger, Phantom and others) can export its recovery phrase and you can import it during wallet setup. Your funds do not move, and the phrase keeps working in the original wallet.') },
    { category: 'networks', question: t('faq.networksQ', 'Which networks are supported?'),
      answer: t('faq.networksA', 'Ethereum, Bitcoin and Solana first. The rollout runs on test networks; main networks arrive after the security review is complete.') },
    { category: 'networks', question: t('faq.testnetQ', 'Why do I see "test networks"?'),
      answer: t('faq.testnetA', 'During the rollout your HASHPASS wallet is created on test networks, so balances are test balances. Your account, PIN and recovery phrase work the same way on main networks later.') },
    { category: 'support', question: t('faq.supportQ', 'How do I get help?'),
      answer: t('faq.supportA', 'For account or event questions, contact HASHPASS support. For anything about your funds, remember: only your PIN and recovery phrase control the wallet — support can never move assets for you.') },
  ], [t]);

  const searching = query.trim().length > 0;
  const results = useMemo(() => {
    if (!searching) return entries.filter(entry => entry.category === category);
    return entries
      .map(entry => ({ entry, score: searchScore(query, entry) }))
      .filter(result => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(result => result.entry);
  }, [entries, category, query, searching]);

  const tabs = [
    { id: 'security' as const, label: t('help.security', 'Security') },
    { id: 'recovery' as const, label: t('help.recovery', 'PIN & recovery') },
    { id: 'networks' as const, label: t('help.networks', 'Wallets & networks') },
    { id: 'support' as const, label: t('help.support', 'Support') },
  ];
  const styles = getStyles(colors);
  // Content-fit on open (defaultHeight omitted): the sheet hugs the search box, tabs and
  // the current category's items, with no dead white band; the grabber expands it when
  // more room is wanted. Content scrolls inside whenever it outgrows the 85% cap.
  return <DrawerSheet open={open} onClose={onClose}
    title={t('help.title', 'Wallet help')}
    closeLabel={t('help.close', 'Close help')}
    expandLabel={t('help.expand', 'Expand')}
    shrinkLabel={t('help.shrink', 'Shrink')}>
    <TextInput accessibilityLabel={t('help.searchLabel', 'Search help')} value={query}
      onChangeText={setQuery} placeholder={t('help.searchPlaceholder', 'Search: password, lost backup, import…')}
      placeholderTextColor={colors.text.secondary} style={styles.search}
      autoCapitalize="none" autoCorrect={false} />
    {!searching && <SegmentedTabs mode={mode} tabs={tabs} value={category} onChange={setCategory}
      accentColor={colors.primary} surfaceColor={colors.background.paper} />}
    <View style={styles.list}>
      {results.length === 0 ? <Text style={styles.body}>{t('help.noResults', 'Nothing matched. Try other words, or browse the categories.')}</Text>
        : results.map(entry => <View key={entry.question} style={styles.item}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: expanded === entry.question }}
            onPress={() => setExpanded(expanded === entry.question ? null : entry.question)} style={styles.itemButton}>
            <Text style={styles.question}>{entry.question}</Text>
            <Text style={styles.question}>{expanded === entry.question ? '−' : '+'}</Text>
          </Pressable>
          {expanded === entry.question && <Text style={styles.body}>{entry.answer}</Text>}
        </View>)}
    </View>
  </DrawerSheet>;
}

/** Floating "?" that opens the drawer from any wallet tab. */
export function WalletHelpButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  const { t } = useTranslation('wallet');
  return <Pressable accessibilityRole="button" accessibilityLabel={t('help.open', 'Wallet help')} onPress={onPress}
    style={[helpStyles.button, { backgroundColor: colors.primary }]}>
    <Text style={helpStyles.icon}>?</Text>
  </Pressable>;
}

const helpStyles = StyleSheet.create({
  button: { position: 'absolute', right: 20, bottom: 28, width: 56, height: 56, borderRadius: uiTokens.radius.circle,
    alignItems: 'center', justifyContent: 'center', elevation: 4, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  icon: { color: uiPalette(false).onAccent, fontSize: 24, fontWeight: '800' },
});

const getStyles = (colors: ThemeColors) => StyleSheet.create({
  search: { minHeight: 48, borderRadius: uiTokens.radius.input, borderWidth: 1, borderColor: colors.divider,
    paddingHorizontal: 14, color: colors.text.primary, fontSize: 14 },
  list: { gap: 12 },
  item: { borderRadius: uiTokens.radius.media, borderWidth: 1, borderColor: colors.divider, padding: 16, gap: 10 },
  itemButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  question: { color: colors.text.primary, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  body: { color: colors.text.secondary, fontSize: 14, lineHeight: 22 },
});
