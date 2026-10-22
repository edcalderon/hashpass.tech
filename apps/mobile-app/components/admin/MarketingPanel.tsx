import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { ActionButton, Badge, FilterChip, FormField, SegmentedTabs, Surface } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens } from '@hashpass/ui/tokens';
import { useTranslation } from '../../i18n/i18n';
import { formatCampaignTime, MARKETING_REQUIREMENTS, validCampaignDraft } from '../../lib/marketing';
import EmailPreviewFrame from '../EmailPreviewFrame';
import type { CampaignCopy, CampaignLocale, MarketingCampaign, MarketingCampaignDraft, MarketingPanelProps, MarketingView } from '../../types/marketing';

const blankCopy: CampaignCopy = { subject: '', preheader: '', heading: '', message: '', actionLabel: '', actionUrl: 'https://hashpass.tech/' };
const localTime = (value: string) => Number.isFinite(Date.parse(value)) ? new Date(new Date(value).getTime() - 5 * 3600000).toISOString().slice(0, 16) : value.replace(/-05:00$/, '');
const dateKey = (value: string) => localTime(value).slice(0, 10);

export default function MarketingPanel({ overview, mode, loading, busy, error, onRefresh, onAction, onPreview }: MarketingPanelProps) {
  const { t } = useTranslation('marketing');
  const palette = uiPalette(mode);
  const [view, setView] = useState<MarketingView>('calendar');
  const [month, setMonth] = useState(() => dateKey(new Date().toISOString()).slice(0, 7));
  const [day, setDay] = useState<string | null>(null);
  const [draft, setDraft] = useState<MarketingCampaignDraft | null>(null);
  const [selected, setSelected] = useState<MarketingCampaign | null>(null);
  const [dirty, setDirty] = useState(false);
  const [locale, setLocale] = useState<CampaignLocale>('es');
  const [html, setHtml] = useState<string | null>(null);
  const [cutoff, setCutoff] = useState('');
  const campaigns = overview?.campaigns || [];
  const cells = useMemo(() => {
    const start = new Date(`${month}-01T12:00:00Z`);
    const total = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
    return [...Array(start.getUTCDay()).fill(null), ...Array.from({ length: total }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  }, [month]);
  const scheduled = campaigns.filter(c => c.scheduled_at && dateKey(c.scheduled_at).startsWith(month) && (!day || dateKey(c.scheduled_at) === day));
  const text = { color: palette.text, fontSize: uiTokens.type.body, lineHeight: 24 };
  const muted = { ...text, color: palette.muted };
  const title = { ...text, fontSize: uiTokens.type.title, fontWeight: '600' as const, lineHeight: 32 };
  const shiftMonth = (offset: number) => { const d = new Date(`${month}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + offset); setMonth(d.toISOString().slice(0, 7)); setDay(null); };
  const edit = (campaign?: MarketingCampaign) => {
    setSelected(campaign || null); setDirty(false); setHtml(null);
    setDraft(campaign ? { key: campaign.key, name: campaign.name, eventId: campaign.event_id, scheduledAt: campaign.scheduled_at || '', timeZone: 'America/Bogota', content: campaign.content, requirements: campaign.requirements, readiness: campaign.readiness } : {
      key: '', name: '', eventId: 'colombia2026', scheduledAt: `${localTime(new Date(Date.now() + 86400000).toISOString())}-05:00`, timeZone: 'America/Bogota', content: { es: { ...blankCopy }, en: { ...blankCopy } }, requirements: ['product_verified', 'assets_published'], readiness: {},
    });
  };
  const update = (change: Partial<MarketingCampaignDraft>) => { if (draft) { setDraft({ ...draft, ...change }); setDirty(true); setHtml(null); } };
  const updateCopy = (key: keyof CampaignCopy, value: string) => { if (draft) update({ content: { ...draft.content, [locale]: { ...draft.content[locale], [key]: value } } }); };
  const liveSelected = campaigns.find(c => c.key === draft?.key);
  const locked = !!liveSelected && (!['draft', 'paused'].includes(liveSelected.status) || Object.values(liveSelected.counts).some(n => (n || 0) > 0));
  const requirements = {
    product_verified: t('productVerified', 'Product links and flows verified'), assets_published: t('assetsPublished', 'Campaign assets published'), reward_terms_verified: t('rewardTermsVerified', 'Reward terms verified for this message'),
  };
  const status = (key: string) => t(`status.${key}`, ({ draft: 'Draft', scheduled: 'Scheduled', paused: 'Paused', sending: 'In flight', completed: 'Completed', cancelled: 'Cancelled', queued: 'Queued', accepted: 'Provider accepted', failed: 'Rejected', unknown: 'Needs reconciliation', suppressed: 'Suppressed' } as Record<string, string>)[key] || key);
  return <View style={styles.root}>
    <Surface mode={mode}>
      <View style={styles.row}><View style={styles.grow}><Badge mode={mode}>{t('eyebrow', 'CAMPAIGN OPERATIONS')}</Badge><Text style={[title, styles.top]}>{t('title', 'From first invite to event day')}</Text><Text style={muted}>{t('intro', 'Plan campaigns, review bilingual messages and follow each send. All calendar times use Bogotá (UTC−5).')}</Text></View><ActionButton mode={mode} variant="secondary" label={t('refresh', 'Refresh')} loading={loading} onPress={onRefresh} /></View>
      <Text style={[muted, styles.top]}>{t('audience', 'Audience: active registered users with a current newsletter subscription. Unsubscribed and inactive accounts are excluded at send time.')}</Text>
      <View style={[styles.row, styles.top]}><ActionButton mode={mode} label={t('new', 'New campaign')} disabled={busy || !overview} onPress={() => edit()} /><ActionButton mode={mode} variant="secondary" label={t('loadPack', 'Load BSL 2026 drafts')} disabled={busy || !overview} onPress={() => { void onAction({ action: 'seed' }); }} /></View>
    </Surface>
    {!!error && <Surface mode={mode}><Text accessibilityRole="alert" style={{ ...text, color: palette.danger }}>{t('error', 'Campaign service unavailable. Check your access and configuration, then refresh.')}</Text><ActionButton mode={mode} variant="secondary" label={t('retry', 'Try again')} onPress={onRefresh} /></Surface>}
    {loading && !overview && <ActivityIndicator accessibilityLabel={t('loading', 'Loading campaigns')} color={palette.accent} />}
    {overview && <>
      <SegmentedTabs mode={mode} value={view} onChange={setView} tabs={[{ id: 'calendar', label: t('calendar', 'Calendar') }, { id: 'history', label: t('history', 'Delivery history') }, { id: 'activity', label: t('activity', 'Activity & snapshots') }]} />
      {view === 'calendar' && <>
        <Surface mode={mode}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}><ActionButton mode={mode} variant="ghost" label="‹" accessibilityLabel={t('previous', 'Previous month')} onPress={() => shiftMonth(-1)} /><Text style={title}>{month}</Text><ActionButton mode={mode} variant="ghost" label="›" accessibilityLabel={t('next', 'Next month')} onPress={() => shiftMonth(1)} /></View>
          <View style={[styles.grid, styles.top]}>{t('weekdays', 'Sun,Mon,Tue,Wed,Thu,Fri,Sat').split(',').map((label: string) => <Text key={label} style={[muted, styles.cell, { fontSize: uiTokens.type.caption, textAlign: 'center' }]}>{label}</Text>)}</View>
          <View style={[styles.grid, styles.top]}>{cells.map((date, i) => <View key={date || `empty-${i}`} style={styles.cell}>{date && <FilterChip mode={mode} selected={day === date} label={`${Number(date.slice(-2))}${campaigns.some(c => c.scheduled_at && dateKey(c.scheduled_at) === date) ? ' •' : ''}`} accessibilityLabel={`${date}, ${campaigns.filter(c => c.scheduled_at && dateKey(c.scheduled_at) === date).length} ${t('campaigns', 'campaigns')}`} onPress={() => setDay(day === date ? null : date)} />}</View>)}</View>
          <Text style={[muted, styles.top]}>{day || t('allDays', 'All days')} · America/Bogota</Text>
        </Surface>
        {scheduled.length === 0 && <Text style={muted}>{t('emptyCalendar', 'No campaigns for this selection. Load the BSL drafts or create a campaign.')}</Text>}
        {scheduled.map(c => <Surface key={c.id} mode={mode}><View style={styles.row}><View style={styles.grow}><Text style={title}>{c.name}</Text><Text style={muted}>{formatCampaignTime(c.scheduled_at)} · America/Bogota</Text></View><Badge mode={mode} tone="neutral">{status(c.status)}</Badge></View><View style={[styles.row, styles.top]}>{Object.entries(c.counts).map(([key, count]) => <Text key={key} style={muted}>{status(key)}: {count}</Text>)}</View><ActionButton mode={mode} variant="secondary" label={`${t('review', 'Review')} · ${c.name}`} onPress={() => edit(c)} /></Surface>)}
        {draft && <Surface mode={mode}>
          <Text style={title}>{t('editor', 'Campaign editor')}</Text>
          <Text style={muted}>{locked ? t('locked', 'Copy is locked once active or queued. Pause or cancel this campaign; create a new campaign for revised copy.') : t('draftHint', 'Save the copy and prerequisites before scheduling. Saving a draft does not send email.')}</Text>
          <FormField mode={mode} label={t('key', 'Campaign key')} value={draft.key} editable={!selected && !busy} onChangeText={key => update({ key })} autoCapitalize="none" />
          <FormField mode={mode} label={t('name', 'Campaign name')} value={draft.name} editable={!locked && !busy} onChangeText={name => update({ name })} />
          <FormField mode={mode} label={t('eventId', 'Event ID')} value={draft.eventId} editable={!selected && !busy} onChangeText={eventId => update({ eventId })} autoCapitalize="none" />
          <FormField mode={mode} label={t('scheduleTime', 'Send time · YYYY-MM-DDTHH:mm · Bogotá UTC−5')} value={draft.scheduledAt ? localTime(draft.scheduledAt) : ''} editable={!locked && !busy} onChangeText={value => update({ scheduledAt: `${value}-05:00` })} />
          <SegmentedTabs mode={mode} value={locale} onChange={value => { setLocale(value); setHtml(null); }} tabs={[{ id: 'es', label: 'Español' }, { id: 'en', label: 'English' }]} />
          {(['subject', 'preheader', 'heading', 'message', 'actionLabel', 'actionUrl', 'imageUrl', 'imageAlt', 'guideUrl'] as const).map(key => <FormField key={key} mode={mode} label={t(`field.${key}`, ({ subject: 'Subject', preheader: 'Preview text', heading: 'Heading', message: 'Message', actionLabel: 'Button label', actionUrl: 'Destination URL', imageUrl: 'Image URL (optional)', imageAlt: 'Image description', guideUrl: 'Video / guide URL (optional)' })[key])} value={draft.content[locale][key] || ''} editable={!locked && !busy} multiline={key === 'message'} style={key === 'message' ? { minHeight: 160, textAlignVertical: 'top' } : undefined} onChangeText={value => updateCopy(key, value)} />)}
          {MARKETING_REQUIREMENTS.map(key => <View key={key} style={styles.row}><Switch accessibilityLabel={requirements[key as keyof typeof requirements]} disabled={locked || busy} value={draft.requirements.includes(key)} onValueChange={enabled => update({ requirements: enabled ? [...draft.requirements, key] : draft.requirements.filter(r => r !== key) })} /><Text style={[text, styles.grow]}>{requirements[key as keyof typeof requirements]}</Text>{draft.requirements.includes(key) && <Switch accessibilityLabel={`${t('ready', 'Ready')}: ${requirements[key as keyof typeof requirements]}`} disabled={locked || busy} value={draft.readiness[key] === true} onValueChange={ready => update({ readiness: { ...draft.readiness, [key]: ready } })} />}</View>)}
          <View style={[styles.row, styles.top]}><ActionButton mode={mode} label={t('save', 'Save draft')} disabled={locked || busy || !validCampaignDraft(draft)} onPress={async () => { if (await onAction({ action: 'save', draft })) setDirty(false); }} /><ActionButton mode={mode} variant="secondary" label={t('preview', 'Preview email')} disabled={busy} onPress={async () => setHtml(await onPreview(draft.content[locale], locale, draft.eventId))} />
            {liveSelected && (['draft', 'paused'].includes(liveSelected.status) ? <ActionButton mode={mode} label={liveSelected.status === 'paused' ? t('resume', 'Resume') : t('schedule', 'Schedule')} disabled={busy || dirty} onPress={() => { void onAction({ action: liveSelected.status === 'paused' ? 'resume' : 'schedule', id: liveSelected.id }); }} /> : ['scheduled', 'sending'].includes(liveSelected.status) && <ActionButton mode={mode} label={t('pause', 'Pause')} disabled={busy} onPress={() => { void onAction({ action: 'pause', id: liveSelected.id }); }} />)}
            {liveSelected && !['completed', 'cancelled'].includes(liveSelected.status) && <ActionButton mode={mode} variant="ghost" label={t('cancel', 'Cancel campaign')} disabled={busy} onPress={() => { void onAction({ action: 'cancel', id: liveSelected.id }); }} />}
            <ActionButton mode={mode} variant="ghost" label={t('close', 'Close editor')} onPress={() => { setDraft(null); setHtml(null); }} />
          </View>{html && <View style={styles.top}><EmailPreviewFrame html={html} height={600} /></View>}
        </Surface>}
      </>}
      {view === 'history' && <Surface mode={mode}><Text style={title}>{t('history', 'Delivery history')}</Text><Text style={muted}>{t('acceptanceNote', 'Provider accepted means SMTP accepted the message. Delivery, opens and clicks are not inferred. Uncertain sends require provider reconciliation and are not retried automatically.')}</Text>
        {overview.deliveries.length === 0 && <Text style={[muted, styles.top]}>{t('emptyHistory', 'No queued or sent messages yet.')}</Text>}
        {overview.deliveries.map(d => <View key={d.id} style={[styles.ledger, { borderColor: palette.border }]}><Text style={text}>{campaigns.find(c => c.id === d.campaign_id)?.name || d.campaign_id}</Text><Text style={muted}>{status(d.status)} · {formatCampaignTime(d.accepted_at || d.created_at)}</Text><Text selectable style={muted}>{d.id}{d.error_code ? ` · ${d.error_code}` : ''}</Text></View>)}
        <Text style={[title, styles.top]}>{t('audit', 'Campaign audit')}</Text>{overview.audit.map(a => <Text key={a.id} style={muted}>{formatCampaignTime(a.created_at)} · {a.action} · {campaigns.find(c => c.id === a.campaign_id)?.name || '—'}</Text>)}
      </Surface>}
      {view === 'activity' && <Surface mode={mode}><Badge mode={mode}>TESTNET</Badge><Text style={[title, styles.top]}>{t('activity', 'Activity & snapshots')}</Text><Text style={muted}>{t('activityNote', 'Verified agenda, meeting and Contacts actions earn provisional activity points. Navigation observations are counted separately. Tiers, allocations, eligibility cutoff and claim details are forthcoming; Contacts XP remains separate.')}</Text><Text style={[text, styles.top]}>{t('verified', 'Verified interactions')}: {overview.activity.verified} · {t('observed', 'Navigation observations')}: {overview.activity.observed} · {t('points', 'Provisional points')}: {overview.activity.points}</Text><Text style={[muted, styles.top]}>{t('snapshotNote', 'Prepare a reproducible testnet manifest and SHA-256 digest. This records a snapshot internally; it does not publish a blockchain transaction or distribute tokens.')}</Text>
        <FormField mode={mode} label={t('cutoff', 'Snapshot cutoff · ISO date with timezone')} placeholder="2026-10-22T09:00:00-05:00" value={cutoff} onChangeText={setCutoff} />
        <ActionButton mode={mode} label={t('prepareSnapshot', 'Prepare testnet snapshot')} disabled={busy || !cutoff} onPress={() => { void onAction({ action: 'snapshot', cutoff }); }} />
        {overview.snapshots.map(s => <View key={s.id} style={[styles.ledger, { borderColor: palette.border }]}><Badge mode={mode} tone="neutral">{t('unpublished', 'Unpublished')}</Badge><Text style={text}>{formatCampaignTime(s.cutoff)} · {s.user_count} {t('users', 'users')}</Text><Text selectable style={muted}>SHA-256: {s.digest}</Text></View>)}
      </Surface>}
    </>}
  </View>;
}
const styles = StyleSheet.create({ root: { gap: 24, marginBottom: 32 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }, grow: { flexGrow: 1, flexShrink: 1, minWidth: 180 }, top: { marginTop: 16 }, grid: { flexDirection: 'row', flexWrap: 'wrap' }, cell: { width: '14.2857%', minHeight: 48, justifyContent: 'center' }, ledger: { gap: 8, paddingVertical: 16, borderBottomWidth: 1 } });
