/// <reference types="jest" />

import React from 'react';
import { Linking } from 'react-native';

const mockGetUserPassInfo = jest.fn();
const mockGetEventPassTiers = jest.fn();
const mockCanMakeMeetingRequest = jest.fn();
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
  passSystemService: {
    getUserPassInfo: (...args: unknown[]) => mockGetUserPassInfo(...args),
    getEventPassTiers: (...args: unknown[]) => mockGetEventPassTiers(...args),
    getPassPerks: () => ({ features: [], perks: [] }),
    canMakeMeetingRequest: (...args: unknown[]) => mockCanMakeMeetingRequest(...args),
    getPassValidationMessage: jest.fn(),
    getPassTypeColor: () => '#34A853',
    getPassTypeDisplayName: () => 'General Pass',
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
    mockAuthState = { dbUserId: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4' };
    mockGetUserPassInfo.mockResolvedValue({
      pass_id: 'pass-1', event_id: 'chile2026', pass_type: 'general', status: 'active', pass_number: 'BSL-GE-79b2',
      max_requests: 10, used_requests: 0, remaining_requests: 10,
      max_boost: 100, used_boost: 0, remaining_boost: 100, access_features: [], special_perks: [],
    });
    mockGetEventPassTiers.mockResolvedValue([]);
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

    const requestControls = renderer.root.findAll((node: any) =>
      typeof node.props?.onPress === 'function'
      && node.findAllByProps({ children: 'View request' }).length > 0,
    );
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

  it('sends native pass purchases to the Blockchain Summit site instead of a placeholder alert', async () => {
    mockGetUserPassInfo.mockResolvedValue(null);
    const canOpenUrl = jest.fn().mockResolvedValue(true);
    const openUrl = jest.fn().mockResolvedValue(true);
    Object.assign(Linking as any, { canOpenURL: canOpenUrl, openURL: openUrl });

    let renderer: any;
    await act(async () => {
      renderer = create(<PassesDisplay mode="speaker" eventId="chile2026" />);
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320));
    });

    const price = renderer.root.findAllByType('Text').find((node: any) => textContent(node) === '$99');
    expect(price).toBeDefined();
    let purchaseButton = price.parent;
    while (purchaseButton && typeof purchaseButton.props?.onPress !== 'function') {
      purchaseButton = purchaseButton.parent;
    }
    await act(async () => purchaseButton.props.onPress());

    expect(canOpenUrl).toHaveBeenCalledWith('https://blockchainsummit.la');
    expect(openUrl).toHaveBeenCalledWith('https://blockchainsummit.la');
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
