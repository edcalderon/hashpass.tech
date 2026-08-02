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
    claimPassByCode: jest.fn(),
    createDefaultPass: jest.fn(),
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

// react-native-web currently renders TouchableOpacity and Pressable as host
// Views with an onClick prop in react-test-renderer. Keep the interaction
// assertions independent of that host implementation detail.
const triggerPress = (node: any) => {
  const handler = node.props.onPress ?? node.props.onClick;
  if (typeof handler !== 'function') {
    throw new Error('Expected a pressable test node');
  }
  handler();
};

describe('PassesWallet', () => {
  beforeEach(() => {
    mockDbUserId = 'supabase-user-id';
    mockFilterOverride = null;
    jest.clearAllMocks();
    (passSystemService.claimPassByCode as jest.Mock).mockResolvedValue(null);
    (passSystemService.createDefaultPass as jest.Mock).mockResolvedValue('restored-pass');
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

  it('renders BSL-style flat cards without the stacked wallet controls', async () => {
    const passes = [
      makePass({ pass_id: 'pass-chile', event_id: 'chile2026' }),
      makePass({ pass_id: 'pass-colombia', event_id: 'colombia2026' }),
    ];
    (passSystemService.getAllUserPasses as jest.Mock).mockResolvedValue(passes);

    const renderer = await renderWallet({ layout: 'plain' });

    expect(renderer.root.findAllByType('MockPassWalletCard')).toHaveLength(2);
    expect(renderer.root.findAllByType('MockSearchAndFilter')).toHaveLength(0);
    expect(renderer.root.findAllByProps({ name: 'chevron-right' })).toHaveLength(0);
  });

  it('reloads already-loaded passes from both BSL and HashPass wallet layouts', async () => {
    (passSystemService.getAllUserPasses as jest.Mock).mockResolvedValue([makePass()]);

    const hashpassWallet = await renderWallet();
    const bslWallet = await renderWallet({ layout: 'plain' });

    const hashpassReload = hashpassWallet.root.findByProps({ accessibilityLabel: 'Reload passes' });
    const bslReload = bslWallet.root.findByProps({ accessibilityLabel: 'Reload passes' });

    await act(async () => {
      triggerPress(hashpassReload);
      await Promise.resolve();
      triggerPress(bslReload);
      await Promise.resolve();
    });

    expect(passSystemService.getAllUserPasses).toHaveBeenCalledTimes(4);
    expect(hashpassWallet.root.findAllByType('MockPassWalletCard')).toHaveLength(1);
    expect(bslWallet.root.findAllByType('MockPassWalletCard')).toHaveLength(1);
  });

  it('keeps loaded wallet controls visible while a reload shows a pass-card skeleton', async () => {
    let resolveReload: ((passes: PassInfo[]) => void) | undefined;
    (passSystemService.getAllUserPasses as jest.Mock)
      .mockResolvedValueOnce([makePass()])
      .mockImplementationOnce(
        () => new Promise<PassInfo[]>((resolve) => {
          resolveReload = resolve;
        }),
      );

    const renderer = await renderWallet();

    await act(async () => {
      triggerPress(renderer.root.findByProps({ accessibilityLabel: 'Reload passes' }));
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({ children: 'Passes' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Refreshing passes' })).toBeTruthy();
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Refreshing pass summary' })).toHaveLength(3);
    expect(renderer.root.findAllByType('MockPassWalletCard')).toHaveLength(0);
    await act(async () => {
      resolveReload?.([makePass()]);
      await Promise.resolve();
      renderer.unmount();
      await Promise.resolve();
    });
  });

  it('keeps the skeleton visible until a Supabase database identity is available', async () => {
    mockDbUserId = null;

    const renderer = await renderWallet();

    expect(passSystemService.getAllUserPasses).not.toHaveBeenCalled();
    expect(renderer.root.findByProps({ children: 'Loading your pass information...' })).toBeTruthy();
    await act(async () => {
      renderer.unmount();
      await Promise.resolve();
    });
  });

  it('shows the empty-wallet state only after an authenticated lookup returns no passes', async () => {
    const renderer = await renderWallet();

    expect(renderer.root.findByProps({ children: 'No passes found' })).toBeTruthy();
    expect(renderer.root.findByProps({ children: 'Contact support to get your event passes' })).toBeTruthy();
    expect(renderer.root.findByProps({ accessibilityLabel: 'Try again' })).toBeTruthy();
  });

  it('reloads passes when the fallback retry action is pressed', async () => {
    const renderer = await renderWallet();
    (passSystemService.getAllUserPasses as jest.Mock).mockResolvedValue([makePass()]);

    await act(async () => {
      triggerPress(renderer.root.findByProps({ accessibilityLabel: 'Try again' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(passSystemService.getAllUserPasses).toHaveBeenCalledTimes(2);
    expect(renderer.root.findAllByType('MockPassWalletCard')).toHaveLength(1);
  });

  it('retries a transient wallet lookup before showing the error state', async () => {
    (passSystemService.getAllUserPasses as jest.Mock)
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce([makePass()]);

    const renderer = await renderWallet();

    expect(passSystemService.getAllUserPasses).toHaveBeenCalledTimes(2);
    expect(renderer.root.findAllByType('MockPassWalletCard')).toHaveLength(1);
  });

  it('restores the included BSL passes for the signed-in holder and reloads the wallet', async () => {
    (passSystemService.getAllUserPasses as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makePass({ event_id: 'chile2026' })]);

    const renderer = await renderWallet({ layout: 'plain' });

    await act(async () => {
      triggerPress(renderer.root.findByProps({ accessibilityLabel: 'Restore included BSL passes' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(passSystemService.createDefaultPass).toHaveBeenNthCalledWith(
      1,
      'supabase-user-id',
      'general',
      'chile2026',
    );
    expect(passSystemService.createDefaultPass).toHaveBeenNthCalledWith(
      2,
      'supabase-user-id',
      'general',
      'colombia2026',
    );
    expect(passSystemService.getAllUserPasses).toHaveBeenCalledTimes(2);
    expect(renderer.root.findAllByType('MockPassWalletCard')).toHaveLength(1);
  });

  it('keeps the restore action scoped to the BSL wallet and reports a failed restore', async () => {
    (passSystemService.createDefaultPass as jest.Mock).mockResolvedValue(null);

    const globalWallet = await renderWallet();
    expect(globalWallet.root.findAllByProps({ accessibilityLabel: 'Restore included BSL passes' })).toHaveLength(0);

    const bslWallet = await renderWallet({ layout: 'plain' });
    await act(async () => {
      triggerPress(bslWallet.root.findByProps({ accessibilityLabel: 'Restore included BSL passes' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(bslWallet.root.findByProps({ children: 'Unable to load your passes' })).toBeTruthy();
  });

  it('offers the pass-claim dialog in both Hashpass and BSL empty wallets', async () => {
    const hashpassWallet = await renderWallet();
    expect(hashpassWallet.root.findByProps({ accessibilityLabel: 'Have a pass? Claim it here' })).toBeTruthy();

    const bslWallet = await renderWallet({ layout: 'plain' });
    expect(bslWallet.root.findByProps({ accessibilityLabel: 'Have a pass? Claim it here' })).toBeTruthy();
  });

  it('opens the pass-claim dialog and reloads the Hashpass wallet after redeeming a courtesy code', async () => {
    (passSystemService.getAllUserPasses as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([makePass({ event_id: 'chile2026' })]);
    (passSystemService.claimPassByCode as jest.Mock).mockResolvedValue({
      status: 'claimed',
      pass_id: 'courtesy-pass',
      event_id: 'chile2026',
    });

    const renderer = await renderWallet();

    await act(async () => {
      triggerPress(renderer.root.findByProps({ accessibilityLabel: 'Have a pass? Claim it here' }));
      await Promise.resolve();
    });
    const codeInput = renderer.root.findByProps({ accessibilityLabel: 'Pass or courtesy code' });
    act(() => {
      codeInput.props.onChangeText(' bsl-2026-welcome ');
    });
    await act(async () => {
      triggerPress(renderer.root.findByProps({ accessibilityLabel: 'Redeem pass code' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(passSystemService.claimPassByCode).toHaveBeenCalledWith(
      'supabase-user-id',
      ' bsl-2026-welcome ',
    );
    expect(passSystemService.getAllUserPasses).toHaveBeenCalledTimes(2);
    expect(renderer.root.findAllByType('MockPassWalletCard')).toHaveLength(1);
    expect(renderer.root.findAllByProps({ accessibilityLabel: 'Restore BSL complimentary passes' })).toHaveLength(0);
  });

  it('keeps the claim dialog open with clear validation for blank or unavailable codes', async () => {
    const renderer = await renderWallet({ layout: 'plain' });

    await act(async () => {
      triggerPress(renderer.root.findByProps({ accessibilityLabel: 'Have a pass? Claim it here' }));
      await Promise.resolve();
    });
    await act(async () => {
      triggerPress(renderer.root.findByProps({ accessibilityLabel: 'Redeem pass code' }));
      await Promise.resolve();
    });
    expect(renderer.root.findByProps({ children: 'Enter your pass or courtesy code.' })).toBeTruthy();

    const codeInput = renderer.root.findByProps({ accessibilityLabel: 'Pass or courtesy code' });
    act(() => {
      codeInput.props.onChangeText('used-code');
    });
    await act(async () => {
      triggerPress(renderer.root.findByProps({ accessibilityLabel: 'Redeem pass code' }));
      await Promise.resolve();
    });

    expect(passSystemService.claimPassByCode).toHaveBeenCalledWith('supabase-user-id', 'used-code');
    expect(renderer.root.findByProps({ children: 'This code is invalid, unavailable, or has already been used.' })).toBeTruthy();
  });

  it('shows a recoverable no-matches state when filters exclude every loaded pass', async () => {
    mockFilterOverride = [];
    (passSystemService.getAllUserPasses as jest.Mock).mockResolvedValue([makePass()]);

    const renderer = await renderWallet();

    expect(renderer.root.findByProps({ children: 'No passes match your filters' })).toBeTruthy();
  });

  it('recovers to the empty-wallet state when the lookup itself fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (passSystemService.getAllUserPasses as jest.Mock).mockRejectedValue(new Error('network down'));

    const renderer = await renderWallet();

    expect(renderer.root.findByProps({ children: 'Unable to load your passes' })).toBeTruthy();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('stops waiting on a hung lookup and offers a retry action', async () => {
    jest.useFakeTimers();
    (passSystemService.getAllUserPasses as jest.Mock).mockImplementation(() => new Promise(() => {}));

    try {
      const renderer = await renderWallet();

      await act(async () => {
        jest.advanceTimersByTime(5_000);
        await Promise.resolve();
      });
      await act(async () => {
        jest.advanceTimersByTime(5_000);
        await Promise.resolve();
      });

      expect(renderer.root.findByProps({ children: 'Passes took too long to load' })).toBeTruthy();
      expect(renderer.root.findByProps({ accessibilityLabel: 'Try again' })).toBeTruthy();
      await act(async () => {
        renderer.unmount();
        await Promise.resolve();
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps the pass-claim recovery action visible while the Supabase identity is reconnecting', async () => {
    jest.useFakeTimers();
    mockDbUserId = null;

    try {
      const renderer = await renderWallet({ layout: 'plain' });

      await act(async () => {
        jest.advanceTimersByTime(10_000);
        await Promise.resolve();
      });

      const claimAction = renderer.root.findByProps({ accessibilityLabel: 'Have a pass? Claim it here' });
      expect(claimAction).toBeTruthy();

      await act(async () => {
        triggerPress(claimAction);
        await Promise.resolve();
      });

      expect(
        renderer.root.findByProps({ children: 'Your account is still connecting. Please try again in a moment.' }),
      ).toBeTruthy();
      expect(renderer.root.findByProps({ accessibilityLabel: 'Redeem pass code' }).props.disabled).toBe(true);
      await act(async () => {
        renderer.unmount();
        await Promise.resolve();
      });
    } finally {
      jest.useRealTimers();
    }
  });

  describe('deck navigation', () => {
    // Event ids deliberately absent from packages/config/src/events.ts: every
    // pass then falls back to the same 'upcoming' timeline with no start/end
    // date, so buildWalletPasses's tie-break (alphabetical by event name,
    // which falls back to the event id) gives a fully deterministic order:
    // aaa, bbb, ccc.
    const passes = ['aaa', 'bbb', 'ccc'].map((id) => makePass({ pass_id: `pass-${id}`, event_id: id }));

    const frontPassId = (renderer: ReturnType<typeof create>) =>
      renderer.root
        .findAllByType('MockPassWalletCard')
        .find((card: any) => card.props.interactive === true)?.props.passId;

    beforeEach(() => {
      (passSystemService.getAllUserPasses as jest.Mock).mockResolvedValue(passes);
    });

    it('cycles the front card forward and backward with the arrow buttons, wrapping around', async () => {
      const renderer = await renderWallet();
      expect(frontPassId(renderer)).toBe('pass-aaa');

      const leftArrow = renderer.root.findByProps({ name: 'chevron-left' }).parent!;
      const rightArrow = renderer.root.findByProps({ name: 'chevron-right' }).parent!;

      act(() => {
        triggerPress(rightArrow);
      });
      expect(frontPassId(renderer)).toBe('pass-bbb');

      act(() => {
        triggerPress(rightArrow);
      });
      expect(frontPassId(renderer)).toBe('pass-ccc');

      act(() => {
        triggerPress(rightArrow);
      });
      // Wraps back around past the end of the stable order.
      expect(frontPassId(renderer)).toBe('pass-aaa');

      act(() => {
        triggerPress(leftArrow);
      });
      // Wraps the other direction from the start.
      expect(frontPassId(renderer)).toBe('pass-ccc');
    });

    it('jumps straight to a pass when its pagination dot is tapped', async () => {
      const renderer = await renderWallet();

      // Pagination dots are the only controls with this hit slop. The card
      // overlays use the same RN-web host type, so component-name lookups are
      // neither portable nor specific enough here. Search the whole rendered
      // tree because coverage instrumentation can add an extra host wrapper.
      const dotCandidates = renderer.root.findAllByProps({ hitSlop: 6 }).filter(
        (node: any) =>
          node.props.style?.borderRadius === 3 &&
          node.props.style?.height === 6 &&
          typeof (node.props.onPress ?? node.props.onClick) === 'function'
      );
      const directPressableDots = dotCandidates.filter((node: any) => node.type?.name === 'Pressable');
      const dots = directPressableDots.length === 3
        ? directPressableDots
        : [0, 1, 2].map((index) => dotCandidates[index * Math.max(1, dotCandidates.length / 3)]);
      expect(dots).toHaveLength(3);

      act(() => {
        triggerPress(dots[2]);
      });

      expect(frontPassId(renderer)).toBe('pass-ccc');
    });

    it('brings a card behind the front one forward when it is tapped directly', async () => {
      const renderer = await renderWallet();
      expect(frontPassId(renderer)).toBe('pass-aaa');

      // Scope to the StackedCard wrapper that actually contains the behind
      // card, rather than climbing from the mocked card's own .parent (which
      // is the mock's composite instance, not the host wrapper StackedCard
      // renders) -- more robust than assuming how many layers to climb.
      const behindStack = renderer.root
        .findAllByType('Animated.View')
        .find((view: any) =>
          view.findAllByType('MockPassWalletCard').some((card: any) => card.props.passId === 'pass-bbb')
        );
      const overlay = behindStack!.find(
        (node: any) => node.props.style?.position === 'absolute' && typeof (node.props.onPress ?? node.props.onClick) === 'function'
      );

      act(() => {
        triggerPress(overlay);
      });

      expect(frontPassId(renderer)).toBe('pass-bbb');
    });
  });
});
