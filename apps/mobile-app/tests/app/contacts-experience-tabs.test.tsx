import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Modal, Text, TextInput } from 'react-native';
import ContactsExperience from '../../components/contacts/ContactsExperience';
import type { ContactProfile, ContactsExperienceProps, ContactsSnapshot } from '../../types/contacts';

let mockWidth = 400;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({ __esModule: true, default: () => ({ width: mockWidth, height: 800, scale: 1, fontScale: 1 }) }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string, values?: Record<string, unknown>) => Object.entries(values ?? {}).reduce((text, [key, value]) => text.replace(`{${key}}`, String(value)), fallback) }) }));
jest.mock('../../lib/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../../lib/hashpass-logo', () => ({ getHashpassFullLogo: () => ({ uri: 'logo' }) }));
jest.mock('../../components/contacts/ContactsGraph', () => 'ContactsGraph');
jest.mock('react-native-qrcode-svg', () => 'QRCode');
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

const person = (id: string, name: string, topics: string[], extra: Partial<ContactProfile> = {}): ContactProfile => ({
  id, name, role: 'Engineer', company: 'Acme', topics, points: 120, connections: 2, discoverable: true, leaderboard: true, share_id: `card-${id}`, ...extra,
});
const me = person('me', 'Ari', ['AI'], { role: '', company: '', points: 620 });
const friend = person('friend', 'Fran', ['AI', 'Design']);
const loner = person('loner', 'Lou', ['Music'], { role: '', company: '' });
const stranger = person('stranger', 'Sam', ['AI']);

const snapshot = (overrides: Partial<ContactsSnapshot> = {}): ContactsSnapshot => ({
  profile: me, contacts: [friend, loner], incoming: [], outgoing: [], suggestions: [stranger], leaderboard: [me, friend], shared: null, ...overrides,
});
const baseProps = (): ContactsExperienceProps => ({ snapshot: snapshot(), mode: 'light', signedIn: true, onAction: jest.fn(async () => true), onRetry: jest.fn(), onSignIn: jest.fn(), onDashboard: jest.fn(), onStandalone: jest.fn() });

const render = async (props: ContactsExperienceProps) => {
  let view!: ReactTestRenderer;
  await act(async () => { view = create(<ContactsExperience {...props} />); });
  return view;
};
const control = (view: ReactTestRenderer, label: string) => view.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').at(-1)!;
const firstControl = (view: ReactTestRenderer, label: string) => view.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function').at(0)!;
const texts = (view: ReactTestRenderer) => view.root.findAllByType(Text).map(node => [node.props.children].flat().join(''));
const hasText = (view: ReactTestRenderer, value: string) => texts(view).some(text => text.includes(value));
const openTab = (view: ReactTestRenderer, label: string) => act(() => {
  view.root.findAll(node => node.props.accessibilityRole === 'tab' && typeof node.props.onPress === 'function' && node.findAllByType(Text).some(text => text.props.children === label)).at(-1)!.props.onPress();
});

describe('Contacts experience tabs and actions', () => {
  beforeEach(() => { mockWidth = 400; jest.clearAllMocks(); });

  it('lists the directory, opens a connection from it, and sends a request to a suggestion', async () => {
    const props = baseProps();
    const view = await render(props);
    openTab(view, 'Directory');
    expect(hasText(view, 'Fran')).toBe(true);
    expect(hasText(view, 'Sam')).toBe(true);
    await act(async () => { control(view, 'Connect').props.onPress(); });
    expect(props.onAction).toHaveBeenCalledWith({ action: 'request', card: 'card-stranger' });
    expect(hasText(view, 'Request sent. Your connection begins when they accept.')).toBe(true);
    openTab(view, 'Directory');
    act(() => control(view, 'View Fran').props.onPress());
    expect(hasText(view, 'Connection details')).toBe(true);
    expect(hasText(view, 'Shared interests')).toBe(true);
    act(() => firstControl(view, 'Close').props.onPress());
    expect(hasText(view, 'Connection details')).toBe(false);
    act(() => view.unmount());
  });

  it('explains when a selected connection has no shared interests and does not show a notice after a failed request', async () => {
    const props = baseProps();
    props.onAction = jest.fn(async () => false);
    const view = await render(props);
    openTab(view, 'Directory');
    act(() => control(view, 'View Lou').props.onPress());
    expect(hasText(view, 'Different interests, a new perspective.')).toBe(true);
    openTab(view, 'Directory');
    await act(async () => { control(view, 'Connect').props.onPress(); });
    expect(hasText(view, 'Request sent.')).toBe(false);
    act(() => view.unmount());
  });

  it('declines an incoming request and shows the empty state once the list is empty', async () => {
    const props = baseProps();
    props.snapshot = snapshot({ incoming: [{ id: 'req-1', profile: stranger }] });
    const view = await render(props);
    openTab(view, 'Incoming');
    await act(async () => { control(view, 'Decline').props.onPress(); });
    expect(props.onAction).toHaveBeenCalledWith({ action: 'decline', requestId: 'req-1' });
    act(() => view.unmount());
    const empty = await render(baseProps());
    openTab(empty, 'Incoming');
    expect(hasText(empty, 'All caught up. New contact requests will land here.')).toBe(true);
    act(() => empty.unmount());
  });

  it('ranks the leaderboard, marks the current person, and opens visibility settings', async () => {
    const view = await render(baseProps());
    openTab(view, 'Leaderboard');
    expect(hasText(view, '01')).toBe(true);
    expect(hasText(view, 'Ari · YOU')).toBe(true);
    expect(hasText(view, '620 XP')).toBe(true);
    act(() => control(view, 'Manage my visibility').props.onPress());
    expect(view.root.findAllByType(Modal)[0].props.visible).toBe(true);
    act(() => view.unmount());
    const empty = await render({ ...baseProps(), snapshot: snapshot({ leaderboard: [] }) });
    openTab(empty, 'Leaderboard');
    expect(hasText(empty, 'A new network, a fresh start. Opt in to join the leaderboard.')).toBe(true);
    act(() => empty.unmount());
  });

  it('connects to a shared card, shows pending and connected states, and routes a card that already requested us to Incoming', async () => {
    const props = baseProps();
    props.snapshot = snapshot({ shared: stranger, suggestions: [] });
    const view = await render(props);
    expect(hasText(view, 'A new connection is waiting')).toBe(true);
    await act(async () => { control(view, 'Connect').props.onPress(); });
    expect(props.onAction).toHaveBeenCalledWith({ action: 'request', card: 'card-stranger' });
    act(() => view.unmount());

    const pending = await render({ ...baseProps(), snapshot: snapshot({ shared: stranger, outgoing: ['stranger'], suggestions: [] }) });
    expect(control(pending, 'Request pending').props.accessibilityState.disabled).toBe(true);
    act(() => pending.unmount());

    const connected = await render({ ...baseProps(), snapshot: snapshot({ shared: friend }) });
    expect(hasText(connected, 'Connected')).toBe(true);
    act(() => connected.unmount());

    const incoming = await render({ ...baseProps(), snapshot: snapshot({ shared: stranger, incoming: [{ id: 'req-2', profile: stranger }], suggestions: [] }) });
    act(() => control(incoming, 'Respond in Incoming').props.onPress());
    expect(hasText(incoming, 'You decide who joins your network.')).toBe(true);
    act(() => incoming.unmount());
  });

  it('opens the card editor instead of requesting when the signed-in person has no profile yet', async () => {
    const props = baseProps();
    props.snapshot = snapshot({ profile: null, contacts: [], shared: stranger, suggestions: [] });
    const view = await render(props);
    expect(hasText(view, 'Make room for your next connection')).toBe(true);
    await act(async () => { control(view, 'Connect').props.onPress(); });
    expect(props.onAction).not.toHaveBeenCalled();
    expect(view.root.findAllByType(Modal)[0].props.visible).toBe(true);
    act(() => view.unmount());
  });

  it('edits topics, toggles visibility, enforces the topic limit, and saves the card', async () => {
    const props = baseProps();
    const view = await render(props);
    act(() => control(view, 'Edit interests').props.onPress());
    const chip = (label: string) => view.root.findAll(node => node.props.accessibilityLabel === label && typeof node.props.onPress === 'function' && node.props.accessibilityRole !== 'button').at(-1) ?? control(view, label);
    for (const topic of ['Design', 'Music', 'Climate', 'Health']) { const target = chip(topic); if (target) act(() => target.props.onPress()); }
    const switches = view.root.findAll(node => typeof node.props.onValueChange === 'function');
    act(() => switches[0].props.onValueChange(true));
    act(() => switches[1].props.onValueChange(true));
    const role = view.root.findAllByType(TextInput).find(input => input.props.accessibilityLabel === 'Role')!;
    act(() => role.props.onChangeText('CTO'));
    const company = view.root.findAllByType(TextInput).find(input => input.props.accessibilityLabel === 'Company')!;
    act(() => company.props.onChangeText('Hash'));
    await act(async () => { await control(view, 'Save contact card').props.onPress(); });
    expect(props.onAction).toHaveBeenCalledWith({ action: 'profile', profile: expect.objectContaining({ role: 'CTO', company: 'Hash', discoverable: true, leaderboard: true }) });
    expect(hasText(view, 'Your contact card is saved.')).toBe(true);
    act(() => view.unmount());
  });

  it('shows retry on a load error, sign-in for guests, and standalone navigation controls', async () => {
    const props = baseProps();
    props.error = 'unavailable';
    const view = await render(props);
    act(() => control(view, 'Try again').props.onPress());
    expect(props.onRetry).toHaveBeenCalled();
    act(() => control(view, 'Open standalone Contacts').props.onPress());
    expect(props.onStandalone).toHaveBeenCalled();
    act(() => view.unmount());

    const guestProps = { ...baseProps(), snapshot: null, signedIn: false, standalone: true };
    const guest = await render(guestProps);
    act(() => control(guest, 'Sign in').props.onPress());
    act(() => control(guest, 'Start your network').props.onPress());
    expect(guestProps.onSignIn).toHaveBeenCalledTimes(2);
    act(() => guest.unmount());

    const signedIn = baseProps();
    const standalone = await render({ ...signedIn, standalone: true });
    act(() => control(standalone, 'Dashboard').props.onPress());
    expect(signedIn.onDashboard).toHaveBeenCalled();
    act(() => standalone.unmount());
  });

  it('shows the growth sidebar on wide screens and filters by a chosen topic', async () => {
    mockWidth = 1280;
    const view = await render(baseProps());
    expect(hasText(view, 'Small steps. Wider circles.')).toBe(true);
    openTab(view, 'Directory');
    act(() => firstControl(view, 'AI').props.onPress());
    expect(hasText(view, 'Fran')).toBe(true);
    expect(hasText(view, 'Lou')).toBe(false);
    act(() => control(view, 'Clear topic filter').props.onPress());
    expect(hasText(view, 'Lou')).toBe(true);
    act(() => view.unmount());
  });
});
