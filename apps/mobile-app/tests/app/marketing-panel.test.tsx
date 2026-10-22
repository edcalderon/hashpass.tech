import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Switch, Text, TextInput } from 'react-native';
import MarketingPanel from '../../components/admin/MarketingPanel';
import pack from '../../config/marketing/bsl2026.json';
import type { MarketingCampaignDraft, MarketingOverview, MarketingPanelProps } from '../../types/marketing';
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }));
jest.mock('../../components/EmailPreviewFrame', () => 'EmailPreviewFrame');
const overview: MarketingOverview = {
  campaigns: pack.messages.map((m: MarketingCampaignDraft, i: number) => ({ id: `id-${i}`, key: m.key, name: m.name, event_id: m.eventId, status: 'draft', scheduled_at: m.scheduledAt, time_zone: m.timeZone, content: m.content, requirements: m.requirements, readiness: {}, counts: {} })),
  deliveries: [], audit: [], snapshots: [], activity: { verified: 3, observed: 2, points: 3 },
};
const props = (): MarketingPanelProps => ({ overview, mode: 'light', onAction: jest.fn(async () => true), onRefresh: jest.fn(), onPreview: jest.fn(async () => '<p>preview</p>') });
const render = async (p: MarketingPanelProps) => { let v!: ReactTestRenderer; await act(async () => { v = create(<MarketingPanel {...p} />); }); return v; };
const button = (v: ReactTestRenderer, label: string) => v.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function').at(-1)!;
const field = (v: ReactTestRenderer, label: string) => v.root.findAllByType(TextInput).find(n => n.props.accessibilityLabel === label)!;
const hasText = (v: ReactTestRenderer, text: string) => v.root.findAllByType(Text).some(n => [n.props.children].flat().join('').includes(text));
const tab = (v: ReactTestRenderer, label: string) => act(() => v.root.findAll(n => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function' && n.findAllByType(Text).some(t => t.props.children === label)).at(-1)!.props.onPress());
beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date('2026-10-22T15:00:00Z')); });
afterEach(() => jest.useRealTimers());
it('loads templates only when requested and shows Bogotá schedule times', async () => {
  const p = props(), v = await render(p);
  expect(p.onAction).not.toHaveBeenCalled(); expect(hasText(v, 'Oct 26')).toBe(true); expect(hasText(v, '09:00')).toBe(true);
  await act(async () => { button(v, 'Load BSL 2026 drafts').props.onPress(); }); expect(p.onAction).toHaveBeenCalledWith({ action: 'seed' });
  act(() => button(v, 'Next month').props.onPress()); expect(hasText(v, 'Nov 4')).toBe(true); expect(hasText(v, '07:00')).toBe(true);
  act(() => button(v, 'Previous month').props.onPress()); expect(hasText(v, 'Oct 26')).toBe(true); act(() => v.unmount());
});
it('filters a calendar day and returns to all days', async () => {
  const v = await render(props()); const label = '2026-10-26, 1 campaigns';
  act(() => button(v, label).props.onPress()); expect(hasText(v, 'BSL Colombia 2026 · agenda')).toBe(false);
  act(() => button(v, label).props.onPress()); expect(hasText(v, 'BSL Colombia 2026 · agenda')).toBe(true); act(() => v.unmount());
});
it('edits bilingual copy, survives partial date input and disables scheduling unsaved changes', async () => {
  const p = props(), v = await render(p);
  act(() => button(v, 'Review · BSL Colombia 2026 · launch').props.onPress());
  act(() => field(v, 'Send time · YYYY-MM-DDTHH:mm · Bogotá UTC−5').props.onChangeText('2026-'));
  expect(field(v, 'Send time · YYYY-MM-DDTHH:mm · Bogotá UTC−5').props.value).toBe('2026-'); expect(button(v, 'Save draft').props.disabled).toBe(true);
  act(() => field(v, 'Send time · YYYY-MM-DDTHH:mm · Bogotá UTC−5').props.onChangeText('2026-10-27T09:00'));
  tab(v, 'English'); act(() => field(v, 'Subject').props.onChangeText('Updated subject')); expect(button(v, 'Schedule').props.disabled).toBe(true);
  await act(async () => { button(v, 'Save draft').props.onPress(); });
  expect(p.onAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'save', draft: expect.objectContaining({ scheduledAt: '2026-10-27T09:00-05:00', content: expect.objectContaining({ en: expect.objectContaining({ subject: 'Updated subject' }) }) }) }));
  await act(async () => { button(v, 'Preview email').props.onPress(); }); expect(p.onPreview).toHaveBeenCalledWith(expect.objectContaining({ subject: 'Updated subject' }), 'en', 'colombia2026');
  act(() => button(v, 'Close editor').props.onPress()); expect(hasText(v, 'Campaign editor')).toBe(false); act(() => v.unmount());
});
it('supports create, readiness checks and lifecycle controls', async () => {
  const p = props(), v = await render(p);
  act(() => button(v, 'New campaign').props.onPress()); expect(button(v, 'Save draft').props.disabled).toBe(true);
  act(() => field(v, 'Campaign key').props.onChangeText('new-campaign'));
  act(() => v.root.findAllByType(Switch)[0].props.onValueChange(false));
  act(() => v.root.findAllByType(Switch)[0].props.onValueChange(true));
  act(() => v.root.findAllByType(Switch)[1].props.onValueChange(true));
  act(() => button(v, 'Review · BSL Colombia 2026 · launch').props.onPress());
  await act(async () => { button(v, 'Schedule').props.onPress(); }); expect(p.onAction).toHaveBeenCalledWith({ action: 'schedule', id: 'id-0' });
  await act(async () => { v.update(<MarketingPanel {...p} overview={{ ...overview, campaigns: overview.campaigns.map((c,i) => i===0 ? {...c,status:'sending'} : c) }} />); });
  expect(field(v, 'Subject').props.editable).toBe(false);
  await act(async () => { button(v, 'Pause').props.onPress(); }); expect(p.onAction).toHaveBeenCalledWith({ action: 'pause', id: 'id-0' });
  await act(async () => { v.update(<MarketingPanel {...p} overview={{ ...overview, campaigns: overview.campaigns.map((c,i) => i===0 ? {...c,status:'paused'} : c) }} />); });
  await act(async () => { button(v, 'Resume').props.onPress(); button(v, 'Cancel campaign').props.onPress(); });
  expect(p.onAction).toHaveBeenCalledWith({ action: 'resume', id: 'id-0' }); expect(p.onAction).toHaveBeenCalledWith({ action: 'cancel', id: 'id-0' }); act(() => v.unmount());
});
it('shows provider acceptance and uncertainty without fabricated inbox metrics', async () => {
  const v = await render({ ...props(), overview: { ...overview, deliveries: [{ id: 'delivery', campaign_id: 'id-0', user_id: 'private-id', status: 'unknown', error_code: 'reconcile', accepted_at: null, created_at: '2026-10-26T14:00:00Z' }], audit: [{ id: 'audit', campaign_id: 'id-0', action: 'schedule', created_at: '2026-10-25T14:00:00Z' }] } });
  tab(v, 'Delivery history'); expect(hasText(v, 'Needs reconciliation')).toBe(true); expect(hasText(v, 'SMTP accepted')).toBe(true); expect(hasText(v, 'private-id')).toBe(false); act(() => v.unmount());
});
it('prepares a labeled unpublished testnet snapshot with an explicit cutoff', async () => {
  const p = props(), v = await render({ ...p, overview: { ...overview, snapshots: [{ id:'snap',cutoff:'2026-10-22T09:00:00-05:00',network:'testnet',status:'unpublished',digest:'a'.repeat(64),user_count:2,created_at:'2026-10-22T15:00:00Z' }] } });
  tab(v, 'Activity & snapshots'); expect(hasText(v, 'Unpublished')).toBe(true); expect(hasText(v, 'SHA-256')).toBe(true);
  act(() => field(v, 'Snapshot cutoff · ISO date with timezone').props.onChangeText('2026-10-22T09:00:00-05:00'));
  await act(async () => { button(v, 'Prepare testnet snapshot').props.onPress(); }); expect(p.onAction).toHaveBeenCalledWith({ action: 'snapshot', cutoff: '2026-10-22T09:00:00-05:00' }); act(() => v.unmount());
});
it('has loading, unavailable, empty and retry states', async () => {
  const p = props(), v = await render({ ...p, overview: null, loading: true, error: 'Unavailable' });
  expect(button(v, 'New campaign').props.disabled).toBe(true); act(() => button(v, 'Try again').props.onPress()); expect(p.onRefresh).toHaveBeenCalled();
  await act(async () => { v.update(<MarketingPanel {...p} overview={{...overview,campaigns:[]}} />); }); expect(hasText(v, 'No campaigns')).toBe(true);
  tab(v, 'Delivery history'); expect(hasText(v, 'No queued or sent messages')).toBe(true); act(() => v.unmount());
});
