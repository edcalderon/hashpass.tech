import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { ActionButton, Badge, FilterChip, FormField, IconButton, ModalBackdrop, SegmentedTabs, Surface } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import type { ColorMode } from '@hashpass/ui/tokens';
import { useTranslation } from '../../i18n/i18n';
import { CONTACT_TOPICS, MAX_CONTACT_TOPICS, contactInitials, filterContacts, networkProgress, toggleContactTopic } from '../../lib/contacts';
import { getHashpassFullLogo } from '../../lib/hashpass-logo';
import { Ionicons } from '../../lib/vector-icons';
import type { ContactGrouping, ContactProfile, ContactProfileDraft, ContactsExperienceProps, ContactsTab } from '../../types/contacts';
import ContactsGraph from './ContactsGraph';

export default function ContactsExperience({ snapshot, loading = false, busy = false, error, signedIn, standalone, mode, onAction, onRetry, onSignIn, onDashboard, onStandalone }: ContactsExperienceProps) {
  const { t } = useTranslation('contacts');
  const palette = uiPalette(mode);
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const [tab, setTab] = useState<ContactsTab>('network');
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState<string | null>(null);
  const [grouping, setGrouping] = useState<ContactGrouping>('topic');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [draft, setDraft] = useState<ContactProfileDraft>({ name: '', role: '', company: '', topics: [], discoverable: false, leaderboard: false });
  const [notice, setNotice] = useState('');
  const profile = snapshot?.profile;
  const contacts = snapshot?.contacts ?? [];
  const filtered = useMemo(() => filterContacts(contacts, query, topic), [contacts, query, topic]);
  const suggestions = useMemo(() => filterContacts(snapshot?.suggestions ?? [], query, topic), [snapshot?.suggestions, query, topic]);
  const selected = contacts.find(contact => contact.id === selectedId);
  const progress = networkProgress(profile?.points ?? 0);
  const topics = profile?.topics ?? [];
  const shared = snapshot?.shared;
  const shareUrl = profile?.share_id ? `https://hashpass.tech/contacts?card=${encodeURIComponent(profile.share_id)}` : '';
  const styles = useMemo(() => makeStyles(mode), [mode]);

  useEffect(() => {
    setSelectedId(null); setEditing(false); setSharing(false); setNotice(''); setCopied(false);
    setQuery(''); setTopic(null);
  }, [profile?.id, signedIn]);

  const editProfile = () => {
    if (!signedIn) { onSignIn(); return; }
    if (!snapshot || loading || busy) return;
    setDraft({ name: profile?.name ?? '', role: profile?.role ?? '', company: profile?.company ?? '', topics: [...topics], discoverable: profile?.discoverable ?? false, leaderboard: profile?.leaderboard ?? false });
    setEditing(true);
  };
  const share = () => {
    if (!profile) { editProfile(); return; }
    setCopied(false); setCopyFailed(false); setSharing(true);
  };
  const connect = async (card: string) => {
    if (!profile) { editProfile(); return; }
    if (await onAction({ action: 'request', card })) setNotice(t('requestSent', 'Request sent. Your connection begins when they accept.'));
  };

  const person = (contact: ContactProfile, action?: React.ReactNode) => <View key={contact.id} style={styles.person}>
    <View style={styles.avatar}><Text style={styles.initials}>{contactInitials(contact.name)}</Text></View>
    <View style={styles.personText}>
      <Text style={styles.name}>{contact.name}</Text>
      {!!(contact.role || contact.company) && <Text style={styles.caption}>{[contact.role, contact.company].filter(Boolean).join(' · ')}</Text>}
      <Text style={styles.topicText}>{contact.topics.map(value => t(`topics.${value}`, value)).join(' · ')}</Text>
    </View>
    {action}
  </View>;

  const heading = (label: string, detail?: string) => <View style={styles.stackSmall}>
    <Text accessibilityRole="header" style={styles.sectionTitle}>{label}</Text>
    {!!detail && <Text style={styles.body}>{detail}</Text>}
  </View>;

  const interests = <Surface mode={mode} style={styles.stack}>
    <View style={styles.between}>
      {heading(t('interests', 'Your interests'))}
      <IconButton mode={mode} label={t('editInterests', 'Edit interests')} disabled={signedIn && (!snapshot || loading || busy)} onPress={editProfile}><Ionicons name="options-outline" size={20} color={palette.accent} /></IconButton>
    </View>
    <Text style={styles.body}>{t('interestsHint', 'Choose what moves you. Find people who share your curiosity.')}</Text>
    <View style={styles.wrap}>{topics.length ? topics.map(value => <FilterChip key={value} mode={mode} label={t(`topics.${value}`, value)} selected={topic === value} onPress={() => setTopic(topic === value ? null : value)} />) : <ActionButton mode={mode} variant="secondary" label={t('chooseTopics', 'Choose your topics')} disabled={signedIn && (!snapshot || loading || busy)} onPress={editProfile} />}</View>
    {topic && <ActionButton mode={mode} variant="ghost" label={t('clearFilter', 'Clear topic filter')} onPress={() => setTopic(null)} />}
  </Surface>;

  return <ScrollView style={styles.page} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    {standalone && <View style={styles.brandBar}>
      <Image source={getHashpassFullLogo(mode === 'dark')} style={styles.logo} resizeMode="contain" accessibilityLabel="HASHPASS" />
      <ActionButton mode={mode} variant="ghost" label={signedIn ? t('dashboard', 'Dashboard') : t('signIn', 'Sign in')} onPress={signedIn ? onDashboard : onSignIn} />
    </View>}
    <View style={styles.header}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>{t('eyebrow', 'PEOPLE. POSSIBILITIES. PROGRESS.')}</Text>
        <Text accessibilityRole="header" style={styles.title}>{t('title', 'Contacts')}</Text>
        <Text style={styles.body}>{t('subtitle', 'Turn a shared interest into your next connection.')}</Text>
      </View>
      <View style={styles.wrap}>
        {!standalone && <IconButton mode={mode} label={t('openStandalone', 'Open standalone Contacts')} onPress={onStandalone}><Ionicons name="open-outline" size={20} color={palette.accent} /></IconButton>}
        <ActionButton mode={mode} label={t('shareCard', 'Share card')} onPress={share} disabled={loading || !!error && !snapshot} leadingIcon={<Ionicons name="qr-code-outline" size={20} color={palette.onAccent} />} />
      </View>
    </View>

    {error && <Surface mode={mode} style={styles.stackSmall}>
      <Text accessibilityRole="alert" style={styles.error}>{t('loadError', 'Your network could not be updated. Your saved connections are unchanged.')}</Text>
      <ActionButton mode={mode} variant="secondary" label={t('retry', 'Try again')} onPress={onRetry} disabled={busy || loading} />
    </Surface>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={styles.success}>{notice}</Text>}
    {loading && <View accessibilityLabel={t('loading', 'Loading your network')} style={styles.row}><ActivityIndicator color={palette.accent} /><Text style={styles.body}>{t('loading', 'Loading your network')}</Text></View>}

    {!signedIn && <Surface mode={mode} style={styles.guest}>
      <Badge mode={mode}>{t('startHere', 'YOUR NEXT CHAPTER STARTS HERE')}</Badge>
      <Text style={styles.heroTitle}>{t('guestTitle', 'Good connections grow with you.')}</Text>
      <Text style={styles.body}>{t('guestBody', 'Shape your interests, exchange contact cards and build a network that lasts beyond the event. Every mutual connection helps you level up.')}</Text>
      <ActionButton mode={mode} label={t('startNetwork', 'Start your network')} onPress={onSignIn} />
    </Surface>}

    {signedIn && snapshot && !loading && !error && !profile && <Surface mode={mode} style={styles.stack}>
      {heading(t('setupTitle', 'Make room for your next connection'), t('setupBody', 'Create your contact card and choose up to five interests to start growing your network.'))}
      <ActionButton mode={mode} label={t('createCard', 'Create my contact card')} onPress={editProfile} />
    </Surface>}

    {(!signedIn || snapshot) && <View style={styles.stats}>
      <View style={styles.stat}><Text style={styles.statValue}>{contacts.length}</Text><Text style={styles.caption}>{t('connections', 'Connections')}</Text></View>
      <View style={styles.stat}><Text style={styles.statValue}>{profile?.points ?? 0}</Text><Text style={styles.caption}>{t('networkXp', 'Network XP')}</Text></View>
      <View style={[styles.level, { minWidth: wide ? 240 : 180 }]}>
        <View style={styles.between}><Text style={styles.name}>{t('level', 'Level {level}', { level: progress.level })}</Text><Text style={styles.caption}>{progress.current} / 500 XP</Text></View>
        <View accessibilityRole="progressbar" accessibilityLabel={t('levelProgress', 'Progress to next level')} accessibilityValue={{ min: 0, max: 500, now: progress.current }} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress.percent}%` }]} /></View>
        <Text style={styles.caption}>{t('nextLevel', '{points} XP to your next level', { points: progress.remaining })}</Text>
      </View>
    </View>}

    <View style={styles.toolbar}>
      <View style={styles.search}><FormField mode={mode} label={t('search', 'Search your network')} value={query} onChangeText={setQuery} placeholder={t('searchPlaceholder', 'People, companies, topics')} autoCorrect={false} /></View>
      <SegmentedTabs mode={mode} value={tab} onChange={setTab} accessibilityLabel={t('views', 'Contacts views')} tabs={[
        { id: 'network', label: t('network', 'Network') }, { id: 'directory', label: t('directory', 'Directory') },
        { id: 'incoming', label: t('incoming', 'Incoming'), count: snapshot?.incoming.length || undefined },
        { id: 'leaderboard', label: t('leaderboard', 'Leaderboard') },
      ]} />
    </View>

    {shared && shared.id !== profile?.id && <Surface mode={mode} style={styles.stack}>
      {heading(t('sharedCard', 'A new connection is waiting'))}
      {person(shared)}
      {contacts.some(contact => contact.id === shared.id) ? <Badge mode={mode}>{t('connected', 'Connected')}</Badge> : <ActionButton mode={mode} label={snapshot?.outgoing.includes(shared.id) ? t('pending', 'Request pending') : snapshot?.incoming.some(request => request.profile.id === shared.id) ? t('respond', 'Respond in Incoming') : t('connect', 'Connect')} onPress={() => snapshot?.incoming.some(request => request.profile.id === shared.id) ? setTab('incoming') : shared.share_id && void connect(shared.share_id)} disabled={busy || snapshot?.outgoing.includes(shared.id)} />}
    </Surface>}

    <View style={[styles.main, wide && styles.mainWide]}>
      {wide && <View style={styles.sidebar}>{interests}
        <Surface mode={mode} style={styles.stack}>
          {heading(t('growTitle', 'Small steps. Wider circles.'))}
          <Text style={styles.body}>{t('topicQuest', 'Shape your card · 20 XP per interest, up to 100 XP.')}</Text>
          <Text style={styles.body}>{t('connectionQuest', 'Meet someone new · 100 XP per mutual connection.')}</Text>
          <Text style={styles.caption}>{t('xpNote', 'Network XP tracks your connections. It is separate from wallet HashPoints and has no monetary value.')}</Text>
        </Surface>
      </View>}
      <View style={styles.workspace}>
        {tab === 'network' && <Surface mode={mode} style={styles.graphPanel}>
          <View style={styles.graphHeader}>
            {heading(t('networkTitle', 'Your living network'), t('networkCount', '{count} connections · built one conversation at a time', { count: contacts.length }))}
            <SegmentedTabs mode={mode} value={grouping} onChange={setGrouping} accessibilityLabel={t('groupBy', 'Group network by')} tabs={[{ id: 'topic', label: t('topic', 'Topic') }, { id: 'company', label: t('company', 'Company') }]} />
          </View>
          <ContactsGraph contacts={filtered} topics={topics} topicLabel={value => t(`topics.${value}`, value)} grouping={grouping} selected={selectedId} mode={mode} onSelect={setSelectedId} youLabel={t('you', 'YOU')} />
          {filtered.length === 0 && <View style={styles.graphEmpty}><Text style={styles.body}>{contacts.length ? t('noMatches', 'No matches. Try another search or topic.') : t('networkEmpty', 'Your first connection starts a new orbit. Share your card to begin.')}</Text></View>}
          {filtered.length > 80 && <Text style={styles.caption}>{t('graphLimit', 'Showing the first 80 connections. Use Directory to see everyone.')}</Text>}
          <View style={styles.graphFooter}><Badge mode={mode} tone="neutral">{t('mutualOnly', 'Mutual connections only')}</Badge><Text style={styles.caption}>{t('graphHint', 'Select a person to explore your shared interests.')}</Text></View>
        </Surface>}

        {selected && tab === 'network' && <Surface mode={mode} style={styles.stack}>
          <View style={styles.between}>{heading(t('contactDetails', 'Connection details'))}<IconButton mode={mode} label={t('close', 'Close')} onPress={() => setSelectedId(null)}><Ionicons name="close" size={20} color={palette.text} /></IconButton></View>
          {person(selected)}
          <Text style={styles.body}>{t('sharedInterests', 'Shared interests')}</Text>
          <View style={styles.wrap}>{selected.topics.filter(value => topics.includes(value)).map(value => <Badge key={value} mode={mode}>{t(`topics.${value}`, value)}</Badge>)}</View>
          {!selected.topics.some(value => topics.includes(value)) && <Text style={styles.caption}>{t('differentInterests', 'Different interests, a new perspective.')}</Text>}
        </Surface>}

        {tab === 'directory' && <Surface mode={mode} style={styles.stack}>
          {heading(t('directory', 'Directory'))}
          {filtered.map(contact => person(contact, <IconButton mode={mode} label={t('viewContact', 'View {name}', { name: contact.name })} onPress={() => { setSelectedId(contact.id); setTab('network'); }}><Ionicons name="arrow-forward" size={20} color={palette.accent} /></IconButton>))}
          {!filtered.length && <Text style={styles.body}>{contacts.length ? t('noMatches', 'No matches. Try another search or topic.') : t('directoryEmpty', 'Accepted connections will appear here. Your contact details are never imported automatically.')}</Text>}
          {heading(t('discover', 'Shared interests. New possibilities.'), t('discoverHint', 'People who chose to be discoverable and share your topics.'))}
          {suggestions.map(contact => <View key={contact.id} style={styles.stackSmall}>{person(contact)}<ActionButton mode={mode} variant="secondary" label={t('connect', 'Connect')} disabled={busy} onPress={() => contact.share_id && void connect(contact.share_id)} /></View>)}
          {!suggestions.length && <Text style={styles.caption}>{t('suggestionsEmpty', 'No suggestions yet. Refine your interests or invite someone with your card.')}</Text>}
        </Surface>}

        {tab === 'incoming' && <Surface mode={mode} style={styles.stack}>
          {heading(t('incoming', 'Incoming'), t('incomingHint', 'You decide who joins your network. Accepting adds a mutual connection.'))}
          {(snapshot?.incoming ?? []).map(request => <View key={request.id} style={styles.request}>
            {person(request.profile)}
            <View style={styles.wrap}><ActionButton mode={mode} label={t('accept', 'Accept')} disabled={busy} onPress={() => void onAction({ action: 'accept', requestId: request.id })} /><ActionButton mode={mode} variant="ghost" label={t('decline', 'Decline')} disabled={busy} onPress={() => void onAction({ action: 'decline', requestId: request.id })} /></View>
          </View>)}
          {!snapshot?.incoming.length && <View style={styles.empty}><Ionicons name="mail-open-outline" size={32} color={palette.muted} /><Text style={styles.body}>{t('incomingEmpty', 'All caught up. New contact requests will land here.')}</Text></View>}
        </Surface>}

        {tab === 'leaderboard' && <Surface mode={mode} style={styles.stack}>
          {heading(t('leaderboardTitle', 'Grow together. Rise together.'), t('leaderboardHint', 'Network XP celebrates mutual connections and curiosity. Only people who opt in appear here.'))}
          <Text style={styles.caption}>{t('rankingRules', '100 XP per accepted connection + 20 XP per interest (maximum 5). Levels advance every 500 XP. Top 20 shown; ties use account order.')}</Text>
          {(snapshot?.leaderboard ?? []).map((entry, index) => <View key={entry.id} style={styles.leaderRow}>
            <Text style={styles.rank}>{String(index + 1).padStart(2, '0')}</Text>
            <View style={styles.personText}><Text style={styles.name}>{entry.name}{entry.id === profile?.id ? ` · ${t('you', 'YOU')}` : ''}</Text><Text style={styles.caption}>{t('level', 'Level {level}', { level: networkProgress(entry.points).level })} · {entry.connections} {t('connections', 'Connections')}</Text></View>
            <Text style={styles.xp}>{entry.points} XP</Text>
          </View>)}
          {!snapshot?.leaderboard.length && <Text style={styles.body}>{t('leaderboardEmpty', 'A new network, a fresh start. Opt in to join the leaderboard.')}</Text>}
          <ActionButton mode={mode} variant="secondary" label={t('manageVisibility', 'Manage my visibility')} disabled={signedIn && (!snapshot || loading || busy)} onPress={editProfile} />
        </Surface>}
      </View>
      {!wide && interests}
    </View>

    <Modal visible={editing} transparent animationType="none" onRequestClose={() => !busy && setEditing(false)}>
      <ModalBackdrop mode={mode} style={styles.modalBackdrop}>
        <Surface mode={mode} style={styles.dialog} accessibilityViewIsModal>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.stack}>
            <View style={styles.between}>{heading(t('editCard', 'Your contact card'))}<IconButton mode={mode} label={t('close', 'Close')} disabled={busy} onPress={() => setEditing(false)}><Ionicons name="close" size={20} color={palette.text} /></IconButton></View>
            <Text style={styles.body}>{t('cardPrivacy', 'Share your name, role and interests. Your email and phone number stay private.')}</Text>
            <FormField mode={mode} label={t('name', 'Name')} value={draft.name} onChangeText={name => setDraft(value => ({ ...value, name }))} maxLength={80} autoFocus editable={!busy} />
            <FormField mode={mode} label={t('role', 'Role')} value={draft.role} onChangeText={role => setDraft(value => ({ ...value, role }))} maxLength={100} editable={!busy} />
            <FormField mode={mode} label={t('company', 'Company')} value={draft.company} onChangeText={company => setDraft(value => ({ ...value, company }))} maxLength={100} editable={!busy} />
            {heading(t('chooseTopics', 'Choose your topics'), t('topicLimit', '{count} of {max} interests selected', { count: draft.topics.length, max: MAX_CONTACT_TOPICS }))}
            <View style={styles.wrap}>{CONTACT_TOPICS.map(value => <FilterChip key={value} mode={mode} label={t(`topics.${value}`, value)} selected={draft.topics.includes(value)} disabled={busy || !draft.topics.includes(value) && draft.topics.length >= MAX_CONTACT_TOPICS} onPress={() => setDraft(previous => ({ ...previous, topics: toggleContactTopic(previous.topics, value) }))} />)}</View>
            <View style={styles.between}><View style={styles.personText}><Text style={styles.name}>{t('discoverable', 'Help like-minded people find me')}</Text><Text style={styles.caption}>{t('discoverableHint', 'Show your card in shared-interest suggestions.')}</Text></View><Switch accessibilityLabel={t('discoverable', 'Help like-minded people find me')} value={draft.discoverable} disabled={busy} onValueChange={discoverable => setDraft(previous => ({ ...previous, discoverable }))} trackColor={{ true: palette.accentFill }} /></View>
            <View style={styles.between}><View style={styles.personText}><Text style={styles.name}>{t('joinLeaderboard', 'Join the leaderboard')}</Text><Text style={styles.caption}>{t('joinLeaderboardHint', 'Show your name, connections, level and XP.')}</Text></View><Switch accessibilityLabel={t('joinLeaderboard', 'Join the leaderboard')} value={draft.leaderboard} disabled={busy} onValueChange={leaderboard => setDraft(previous => ({ ...previous, leaderboard }))} trackColor={{ true: palette.accentFill }} /></View>
            {error && <Text accessibilityRole="alert" style={styles.error}>{t('saveError', 'Your changes could not be saved. Please try again.')}</Text>}
            <ActionButton mode={mode} label={t('save', 'Save contact card')} loading={busy} disabled={!draft.name.trim()} onPress={async () => { if (await onAction({ action: 'profile', profile: draft })) { setEditing(false); setNotice(t('saved', 'Your contact card is saved.')); } }} />
          </ScrollView>
        </Surface>
      </ModalBackdrop>
    </Modal>

    <Modal visible={sharing} transparent animationType="none" onRequestClose={() => setSharing(false)}>
      <ModalBackdrop mode={mode} style={styles.modalBackdrop}>
        <Surface mode={mode} style={styles.dialog} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.stack}>
            <View style={styles.between}>{heading(t('shareCard', 'Share card'))}<IconButton mode={mode} label={t('close', 'Close')} onPress={() => setSharing(false)}><Ionicons name="close" size={20} color={palette.text} /></IconButton></View>
            {profile && person(profile)}
            <View style={styles.qr} accessibilityLabel={t('qrLabel', 'Scan to request a connection')} accessible>{!!shareUrl && <QRCode value={shareUrl} size={200} color={uiTokens.colors.light.text} backgroundColor={uiTokens.colors.light.canvas} />}</View>
            <Text style={styles.body}>{t('shareHint', 'Let someone scan your card or send them the link. You both choose to connect before your networks grow.')}</Text>
            <Text selectable style={styles.caption}>{shareUrl}</Text>
            {copyFailed && <Text accessibilityRole="alert" style={styles.error}>{t('copyFailed', 'Could not copy. Select the card link to copy it manually.')}</Text>}
            <ActionButton mode={mode} label={copied ? t('copied', 'Link copied') : t('copyLink', 'Copy card link')} onPress={async () => { try { const didCopy = await Clipboard.setStringAsync(shareUrl); setCopied(didCopy); setCopyFailed(!didCopy); } catch { setCopyFailed(true); } }} />
          </ScrollView>
        </Surface>
      </ModalBackdrop>
    </Modal>
  </ScrollView>;
}

const makeStyles = (mode: ColorMode) => {
  const p = uiPalette(mode);
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: p.canvas },
    content: { width: '100%', maxWidth: 1320, alignSelf: 'center', padding: uiTokens.space.xl, paddingBottom: uiTokens.space.hero, gap: uiTokens.space.xl },
    brandBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: uiTokens.space.sm },
    logo: { width: 144, height: 36 },
    header: { flexDirection: 'row', flexWrap: 'wrap', gap: uiTokens.space.lg, alignItems: 'center', justifyContent: 'space-between' },
    heading: { flexGrow: 1, gap: uiTokens.space.sm },
    eyebrow: { color: p.muted, fontSize: uiTokens.type.caption, fontWeight: '600', letterSpacing: 1 },
    title: { fontSize: uiTokens.type.display, color: p.text, fontWeight: '700', letterSpacing: -1 },
    heroTitle: { fontSize: uiTokens.type.heading, color: p.text, fontWeight: '700' },
    body: { color: p.muted, fontSize: uiTokens.type.label, lineHeight: 22, flexShrink: 1 },
    caption: { color: p.muted, fontSize: uiTokens.type.caption, lineHeight: 19, flexShrink: 1 },
    error: { color: p.danger, fontSize: uiTokens.type.label, lineHeight: 22 },
    success: { color: p.success, fontSize: uiTokens.type.label },
    guest: { alignItems: 'flex-start', gap: uiTokens.space.lg },
    stats: { flexDirection: 'row', flexWrap: 'wrap', gap: uiTokens.space.xl, alignItems: 'center', paddingVertical: uiTokens.space.lg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: p.border },
    stat: { gap: uiTokens.space.xs, flexGrow: 1 },
    statValue: { color: p.text, fontSize: uiTokens.type.heading, fontWeight: '600' },
    level: { gap: uiTokens.space.sm, flexGrow: 2 },
    progressTrack: { height: 6, overflow: 'hidden', borderRadius: uiTokens.radius.pill, backgroundColor: p.border },
    progressFill: { height: '100%', borderRadius: uiTokens.radius.pill, backgroundColor: p.accentFill },
    toolbar: { gap: uiTokens.space.lg },
    search: { maxWidth: 520, width: '100%' },
    main: { gap: uiTokens.space.xl },
    mainWide: { flexDirection: 'row', alignItems: 'flex-start' },
    sidebar: { width: 280, gap: uiTokens.space.xl },
    workspace: { flex: 1, minWidth: 0, gap: uiTokens.space.xl, width: '100%' },
    stack: { gap: uiTokens.space.lg },
    stackSmall: { gap: uiTokens.space.sm },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: uiTokens.space.sm },
    between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: uiTokens.space.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: uiTokens.space.sm },
    sectionTitle: { fontSize: uiTokens.type.body, color: p.text, fontWeight: '600' },
    name: { fontSize: uiTokens.type.label, color: p.text, fontWeight: '600' },
    person: { flexDirection: 'row', alignItems: 'center', gap: uiTokens.space.md, paddingVertical: uiTokens.space.md },
    personText: { flex: 1, minWidth: 0, gap: uiTokens.space.xs },
    avatar: { width: 44, height: 44, borderRadius: uiTokens.radius.circle, borderWidth: 1, borderColor: p.border, backgroundColor: p.accentSoft, alignItems: 'center', justifyContent: 'center' },
    initials: { color: p.accent, fontWeight: '700', fontSize: uiTokens.type.label },
    topicText: { color: p.muted, fontSize: uiTokens.type.caption },
    graphPanel: { padding: 0, overflow: 'hidden' },
    graphHeader: { padding: uiTokens.space.xl, gap: uiTokens.space.lg },
    graphFooter: { padding: uiTokens.space.lg, gap: uiTokens.space.md, borderTopWidth: 1, borderColor: p.border },
    graphEmpty: { paddingHorizontal: uiTokens.space.xl, paddingBottom: uiTokens.space.xl, alignItems: 'center' },
    request: { gap: uiTokens.space.sm, paddingBottom: uiTokens.space.lg, borderBottomWidth: 1, borderColor: p.border },
    empty: { alignItems: 'center', paddingVertical: uiTokens.space.xl, gap: uiTokens.space.lg },
    leaderRow: { flexDirection: 'row', alignItems: 'center', gap: uiTokens.space.md, paddingVertical: uiTokens.space.md, borderBottomWidth: 1, borderColor: p.border },
    rank: { color: p.muted, fontSize: uiTokens.type.title, fontWeight: '600' },
    xp: { color: p.accent, fontSize: uiTokens.type.label, fontWeight: '600' },
    modalBackdrop: { padding: uiTokens.space.lg, justifyContent: 'center', alignItems: 'center' },
    dialog: { width: '100%', maxWidth: 640, maxHeight: '90%', backgroundColor: p.raised },
    qr: { alignSelf: 'center', padding: uiTokens.space.lg, backgroundColor: uiTokens.colors.light.canvas, borderRadius: uiTokens.radius.media },
  });
};
