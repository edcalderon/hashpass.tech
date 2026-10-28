/// <reference types="jest" />

import React from 'react';
import { Alert } from 'react-native';

const mockGetUserPassInfo = jest.fn();
const mockGetEventPassTiers = jest.fn();
const mockCanMakeMeetingRequest = jest.fn();
const mockResetMeetingRequestLimits = jest.fn();
const mockRouterPush = jest.fn();
let mockAuthState: { dbUserId: string | null; retryDatabaseSession?: jest.Mock } = {
  dbUserId: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4',
};

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockRouterPush }) }));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      primary: '#d93025', divider: '#d1d5db', background: { default: '#fff' },
      text: { primary: '#111827', secondary: '#4b5563' }, error: { main: '#d93025' },
    },
  }),
}));
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => mockAuthState }));
jest.mock('../../i18n/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));
jest.mock('../../components/passes/PassesWallet', () => 'PassesWallet');
jest.mock('../../lib/pass-system', () => ({
  MEETING_REQUEST_LIMIT_RESET_COST: 50,
  passSystemService: {
    getUserPassInfo: (...args: unknown[]) => mockGetUserPassInfo(...args),
    getEventPassTiers: (...args: unknown[]) => mockGetEventPassTiers(...args),
    getPassPerks: () => ({ features: [], perks: [] }),
    canMakeMeetingRequest: (...args: unknown[]) => mockCanMakeMeetingRequest(...args),
    resetMeetingRequestLimits: (...args: unknown[]) => mockResetMeetingRequestLimits(...args),
    getPassValidationMessage: jest.fn(),
    getPassTypeColor: () => '#34A853',
    getPassTypeDisplayName: (type: string) =>
      ({ general: 'General Pass', business: 'Business Pass', vip: 'VIP Pass' } as Record<string, string>)[type] ?? 'General Pass',
  },
}));

import PassesDisplay, { formatEventPassTierPrice } from '../../components/PassesDisplay';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { act, create } = require('react-test-renderer');

const textContent = (node: any): string => {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return (node.children || []).map(textContent).join('');
};

describe('PassesDisplay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockAuthState = { dbUserId: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4' };
    mockGetUserPassInfo.mockResolvedValue({
      pass_id: 'pass-1', event_id: 'chile2026', pass_type: 'general', status: 'active', pass_number: 'BSL-GE-79b2',
      max_requests: 10, used_requests: 0, remaining_requests: 10,
      max_boost: 100, used_boost: 0, remaining_boost: 100, access_features: [], special_perks: [],
    });
    mockGetEventPassTiers.mockResolvedValue([]);
    mockResetMeetingRequestLimits.mockResolvedValue({
      pass_id: 'pass-1', event_id: 'chile2026', reset_cost: 50,
      remaining_requests: 10, remaining_boost: 50, pass_type: 'general',
    });
    mockCanMakeMeetingRequest.mockResolvedValue({
      can_request: false,
      canSendRequest: false,
      reason: 'existing_request',
      pass_type: 'general',
      remaining_requests: 9,
      remaining_boost: 100,
    });
  });

  it('renders the actual issued pass limits and uses Boost points rather than VOI', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<PassesDisplay mode="speaker" eventId="chile2026" />);
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });

    expect(mockGetUserPassInfo).toHaveBeenCalledWith('7f60f5d2-5948-4df1-9670-2f9177cf2fe4', 'chile2026');
    expect(mockGetEventPassTiers).toHaveBeenCalledWith('chile2026');
    expect(renderer.root.findAllByProps({ children: 'Boost points' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ children: 'VOI Boost' })).toHaveLength(0);
  });

  it('shows one collapsed pass-tier row that expands to entitlements without prices', async () => {
    mockGetEventPassTiers.mockResolvedValue([
      { event_id: 'colombia2026', pass_type: 'general', max_meeting_requests: 10, max_boost_amount: 100, price_cents: 9900, currency: 'USD', price_label: null },
      { event_id: 'colombia2026', pass_type: 'business', max_meeting_requests: 20, max_boost_amount: 300, price_cents: 24900, currency: 'USD', price_label: null },
      { event_id: 'colombia2026', pass_type: 'vip', max_meeting_requests: 50, max_boost_amount: 500, price_cents: null, currency: 'USD', price_label: 'Premium' },
    ]);
    let renderer: any;
    await act(async () => {
      renderer = create(<PassesDisplay mode="speaker" eventId="colombia2026" />);
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });

    // One collapsed row by default: no tier names, entitlements or buttons yet.
    expect(renderer.root.findAllByProps({ testID: 'pass-tier-showcase' }).length).toBeGreaterThan(0);
    expect(renderer.root.findAllByProps({ testID: 'pass-tier-vip' })).toHaveLength(0);
    expect(JSON.stringify(renderer.toJSON())).not.toContain('Acquire ticket');
    await act(async () => {
      renderer.root.findAllByProps({ accessibilityLabel: 'Pass tiers' })[0].props.onPress();
    });

    for (const tier of ['general', 'business', 'vip']) {
      expect(renderer.root.findAllByProps({ testID: `pass-tier-${tier}` }).length).toBeGreaterThan(0);
    }
    const tree = JSON.stringify(renderer.toJSON());
    expect(tree).toContain('50 meeting requests · 500 boost points');
    expect(tree).toContain('20 meeting requests · 300 boost points');
    // Entitlements are shown; prices (dynamic) are not.
    expect(tree).not.toMatch(/\$|USD|9900|24900|99\.00|249|Premium/);

    const ticketsLink = renderer.root.findAllByProps({
      accessibilityLabel: 'Acquire ticket',
    })[0];

    await act(async () => ticketsLink.props.onPress());

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/events/[eventSlug]/tickets',
      params: {
        eventSlug: 'colombia2026',
        openTicketModal: 'true',
      },
    });
    expect(renderer.root.findAllByProps({ children: 'All Pass Types & Pricing' })).toHaveLength(0);
  });

  it('checks limits for the selected event and offers a 50-point reset at the request limit', async () => {
    mockCanMakeMeetingRequest.mockResolvedValue({
      can_request: false,
      canSendRequest: false,
      reason: 'no_requests_remaining',
      pass_type: 'general',
      remaining_requests: 0,
      remaining_boost: 100,
    });

    let renderer: any;
    await act(async () => {
      renderer = create(
        <PassesDisplay
          mode="speaker"
          eventId="chile2026"
          speakerId="speaker-1"
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });

    expect(mockCanMakeMeetingRequest).toHaveBeenCalledWith(
      '7f60f5d2-5948-4df1-9670-2f9177cf2fe4',
      'speaker-1',
      0,
      'chile2026',
    );
    const resetButton = renderer.root.findByProps({
      accessibilityLabel: 'Reset limit',
    });
    expect(resetButton).toBeDefined();
    await act(async () => resetButton.props.onPress());

    const alertButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2];
    const confirmButton = alertButtons?.find((button: any) => button.text === 'Reset limit');
    await act(async () => confirmButton?.onPress());
    expect(mockResetMeetingRequestLimits).toHaveBeenCalledWith(
      '7f60f5d2-5948-4df1-9670-2f9177cf2fe4',
      'chile2026',
    );
  });

  it('links an existing pending request instead of presenting it as a limit error', async () => {
    const onExistingRequestPress = jest.fn();
    let renderer: any;
    await act(async () => {
      renderer = create(
        <PassesDisplay
          mode="speaker"
          eventId="chile2026"
          speakerId="speaker-1"
          showRequestButton
          onRequestPress={jest.fn()}
          existingRequest={{ id: 'request-1', status: 'pending' }}
          onExistingRequestPress={onExistingRequestPress}
        />,
      );
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });

    const matchingControls = renderer.root.findAll((node: any) =>
      typeof node.props?.onPress === 'function'
      && node.findAllByProps({ children: 'View request' }).length > 0,
    );
    // The shared button wraps a Pressable; count each control once, outermost only.
    const requestControls = matchingControls.filter((node: any) => {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (matchingControls.includes(parent)) return false;
      }
      return true;
    });
    expect(requestControls).toHaveLength(1);

    const requestControl = requestControls[0];
    expect(requestControl).toBeDefined();
    await act(async () => requestControl.props.onPress());
    expect(onExistingRequestPress).toHaveBeenCalledTimes(1);
  });

  it('shows a stable fallback number when a legacy pass has a blank number', async () => {
    mockGetUserPassInfo.mockResolvedValue({
      pass_id: 'legacy-pass-12345678', event_id: 'chile2026', pass_type: 'general', status: 'active', pass_number: '   ',
      max_requests: 10, used_requests: 0, remaining_requests: 10,
      max_boost: 100, used_boost: 0, remaining_boost: 100, access_features: [], special_perks: [],
    });

    let renderer: any;
    await act(async () => {
      renderer = create(<PassesDisplay mode="speaker" eventId="chile2026" />);
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });

    expect(renderer.root.findAllByType('Text').map((node: any) => textContent(node))).toEqual(
      expect.arrayContaining([expect.stringMatching(/Pass #legacy.*5678/)]),
    );
  });

  it('clears a previously loaded pass when the database identity disappears', async () => {
    const retryDatabaseSession = jest.fn().mockResolvedValue(undefined);
    let renderer: any;
    await act(async () => {
      renderer = create(<PassesDisplay mode="speaker" eventId="chile2026" />);
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });
    expect(renderer.root.findAllByType('Text').map((node: any) => textContent(node))).toEqual(
      expect.arrayContaining([expect.stringContaining('BSL-GE-79b2')]),
    );

    mockAuthState = { dbUserId: null, retryDatabaseSession };
    await act(async () => {
      renderer.update(<PassesDisplay mode="speaker" eventId="chile2026" />);
      await Promise.resolve();
    });

    expect(retryDatabaseSession).toHaveBeenCalledTimes(1);
    expect(renderer.root.findAllByType('Text').map((node: any) => textContent(node))).not.toEqual(
      expect.arrayContaining([expect.stringContaining('BSL-GE-79b2')]),
    );
  });

  it('opens the selected pass details from a speaker card', async () => {
    let renderer: any;
    await act(async () => {
      renderer = create(<PassesDisplay mode="speaker" eventId="chile2026" />);
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: 'View full pass details' }).props.onPress();
    });

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/(shared)/dashboard/pass-details',
      params: { passId: 'pass-1', eventId: 'chile2026' },
    });
  });

  it('opens the event tickets modal when a speaker has no pass', async () => {
    mockGetUserPassInfo.mockResolvedValue(null);

    let renderer: any;
    await act(async () => {
      renderer = create(<PassesDisplay mode="speaker" eventId="chile2026" />);
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });

    await act(async () => {
      renderer.root.findAllByProps({ accessibilityLabel: 'Pass tiers' })[0].props.onPress();
    });
    const ticketsLink = renderer.root.findAllByProps({
      accessibilityLabel: 'Acquire ticket',
    })[0];
    await act(async () => ticketsLink.props.onPress());

    expect(mockRouterPush).toHaveBeenCalledWith({
      pathname: '/events/[eventSlug]/tickets',
      params: {
        eventSlug: 'chile2026',
        openTicketModal: 'true',
      },
    });
  });

  it('formats configured fractional tier prices without mutating the renderer environment', () => {
    expect(formatEventPassTierPrice({
      event_id: 'chile2026', pass_type: 'general', max_meeting_requests: 10, max_boost_amount: 100,
      price_cents: 9950, currency: 'USD', price_label: null,
    })).toMatch(/99\.50/);
    expect(formatEventPassTierPrice({
      event_id: 'chile2026', pass_type: 'vip', max_meeting_requests: 50, max_boost_amount: 500,
      price_cents: null, currency: 'USD', price_label: 'Premium',
    })).toBe('Premium');
    expect(formatEventPassTierPrice()).toBe('');
  });
});
