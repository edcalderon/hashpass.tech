/// <reference types="jest" />

import React from 'react';

import PassesWallet from '../../../components/passes/PassesWallet';
import { passSystemService } from '../../../lib/pass-system';
import type { PassInfo } from '../../../lib/pass-system';

let mockDbUserId: string | null = 'supabase-user-id';
let mockFilterOverride: unknown[] | null = null;

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: 'Animated.View' },
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useSharedValue: (value: number) => ({ value }),
  withSpring: (value: number) => value,
  withTiming: (value: number) => value,
}));

jest.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({ dbUserId: mockDbUserId }),
}));

jest.mock('../../../hooks/useTheme', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      primary: '#2563eb',
      background: { paper: '#fff' },
      divider: '#d1d5db',
      text: { primary: '#111827', secondary: '#4b5563', disabled: '#9ca3af' },
    },
  }),
}));

jest.mock('../../../i18n/i18n', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

jest.mock('../../../lib/vector-icons', () => ({ MaterialIcons: 'MaterialIcons' }));
jest.mock('../../../lib/event-branding', () => ({ getSelectEventCardWatermark: () => 1 }));

jest.mock('../../../components/passes/PassWalletCard', () => {
  const ReactRuntime = require('react');
  return {
    __esModule: true,
    PASS_CARD_HEIGHT: 390,
    PASS_CARD_WIDTH: 340,
    default: ({ pass, interactive }: { pass: { id: string }; interactive: boolean }) =>
      ReactRuntime.createElement('MockPassWalletCard', { passId: pass.id, interactive }),
  };
});

jest.mock('../../../components/UnifiedSearchAndFilter', () => {
  const ReactRuntime = require('react');
  return ({ data, onFilteredData }: { data: unknown[]; onFilteredData: (value: unknown[]) => void }) => {
    ReactRuntime.useEffect(() => {
      onFilteredData(mockFilterOverride ?? data);
    }, [data, onFilteredData]);
    return ReactRuntime.createElement('MockSearchAndFilter');
  };
});

jest.mock('../../../lib/pass-system', () => ({
  passSystemService: {
    getAllUserPasses: jest.fn(),
    getUserPassesForEvents: jest.fn(),
  },
}));

// Untyped require, matching tests/app/home.test.tsx's convention: the real
// @types/react-test-renderer types require findByType/find to take an actual
// component reference, not the mocked-component-name strings
// ('MockPassWalletCard') this file queries by.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { act, create } = require('react-test-renderer');

const makePass = (overrides: Partial<PassInfo> = {}): PassInfo => ({
  pass_id: 'pass-1',
  event_id: 'chile2026',
  pass_type: 'general',
  status: 'active',
  pass_number: 'PASS-001',
  max_requests: 10,
  used_requests: 0,
  remaining_requests: 10,
  max_boost: 100,
  used_boost: 0,
  remaining_boost: 100,
  access_features: [],
  special_perks: [],
  ...overrides,
});

const renderWallet = async (props: React.ComponentProps<typeof PassesWallet> = {}) => {
  let renderer: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(<PassesWallet {...props} />);
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  return renderer!;
};

describe('PassesWallet', () => {
  beforeEach(() => {
    mockDbUserId = 'supabase-user-id';
    mockFilterOverride = null;
    jest.clearAllMocks();
    (passSystemService.getAllUserPasses as jest.Mock).mockResolvedValue([]);
    (passSystemService.getUserPassesForEvents as jest.Mock).mockResolvedValue([]);
  });

  it('loads every pass for the bridged database identity and mounts at most four stacked cards', async () => {
    const passes = Array.from({ length: 5 }, (_, index) =>
      makePass({ pass_id: `pass-${index}`, event_id: index % 2 ? 'colombia2026' : 'chile2026' }),
    );
    const onPassesLoaded = jest.fn();
    (passSystemService.getAllUserPasses as jest.Mock).mockResolvedValue(passes);

    const renderer = await renderWallet({ onPassesLoaded });

    expect(passSystemService.getAllUserPasses).toHaveBeenCalledWith('supabase-user-id');
    expect(onPassesLoaded).toHaveBeenCalledWith(passes);
    expect(renderer.root.findAllByType('MockPassWalletCard')).toHaveLength(4);
    expect(renderer.root.findByProps({ children: 'Passes' })).toBeTruthy();
  });

  it('uses the scoped event endpoint when event ids are supplied', async () => {
    (passSystemService.getUserPassesForEvents as jest.Mock).mockResolvedValue([
      makePass({ event_id: 'chile2026' }),
    ]);

    await renderWallet({ eventIds: ['chile2026', 'colombia2026'] });

    expect(passSystemService.getUserPassesForEvents).toHaveBeenCalledWith(
      'supabase-user-id',
      ['chile2026', 'colombia2026'],
    );
    expect(passSystemService.getAllUserPasses).not.toHaveBeenCalled();
  });

  it('keeps the skeleton visible until a Supabase database identity is available', async () => {
    mockDbUserId = null;

    const renderer = await renderWallet();

    expect(passSystemService.getAllUserPasses).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ children: 'Loading your pass information...' })).toBeTruthy();
  });

  it('shows the empty-wallet state only after an authenticated lookup returns no passes', async () => {
    const renderer = await renderWallet();

    expect(renderer.root.findByProps({ children: 'No passes found' })).toBeTruthy();
    expect(renderer.root.findByProps({ children: 'Contact support to get your event passes' })).toBeTruthy();
  });

  it('shows a recoverable no-matches state when filters exclude every loaded pass', async () => {
    mockFilterOverride = [];
    (passSystemService.getAllUserPasses as jest.Mock).mockResolvedValue([makePass()]);

    const renderer = await renderWallet();

    expect(renderer.root.findByProps({ children: 'No passes match your filters' })).toBeTruthy();
  });
});
