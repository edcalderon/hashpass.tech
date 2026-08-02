/// <reference types="jest" />

import React from 'react';

const mockGetUserPassInfo = jest.fn();
const mockGetEventPassTiers = jest.fn();
const mockCanMakeMeetingRequest = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../hooks/useTheme', () => ({
  useTheme: () => ({
    colors: {
      primary: '#d93025', divider: '#d1d5db', background: { default: '#fff' },
      text: { primary: '#111827', secondary: '#4b5563' }, error: { main: '#d93025' },
    },
  }),
}));
jest.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ dbUserId: '7f60f5d2-5948-4df1-9670-2f9177cf2fe4' }) }));
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

import PassesDisplay from '../../components/PassesDisplay';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { act, create } = require('react-test-renderer');

describe('PassesDisplay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    const requestControl = renderer.root.findAll((node: any) =>
      typeof node.props?.onPress === 'function'
      && node.findAllByProps({ children: 'View request' }).length > 0,
    )[0];
    expect(requestControl).toBeDefined();
    await act(async () => requestControl.props.onPress());
    expect(onExistingRequestPress).toHaveBeenCalledTimes(1);
  });
});
